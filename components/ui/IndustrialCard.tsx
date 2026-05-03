import { ReactNode } from 'react'

export interface IndustrialCardProps {
  title?: string
  headerLeft?: ReactNode
  headerRight?: ReactNode
  headerBg?: string
  children: ReactNode
  className?: string
  borderLeftColor?: string
}

export default function IndustrialCard({
  title,
  headerLeft,
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
          <div className="flex items-center gap-2">
            {headerLeft && <div>{headerLeft}</div>}
            <h3 className="font-label-bold text-label-bold uppercase tracking-widest text-on-surface-variant">
              {title}
            </h3>
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
