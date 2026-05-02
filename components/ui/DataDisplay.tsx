export interface DataDisplayProps {
  label: string
  value: string
  unit: string
  color?: string
  className?: string
}

export default function DataDisplay({
  label,
  value,
  unit,
  color,
  className = '',
}: DataDisplayProps) {
  return (
    <div className={`flex justify-between items-end border-b border-surface-variant pb-xs ${className}`}>
      <span className="font-body-md text-secondary">{label}</span>
      <span className={`font-display-data text-headline-lg monospaced-data ${color || ''}`}>
        {value} <span className="text-sm font-normal">{unit}</span>
      </span>
    </div>
  )
}
