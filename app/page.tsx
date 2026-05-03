"use client"

import { useState, useRef, useEffect } from 'react'
import { useDevice } from '@/lib/comm/use-device'
import { getPrStatusText, pulsesToAngle, getConnectionStatus } from '@/lib/comm/types'
import { useAppStore } from '@/lib/store'
import IndustrialCard from '@/components/ui/IndustrialCard'
import Button from '@/components/ui/Button'
import StatusIndicator from '@/components/ui/StatusIndicator'
import NumericInput from '@/components/ui/NumericInput'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const inputClass = "w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"

export default function HomePage() {
  const { state, actions, error } = useDevice()
  const connectionStatus = getConnectionStatus(state)

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

  // Global store
  const ip = useAppStore((s) => s.ip)
  const port = useAppStore((s) => s.port)
  const setIp = useAppStore((s) => s.setIp)
  const setPort = useAppStore((s) => s.setPort)
  const targetAngle = useAppStore((s) => s.targetAngle)
  const setTargetAngle = useAppStore((s) => s.setTargetAngle)
  const positionHistory = useAppStore((s) => s.positionHistory)
  const addPositionPoint = useAppStore((s) => s.addPositionPoint)
  const clearPositionHistory = useAppStore((s) => s.clearPositionHistory)

  // Connection UI state (local)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Sync position to store
  useEffect(() => {
    addPositionPoint({ time: Date.now(), position: state.position / 1000 })
  }, [state.position])

  const showToast = (msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000)
  }

  const handleConnect = async () => {
    if (connectionStatus === 'disconnected') {
      if (!ip.trim()) {
        showToast('请输入 IP 地址')
        return
      }
      const portNum = parseInt(port)
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        showToast('端口号必须在 1-65535 之间')
        return
      }
      setConnecting(true)
      await actions.connect(ip, portNum)
      setConnecting(false)
    } else {
      setDisconnecting(true)
      await actions.disconnect()
      setDisconnecting(false)
    }
  }

  const handleCancelConnect = async () => {
    await actions.cancelConnect()
    setConnecting(false)
  }

  const handleMoveTo = () => {
    const angle = parseFloat(targetAngle)
    if (!isNaN(angle)) actions.moveTo(angle)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden w-full px-4 py-3">
      {/* Error Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border border-red-300 bg-red-600 text-white text-sm max-w-sm animate-[slideIn_0.25s_ease-out]">
          <span className="material-symbols-outlined text-base flex-shrink-0">error</span>
          <span className="flex-1">{toastMsg}</span>
          <button onClick={dismissToast} className="flex-shrink-0 hover:bg-red-500 rounded p-0.5 transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Top Bar: Title + Connection */}
      <section className="flex-shrink-0 mb-3">
        <div className="industrial-card rounded-xl p-md flex flex-col md:flex-row items-center justify-between gap-md bg-white border-l-4 border-l-primary-container">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
              机动车角度综合校准装置
            </h1>
          </div>
          <div className="flex items-center gap-sm">
            {/* Connection inputs (compact) */}
            <NumericInput
              className="w-28 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={ip}
              onChange={setIp}
              disabled={connecting || disconnecting}
              placeholder="IP 地址"
              allowNegative={false}
              allowDecimal={true}
              allowMultipleDots={true}
              title="IP 地址"
            />
            <NumericInput
              className="w-16 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={port}
              onChange={setPort}
              disabled={connecting || disconnecting}
              placeholder="端口"
              allowNegative={false}
              allowDecimal={false}
              title="端口"
            />
            <Button
              variant={connectionStatus === 'disconnected' ? 'primary' : 'critical'}
              icon={connecting || disconnecting ? undefined : (connectionStatus === 'disconnected' ? 'link' : 'link_off')}
              onClick={handleConnect}
              disabled={connecting || disconnecting}
            >
              {connecting ? (
                <span className="inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  连接中...
                </span>
              ) : disconnecting ? (
                <span className="inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  断开中...
                </span>
              ) : connectionStatus === 'disconnected' ? '连接' : '断开'}
            </Button>
            {connecting && (
              <button
                className="px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors font-medium"
                onClick={handleCancelConnect}
              >
                取消
              </button>
            )}
            <StatusIndicator
              status={connecting ? 'warning' : connectionStatus === 'authenticated' ? 'connected' : connectionStatus === 'connecting' ? 'warning' : 'disconnected'}
              label={connecting ? '连接中' : connectionStatus === 'authenticated' ? '已认证' : connectionStatus === 'connecting' ? '连接中' : '未连接'}
            />
            <Link href="/debug">
              <Button variant="ghost" icon="bug_report">
                调试面板
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content Bento Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
        {/* ===== Left Column (col-span-4) ===== */}
        <div className="col-span-4 flex flex-col gap-3 min-h-0">
          {/* Card A: 当前位置 */}
          <IndustrialCard title="当前位置" borderLeftColor="#2563eb" className="flex-shrink-0">
            <div className="p-4 flex flex-col items-center relative">
              {/* 伺服状态徽章 - 右上角 */}
              <div className="absolute top-3 right-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  state.is_servo_on
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${state.is_servo_on ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {state.is_servo_on ? '伺服ON' : '伺服OFF'}
                </span>
              </div>
              {/* 大号角度显示 */}
              <div className="text-4xl font-mono font-bold text-primary tracking-tight">
                {pulsesToAngle(state.position).toFixed(3)}°
              </div>
              {/* 速度 */}
              <div className="text-xs text-slate-500 mt-1 font-mono">
                速度: {state.speed} pulse/s
              </div>
            </div>
          </IndustrialCard>

          {/* Card B: 倾角仪 */}
          <IndustrialCard title="倾角仪" borderLeftColor="#10b981" className="flex-shrink-0">
            <div className="p-4 space-y-2">
              <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded">
                <span className="text-xs text-slate-500 font-semibold">X 轴</span>
                <span className="font-mono text-sm font-semibold text-slate-800">{state.incline_x.toFixed(3)}°</span>
              </div>
              <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded">
                <span className="text-xs text-slate-500 font-semibold">Y 轴</span>
                <span className="font-mono text-sm font-semibold text-slate-800">{state.incline_y.toFixed(3)}°</span>
              </div>
            </div>
          </IndustrialCard>

          {/* Card C: 设备概览 */}
          <IndustrialCard title="设备概览" borderLeftColor="#64748b" className="flex-1 min-h-0">
            <div className="p-4 grid grid-cols-2 gap-2 text-xs">
              <StatusItem
                label="连接"
                value={state.is_connected ? '已连接' : '未连接'}
                active={state.is_connected}
              />
              <StatusItem
                label="Modbus"
                value={state.modbus_connected ? '正常' : '异常'}
                active={state.modbus_connected}
              />
              <StatusItem
                label="调平"
                value={state.homing_status === 2 ? '已完成' : state.homing_status === 1 ? '进行中' : '未完成'}
                active={state.homing_status === 2}
                warning={state.homing_status === 1}
              />
              <StatusItem
                label="错误码"
                value={state.error_code === 0 ? '无' : `0x${state.error_code.toString(16).toUpperCase()}`}
                active={state.error_code === 0}
                danger={state.error_code !== 0}
              />
            </div>
          </IndustrialCard>
        </div>

        {/* ===== Right Column (col-span-8) ===== */}
        <div className="col-span-8 flex flex-col gap-3 min-h-0">
          {/* Card D: 位置趋势图 */}
          <div className="flex-1 min-h-0">
            <IndustrialCard
              title="位置趋势"
              borderLeftColor="#1a2b3c"
              className="h-full flex flex-col"
              headerRight={
                <button
                  className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 transition-colors"
                  onClick={clearPositionHistory}
                >
                  清空
                </button>
              }
            >
              <div className="p-2 flex-1 min-h-0" style={{ height: 'calc(100% - 40px)' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={positionHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="label"
                      interval="preserveStartEnd"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => v.toFixed(3)}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      unit="°"
                      width={65}
                    />
                    <Tooltip
                      formatter={(value: any) => [`${Number(value).toFixed(3)}°`, '位置']}
                      labelFormatter={(label) => `时间: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="position"
                      stroke="#1a2b3c"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </IndustrialCard>
          </div>

          {/* Card E: 运动控制 + Card F: 快捷操作 (一行) */}
          <div className="flex-shrink-0 grid grid-cols-2 gap-3">
            {/* Card E: 运动控制 */}
            <IndustrialCard title="运动控制" borderLeftColor="#f59e0b">
              <div className="p-4 space-y-3">
                {/* 目标角度输入 + 移动按钮 */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">目标角度 (°)</label>
                    <NumericInput
                      className={inputClass}
                      value={targetAngle}
                      onChange={setTargetAngle}
                      placeholder="0.000"
                      title="目标角度"
                    />
                  </div>
                  <Button variant="primary" icon="my_location" onClick={handleMoveTo}>移动</Button>
                </div>
              </div>
            </IndustrialCard>

            {/* Card F: 快捷操作 */}
            <IndustrialCard title="快捷操作" borderLeftColor="#8b5cf6">
              <div className="p-4 space-y-2">
                {/* 第一排：调平、JOG+、JOG- */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    icon="home"
                    onClick={() => actions.startHoming()}
                    className="flex-1 justify-center !bg-blue-600 hover:!bg-blue-700"
                  >
                    调平
                  </Button>
                  <button
                    className="flex-1 px-3 py-2 text-xs font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:bg-blue-200 transition-colors select-none"
                    onMouseDown={() => actions.jogStart('+')}
                    onMouseUp={() => actions.jogStop()}
                    onMouseLeave={() => actions.jogStop()}
                    onTouchStart={() => actions.jogStart('+')}
                    onTouchEnd={() => actions.jogStop()}
                  >
                    JOG +
                  </button>
                  <button
                    className="flex-1 px-3 py-2 text-xs font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:bg-blue-200 transition-colors select-none"
                    onMouseDown={() => actions.jogStart('-')}
                    onMouseUp={() => actions.jogStop()}
                    onMouseLeave={() => actions.jogStop()}
                    onTouchStart={() => actions.jogStart('-')}
                    onTouchEnd={() => actions.jogStop()}
                  >
                    JOG -
                  </button>
                </div>
                {/* 第二排：急停、复位 */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="critical"
                    icon="emergency_home"
                    onClick={() => actions.emergencyStop()}
                    className="flex-1 justify-center !bg-red-600 hover:!bg-red-700 !text-base !font-bold"
                  >
                    急停
                  </Button>
                  <Button
                    variant="ghost"
                    icon="restart_alt"
                    onClick={() => actions.reset()}
                    className="flex-1 justify-center !border-orange-400 !text-orange-600 hover:!bg-orange-500 hover:!text-white"
                  >
                    复位
                  </Button>
                </div>
              </div>
            </IndustrialCard>
          </div>
        </div>
      </div>

      {/* System Info Bar */}
      <div className="flex-shrink-0 mt-3 flex items-center h-9 bg-slate-800 text-white text-xs font-mono px-3 divide-x divide-slate-600 rounded-xl">
        <div className="flex items-center gap-1.5 pr-3">
          <span className={`inline-block w-2 h-2 rounded-full ${
            state.is_authenticated ? 'bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.6)]' : 'bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.6)]'
          }`} />
          <span className="text-slate-400">系统</span>
          <span>{state.is_authenticated ? '已连接' : '未连接'}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3">
          <span className="text-slate-400">伺服</span>
          <span>{state.homing_status === 2 ? '已调平' : state.homing_status === 1 ? '调平中' : '未调平'}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3">
          <span className="text-slate-400">PR</span>
          <span>{getPrStatusText(state.pr_status)}</span>
        </div>
        <div className="flex items-center gap-1.5 pl-3">
          <span className="text-slate-400">错误</span>
          <span>{state.error_code === 0 ? '无' : `0x${state.error_code.toString(16).toUpperCase()}`}</span>
        </div>
      </div>
    </div>
  )
}

// ---------- Sub-components ----------

function StatusItem({ label, value, active, danger, warning }: {
  label: string
  value: string
  active: boolean
  danger?: boolean
  warning?: boolean
}) {
  const dotColor = danger
    ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]'
    : warning
      ? 'bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.6)]'
      : active
        ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]'
        : 'bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.6)]'

  return (
    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded">
      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <div className="flex flex-col">
        <span className="text-slate-400 text-[10px]">{label}</span>
        <span className="text-slate-700 font-semibold">{value}</span>
      </div>
    </div>
  )
}
