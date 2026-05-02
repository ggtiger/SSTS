"use client"

import { ReactNode } from 'react'

export interface ButtonProps {
  variant?: 'primary' | 'critical' | 'ghost'
  children: ReactNode
  icon?: string
  className?: string
  onClick?: () => void
  disabled?: boolean
}

const variantStyles = {
  primary:
    'bg-primary text-on-primary hover:bg-opacity-90 shadow-md',
  critical:
    'bg-critical text-white hover:bg-opacity-90 shadow-md',
  ghost:
    'bg-transparent border border-primary text-primary hover:bg-primary hover:text-on-primary',
}

export default function Button({
  variant = 'primary',
  children,
  icon,
  className = '',
  onClick,
  disabled,
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-sm py-xs rounded-lg font-label-bold text-label-bold transition-all flex items-center gap-xs ${variantStyles[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {icon && (
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      )}
      {children}
    </button>
  )
}
