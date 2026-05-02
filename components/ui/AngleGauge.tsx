"use client"

interface AngleGaugeProps {
  value: number
  min?: number
  max?: number
  label?: string
}

export default function AngleGauge({
  value,
  min = 0,
  max = 100,
  label = '角度',
}: AngleGaugeProps) {
  const clampedValue = Math.max(min, Math.min(max, value))
  const ratio = (clampedValue - min) / (max - min)

  // 270° arc from 135° to 405° (bottom-left to bottom-right)
  const startAngle = 135
  const endAngle = 405
  const totalArc = endAngle - startAngle // 270°

  const cx = 150
  const cy = 150
  const r = 110 // main arc radius

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const polarToXY = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(angle)),
    y: cy + radius * Math.sin(toRad(angle)),
  })

  // Arc path helper
  const arcPath = (startDeg: number, endDeg: number, radius: number) => {
    const start = polarToXY(startDeg, radius)
    const end = polarToXY(endDeg, radius)
    const largeArc = endDeg - startDeg > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  // Gradient segments (green -> yellow -> orange -> red)
  const segments = [
    { from: 0, to: 0.25, color: '#22c55e' },
    { from: 0.25, to: 0.5, color: '#eab308' },
    { from: 0.5, to: 0.75, color: '#f97316' },
    { from: 0.75, to: 1, color: '#ef4444' },
  ]

  // Pointer angle
  const pointerAngle = startAngle + ratio * totalArc

  // Tick marks
  const tickCount = 10
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const tickRatio = i / tickCount
    const angle = startAngle + tickRatio * totalArc
    const tickValue = min + tickRatio * (max - min)
    const outerPt = polarToXY(angle, r + 12)
    const innerPt = polarToXY(angle, r + 2)
    const labelPt = polarToXY(angle, r + 26)
    return { angle, tickValue, outerPt, innerPt, labelPt }
  })

  // Minor ticks (between each major tick)
  const minorTicks = Array.from({ length: tickCount * 5 + 1 }, (_, i) => {
    const tickRatio = i / (tickCount * 5)
    const angle = startAngle + tickRatio * totalArc
    const outerPt = polarToXY(angle, r + 6)
    const innerPt = polarToXY(angle, r + 2)
    return { outerPt, innerPt }
  })

  return (
    <div className="w-full aspect-square max-w-[280px] mx-auto">
      <svg viewBox="0 0 300 300" className="w-full h-full">
        {/* Background track */}
        <path
          d={arcPath(startAngle, endAngle, r)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="18"
          strokeLinecap="round"
        />

        {/* Colored segments */}
        {segments.map((seg, i) => {
          const segStart = startAngle + seg.from * totalArc
          const segEnd = startAngle + seg.to * totalArc
          return (
            <path
              key={i}
              d={arcPath(segStart, segEnd, r)}
              fill="none"
              stroke={seg.color}
              strokeWidth="18"
              strokeLinecap="butt"
            />
          )
        })}

        {/* Minor tick marks */}
        {minorTicks.map((tick, i) => (
          <line
            key={`minor-${i}`}
            x1={tick.innerPt.x}
            y1={tick.innerPt.y}
            x2={tick.outerPt.x}
            y2={tick.outerPt.y}
            stroke="#94a3b8"
            strokeWidth="0.5"
          />
        ))}

        {/* Major tick marks */}
        {ticks.map((tick, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={tick.innerPt.x}
              y1={tick.innerPt.y}
              x2={tick.outerPt.x}
              y2={tick.outerPt.y}
              stroke="#475569"
              strokeWidth="2"
            />
            <text
              x={tick.labelPt.x}
              y={tick.labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-600"
              fontSize="11"
              fontWeight="600"
              fontFamily="Inter, sans-serif"
            >
              {Math.round(tick.tickValue)}
            </text>
          </g>
        ))}

        {/* Pointer pivot */}
        <circle cx={cx} cy={cy} r="8" fill="#ffffff" stroke="#475569" strokeWidth="2" />

        {/* Pointer needle */}
        <line
          x1={cx}
          y1={cy}
          x2={polarToXY(pointerAngle, r - 10).x}
          y2={polarToXY(pointerAngle, r - 10).y}
          stroke="#dc2626"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Center value display */}
        <text
          x={cx}
          y={cy + 40}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-800"
          fontSize="28"
          fontWeight="700"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {clampedValue.toFixed(1)}
        </text>

        {/* Label */}
        <text
          x={cx}
          y={cy + 62}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-500"
          fontSize="13"
          fontWeight="500"
          fontFamily="Inter, sans-serif"
        >
          {label}
        </text>
      </svg>
    </div>
  )
}
