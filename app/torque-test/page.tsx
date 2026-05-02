"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import IndustrialCard from '@/components/ui/IndustrialCard'
import NumericInput from '@/components/ui/NumericInput'

type UnitType = 'N' | 'Nm'

const inputClass = "w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
const disabledInputClass = "w-full px-2 py-1.5 bg-slate-100 border border-slate-300 rounded text-sm font-mono text-slate-400 cursor-not-allowed"
const primaryBtnClass = "px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
const criticalBtnClass = "px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"

interface TorqueRow {
  id: string
  direction: 'cw' | 'ccw'
  standardPoint: string
  values: [string, string, string]
  average: number | null
  error: number | null
  repeatability: number | null
}

const createInitialRows = (): TorqueRow[] => {
  const rows: TorqueRow[] = []
  for (let i = 1; i <= 5; i++) {
    rows.push({
      id: `CW${i}`,
      direction: 'cw',
      standardPoint: i === 1 ? 'A1' : '',
      values: ['', '', ''],
      average: null,
      error: null,
      repeatability: null,
    })
  }
  for (let i = 1; i <= 5; i++) {
    rows.push({
      id: `CCW${i}`,
      direction: 'ccw',
      standardPoint: '',
      values: ['', '', ''],
      average: null,
      error: null,
      repeatability: null,
    })
  }
  return rows
}

const calculateRow = (row: TorqueRow): TorqueRow => {
  const vals = row.values.map(v => parseFloat(v)).filter(v => !isNaN(v))
  if (vals.length === 3) {
    const avg = (vals[0] + vals[1] + vals[2]) / 3
    const std = parseFloat(row.standardPoint)
    const error = !isNaN(std) && std !== 0 ? ((avg - std) / std) * 100 : null
    const repeat = avg !== 0 ? ((Math.max(...vals) - Math.min(...vals)) / avg) * 100 : null
    return { ...row, average: avg, error, repeatability: repeat }
  }
  return { ...row, average: null, error: null, repeatability: null }
}

export default function TorqueTestPage() {
  // === 单位选择 ===
  const [unit, setUnit] = useState<UnitType>('N')

  // === 实时力矩值（模拟） ===
  const [liveValue, setLiveValue] = useState('23.4')

  // === 表格数据 ===
  const [rows, setRows] = useState<TorqueRow[]>(createInitialRows)

  // === 漂移测试 ===
  const [driftValues, setDriftValues] = useState({ min0: '', min5: '', min10: '' })
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const canEdit5min = elapsedSeconds >= 300
  const canEdit10min = elapsedSeconds >= 600

  const driftResult = (() => {
    const v10 = parseFloat(driftValues.min10)
    const v0 = parseFloat(driftValues.min0)
    if (!isNaN(v10) && !isNaN(v0)) return (v10 - v0).toFixed(2)
    return ''
  })()

  const formatRemaining = (targetSeconds: number) => {
    const remaining = Math.max(0, targetSeconds - elapsedSeconds)
    const min = Math.floor(remaining / 60)
    const sec = remaining % 60
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  // 启动漂移测试
  const startDriftTest = () => {
    if (!driftValues.min0) return
    setIsTimerRunning(true)
    setElapsedSeconds(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1)
    }, 1000)
  }

  // 清理 timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // 10min 倒计时结束后停止
  useEffect(() => {
    if (elapsedSeconds >= 600 && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [elapsedSeconds])

  // === 表格编辑 ===
  const handleStandardPointEdit = useCallback((rowId: string, value: string) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row
        const updated = { ...row, standardPoint: value }
        return calculateRow(updated)
      })
    )
  }, [])

  const handleValueEdit = useCallback((rowId: string, colIndex: number, value: string) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row
        const newValues: [string, string, string] = [...row.values]
        newValues[colIndex] = value
        const updated = { ...row, values: newValues }
        return calculateRow(updated)
      })
    )
  }, [])

  // === 操作按钮 ===
  const handleZero = () => {
    setLiveValue('0.0')
  }

  const handleClear = () => {
    setRows(createInitialRows())
    setDriftValues({ min0: '', min5: '', min10: '' })
    setIsTimerRunning(false)
    setElapsedSeconds(0)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleExport = () => {
    // 构建 CSV
    let csv = '方向,标准点,示值1,示值2,示值3,平均值,示值误差%,重复性%\n'
    for (const row of rows) {
      const dir = row.direction === 'cw' ? '顺时针' : '逆时针'
      csv += `${dir},${row.standardPoint},${row.values.join(',')},${row.average !== null ? row.average.toFixed(2) : ''},${row.error !== null ? row.error.toFixed(2) : ''},${row.repeatability !== null ? row.repeatability.toFixed(2) : ''}\n`
    }
    // 漂移数据
    csv += '\n漂移测试\n'
    csv += '0min,5min,10min,漂移\n'
    csv += `${driftValues.min0},${driftValues.min5},${driftValues.min10},${driftResult}\n`

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `力矩测试_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatNum = (val: number | null) => {
    if (val === null) return '—'
    return val.toFixed(2)
  }

  const cwRows = rows.filter(r => r.direction === 'cw')
  const ccwRows = rows.filter(r => r.direction === 'ccw')

  const unitLabel = unit === 'N' ? '转向力/N' : '力矩/Nm'

  return (
    <div className="flex flex-col h-full overflow-hidden w-full px-4 py-3 gap-3">
      {/* ===== 顶部操作栏 ===== */}
      <IndustrialCard borderLeftColor="#dc2626">
        <div className="flex items-center gap-3 p-4">
        {/* 单位选择 - Segmented Button */}
        <div className="flex-shrink-0 flex rounded-lg border border-slate-300 overflow-hidden">
          <button
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              unit === 'N'
                ? 'bg-primary text-on-primary'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setUnit('N')}
          >
            转向力/N
          </button>
          <button
            className={`px-3 py-2 text-sm font-semibold transition-colors border-l border-slate-300 ${
              unit === 'Nm'
                ? 'bg-primary text-on-primary'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setUnit('Nm')}
          >
            力矩/Nm
          </button>
        </div>

        {/* 实时力矩值 */}
        <div className="flex-1 max-w-md px-4 py-2 bg-primary-fixed border-2 border-primary-fixed-dim rounded-lg text-center">
          <span className="text-xl font-mono font-bold text-primary">{liveValue}{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className={primaryBtnClass} onClick={handleZero}>
            <span className="material-symbols-outlined text-sm">exposure_zero</span>
            清零
          </button>
          <button className={criticalBtnClass} onClick={handleClear}>
            <span className="material-symbols-outlined text-sm">delete_sweep</span>
            清除
          </button>
          <button className={primaryBtnClass} onClick={handleExport}>
            <span className="material-symbols-outlined text-sm">file_download</span>
            导出记录
          </button>
        </div>
      </div>
      </IndustrialCard>

      {/* ===== 转向力/力矩 表格 ===== */}
      <IndustrialCard className="flex-1 flex flex-col min-h-0" borderLeftColor="#dc2626">
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* 表头第一行：标题 + 仪器示值合并 */}
              <tr>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[72px]"
                >
                  方向
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[100px]"
                >
                  标准点
                </th>
                <th
                  colSpan={3}
                  className="border border-slate-300 bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  {unitLabel}
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[80px]"
                >
                  平均值
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[80px]"
                >
                  示值误差%
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[80px]"
                >
                  重复性%
                </th>
              </tr>
              {/* 表头第二行：1, 2, 3 */}
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[80px]">1</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[80px]">2</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[80px]">3</th>
              </tr>
            </thead>
            <tbody>
              {/* 顺时针 5 行 */}
              {cwRows.map((row, i) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50">
                  {i === 0 && (
                    <td
                      rowSpan={5}
                      className="border border-slate-300 text-center font-semibold text-slate-600 align-middle w-[72px]"
                    >
                      <span className="inline-block text-xs" style={{ writingMode: 'vertical-rl' }}>顺时针</span>
                    </td>
                  )}
                  <td className="border border-slate-300 px-1 py-0.5">
                    <NumericInput
                      className={inputClass}
                      value={row.standardPoint}
                      onChange={val => handleStandardPointEdit(row.id, val)}
                      placeholder="—"
                      title="标准点"
                    />
                  </td>
                  {([0, 1, 2] as const).map(ci => (
                    <td key={ci} className="border border-slate-300 px-1 py-0.5">
                      <NumericInput
                        className={inputClass}
                        value={row.values[ci]}
                        onChange={val => handleValueEdit(row.id, ci, val)}
                        placeholder="—"
                        title={`仪器示值 ${ci + 1}`}
                      />
                    </td>
                  ))}
                  <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.average)}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.error)}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.repeatability)}</td>
                </tr>
              ))}
              {/* 逆时针 5 行 */}
              {ccwRows.map((row, i) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50">
                  {i === 0 && (
                    <td
                      rowSpan={5}
                      className="border border-slate-300 text-center font-semibold text-slate-600 align-middle w-[72px]"
                    >
                      <span className="inline-block text-xs" style={{ writingMode: 'vertical-rl' }}>逆时针</span>
                    </td>
                  )}
                  <td className="border border-slate-300 px-1 py-0.5">
                    <NumericInput
                      className={inputClass}
                      value={row.standardPoint}
                      onChange={val => handleStandardPointEdit(row.id, val)}
                      placeholder="—"
                      title="标准点"
                    />
                  </td>
                  {([0, 1, 2] as const).map(ci => (
                    <td key={ci} className="border border-slate-300 px-1 py-0.5">
                      <NumericInput
                        className={inputClass}
                        value={row.values[ci]}
                        onChange={val => handleValueEdit(row.id, ci, val)}
                        placeholder="—"
                        title={`仪器示值 ${ci + 1}`}
                      />
                    </td>
                  ))}
                  <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.average)}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.error)}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.repeatability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IndustrialCard>

      {/* ===== 漂移测试区 ===== */}
      <IndustrialCard className="flex-shrink-0" borderLeftColor="#dc2626">
        <div className="p-4">
          <div className="grid grid-cols-4 gap-3">
            {/* 0min */}
            <div>
              <div className="bg-primary text-on-primary px-3 py-1.5 rounded-t-lg font-semibold text-sm">0min</div>
              <div className="border border-t-0 border-slate-200 rounded-b-lg p-2 bg-white">
                <NumericInput
                  className={disabledInputClass.replace('bg-slate-100', 'bg-white').replace('text-slate-400 cursor-not-allowed', 'text-slate-700')}
                  value={driftValues.min0}
                  onChange={val => setDriftValues(prev => ({ ...prev, min0: val }))}
                  placeholder="录入值"
                  title="0min"
                />
                <button
                  className={`${primaryBtnClass} w-full mt-2 text-xs`}
                  onClick={startDriftTest}
                  disabled={isTimerRunning || !driftValues.min0}
                >
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  启动
                </button>
              </div>
            </div>

            {/* 5min */}
            <div>
              <div className="bg-primary text-on-primary px-3 py-1.5 rounded-t-lg font-semibold text-sm flex items-center justify-between">
                <span>5min</span>
                {isTimerRunning && !canEdit5min && (
                  <span className="text-xs font-mono opacity-80">({formatRemaining(300)})</span>
                )}
                {canEdit5min && <span className="text-xs opacity-80">✓</span>}
              </div>
              <div className="border border-t-0 border-slate-200 rounded-b-lg p-2 bg-white">
                <NumericInput
                  className={canEdit5min ? disabledInputClass.replace('bg-slate-100', 'bg-white').replace('text-slate-400 cursor-not-allowed', 'text-slate-700') : disabledInputClass}
                  value={driftValues.min5}
                  onChange={val => setDriftValues(prev => ({ ...prev, min5: val }))}
                  disabled={!canEdit5min}
                  placeholder={canEdit5min ? '录入值' : '等待中...'}
                  title="5min"
                />
              </div>
            </div>

            {/* 10min */}
            <div>
              <div className="bg-primary text-on-primary px-3 py-1.5 rounded-t-lg font-semibold text-sm flex items-center justify-between">
                <span>10min</span>
                {isTimerRunning && !canEdit10min && (
                  <span className="text-xs font-mono opacity-80">({formatRemaining(600)})</span>
                )}
                {canEdit10min && <span className="text-xs opacity-80">✓</span>}
              </div>
              <div className="border border-t-0 border-slate-200 rounded-b-lg p-2 bg-white">
                <NumericInput
                  className={canEdit10min ? disabledInputClass.replace('bg-slate-100', 'bg-white').replace('text-slate-400 cursor-not-allowed', 'text-slate-700') : disabledInputClass}
                  value={driftValues.min10}
                  onChange={val => setDriftValues(prev => ({ ...prev, min10: val }))}
                  disabled={!canEdit10min}
                  placeholder={canEdit10min ? '录入值' : '等待中...'}
                  title="10min"
                />
              </div>
            </div>

            {/* 漂移 */}
            <div>
              <div className="bg-primary text-on-primary px-3 py-1.5 rounded-t-lg font-semibold text-sm">漂移</div>
              <div className="border border-t-0 border-slate-200 rounded-b-lg p-2 bg-white">
                <input
                  className={disabledInputClass}
                  value={driftResult}
                  disabled
                  placeholder="自动计算"
                />
              </div>
            </div>
          </div>
        </div>
      </IndustrialCard>
    </div>
  )
}
