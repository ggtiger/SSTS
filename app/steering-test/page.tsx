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

const inputClass = "w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
const primaryBtnClass = "flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
const criticalBtnClass = "flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"

interface AutoMeasureRow {
  id: string
  label: string
  labelValue: string
  isEditable: boolean
  values: string[]
}

const initialMeasureData: AutoMeasureRow[] = [
  { id: 'A1', label: 'A1', labelValue: '', isEditable: true, values: ['', '', ''] },
  { id: 'A2', label: 'A2', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'A3', label: 'A3', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'A4', label: 'A4', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'A5', label: 'A5', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'B1', label: 'B1', labelValue: '', isEditable: true, values: ['', '', ''] },
  { id: 'B2', label: 'B2', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'B3', label: 'B3', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'B4', label: 'B4', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'B5', label: 'B5', labelValue: '', isEditable: false, values: ['', '', ''] },
]

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

  const handleZeroSet = async () => {
    await actions.reset()
  }

  const handleGoHome = async () => {
    await actions.startHoming()
  }

  // === 自动测量 ===
  const [measureData, setMeasureData] = useState<AutoMeasureRow[]>(
    initialMeasureData.map(r => ({ ...r, values: [...r.values] }))
  )
  const [isAutoRunning, setIsAutoRunning] = useState(false)
  const [currentMeasureRow, setCurrentMeasureRow] = useState<string | null>(null)
  const [currentMeasureRound, setCurrentMeasureRound] = useState(0)

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

        const autoRows = measureData.filter((r: AutoMeasureRow) => !r.isEditable)
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

  const handleAutoClear = () => {
    setMeasureData(initialMeasureData.map(r => ({ ...r, values: [...r.values], labelValue: '' })))
    setCurrentMeasureRow(null)
    setCurrentMeasureRound(0)
    setIsAutoRunning(false)
  }

  // === 数据记录历史 ===
  const [recordHistory, setRecordHistory] = useState<AutoMeasureRow[][]>([])

  const handleAutoRecord = () => {
    setRecordHistory((prev: AutoMeasureRow[][]) => [...prev, measureData.map((r: AutoMeasureRow) => ({ ...r, values: [...r.values] }))])
    setToastMsg('数据已记录')
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
  }

  const handleExport = () => {
    // 构建 CSV
    let csv = '行号,标准点°,示值1,示值2,示值3\n'
    for (const row of measureData) {
      csv += `${row.label},${row.labelValue},${row.values.join(',')}\n`
    }
    if (recordHistory.length > 0) {
      csv += '\n--- 历史记录 ---\n'
      recordHistory.forEach((record: AutoMeasureRow[], idx: number) => {
        csv += `\n记录 ${idx + 1}\n`
        csv += '行号,标准点°,示值1,示值2,示值3\n'
        for (const row of record) {
          csv += `${row.label},${row.labelValue},${row.values.join(',')}\n`
        }
      })
    }
    // 浏览器 Blob 下载
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

  const handleAutoStop = () => {
    abortRef.current = true
  }

  // Convert AutoMeasureRow[] to MeasurementRow[] for the table component
  const tableRows: MeasurementRow[] = measureData.map((r: AutoMeasureRow) => ({
    id: r.id,
    label: r.label,
    labelValue: r.labelValue,
    isEditable: r.isEditable,
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

            {/* 底部按钮：置零、归零 */}
            <div className="flex gap-3">
              <button className={primaryBtnClass} onClick={handleZeroSet}>
                <span className="material-symbols-outlined text-sm">exposure_zero</span>
                置零
              </button>
              <button className={primaryBtnClass} onClick={handleGoHome}>
                <span className="material-symbols-outlined text-sm">home</span>
                归零
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
          headerRight={
            isAutoRunning ? (
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
                highlightRow={currentMeasureRow}
              />
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
