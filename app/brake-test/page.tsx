"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDevice } from '@/lib/comm/use-device'
import { pulsesToAngle } from '@/lib/comm/types'
import type { DeviceState } from '@/lib/comm/types'
import IndustrialCard from '@/components/ui/IndustrialCard'
import MeasurementTable from '@/components/ui/MeasurementTable'
import type { MeasurementRow, ColumnGroup } from '@/components/ui/MeasurementTable'
import NumericInput from '@/components/ui/NumericInput'

const inputClass = "w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
const primaryBtnClass = "flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
const criticalBtnClass = "flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"

// 制动测试列组配置
const brakeColumnGroups: ColumnGroup[] = [
  { label: '加速度\nm/s²', columns: [''], editable: false },
  { label: '仪器示值', columns: ['1', '2', '3'], editable: true },
]

interface BrakeMeasureRow {
  id: string
  label: string
  labelValue: string
  values: string[] // [加速度, 示值1, 示值2, 示值3]
}

const initialBrakeData: BrakeMeasureRow[] = [
  { id: 'A1', label: 'A1', labelValue: '', values: ['', '', '', ''] },
  { id: 'A2', label: 'A2', labelValue: '', values: ['', '', '', ''] },
  { id: 'A3', label: 'A3', labelValue: '', values: ['', '', '', ''] },
  { id: 'A4', label: 'A4', labelValue: '', values: ['', '', '', ''] },
  { id: 'A5', label: 'A5', labelValue: '', values: ['', '', '', ''] },
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

  // === 自由测量 ===
  const [freeAngle, setFreeAngle] = useState('')
  const [isFreeRunning, setIsFreeRunning] = useState(false)

  const handleFreeStart = async () => {
    const angle = parseFloat(freeAngle)
    if (isNaN(angle)) return
    setIsFreeRunning(true)
    await actions.moveTo(angle)
    setIsFreeRunning(false)
  }

  const handleLevel = async () => {
    await actions.startHoming()
  }

  const handleReset = async () => {
    await actions.reset()
  }

  // === 表格记录 ===
  const [measureData, setMeasureData] = useState<BrakeMeasureRow[]>(
    initialBrakeData.map(r => ({ ...r, values: [...r.values] }))
  )
  const [isAutoRunning, setIsAutoRunning] = useState(false)
  const [currentMeasureRow, setCurrentMeasureRow] = useState<string | null>(null)

  // 实时数据展示（最近5次角度读数）
  const [liveReadings, setLiveReadings] = useState<string[]>(['—', '—', '—', '—', '—'])

  // 监听 position 变化，更新实时读数
  const liveReadingsRef = useRef(liveReadings)
  liveReadingsRef.current = liveReadings

  useEffect(() => {
    if (state.position !== 0) {
      const angle = Math.abs(pulsesToAngle(state.position)).toFixed(1)
      setLiveReadings(prev => {
        const next = [...prev.slice(1), `${angle}°`]
        return next
      })
    }
  }, [state.position])

  const handleCellEdit = useCallback((rowId: string, colIndex: number, value: string) => {
    setMeasureData(prev =>
      prev.map(row =>
        row.id === rowId
          ? { ...row, values: row.values.map((v, i) => (i === colIndex ? value : v)) }
          : row
      )
    )
  }, [])

  const handleLabelEdit = useCallback((rowId: string, value: string) => {
    setMeasureData(prev =>
      prev.map(row =>
        row.id === rowId ? { ...row, labelValue: value } : row
      )
    )
  }, [])

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
    setMeasureData(initialBrakeData.map(r => ({ ...r, values: [...r.values], labelValue: '' })))
    setCurrentMeasureRow(null)
    setIsAutoRunning(false)
    setLiveReadings(['—', '—', '—', '—', '—'])
  }

  // === 数据记录历史 ===
  const [recordHistory, setRecordHistory] = useState<BrakeMeasureRow[][]>([])
  
  const handleAutoRecord = () => {
    setRecordHistory((prev: BrakeMeasureRow[][]) => [...prev, measureData.map((r: BrakeMeasureRow) => ({ ...r, values: [...r.values] }))])
    setToastMsg('数据已记录')
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
  }
  
  const handleExport = () => {
    let csv = '行号,标准点°,加速度(m/s²),示值1,示值2,示值3\n'
    for (const row of measureData) {
      csv += `${row.label},${row.labelValue},${row.values.join(',')}\n`
    }
    if (recordHistory.length > 0) {
      csv += '\n--- 历史记录 ---\n'
      recordHistory.forEach((record: BrakeMeasureRow[], idx: number) => {
        csv += `\n记录 ${idx + 1}\n`
        csv += '行号,标准点°,加速度(m/s²),示值1,示值2,示值3\n'
        for (const row of record) {
          csv += `${row.label},${row.labelValue},${row.values.join(',')}\n`
        }
      })
    }
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
              />
            </div>

            {/* 启动按钮 */}
            <button
              className={`${primaryBtnClass} !flex-none py-2.5`}
              onClick={handleFreeStart}
              disabled={isFreeRunning}
            >
              {isFreeRunning ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  运行中...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  启动
                </>
              )}
            </button>
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
          headerRight={
            isAutoRunning ? (
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
                highlightRow={currentMeasureRow}
              />
            </div>

            {/* 实时数据展示条 */}
            <div className="flex-none px-4 pb-2">
              <div className="flex gap-2">
                {liveReadings.map((val: string, i: number) => (
                  <div
                    key={i}
                    className="flex-1 px-2 py-3 bg-white border border-slate-300 rounded-lg text-center"
                  >
                    <span className="text-2xl font-mono font-bold text-slate-800">
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 扩展数据区 */}
            <div className="flex-1 overflow-auto px-4 pb-2 min-h-[60px]">
              <div className="w-full border border-slate-200 rounded-lg bg-white min-h-full" />
            </div>

            {/* 底部按钮 */}
            <div className="flex-shrink-0 px-4 pb-4 flex gap-3">
              <button
                className={primaryBtnClass}
                onClick={handleAutoStart}
                disabled={isAutoRunning}
              >
                <span className="material-symbols-outlined text-sm">play_arrow</span>
                启动
              </button>
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
