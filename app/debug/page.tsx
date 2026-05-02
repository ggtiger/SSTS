"use client"

import { useState, useRef, useEffect } from 'react'
import { useDevice } from '@/lib/comm/use-device'
import { getPrStatusText, pulsesToAngle, angleToPulses, getConnectionStatus } from '@/lib/comm/types'
import type { ServoParams } from '@/lib/comm/types'
import { useAppStore } from '@/lib/store'
import IndustrialCard from '@/components/ui/IndustrialCard'
import Button from '@/components/ui/Button'
import StatusIndicator from '@/components/ui/StatusIndicator'
import NumericInput from '@/components/ui/NumericInput'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const inputClass = "w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary monospaced-data"
const smallBtnClass = "px-2 py-1 text-xs font-semibold rounded transition-colors"

export default function DebugPage() {
  const { state, actions, debugLog, error } = useDevice()
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

  // Move to angle
  // (targetAngle is now in global store)

  // Raw command
  const [rawCmd, setRawCmd] = useState('')

  // Params collapsed
  const [paramsOpen, setParamsOpen] = useState(false)
  const [params, setParams] = useState<ServoParams>({
    control_mode: 0, feedback_mode: 0, lead_screw: 10, encoder_resolution: 10000,
    max_speed: 1000, acceleration: 500, position_gain: 100, speed_gain: 100,
    torque_gain: 100, speed_feed_forward: 0, position_feed_forward: 0,
    friction_compensation: 0, dead_band_compensation: 0, home_offset: 0,
  })

  // Sync position to store
  useEffect(() => {
    addPositionPoint({ time: Date.now(), position: state.position / 1000 })
  }, [state.position])

  // Log scroll
  const logEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [debugLog.length])

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

  const handleSendRaw = () => {
    if (rawCmd.trim()) {
      actions.sendRaw(rawCmd.trim())
      setRawCmd('')
    }
  }

  const updateParam = (key: keyof ServoParams, value: string) => {
    setParams(p => ({ ...p, [key]: parseFloat(value) || 0 }))
  }

  return (
    <div className="flex h-full overflow-hidden w-full gap-3 p-3 relative">
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
      {/* Left Panel */}
      <div className="w-1/3 min-w-[320px] flex flex-col gap-3 overflow-y-auto pr-1">
        {/* A. Connection Control */}
        <IndustrialCard title="连接控制" borderLeftColor="#2563eb">
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">IP 地址</label>
                <NumericInput className={inputClass} value={ip} onChange={setIp} disabled={connecting || disconnecting} allowNegative={false} allowDecimal={true} allowMultipleDots={true} title="IP 地址" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">端口</label>
                <NumericInput className={inputClass} value={port} onChange={setPort} disabled={connecting || disconnecting} allowNegative={false} allowDecimal={false} title="端口" />
              </div>
            </div>
            <div className="flex items-center gap-3">
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
                  className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors font-medium"
                  onClick={handleCancelConnect}
                >
                  取消
                </button>
              )}
              <StatusIndicator
                status={connecting ? 'warning' : connectionStatus === 'authenticated' ? 'connected' : connectionStatus === 'connecting' ? 'warning' : 'disconnected'}
                label={connecting ? '连接中' : connectionStatus === 'authenticated' ? '已认证' : connectionStatus === 'connecting' ? '连接中' : '未连接'}
              />
            </div>

          </div>
        </IndustrialCard>

        {/* B. Device Status */}
        <IndustrialCard title="设备状态" borderLeftColor="#10b981">
          <div className="p-4 space-y-3">
            {/* Status grid */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <StatusBadge label="已认证" active={state.is_authenticated} />
              <StatusBadge label="伺服ON" active={state.is_servo_on} />
              <StatusBadge label="调平完成" active={state.is_homing_complete} />
              <StatusBadge label="运行中" active={state.is_moving} />
              <StatusBadge label="报警" active={state.has_alarm} danger />
              <StatusBadge label="错误" active={state.has_error} danger />
            </div>
            {/* Data values */}
            <div className="grid grid-cols-2 gap-2 text-xs monospaced-data">
              <DataItem label="位置" value={`${pulsesToAngle(state.position).toFixed(3)}°`} />
              <DataItem label="速度" value={`${state.speed}`} />
              <DataItem label="错误码" value={`0x${state.error_code.toString(16).toUpperCase()}`} />
              <DataItem label="PR状态" value={getPrStatusText(state.pr_status)} />
              <DataItem label="水平仪X" value={`${state.incline_x.toFixed(2)}°`} />
              <DataItem label="水平仪Y" value={`${state.incline_y.toFixed(2)}°`} />
              <DataItem label="Modbus" value={state.modbus_connected ? '已连接' : '断开'} />
              <DataItem label="Modbus错误" value={`${state.modbus_errors}`} />
            </div>
            {/* Inputs */}
            <div>
              <span className="text-xs text-slate-500 font-semibold">输入状态</span>
              <div className="flex gap-2 mt-1">
                {state.inputs.map((v, i) => (
                  <IoLed key={`in${i}`} label={`IN${i + 1}`} active={v} />
                ))}
              </div>
            </div>
            {/* Relays */}
            <div>
              <span className="text-xs text-slate-500 font-semibold">继电器状态</span>
              <div className="flex gap-2 mt-1">
                {state.relay_states.map((v, i) => (
                  <IoLed key={`r${i}`} label={`R${i + 1}`} active={v} color="amber" />
                ))}
              </div>
            </div>
          </div>
        </IndustrialCard>

        {/* C. Motion Control */}
        <IndustrialCard title="运动控制" borderLeftColor="#f59e0b">
          <div className="p-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary" icon="home" onClick={() => actions.startHoming()}>调平</Button>
              <Button variant="critical" icon="emergency_home" onClick={() => actions.emergencyStop()} className="!px-4 !py-2 text-base font-bold">
                急停
              </Button>
              <Button variant="ghost" icon="restart_alt" onClick={() => actions.reset()}>复位</Button>
            </div>
            {/* Move to angle */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">目标角度 (°)</label>
                <NumericInput className={inputClass} value={targetAngle} onChange={setTargetAngle} placeholder="0.000" title="目标角度" />
              </div>
              <Button variant="primary" icon="my_location" onClick={handleMoveTo}>移动</Button>
            </div>
            {/* Fine-tune buttons */}
            <div className="flex gap-1">
              {[
                { offset: -0.007, label: '-0.007°' },
                { offset: -0.005, label: '-0.005°' },
                { offset: -0.003, label: '-0.003°' },
                { offset: 0.003, label: '+0.003°' },
                { offset: 0.005, label: '+0.005°' },
                { offset: 0.007, label: '+0.007°' },
              ].map(({ offset, label }) => (
                <button
                  key={label}
                  className={`flex-1 px-1 py-1 text-[10px] font-mono rounded border transition-colors ${
                    offset < 0
                      ? 'text-red-600 border-red-200 hover:bg-red-50 active:bg-red-100'
                      : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 active:bg-emerald-100'
                  }`}
                  onClick={() => {
                    const currentAngle = state.position / 1000
                    actions.moveTo(currentAngle + offset)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* JOG */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">JOG 控制</label>
              <div className="flex gap-2">
                <button
                  className={`${smallBtnClass} flex-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:bg-blue-200`}
                  onMouseDown={() => actions.jogStart('+')}
                  onMouseUp={() => actions.jogStop()}
                  onMouseLeave={() => actions.jogStop()}
                  onTouchStart={() => actions.jogStart('+')}
                  onTouchEnd={() => actions.jogStop()}
                >
                  JOG +
                </button>
                <button
                  className={`${smallBtnClass} flex-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:bg-blue-200`}
                  onMouseDown={() => actions.jogStart('-')}
                  onMouseUp={() => actions.jogStop()}
                  onMouseLeave={() => actions.jogStop()}
                  onTouchStart={() => actions.jogStart('-')}
                  onTouchEnd={() => actions.jogStop()}
                >
                  JOG -
                </button>
              </div>
            </div>
          </div>
        </IndustrialCard>

        {/* D. IO Control */}
        <IndustrialCard title="IO 控制" borderLeftColor="#8b5cf6">
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map(ch => (
              <div key={ch} className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">继电器 {ch}</span>
                <div className="flex gap-1">
                  <button className={`${smallBtnClass} bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100`} onClick={() => actions.relayOn(ch)}>开</button>
                  <button className={`${smallBtnClass} bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100`} onClick={() => actions.relayOff(ch)}>关</button>
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button className={`${smallBtnClass} bg-red-50 text-red-700 border border-red-200 hover:bg-red-100`} onClick={() => actions.relayAllOff()}>全部关闭</button>
              <button className={`${smallBtnClass} bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100`} onClick={() => actions.readInput()}>读取输入</button>
              <button className={`${smallBtnClass} bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100`} onClick={() => actions.stopIoTest()}>停止读取</button>
            </div>
          </div>
        </IndustrialCard>

        {/* E. Parameters (collapsible) */}
        <IndustrialCard
          title="参数设置"
          borderLeftColor="#64748b"
          headerRight={
            <button onClick={() => setParamsOpen(!paramsOpen)} className="text-xs text-primary hover:underline">
              {paramsOpen ? '收起' : '展开'}
            </button>
          }
        >
          {paramsOpen && (
            <div className="p-4 space-y-3">
              <ParamGroup title="基本参数">
                <ParamInput label="控制模式" value={params.control_mode} onChange={v => updateParam('control_mode', v)} />
                <ParamInput label="反馈模式" value={params.feedback_mode} onChange={v => updateParam('feedback_mode', v)} />
                <ParamInput label="丝杆导程" value={params.lead_screw} onChange={v => updateParam('lead_screw', v)} />
                <ParamInput label="编码器分辨率" value={params.encoder_resolution} onChange={v => updateParam('encoder_resolution', v)} />
                <ParamInput label="最大速度" value={params.max_speed} onChange={v => updateParam('max_speed', v)} />
                <ParamInput label="加速度" value={params.acceleration} onChange={v => updateParam('acceleration', v)} />
              </ParamGroup>
              <ParamGroup title="增益参数">
                <ParamInput label="位置增益" value={params.position_gain} onChange={v => updateParam('position_gain', v)} />
                <ParamInput label="速度增益" value={params.speed_gain} onChange={v => updateParam('speed_gain', v)} />
                <ParamInput label="扭矩增益" value={params.torque_gain} onChange={v => updateParam('torque_gain', v)} />
                <ParamInput label="速度前馈" value={params.speed_feed_forward} onChange={v => updateParam('speed_feed_forward', v)} />
                <ParamInput label="位置前馈" value={params.position_feed_forward} onChange={v => updateParam('position_feed_forward', v)} />
              </ParamGroup>
              <ParamGroup title="补偿参数">
                <ParamInput label="摩擦补偿" value={params.friction_compensation} onChange={v => updateParam('friction_compensation', v)} />
                <ParamInput label="死区补偿" value={params.dead_band_compensation} onChange={v => updateParam('dead_band_compensation', v)} />
                <ParamInput label="原点偏移" value={params.home_offset} onChange={v => updateParam('home_offset', v)} />
              </ParamGroup>
              <Button variant="primary" icon="send" onClick={() => actions.setParams(params)}>发送参数</Button>
            </div>
          )}
        </IndustrialCard>
        {/* System Info Bar */}
        <div className="flex-shrink-0 flex items-center h-9 bg-slate-800 text-white text-xs font-mono px-3 divide-x divide-slate-600 rounded-b-xl">
          <div className="flex items-center gap-1.5 pr-3">
            <span className={`inline-block w-2 h-2 rounded-full ${
              state.is_connected ? 'bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.6)]' : 'bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.6)]'
            }`} />
            <span className="text-slate-400">系统</span>
            <span>{state.is_connected ? '已连接' : '未连接'}</span>
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

      {/* Right Panel */}
      <div className="flex-1 flex flex-col min-w-0 gap-3">
        {/* Trend Chart */}
        <div className="h-[40%] flex-shrink-0 min-h-0">
          <IndustrialCard
            title="位置趋势"
            borderLeftColor="#1a2b3c"
            headerRight={
              <button
                className={`${smallBtnClass} bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200`}
                onClick={clearPositionHistory}
              >
                清空
              </button>
            }
          >
            <div className="p-2 h-full min-h-0" style={{ height: 'calc(100% - 40px)' }}>
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

        {/* Debug Log */}
        <div className="flex-1 min-h-0 flex flex-col industrial-card rounded-xl overflow-hidden">
          {/* Log toolbar */}
          <div className="flex-shrink-0 flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
            <button
              className={`${smallBtnClass} bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200`}
              onClick={() => actions.clearDebugLog()}
            >
              清空日志
            </button>
            <input
              className="flex-1 px-2 py-1.5 bg-white border border-slate-300 rounded text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={rawCmd}
              onChange={e => setRawCmd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendRaw()}
              placeholder="输入原始命令..."
            />
            <Button variant="primary" icon="send" onClick={handleSendRaw}>发送</Button>
          </div>
          {/* Log list */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 bg-slate-900">
            {debugLog.length === 0 && (
              <p className="text-slate-500 text-sm text-center mt-8">暂无日志</p>
            )}
            {debugLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs font-mono leading-5 px-2 hover:bg-slate-800 rounded">
                <span className="text-slate-500 flex-shrink-0 w-20">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className={`flex-shrink-0 w-8 font-bold ${entry.direction === 'TX' ? 'text-blue-400' : 'text-emerald-400'}`}>
                  {entry.direction}
                </span>
                <span className="text-slate-200 break-all">{entry.content}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Sub-components ----------

function StatusBadge({ label, active, danger }: { label: string; active: boolean; danger?: boolean }) {
  const color = active
    ? danger ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-slate-50 text-slate-400 border-slate-200'
  return (
    <div className={`flex items-center justify-center gap-1 px-2 py-1 rounded border ${color}`}>
      <span>{active ? '✓' : '✗'}</span>
      <span>{label}</span>
    </div>
  )
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between bg-slate-50 px-2 py-1 rounded">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-semibold">{value}</span>
    </div>
  )
}

function IoLed({ label, active, color = 'emerald' }: { label: string; active: boolean; color?: string }) {
  const dotColor = active
    ? color === 'amber' ? 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
    : 'bg-slate-300'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`w-3 h-3 rounded-full ${dotColor}`} />
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  )
}

function ParamGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">{title}</h4>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

function ParamInput({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-slate-400 block">{label}</label>
      <input
        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs monospaced-data focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
