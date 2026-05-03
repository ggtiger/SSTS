"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDevice } from '@/lib/comm/use-device'
import { pulsesToAngle } from '@/lib/comm/types'
import type { DeviceState } from '@/lib/comm/types'
import IndustrialCard from '@/components/ui/IndustrialCard'
import MeasurementTable from '@/components/ui/MeasurementTable'
import type { MeasurementRow, ColumnGroup } from '@/components/ui/MeasurementTable'
import NumericInput from '@/components/ui/NumericInput'
import { isTauri } from '@/lib/tauri'
import { useBrakeStore, initialBrakeData, defaultSummaryTitles } from '@/lib/store/brake-store'
import type { BrakeMeasureRow, BrakeRecord } from '@/lib/store/brake-store'
import { initBrakeDB, saveBrakeRecord, getAllBrakeRecords, updateBrakeRecord, deleteBrakeRecord } from '@/lib/db/brake-records'

const inputClass = "w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
const primaryBtnClass = "flex-1 px-3 py-1.5 bg-primary hover:bg-primary/90 text-on-primary text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
const criticalBtnClass = "flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"

// 制动测试列组配置
const brakeColumnGroups: ColumnGroup[] = [
  { label: '加速度\nm/s²', columns: [''], editable: false },
  { label: '仪器示值', columns: ['1', '2', '3'], editable: true },
]



/** 水平仪气泡图 */
function BubbleLevel({ inclineX, inclineY }: { inclineX: number; inclineY: number }) {
  const clampedX = Math.max(-60, Math.min(60, inclineX * 20))
  const clampedY = Math.max(-60, Math.min(60, inclineY * 20))

  return (
    <div className="relative w-48 h-48 mx-auto rounded-full border-4 border-slate-100 flex items-center justify-center bg-slate-50">
      {/* 内圈虚线（安全范围参考） */}
      <div className="absolute inset-4 border border-slate-200 rounded-full border-dashed" />
      {/* 十字准心线 */}
      <div className="absolute w-full h-[1px] bg-slate-200" />
      <div className="absolute h-full w-[1px] bg-slate-200" />
      {/* 气泡点 - 根据倾斜角偏移 */}
      <div
        className="z-10 w-6 h-6 bg-primary rounded-full shadow-lg border-2 border-white transition-transform duration-300"
        style={{
          transform: `translate(${clampedX}px, ${clampedY}px)`
        }}
      />
    </div>
  )
}

export default function BrakeTestPage() {
  const { state, actions, error } = useDevice()
  const stateRef = useRef<DeviceState>(state)
  stateRef.current = state
  const abortRef = useRef(false)

  // Toast error
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (error) {
      setToastMsg(error)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => {
        setToastMsg(null)
        actions.clearError()
      }, 4000)
    }
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current) }
  }, [error])

  const dismissToast = () => {
    setToastMsg(null)
    actions.clearError()
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }

  // 从 Zustand Store 获取持久化状态
  const {
    measureData, setMeasureData, updateMeasureValue, updateMeasureLabelValue, resetMeasureData,
    summaryTitles, setSummaryTitles, updateSummaryTitle,
    summaryValues, setSummaryValues, updateSummaryValue,
    freeAngle, setFreeAngle,
    selectedRow, setSelectedRow,
    selectedSummaryCol, setSelectedSummaryCol,
    recordHistory, setRecordHistory,
    viewingRecordId, setViewingRecordId,
  } = useBrakeStore()

  // 页面 mount 时初始化 DB 并加载记录
  useEffect(() => {
    const loadRecords = async () => {
      try {
        await initBrakeDB()
        const records = await getAllBrakeRecords()
        setRecordHistory(records)
      } catch (err) {
        console.error('加载记录失败:', err)
      }
    }
    loadRecords()
  }, [])

  // === 自由测量 ===
  const [freeMotorState, setFreeMotorState] = useState<'idle' | 'running' | 'paused'>('idle')
  const freeMotorStateRef = useRef<'idle' | 'running' | 'paused'>('idle')
  const freeTargetRef = useRef<number | null>(null)

  const updateFreeMotorState = useCallback((s: 'idle' | 'running' | 'paused') => {
    freeMotorStateRef.current = s
    setFreeMotorState(s)
  }, [])

  const handleFreeStart = async () => {
    const angle = parseFloat(freeAngle)
    if (isNaN(angle)) return
    freeTargetRef.current = angle
    updateFreeMotorState('running')
    abortRef.current = false
    try {
      await actions.moveTo(angle)
      await waitForArrival()
    } catch (err) {
      console.error('自由测量启动出错:', err)
    } finally {
      if (freeMotorStateRef.current !== 'paused') {
        updateFreeMotorState('idle')
        freeTargetRef.current = null
      }
    }
  }

  const handleFreePause = async () => {
    abortRef.current = true
    updateFreeMotorState('paused')
    await actions.emergencyStop()
  }

  const handleFreeResume = async () => {
    if (freeTargetRef.current === null) return
    updateFreeMotorState('running')
    abortRef.current = false
    try {
      await actions.moveTo(freeTargetRef.current)
      await waitForArrival()
    } catch (err) {
      console.error('自由测量继续出错:', err)
    } finally {
      if (freeMotorStateRef.current !== 'paused') {
        updateFreeMotorState('idle')
        freeTargetRef.current = null
      }
    }
  }

  const handleFreeStop = async () => {
    abortRef.current = true
    await actions.emergencyStop()
    updateFreeMotorState('idle')
    freeTargetRef.current = null
  }

  const handleLevel = async () => {
    await actions.startHoming()
  }

  const handleReset = async () => {
    await actions.reset()
  }

  // === 表格记录 ===
  const [isAutoRunning, setIsAutoRunning] = useState(false)
  const [currentMeasureRow, setCurrentMeasureRow] = useState<string | null>(null)

  // 运动状态机: idle → running → paused → running → ... → idle
  const [motorState, setMotorState] = useState<'idle' | 'running' | 'paused'>('idle')
  const motorStateRef = useRef<'idle' | 'running' | 'paused'>('idle')
  const targetAngleRef = useRef<number | null>(null)

  const updateMotorState = useCallback((s: 'idle' | 'running' | 'paused') => {
    motorStateRef.current = s
    setMotorState(s)
  }, [])



  // 全局运行状态：自由测量和表格启动互斥
  const isAnyRunning = freeMotorState !== 'idle' || motorState !== 'idle'

  const handleSelectRow = (rowId: string) => {
    if (isAnyRunning) return
    setSelectedRow(selectedRow === rowId ? null : rowId)
    setSelectedSummaryCol(null)
  }

  const handleSelectSummaryCol = (colIndex: number) => {
    if (isAnyRunning) return
    setSelectedSummaryCol(selectedSummaryCol === colIndex ? null : colIndex)
    setSelectedRow(null)
  }

  const handleStartMove = async () => {
    let targetAngle: number | null = null

    if (selectedRow) {
      const row = measureData.find(r => r.id === selectedRow)
      if (row) targetAngle = parseFloat(row.labelValue)
    } else if (selectedSummaryCol !== null) {
      const title = summaryTitles[selectedSummaryCol]
      targetAngle = parseFloat(title.replace('°', ''))
    }

    if (targetAngle === null || isNaN(targetAngle)) return

    targetAngleRef.current = targetAngle
    updateMotorState('running')
    setIsAutoRunning(true)
    abortRef.current = false

    try {
      await actions.moveTo(targetAngle)
      await waitForArrival()
    } catch (err) {
      console.error('启动出错:', err)
    } finally {
      if (motorStateRef.current !== 'paused') {
        updateMotorState('idle')
        setIsAutoRunning(false)
        targetAngleRef.current = null
      }
    }
  }

  const handlePause = async () => {
    abortRef.current = true
    updateMotorState('paused')
    await actions.emergencyStop()
  }

  const handleResume = async () => {
    if (targetAngleRef.current === null) return
    updateMotorState('running')
    abortRef.current = false
    try {
      await actions.moveTo(targetAngleRef.current)
      await waitForArrival()
    } catch (err) {
      console.error('继续出错:', err)
    } finally {
      if (motorStateRef.current !== 'paused') {
        updateMotorState('idle')
        setIsAutoRunning(false)
        targetAngleRef.current = null
      }
    }
  }

  const handleStop = async () => {
    abortRef.current = true
    await actions.emergencyStop()
    updateMotorState('idle')
    setIsAutoRunning(false)
    targetAngleRef.current = null
  }

  const handleCellEdit = useCallback((rowId: string, colIndex: number, value: string) => {
    updateMeasureValue(rowId, colIndex, value)
  }, [updateMeasureValue])

  const handleLabelEdit = useCallback((rowId: string, value: string) => {
    updateMeasureLabelValue(rowId, value)
    // 自动计算加速度
    const angle = parseFloat(value)
    if (!isNaN(angle)) {
      const g = 9.80665
      const radians = angle * Math.PI / 180
      const accel = Math.sin(radians) * g
      updateMeasureValue(rowId, 0, accel.toFixed(3))
    } else {
      updateMeasureValue(rowId, 0, '')
    }
  }, [updateMeasureLabelValue, updateMeasureValue])

  /** 等待电机到位 */
  const waitForArrival = (timeoutMs = 30000): Promise<boolean> => {
    return new Promise(resolve => {
      const start = Date.now()
      const check = () => {
        if (abortRef.current) { resolve(false); return }
        const st = stateRef.current
        if (st.pr_status >= 20000 || (!st.is_moving && st.pr_status === 0 && Date.now() - start > 1000)) {
          resolve(true); return
        }
        if (Date.now() - start > timeoutMs) { resolve(false); return }
        setTimeout(check, 200)
      }
      setTimeout(check, 500)
    })
  }

  const handleAutoStart = async () => {
    if (isAutoRunning) return
    setIsAutoRunning(true)
    abortRef.current = false

    try {
      // 制动测试自动流程：遍历每行标准点，移动到目标角度，读取加速度值填入第一列
      // 然后重复3次读取仪器示值填入后续列
      for (const row of measureData) {
        if (abortRef.current) break
        setCurrentMeasureRow(row.id)

        const targetAngle = parseFloat(row.labelValue || '')
        if (isNaN(targetAngle)) continue

        // 发送移动指令
        await actions.moveTo(targetAngle)

        // 等待到位
        const arrived = await waitForArrival()
        if (!arrived) {
          console.warn(`行 ${row.id} 未到位，跳过`)
          continue
        }

        // 稳定延时
        await new Promise(resolve => setTimeout(resolve, 2000))

        // 读取当前加速度值（利用倾角仪数据）
        const accelValue = Math.abs(stateRef.current.incline_x).toFixed(3)
        handleCellEdit(row.id, 0, accelValue)

        // 读取 3 次仪器示值
        for (let i = 1; i <= 3; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          const reading = pulsesToAngle(stateRef.current.position)
          handleCellEdit(row.id, i, reading.toFixed(3))
        }
      }
    } catch (error) {
      console.error('自动测量出错:', error)
    } finally {
      setIsAutoRunning(false)
      setCurrentMeasureRow(null)
    }
  }

  const handleAutoClear = () => {
    resetMeasureData()
    setCurrentMeasureRow(null)
    setIsAutoRunning(false)
    setSummaryTitles([...defaultSummaryTitles])
    setSummaryValues(['', '', '', '', ''])
    setSelectedRow(null)
    setSelectedSummaryCol(null)
    setViewingRecordId(null)
  }

  // === 数据记录历史 ===
  const [showRecordList, setShowRecordList] = useState(false)

  const handleAutoRecord = async () => {
    try {
      const timestamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      const newId = await saveBrakeRecord({
        timestamp,
        measureData: measureData.map(r => ({ ...r, values: [...r.values] })),
        summaryTitles: [...summaryTitles],
        summaryValues: [...summaryValues],
      })
      // 重新加载记录列表
      const records = await getAllBrakeRecords()
      setRecordHistory(records)
      setToastMsg('数据已记录')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
    } catch (err) {
      console.error('记录保存失败:', err)
      setToastMsg('记录保存失败')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
    }
  }

  const handleViewRecord = (record: BrakeRecord) => {
    setMeasureData(record.measureData.map(r => ({ ...r, values: [...r.values] })))
    setSummaryTitles([...record.summaryTitles])
    setSummaryValues([...record.summaryValues])
    setViewingRecordId(record.id)
    setShowRecordList(false)
  }

  const handleBackToEdit = () => {
    setViewingRecordId(null)
    handleAutoClear()
  }

  const generateCSV = (data: BrakeMeasureRow[], titles: string[], values: string[]) => {
    let csv = '行号,标准点°,加速度(m/s²),示值1,示值2,示值3\n'
    for (const row of data) {
      csv += `${row.label},${row.labelValue},${row.values.join(',')}\n`
    }
    csv += '\n'
    csv += titles.join(',') + '\n'
    csv += values.join(',') + '\n'
    return csv
  }

  const handleExport = async () => {
    const csv = generateCSV(measureData, summaryTitles, summaryValues)

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const filePath = await save({
          defaultPath: `制动测试_${new Date().toISOString().slice(0, 10)}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }]
        })
        if (!filePath) return
        const content = new TextEncoder().encode('\uFEFF' + csv)
        await invoke('save_file_content', { path: filePath, content: Array.from(content) })
        setToastMsg('数据已导出')
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
      } catch (err) {
        console.error('导出失败:', err)
        setToastMsg('导出失败')
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
      }
    } else {
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `制动测试_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setToastMsg('数据已导出')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
    }
  }

  const handleExportRecord = async (record: BrakeRecord) => {
    const csv = generateCSV(record.measureData, record.summaryTitles, record.summaryValues)

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const filePath = await save({
          defaultPath: `制动测试_${record.timestamp.replace(/[\/\s:]/g, '-')}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }]
        })
        if (!filePath) return
        const content = new TextEncoder().encode('\uFEFF' + csv)
        await invoke('save_file_content', { path: filePath, content: Array.from(content) })
      } catch (err) {
        console.error('导出失败:', err)
      }
    } else {
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `制动测试_${record.timestamp.replace(/[\/\s:]/g, '-')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleDeleteRecord = async (recordId: number) => {
    try {
      await deleteBrakeRecord(recordId)
      const records = await getAllBrakeRecords()
      setRecordHistory(records)
      if (viewingRecordId === recordId) {
        handleBackToEdit()
      }
    } catch (err) {
      console.error('删除记录失败:', err)
    }
  }

  const handleSaveRecord = async () => {
    if (viewingRecordId === null) return
    try {
      await updateBrakeRecord(viewingRecordId, {
        measureData: measureData.map(r => ({ ...r, values: [...r.values] })),
        summaryTitles: [...summaryTitles],
        summaryValues: [...summaryValues],
      })
      const records = await getAllBrakeRecords()
      setRecordHistory(records)
      setToastMsg('修改已保存')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
    } catch (err) {
      console.error('保存修改失败:', err)
      setToastMsg('保存失败')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
    }
  }
  
  const handleAutoStop = () => {
    abortRef.current = true
  }

  // Convert to MeasurementRow[] for table
  const tableRows: MeasurementRow[] = measureData.map((r: BrakeMeasureRow) => ({
    id: r.id,
    label: r.label,
    labelValue: r.labelValue,
    isEditable: true,
    values: r.values,
  }))

  return (
    <div className="flex h-full overflow-hidden w-full gap-3 px-4 py-3">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border border-red-300 bg-red-600 text-white text-sm max-w-sm animate-[slideIn_0.25s_ease-out]">
          <span className="material-symbols-outlined text-base flex-shrink-0">error</span>
          <span className="flex-1">{toastMsg}</span>
          <button onClick={dismissToast} className="flex-shrink-0 hover:bg-red-500 rounded p-0.5 transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* ===== 左列 - 自由测量 ===== */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-3">
        {/* 自由测量卡片 */}
        <IndustrialCard title="自由测量" borderLeftColor="#dc2626">
          <div className="p-4 flex flex-col gap-3">
            {/* 设定值输入 */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block font-semibold">设定值°</label>
              <NumericInput
                className={inputClass}
                value={freeAngle}
                onChange={setFreeAngle}
                placeholder="0.000"
                title="设定值°"
                maxDecimalPlaces={3}
              />
            </div>

            {/* 启动/暂停/结束 按钮 */}
            <div className="flex gap-1.5">
              {freeMotorState === 'idle' ? (
                (() => {
                  const hasValid = !isNaN(parseFloat(freeAngle))
                  const isFreeDisabled = !hasValid || motorState !== 'idle'
                  const freeDisabledReason = motorState !== 'idle'
                    ? '表格启动运行中'
                    : '请先输入有效角度值'
                  return (
                    <div className="relative flex-1 group">
                      <button
                        className={`${primaryBtnClass} w-full whitespace-nowrap ${isFreeDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleFreeStart}
                        disabled={isFreeDisabled}
                      >
                        <span className="material-symbols-outlined text-sm">play_arrow</span>
                        启动
                      </button>
                      {isFreeDisabled && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                          {freeDisabledReason}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                        </div>
                      )}
                    </div>
                  )
                })()
              ) : (
                <>
                  {freeMotorState === 'running' ? (
                    <button className={`${primaryBtnClass} !bg-amber-500 hover:!bg-amber-600`} onClick={handleFreePause}>
                      <span className="material-symbols-outlined text-sm">pause</span>
                      暂停
                    </button>
                  ) : (
                    <button className={primaryBtnClass} onClick={handleFreeResume}>
                      <span className="material-symbols-outlined text-sm">play_arrow</span>
                      继续
                    </button>
                  )}
                  <button className={criticalBtnClass} onClick={handleFreeStop}>
                    <span className="material-symbols-outlined text-sm">stop</span>
                    结束
                  </button>
                </>
              )}
            </div>
          </div>
        </IndustrialCard>

        {/* 倾角仪卡片 */}
        <IndustrialCard title="倾角仪" borderLeftColor="#dc2626" className="flex-1 flex flex-col">
          <div className="p-4 flex flex-col flex-1 gap-3">
            {/* 水平仪气泡图 */}
            <div className="flex-1 flex items-center justify-center min-h-0">
              <BubbleLevel inclineX={state.incline_x} inclineY={state.incline_y} />
            </div>

            {/* X/Y轴倾斜 & 转动角度 */}
            <div className="w-full grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded border border-slate-100">
                <p className="text-xs text-on-surface-variant uppercase">X轴倾斜</p>
                <p className="text-lg font-mono font-semibold text-primary">{state.incline_x.toFixed(3)}°</p>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-100">
                <p className="text-xs text-on-surface-variant uppercase">Y轴倾斜</p>
                <p className="text-lg font-mono font-semibold text-primary">{state.incline_y.toFixed(3)}°</p>
              </div>
              <div className="col-span-2 bg-slate-50 p-3 rounded border border-slate-100">
                <p className="text-xs text-on-surface-variant uppercase">转动角度</p>
                <p className="text-lg font-mono font-semibold text-primary">{(state.position / 1000).toFixed(3)}°</p>
              </div>
            </div>

            {/* 底部按钮：调平、复位 */}
            <div className="flex gap-3">
              <button className={primaryBtnClass} onClick={handleLevel}>
                <span className="material-symbols-outlined text-sm">straighten</span>
                调平
              </button>
              <button className={primaryBtnClass} onClick={handleReset}>
                <span className="material-symbols-outlined text-sm">restart_alt</span>
                复位
              </button>
            </div>
          </div>
        </IndustrialCard>
      </div>

      {/* ===== 右列 - 表格记录 ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        <IndustrialCard
          title="表格记录"
          borderLeftColor="#dc2626"
          className="flex-1 flex flex-col"
          headerLeft={
            <div className="relative">
              <button
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                onClick={() => setShowRecordList(!showRecordList)}
              >
                <span className="material-symbols-outlined text-sm">history</span>
                记录 ({recordHistory.length})
              </button>
              {showRecordList && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRecordList(false)} />
                  <div className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-auto bg-white border border-slate-200 rounded-lg shadow-xl z-50">
                    {recordHistory.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">
                        暂无保存记录
                      </div>
                    ) : (
                      <div className="py-1">
                        {recordHistory.map((record, idx) => (
                          <div
                            key={record.id}
                            className={`flex items-center justify-between px-3 py-2 hover:bg-slate-50 ${viewingRecordId === record.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                          >
                            <button
                              className="flex-1 text-left text-sm text-slate-700 hover:text-primary"
                              onClick={() => handleViewRecord(record)}
                            >
                              <span className="font-semibold">记录 {idx + 1}</span>
                              <span className="ml-2 text-xs text-slate-400">{record.timestamp}</span>
                            </button>
                            <div className="flex items-center gap-1 ml-2">
                              <button
                                className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                                onClick={() => handleExportRecord(record)}
                                title="导出此记录"
                              >
                                <span className="material-symbols-outlined text-base">file_download</span>
                              </button>
                              <button
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                                onClick={() => handleDeleteRecord(record.id)}
                                title="删除此记录"
                              >
                                <span className="material-symbols-outlined text-base">delete</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          }
          headerRight={
            viewingRecordId ? (
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-green-600 bg-green-50 hover:bg-green-100 rounded transition-colors"
                  onClick={handleSaveRecord}
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  保存修改
                </button>
                <button
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                  onClick={handleBackToEdit}
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  返回编辑
                </button>
              </div>
            ) : isAutoRunning ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                测量中
                {currentMeasureRow && ` — ${currentMeasureRow}`}
              </span>
            ) : null
          }
        >
          <div className="flex-1 flex flex-col min-h-0">
            {/* 表格区域 */}
            <div className="flex-none overflow-auto p-4">
              <MeasurementTable
                columnHeaders={[]}
                columnGroups={brakeColumnGroups}
                rowLabelHeader="标准点°"
                rows={tableRows}
                onCellEdit={handleCellEdit}
                onLabelEdit={handleLabelEdit}
                highlightRow={isAutoRunning ? (currentMeasureRow || selectedRow) : selectedRow}
                onRowClick={handleSelectRow}
              />
            </div>

            {/* 汇总数据表 */}
            <div className="flex-none px-4 pb-2">
              <div className="w-full">
                <table className="w-full border-collapse text-sm table-fixed">
                  <thead>
                    <tr>
                      {summaryTitles.map((title: string, i: number) => (
                        <th
                          key={i}
                          className={`border border-slate-300 px-2 py-2 text-center cursor-pointer transition-colors ${
                            selectedSummaryCol === i ? 'bg-teal-600 ring-2 ring-offset-1 ring-teal-400 shadow-lg scale-[1.02]' : 'bg-teal-400/80 hover:bg-teal-500/80'
                          }`}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('input')) return
                            handleSelectSummaryCol(i)
                          }}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                              selectedSummaryCol === i ? 'bg-white border-white text-teal-600' : 'border-white/50 text-transparent hover:border-white/80'
                            }`}>
                              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check</span>
                            </span>
                            <input
                              type="text"
                              value={title}
                              onChange={(e) => updateSummaryTitle(i, e.target.value)}
                              className="flex-1 min-w-0 bg-transparent text-center text-white text-sm font-semibold font-mono outline-none placeholder-white/60"
                              placeholder="—"
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {summaryValues.map((val: string, i: number) => (
                        <td
                          key={i}
                          className={`border border-slate-300 px-1 py-0.5 text-center transition-colors ${
                            selectedSummaryCol === i ? 'bg-teal-100 ring-2 ring-teal-300 border-teal-400' : ''
                          }`}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('input, [role="textbox"]')) return
                            handleSelectSummaryCol(i)
                          }}
                        >
                          <NumericInput
                            value={val}
                            onChange={(newVal) => updateSummaryValue(i, newVal)}
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder="—"
                            title={`${summaryTitles[i]} 数据`}
                            maxDecimalPlaces={3}
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="mt-auto flex-shrink-0 px-4 pb-4 flex gap-1.5">
              {motorState === 'idle' ? (
                (() => {
                  const noSelection = selectedRow === null && selectedSummaryCol === null
                  let hasValidAngle = false
                  if (selectedRow) {
                    const row = measureData.find(r => r.id === selectedRow)
                    hasValidAngle = !!row && !isNaN(parseFloat(row.labelValue))
                  } else if (selectedSummaryCol !== null) {
                    hasValidAngle = !isNaN(parseFloat(summaryTitles[selectedSummaryCol].replace('°', '')))
                  }
                  const isDisabled = noSelection || !hasValidAngle || freeMotorState !== 'idle'
                  const disabledReason = freeMotorState !== 'idle'
                    ? '自由测量运行中'
                    : noSelection
                      ? '请先选择标准点行或汇总列'
                      : !hasValidAngle
                        ? '选中项未填写有效角度值'
                        : ''
                  return (
                    <div className="relative flex-1 min-w-[180px] group">
                      <button
                        className={`${primaryBtnClass} w-full whitespace-nowrap ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleStartMove}
                        disabled={isDisabled}
                      >
                        <span className="material-symbols-outlined text-sm">play_arrow</span>
                        {selectedRow
                          ? `启动 (${measureData.find(r => r.id === selectedRow)?.labelValue || '—'}°)`
                          : selectedSummaryCol !== null
                            ? `启动 (${summaryTitles[selectedSummaryCol]})`
                            : '启动'}
                      </button>
                      {isDisabled && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                          {disabledReason}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                        </div>
                      )}
                    </div>
                  )
                })()
              ) : (
                <>
                  {motorState === 'running' ? (
                    <button className={`${primaryBtnClass} !bg-amber-500 hover:!bg-amber-600`} onClick={handlePause}>
                      <span className="material-symbols-outlined text-sm">pause</span>
                      暂停
                    </button>
                  ) : (
                    <button className={primaryBtnClass} onClick={handleResume}>
                      <span className="material-symbols-outlined text-sm">play_arrow</span>
                      继续
                    </button>
                  )}
                  <button className={criticalBtnClass} onClick={handleStop}>
                    <span className="material-symbols-outlined text-sm">stop</span>
                    结束
                  </button>
                </>
              )}
              <button
                className={criticalBtnClass}
                onClick={handleAutoClear}
              >
                <span className="material-symbols-outlined text-sm">delete_sweep</span>
                清除
              </button>
              <button
                className={primaryBtnClass}
                onClick={handleAutoRecord}
              >
                <span className="material-symbols-outlined text-sm">save</span>
                记录
              </button>
              <button
                className={primaryBtnClass}
                onClick={handleExport}
              >
                <span className="material-symbols-outlined text-sm">file_download</span>
                导出
              </button>
            </div>
          </div>
        </IndustrialCard>
      </div>
    </div>
  )
}
