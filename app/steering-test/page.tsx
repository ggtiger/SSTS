"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDevice } from '@/lib/comm/use-device'
import { pulsesToAngle } from '@/lib/comm/types'
import type { DeviceState } from '@/lib/comm/types'
import IndustrialCard from '@/components/ui/IndustrialCard'
import AngleGauge from '@/components/ui/AngleGauge'
import MeasurementTable from '@/components/ui/MeasurementTable'
import type { MeasurementRow } from '@/components/ui/MeasurementTable'
import NumericInput from '@/components/ui/NumericInput'
import { useSteeringStore, initialSteeringData } from '@/lib/store/steering-store'
import type { SteeringMeasureRow, SteeringRecord } from '@/lib/store/steering-store'
import { initSteeringDB, saveSteeringRecord, getAllSteeringRecords, updateSteeringRecord, deleteSteeringRecord } from '@/lib/db/steering-records'
import { isTauri } from '@/lib/tauri'

const inputClass = "w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
const primaryBtnClass = "flex-1 px-3 py-1.5 bg-primary hover:bg-primary/90 text-on-primary text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
const criticalBtnClass = "flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"

export default function SteeringTestPage() {
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
    freeAngle, setFreeAngle,
    selectedRow, setSelectedRow,
    recordHistory, setRecordHistory,
    viewingRecordId, setViewingRecordId,
  } = useSteeringStore()

  // 页面 mount 时初始化 DB 并加载记录
  useEffect(() => {
    const loadRecords = async () => {
      try {
        await initSteeringDB()
        const records = await getAllSteeringRecords()
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

  const handleZeroSet = async () => {
    await actions.reset()
  }

  const handleGoHome = async () => {
    await actions.startHoming()
  }

  // === 自动测量 ===
  const [isAutoRunning, setIsAutoRunning] = useState(false)

  // 选中行启动状态机
  const [motorState, setMotorState] = useState<'idle' | 'running' | 'paused'>('idle')
  const motorStateRef = useRef<'idle' | 'running' | 'paused'>('idle')
  const targetAngleRef = useRef<number | null>(null)

  const updateMotorState = useCallback((s: 'idle' | 'running' | 'paused') => {
    motorStateRef.current = s
    setMotorState(s)
  }, [])

  // 全局运行状态：自由测量、自动测量、选中行启动互斥
  const isAnyRunning = freeMotorState !== 'idle' || isAutoRunning || motorState !== 'idle'
  const [currentMeasureRow, setCurrentMeasureRow] = useState<string | null>(null)
  const [currentMeasureRound, setCurrentMeasureRound] = useState(0)
  const [showRecordList, setShowRecordList] = useState(false)

  const handleCellEdit = useCallback((rowId: string, colIndex: number, value: string) => {
    updateMeasureValue(rowId, colIndex, value)
  }, [updateMeasureValue])

  const handleLabelEdit = useCallback((rowId: string, value: string) => {
    updateMeasureLabelValue(rowId, value)
  }, [updateMeasureLabelValue])

  const handleSelectRow = (rowId: string) => {
    if (isAnyRunning) return  // 运行中禁止改选
    setSelectedRow(selectedRow === rowId ? null : rowId)
  }

  /** 等待电机到位：轮询 pr_status >= 20000 或超时 */
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
      for (let round = 1; round <= 3; round++) {
        setCurrentMeasureRound(round)

        const autoRows = measureData.filter((r: SteeringMeasureRow) => !r.isEditable)
        for (const row of autoRows) {
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

          // 读取当前角度
          const currentAngle = pulsesToAngle(stateRef.current.position)
          handleCellEdit(row.id, round - 1, currentAngle.toFixed(3))
        }
        if (abortRef.current) break
      }
    } catch (error) {
      console.error('自动测量出错:', error)
    } finally {
      setIsAutoRunning(false)
      setCurrentMeasureRow(null)
      setCurrentMeasureRound(0)
    }
  }

  const handleStartMove = async () => {
    if (!selectedRow) return
    const row = measureData.find(r => r.id === selectedRow)
    if (!row) return
    const targetAngle = parseFloat(row.labelValue)
    if (isNaN(targetAngle)) return

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

  const handleAutoClear = () => {
    resetMeasureData()
    setCurrentMeasureRow(null)
    setCurrentMeasureRound(0)
    setIsAutoRunning(false)
    setViewingRecordId(null)
    setSelectedRow(null)
  }

  // === 数据记录历史 ===

  const handleAutoRecord = async () => {
    try {
      const timestamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      await saveSteeringRecord({
        timestamp,
        measureData: measureData.map(r => ({ ...r, values: [...r.values] })),
      })
      const records = await getAllSteeringRecords()
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

  const handleViewRecord = (record: SteeringRecord) => {
    setMeasureData(record.measureData.map(r => ({ ...r, values: [...r.values] })))
    setViewingRecordId(record.id)
    setShowRecordList(false)
  }

  const handleBackToEdit = () => {
    setViewingRecordId(null)
    handleAutoClear()
  }

  const handleDeleteRecord = async (recordId: number) => {
    try {
      await deleteSteeringRecord(recordId)
      const records = await getAllSteeringRecords()
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
      await updateSteeringRecord(viewingRecordId, {
        measureData: measureData.map(r => ({ ...r, values: [...r.values] })),
      })
      const records = await getAllSteeringRecords()
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

  const handleExportRecord = async (record: SteeringRecord) => {
    let csv = '行号,标准点°,示值1,示值2,示值3\n'
    for (const row of record.measureData) {
      csv += `${row.label},${row.labelValue},${row.values.join(',')}\n`
    }
    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const filePath = await save({
          defaultPath: `转向测试_${record.timestamp.replace(/[\/\s:]/g, '-')}.csv`,
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
      a.download = `转向测试_${record.timestamp.replace(/[\/\s:]/g, '-')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleExport = async () => {
    let csv = '行号,标准点°,示值1,示值2,示值3\n'
    for (const row of measureData) {
      csv += `${row.label},${row.labelValue},${row.values.join(',')}\n`
    }

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const filePath = await save({
          defaultPath: `转向测试_${new Date().toISOString().slice(0, 10)}.csv`,
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
      a.download = `转向测试_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setToastMsg('数据已导出')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
    }
  }

  const handleAutoStop = () => {
    abortRef.current = true
  }

  // Convert to MeasurementRow[] for table
  const tableRows: MeasurementRow[] = measureData.map((r: SteeringMeasureRow) => ({
    id: r.id,
    label: r.label,
    labelValue: r.labelValue,
    isEditable: true,  // 所有仪器示值列均可录入
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
                  const isFreeDisabled = !hasValid || isAutoRunning
                  const freeDisabledReason = isAutoRunning
                    ? '自动测量运行中'
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

        {/* 角度仪表卡片 */}
        <IndustrialCard title="角度仪表" borderLeftColor="#dc2626" className="flex-1 flex flex-col">
          <div className="p-4 flex flex-col flex-1 gap-3">
            {/* AngleGauge 仪表盘 */}
            <div className="flex-1 flex items-center justify-center min-h-0">
              <AngleGauge
                value={pulsesToAngle(state.position)}
                min={-180}
                max={180}
                label="当前角度"
              />
            </div>

            {/* 底部按钮：置零 */}
            <div className="flex gap-3">
              <button className={primaryBtnClass} onClick={handleZeroSet}>
                <span className="material-symbols-outlined text-sm">exposure_zero</span>
                置零
              </button>
            </div>
          </div>
        </IndustrialCard>
      </div>

      {/* ===== 右列 - 自动测量 ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        <IndustrialCard
          title="自动测量"
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
                      <div className="px-4 py-6 text-center text-sm text-slate-400">暂无保存记录</div>
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
                第 {currentMeasureRound} 轮测量中
                {currentMeasureRow && ` — ${currentMeasureRow}`}
              </span>
            ) : null
          }
        >
          <div className="flex-1 flex flex-col min-h-0">
            {/* 表格区域 */}
            <div className="flex-1 overflow-auto p-4">
              <MeasurementTable
                columnHeaders={['1', '2', '3']}
                columnGroupLabel="仪器示值°"
                rowLabelHeader="标准点°"
                rows={tableRows}
                onCellEdit={handleCellEdit}
                onLabelEdit={handleLabelEdit}
                highlightRow={isAutoRunning ? (currentMeasureRow || selectedRow) : selectedRow}
                onRowClick={handleSelectRow}
              />
            </div>

            {/* 底部按钮 */}
            <div className="flex-shrink-0 px-4 pb-4 flex gap-1.5">
              {motorState === 'idle' ? (
                (() => {
                  const noSelection = selectedRow === null
                  let hasValidAngle = false
                  if (selectedRow) {
                    const row = measureData.find(r => r.id === selectedRow)
                    hasValidAngle = !!row && !isNaN(parseFloat(row.labelValue))
                  }
                  const isDisabled = noSelection || !hasValidAngle || freeMotorState !== 'idle' || isAutoRunning
                  const disabledReason = freeMotorState !== 'idle'
                    ? '自由测量运行中'
                    : isAutoRunning
                      ? '自动测量运行中'
                      : noSelection
                        ? '请先选择标准点行'
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
              <button className={criticalBtnClass} onClick={handleAutoClear}>
                <span className="material-symbols-outlined text-sm">delete_sweep</span>
                清除
              </button>
              <button className={primaryBtnClass} onClick={handleAutoRecord}>
                <span className="material-symbols-outlined text-sm">save</span>
                记录
              </button>
              <button className={primaryBtnClass} onClick={handleExport}>
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
