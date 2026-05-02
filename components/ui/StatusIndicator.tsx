export interface StatusIndicatorProps {
  status: 'connected' | 'disconnected' | 'warning'
  label?: string
}

const statusConfig = {
  connected: {
    dotClass: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]',
    textClass: 'text-emerald-700',
    defaultLabel: '已连接',
  },
  disconnected: {
    dotClass: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
    textClass: 'text-red-700',
    defaultLabel: '已断开',
  },
  warning: {
    dotClass: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]',
    textClass: 'text-amber-700',
    defaultLabel: '警告',
  },
}

export default function StatusIndicator({ status, label }: StatusIndicatorProps) {
  const config = statusConfig[status]
  return (
    <div className="flex items-center gap-xs">
      <div className={`w-3 h-3 rounded-full ${config.dotClass}`} />
      <span className={`font-label-bold ${config.textClass}`}>
        {label || config.defaultLabel}
      </span>
    </div>
  )
}
