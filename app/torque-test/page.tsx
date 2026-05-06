"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { useScale } from '@/lib/comm/use-scale'
import type { ScaleDeviceInfo } from '@/lib/comm/types'
import IndustrialCard from '@/components/ui/IndustrialCard'
import StatusIndicator from '@/components/ui/StatusIndicator'
import NumericInput from '@/components/ui/NumericInput'
import { isTauri } from '@/lib/tauri'
import { loadConfig, saveConfig } from '@/lib/config'
import { useTorqueStore, initialTorqueData } from '@/lib/store/torque-store'
import type { TorqueRow, TorqueRecord } from '@/lib/store/torque-store'
import { initTorqueDB, saveTorqueRecord, getAllTorqueRecords, updateTorqueRecord, deleteTorqueRecord } from '@/lib/db/torque-records'

const inputClass = "w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
const disabledInputClass = "w-full px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono text-slate-400 cursor-not-allowed"
const primaryBtnClass = "flex-1 px-3 py-1.5 bg-primary hover:bg-primary/90 text-on-primary text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
const criticalBtnClass = "flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"

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

  // === 从 Zustand Store 获取持久化状态 ===
  const {
    measureData, setMeasureData, resetMeasureData,
    driftValues, setDriftValues, resetDriftValues,
    unit, setUnit,
    recordHistory, setRecordHistory,
    viewingRecordId, setViewingRecordId,
  } = useTorqueStore()

  // === 自动测量 ===
  const [isAutoMeasuring, setIsAutoMeasuring] = useState(false)
  const abortAutoRef = useRef(false)

  // === 漂移测试 ===
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // === 力值校正 ===
  const [standardValue, setStandardValue] = useState<string>('')
  const [correctionCoefficient, setCorrectionCoefficient] = useState<string>('')

  // === Toast ===
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // === 记录列表下拉 ===
  const [showRecordList, setShowRecordList] = useState(false)

  // === DB 初始化 ===
  useEffect(() => {
    const loadRecords = async () => {
      try {
        await initTorqueDB()
        const records = await getAllTorqueRecords()
        setRecordHistory(records)
      } catch (err) {
        console.error('加载记录失败:', err)
      }
    }
    loadRecords()
  }, [])

  // === 从配置加载标准值和校正系数 ===
  useEffect(() => {
    const initConfig = async () => {
      const config = await loadConfig()
      if (config.scale.standardValue) {
        setStandardValue(config.scale.standardValue)
      }
      if (config.scale.correctionCoefficient) {
        setCorrectionCoefficient(config.scale.correctionCoefficient)
      }
    }
    initConfig()
  }, [])

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

  const cancelDriftTest = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsTimerRunning(false)
    setElapsedSeconds(0)
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
  const correctionCoeff = parseFloat(correctionCoefficient) || 1
  const liveValue = scaleState.data
    ? (scaleState.data.weightN * correctionCoeff).toFixed(3)
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
    setMeasureData(
      measureData.map(row => {
        if (row.id !== rowId) return row
        const updated = { ...row, standardPoint: value }
        return calculateRow(updated)
      })
    )
  }, [measureData, setMeasureData])

  const handleValueEdit = useCallback((rowId: string, colIndex: number, value: string) => {
    setMeasureData(
      measureData.map(row => {
        if (row.id !== rowId) return row
        const newValues: [string, string, string] = [...row.values]
        newValues[colIndex] = value
        const updated = { ...row, values: newValues }
        return calculateRow(updated)
      })
    )
  }, [measureData, setMeasureData])

  // === 操作按钮 ===
  const handleZero = async () => {
    if (scaleState.isConnected) {
      await scaleActions.zero()
    }
  }

  const handleClear = () => {
    resetMeasureData()
    resetDriftValues()
    setViewingRecordId(null)
    setIsTimerRunning(false)
    setElapsedSeconds(0)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // === 记录管理函数 ===
  const handleAutoRecord = async () => {
    try {
      const timestamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      await saveTorqueRecord({
        timestamp,
        measureData: measureData.map(r => ({ ...r, values: [...r.values] as [string, string, string] })),
        driftValues: { ...driftValues },
        unit: unit,
      })
      const records = await getAllTorqueRecords()
      setRecordHistory(records)
      setToastMsg('数据已记录')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
    } catch (err) {
      console.error('保存记录失败:', err)
      setToastMsg('记录保存失败')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
    }
  }

  const handleViewRecord = (record: TorqueRecord) => {
    setMeasureData(record.measureData.map(r => ({ ...r, values: [...r.values] as [string, string, string] })))
    setDriftValues({ ...record.driftValues })
    setUnit(record.unit)
    setViewingRecordId(record.id)
    setShowRecordList(false)
  }

  const handleSaveRecord = async () => {
    if (!viewingRecordId) return
    try {
      await updateTorqueRecord(viewingRecordId, {
        measureData: measureData.map(r => ({ ...r, values: [...r.values] as [string, string, string] })),
        driftValues: { ...driftValues },
        unit: unit,
      })
      const records = await getAllTorqueRecords()
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

  const handleBackToEdit = () => {
    setViewingRecordId(null)
    resetMeasureData()
    resetDriftValues()
  }

  const handleDeleteRecord = async (recordId: number) => {
    try {
      await deleteTorqueRecord(recordId)
      const records = await getAllTorqueRecords()
      setRecordHistory(records)
      if (viewingRecordId === recordId) {
        setViewingRecordId(null)
        resetMeasureData()
        resetDriftValues()
      }
    } catch (err) {
      console.error('删除记录失败:', err)
    }
  }

  // === CSV 生成 ===
  const generateCSV = (rows: TorqueRow[], drift: typeof driftValues) => {
    const dResult = (() => {
      const v10 = parseFloat(drift.min10)
      const v0 = parseFloat(drift.min0)
      if (!isNaN(v10) && !isNaN(v0)) return (v10 - v0).toFixed(2)
      return ''
    })()
    let csv = '方向,标准点,示值1,示值2,示值3,平均值,示值误差%,重复性%\n'
    for (const row of rows) {
      const dir = row.direction === 'cw' ? '顺时针' : '逆时针'
      csv += `${dir},${row.standardPoint},${row.values.join(',')},${row.average !== null ? row.average.toFixed(2) : ''},${row.error !== null ? row.error.toFixed(2) : ''},${row.repeatability !== null ? row.repeatability.toFixed(2) : ''}\n`
    }
    csv += '\n漂移测试\n'
    csv += '0min,5min,10min,漂移\n'
    csv += `${drift.min0},${drift.min5},${drift.min10},${dResult}\n`
    return csv
  }

  const handleExport = async () => {
    const csvContent = generateCSV(measureData, driftValues)

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const filePath = await save({
          defaultPath: `力矩测试_${new Date().toLocaleDateString('zh-CN')}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        })
        if (!filePath) return
        const content = new TextEncoder().encode('\uFEFF' + csvContent)
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
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `力矩测试_${new Date().toLocaleDateString('zh-CN')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setToastMsg('数据已导出')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
    }
  }

  const handleExportRecord = async (record: TorqueRecord) => {
    const csvContent = generateCSV(record.measureData, record.driftValues)

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const filePath = await save({
          defaultPath: `力矩测试_${record.timestamp.replace(/[\/\s:]/g, '-')}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        })
        if (!filePath) return
        const content = new TextEncoder().encode('\uFEFF' + csvContent)
        await invoke('save_file_content', { path: filePath, content: Array.from(content) })
      } catch (err) {
        console.error('导出失败:', err)
      }
    } else {
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `力矩测试_${record.timestamp.replace(/[\/\s:]/g, '-')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  // === 自动测量 ===
  const handleAutoMeasure = async () => {
    if (!scaleState.isConnected || !scaleState.data) return
    setIsAutoMeasuring(true)
    abortAutoRef.current = false
    try {
      for (const row of measureData) {
        if (abortAutoRef.current) break
        for (let i = 0; i < 3; i++) {
          if (abortAutoRef.current) break
          await new Promise(r => setTimeout(r, 2000))
          const rawValue = scaleDataRef.current?.weightN ?? 0
          const coeff = parseFloat(correctionCoefficient) || 1
          const value = rawValue * coeff
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
  const handleCalibration = async () => {
    const currentForce = scaleState.data?.weightN
    const standard = parseFloat(standardValue)
    if (currentForce && standard && standard !== 0) {
      const coefficient = standard / currentForce
      const coeffStr = coefficient.toFixed(5)
      setCorrectionCoefficient(coeffStr)

      // 保存到配置
      const config = await loadConfig()
      config.scale.standardValue = standardValue
      config.scale.correctionCoefficient = coeffStr
      await saveConfig(config)
    }
  }

  const formatNum = (val: number | null) => {
    if (val === null) return '—'
    return val.toFixed(2)
  }

  const cwRows = measureData.filter(r => r.direction === 'cw')
  const ccwRows = measureData.filter(r => r.direction === 'ccw')
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

            {/* 已连接设备信息 */}
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

        {/* 卡片2: 力值测量 */}
        <IndustrialCard title="力值测量" borderLeftColor="#dc2626" className="flex-1">
          <div className="p-4 flex flex-col gap-3">
            {/* 大字体实时力值 */}
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

            {/* 清零按钮 */}
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
                <NumericInput
                  className="flex-1 px-2 py-1 text-sm text-right border border-slate-200 rounded bg-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  value={standardValue}
                  onChange={async (val) => {
                    setStandardValue(val)
                    const config = await loadConfig()
                    config.scale.standardValue = val
                    await saveConfig(config)
                  }}
                  placeholder="输入标准值(N)"
                  title="标准值"
                  maxDecimalPlaces={2}
                  allowNegative={false}
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

      {/* ===== 右列 - 测试表格 + 漂移测试 ===== */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* 转向力/力矩 表格 */}
        <IndustrialCard
          className="flex-1 flex flex-col min-h-0"
          borderLeftColor="#dc2626"
          headerLeft={
            <div className="flex items-center gap-2">
              {/* 记录列表 */}
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

              {/* 单位切换 */}
              <div className="flex rounded-md border border-slate-300 overflow-hidden">
                <button
                  className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                    unit === 'N'
                      ? 'bg-primary text-on-primary'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setUnit('N')}
                >
                  转向力/N
                </button>
                <button
                  className={`px-2.5 py-1 text-xs font-semibold transition-colors border-l border-slate-300 ${
                    unit === 'Nm'
                      ? 'bg-primary text-on-primary'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setUnit('Nm')}
                >
                  力矩/Nm
                </button>
              </div>
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

          {/* 漂移测试区 */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">漂移测试</span>
              {isTimerRunning && (
                <span className="text-xs text-blue-600 font-mono">
                  {elapsedSeconds < 600 ? formatRemaining(600) : '已完成'}
                </span>
              )}
              <div className="flex-1" />
              {isTimerRunning ? (
                <button
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                  onClick={cancelDriftTest}
                >
                  <span className="material-symbols-outlined text-sm">stop</span>
                  取消
                </button>
              ) : (
                <button
                  className="px-3 py-1 bg-primary hover:bg-primary/90 text-on-primary text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={startDriftTest}
                  disabled={!driftValues.min0}
                >
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  启动
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {/* 0min */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">0min</label>
                <NumericInput
                  className={inputClass}
                  value={driftValues.min0}
                  onChange={val => setDriftValues({ ...driftValues, min0: val })}
                  placeholder="录入值"
                  title="0min"
                />
              </div>
              {/* 5min */}
              <div>
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                  5min
                  {isTimerRunning && !canEdit5min && <span className="text-xs font-mono text-blue-500">({formatRemaining(300)})</span>}
                  {canEdit5min && <span className="text-emerald-500">✓</span>}
                </label>
                <NumericInput
                  className={canEdit5min ? inputClass : disabledInputClass}
                  value={driftValues.min5}
                  onChange={val => setDriftValues({ ...driftValues, min5: val })}
                  disabled={!canEdit5min}
                  placeholder={canEdit5min ? '录入值' : '等待中...'}
                  title="5min"
                />
              </div>
              {/* 10min */}
              <div>
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                  10min
                  {isTimerRunning && !canEdit10min && <span className="text-xs font-mono text-blue-500">({formatRemaining(600)})</span>}
                  {canEdit10min && <span className="text-emerald-500">✓</span>}
                </label>
                <NumericInput
                  className={canEdit10min ? inputClass : disabledInputClass}
                  value={driftValues.min10}
                  onChange={val => setDriftValues({ ...driftValues, min10: val })}
                  disabled={!canEdit10min}
                  placeholder={canEdit10min ? '录入值' : '等待中...'}
                  title="10min"
                />
              </div>
              {/* 漂移结果 */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">漂移</label>
                <input className={disabledInputClass} value={driftResult} disabled placeholder="自动计算" />
              </div>
            </div>
          </div>

          {/* 底部按钮区 */}
          <div className="flex-shrink-0 px-4 pb-4 flex gap-1.5">
            <button className={criticalBtnClass} onClick={handleClear}>
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
        </IndustrialCard>
      </div>
    </div>
  )
}
