import { ReactNode } from 'react'

export interface IndustrialCardProps {
  title?: string
  headerRight?: ReactNode
  headerBg?: string
  children: ReactNode
  className?: string
  borderLeftColor?: string
}

export default function IndustrialCard({
  title,
  headerRight,
  headerBg,
  children,
  className = '',
  borderLeftColor,
}: IndustrialCardProps) {
  return (
    <div
      className={`industrial-card rounded-xl ${className}`}
      style={borderLeftColor ? { borderLeftWidth: '4px', borderLeftColor } : undefined}
    >
      {title && (
        <div
          className={`industrial-card-header flex justify-between items-center ${headerBg || ''}`}
        >
          <h3 className="font-label-bold text-label-bold uppercase tracking-widest text-on-surface-variant">
            {title}
          </h3>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
