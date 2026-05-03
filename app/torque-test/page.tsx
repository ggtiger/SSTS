"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { useScale } from '@/lib/comm/use-scale'
import type { ScaleDeviceInfo } from '@/lib/comm/types'
import IndustrialCard from '@/components/ui/IndustrialCard'
import StatusIndicator from '@/components/ui/StatusIndicator'
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
  // === BLE 称重模块 ===
  const { state: scaleState, actions: scaleActions, error: scaleError } = useScale()
  const [devices, setDevices] = useState<ScaleDeviceInfo[]>([])
  const [scanLoading, setScanLoading] = useState(false)
  const scaleDataRef = useRef(scaleState.data)
  scaleDataRef.current = scaleState.data

  // === 单位选择 ===
  const [unit, setUnit] = useState<UnitType>('N')

  // === 表格数据 ===
  const [rows, setRows] = useState<TorqueRow[]>(createInitialRows)

  // === 自动测量 ===
  const [isAutoMeasuring, setIsAutoMeasuring] = useState(false)
  const abortAutoRef = useRef(false)

  // === 漂移测试 ===
  const [driftValues, setDriftValues] = useState({ min0: '', min5: '', min10: '' })
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // === 力值校正 ===
  const [standardValue, setStandardValue] = useState<string>('')
  const [correctionCoefficient, setCorrectionCoefficient] = useState<string>('')

  // === Toast ===
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (scaleError) {
      setToastMsg(scaleError)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => {
        setToastMsg(null)
        scaleActions.clearError()
      }, 4000)
    }
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current) }
  }, [scaleError])

  const dismissToast = () => {
    setToastMsg(null)
    scaleActions.clearError()
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }

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

  const startDriftTest = () => {
    if (!driftValues.min0) return
    setIsTimerRunning(true)
    setElapsedSeconds(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1)
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (elapsedSeconds >= 600 && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [elapsedSeconds])

  // === 实时力值 ===
  const liveValue = scaleState.data
    ? scaleState.data.weightN.toFixed(3)
    : '---'

  // === BLE 操作 ===
  const handleScan = async () => {
    setScanLoading(true)
    setDevices([])
    try {
      const result = await scaleActions.scan()
      if (result) setDevices(result)
    } finally {
      setScanLoading(false)
    }
  }

  const handleConnect = async (address: string) => {
    await scaleActions.connect(address)
  }

  const handleDisconnect = async () => {
    await scaleActions.disconnect()
    setDevices([])
  }

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
  const handleZero = async () => {
    if (scaleState.isConnected) {
      await scaleActions.zero()
    }
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
    let csv = '方向,标准点,示值1,示值2,示值3,平均值,示值误差%,重复性%\n'
    for (const row of rows) {
      const dir = row.direction === 'cw' ? '顺时针' : '逆时针'
      csv += `${dir},${row.standardPoint},${row.values.join(',')},${row.average !== null ? row.average.toFixed(2) : ''},${row.error !== null ? row.error.toFixed(2) : ''},${row.repeatability !== null ? row.repeatability.toFixed(2) : ''}\n`
    }
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

  // === 自动测量 ===
  const handleAutoMeasure = async () => {
    if (!scaleState.isConnected || !scaleState.data) return
    setIsAutoMeasuring(true)
    abortAutoRef.current = false
    try {
      for (const row of rows) {
        if (abortAutoRef.current) break
        for (let i = 0; i < 3; i++) {
          if (abortAutoRef.current) break
          await new Promise(r => setTimeout(r, 2000))
          const value = scaleDataRef.current?.weightN ?? 0
          handleValueEdit(row.id, i, value.toFixed(2))
        }
      }
    } finally {
      setIsAutoMeasuring(false)
    }
  }

  const handleAutoStop = () => {
    abortAutoRef.current = true
  }

  // === 力值校正 ===
  const handleCalibration = () => {
    const currentForce = scaleState.data?.weightN
    const standard = parseFloat(standardValue)
    if (currentForce && standard && standard !== 0) {
      const coefficient = standard / currentForce
      setCorrectionCoefficient(coefficient.toFixed(5))
    }
  }

  const formatNum = (val: number | null) => {
    if (val === null) return '—'
    return val.toFixed(2)
  }

  const cwRows = rows.filter(r => r.direction === 'cw')
  const ccwRows = rows.filter(r => r.direction === 'ccw')
  const unitLabel = unit === 'N' ? '转向力/N' : '力矩/Nm'

  // 信号强度图标
  const rssiIcon = (rssi: number | null) => {
    if (rssi === null) return 'signal_cellular_0_bar'
    if (rssi > -50) return 'signal_cellular_4_bar'
    if (rssi > -70) return 'signal_cellular_3_bar'
    if (rssi > -85) return 'signal_cellular_2_bar'
    return 'signal_cellular_1_bar'
  }

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

      {/* ===== 左列 - BLE设备连接 + 力值测量 ===== */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-3">
        {/* 卡片1: 蓝牙设备 */}
        <IndustrialCard
          title="蓝牙称重设备"
          borderLeftColor="#dc2626"
          headerRight={
            <StatusIndicator
              status={scaleState.isConnected ? 'connected' : 'disconnected'}
              label={scaleState.isConnected ? scaleState.deviceName || '已连接' : '未连接'}
            />
          }
        >
          <div className="p-4 flex flex-col gap-3">
            {/* 扫描 / 断开按钮 */}
            <div className="flex gap-2">
              {!scaleState.isConnected ? (
                <button
                  className={`${primaryBtnClass} flex-1`}
                  onClick={handleScan}
                  disabled={scanLoading}
                >
                  {scanLoading ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      扫描中...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">bluetooth_searching</span>
                      扫描设备
                    </>
                  )}
                </button>
              ) : (
                <button
                  className={`${criticalBtnClass} flex-1`}
                  onClick={handleDisconnect}
                >
                  <span className="material-symbols-outlined text-sm">bluetooth_disabled</span>
                  断开连接
                </button>
              )}
            </div>

            {/* 设备列表 */}
            {!scaleState.isConnected && (
              <div className="max-h-[180px] overflow-y-auto">
                {devices.length === 0 && !scanLoading && (
                  <div className="text-center text-xs text-slate-400 py-4">
                    <span className="material-symbols-outlined text-2xl text-slate-300 block mb-1">bluetooth</span>
                    点击扫描查找附近设备
                  </div>
                )}
                {devices.length === 0 && scanLoading && (
                  <div className="text-center text-xs text-slate-400 py-4">
                    <span className="material-symbols-outlined text-2xl text-primary animate-spin block mb-1">progress_activity</span>
                    正在搜索附近设备...
                  </div>
                )}
                {devices.map((device, index) => (
                  <button
                    key={`${device.address}-${index}`}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-primary hover:bg-primary/5 transition-colors mb-1.5 text-left group"
                    onClick={() => handleConnect(device.address)}
                  >
                    <span className="material-symbols-outlined text-lg text-slate-400 group-hover:text-primary">
                      {rssiIcon(device.rssi)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{device.name || '未知设备'}</p>
                      <p className="text-xs text-slate-400 font-mono truncate">{device.address}</p>
                    </div>
                    {device.rssi !== null && (
                      <span className="text-xs text-slate-400 font-mono flex-shrink-0">{device.rssi}dBm</span>
                    )}
                    <span className="material-symbols-outlined text-sm text-slate-300 group-hover:text-primary">chevron_right</span>
                  </button>
                ))}
              </div>
            )}

            {/* 已连接设备信息（含AD内码和重量） */}
            {scaleState.isConnected && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-emerald-600">bluetooth_connected</span>
                  <span className="text-sm font-semibold text-emerald-700 truncate">{scaleState.deviceName || '已连接'}</span>
                  <span className="text-xs text-emerald-500 font-mono ml-auto flex-shrink-0">{scaleState.deviceAddress}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-emerald-600 font-mono">
                  <span>AD内码: {scaleState.data?.adCode ?? '---'}</span>
                  <span className="text-emerald-300">|</span>
                  <span>重量: {scaleState.data?.weightG?.toFixed(2) ?? '---'}g</span>
                </div>
              </div>
            )}
          </div>
        </IndustrialCard>

        {/* 卡片2: 力值测量（合并实时力值 + 清零 + 校正） */}
        <IndustrialCard title="力值测量" borderLeftColor="#dc2626" className="flex-1">
          <div className="p-4 flex flex-col gap-3">
            {/* 大字体实时力值 - 唯一显示位置 */}
            <div className={`rounded-lg border-2 p-3 text-center ${
              scaleState.isConnected
                ? 'bg-primary-fixed border-primary-fixed-dim'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <p className={`text-3xl font-mono font-bold tracking-tight ${
                scaleState.isConnected ? 'text-primary' : 'text-slate-300'
              }`}>
                {liveValue}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 font-semibold">{unit}</p>
            </div>

            {/* 清零按钮 - 紧凑样式 */}
            <button
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleZero}
              disabled={!scaleState.isConnected}
            >
              <span className="material-symbols-outlined text-sm">exposure_zero</span>
              清零
            </button>

            {/* 分隔线 */}
            <div className="border-t border-slate-200" />

            {/* 力值校正区域 */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-500 uppercase">力值校正</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 flex-shrink-0 w-14">标准值</label>
                <input
                  type="number"
                  className="flex-1 px-2 py-1 text-sm text-right border border-slate-200 rounded bg-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={standardValue}
                  onChange={e => setStandardValue(e.target.value)}
                  placeholder="输入标准值(N)"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 flex-shrink-0 w-14">校正系数</label>
                <span className="flex-1 text-sm font-mono text-right text-slate-700">{correctionCoefficient || '---'}</span>
              </div>
              <button
                className={`${primaryBtnClass} w-full text-xs`}
                onClick={handleCalibration}
                disabled={!scaleState.isConnected || !standardValue}
              >
                力值校正
              </button>
            </div>
          </div>
        </IndustrialCard>
      </div>

      {/* ===== 右列 - 测试表格 + 漂移测试 + 操作 ===== */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* 单位选择栏 */}
        <IndustrialCard borderLeftColor="#dc2626">
          <div className="flex items-center gap-3 p-4">
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

            <div className="flex-1" />

            {/* 操作按钮 */}
            <div className="flex items-center gap-2">
              {!isAutoMeasuring ? (
                <button
                  className={`${primaryBtnClass} ${!scaleState.isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={handleAutoMeasure}
                  disabled={!scaleState.isConnected || !scaleState.data}
                  title={!scaleState.isConnected ? '请先连接蓝牙称重设备' : ''}
                >
                  <span className="material-symbols-outlined text-sm">precision_manufacturing</span>
                  自动测量
                </button>
              ) : (
                <button className={criticalBtnClass} onClick={handleAutoStop}>
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  停止测量
                </button>
              )}
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

        {/* 转向力/力矩 表格 */}
        <IndustrialCard
          className="flex-1 flex flex-col min-h-0"
          borderLeftColor="#dc2626"
          headerRight={
            isAutoMeasuring ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                自动测量中...
              </span>
            ) : null
          }
        >
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th rowSpan={2} className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[72px]">方向</th>
                  <th rowSpan={2} className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[100px]">标准点</th>
                  <th colSpan={3} className="border border-slate-300 bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">{unitLabel}</th>
                  <th rowSpan={2} className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[80px]">平均值</th>
                  <th rowSpan={2} className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[80px]">示值误差%</th>
                  <th rowSpan={2} className="border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-[80px]">重复性%</th>
                </tr>
                <tr>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[80px]">1</th>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[80px]">2</th>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[80px]">3</th>
                </tr>
              </thead>
              <tbody>
                {cwRows.map((row, i) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    {i === 0 && (
                      <td rowSpan={5} className="border border-slate-300 text-center font-semibold text-slate-600 align-middle w-[72px]">
                        <span className="inline-block text-xs" style={{ writingMode: 'vertical-rl' }}>顺时针</span>
                      </td>
                    )}
                    <td className="border border-slate-300 px-1 py-0.5">
                      <NumericInput className={inputClass} value={row.standardPoint} onChange={val => handleStandardPointEdit(row.id, val)} placeholder="—" title="标准点" />
                    </td>
                    {([0, 1, 2] as const).map(ci => (
                      <td key={ci} className="border border-slate-300 px-1 py-0.5">
                        <NumericInput className={inputClass} value={row.values[ci]} onChange={val => handleValueEdit(row.id, ci, val)} placeholder="—" title={`仪器示值 ${ci + 1}`} />
                      </td>
                    ))}
                    <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.average)}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.error)}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center text-xs font-mono text-slate-700">{formatNum(row.repeatability)}</td>
                  </tr>
                ))}
                {ccwRows.map((row, i) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    {i === 0 && (
                      <td rowSpan={5} className="border border-slate-300 text-center font-semibold text-slate-600 align-middle w-[72px]">
                        <span className="inline-block text-xs" style={{ writingMode: 'vertical-rl' }}>逆时针</span>
                      </td>
                    )}
                    <td className="border border-slate-300 px-1 py-0.5">
                      <NumericInput className={inputClass} value={row.standardPoint} onChange={val => handleStandardPointEdit(row.id, val)} placeholder="—" title="标准点" />
                    </td>
                    {([0, 1, 2] as const).map(ci => (
                      <td key={ci} className="border border-slate-300 px-1 py-0.5">
                        <NumericInput className={inputClass} value={row.values[ci]} onChange={val => handleValueEdit(row.id, ci, val)} placeholder="—" title={`仪器示值 ${ci + 1}`} />
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

        {/* 漂移测试区 */}
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
    </div>
  )
}
