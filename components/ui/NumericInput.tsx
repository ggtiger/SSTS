"use client"

import { useState, useCallback } from 'react'
import NumericKeypad from './NumericKeypad'

export interface NumericInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  title?: string
  allowNegative?: boolean
  allowDecimal?: boolean
  allowMultipleDots?: boolean
  maxDecimalPlaces?: number
}

export default function NumericInput({
  value,
  onChange,
  placeholder = '—',
  className = '',
  disabled = false,
  title,
  allowNegative = true,
  allowDecimal = true,
  allowMultipleDots = false,
  maxDecimalPlaces,
}: NumericInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempValue, setTempValue] = useState('')

  const handleOpen = useCallback(() => {
    if (disabled) return
    setTempValue(value)
    setIsOpen(true)
  }, [disabled, value])

  const handleConfirm = useCallback(
    (val: string) => {
      onChange(val)
      setIsOpen(false)
    },
    [onChange]
  )

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <>
      <input
        type="text"
        readOnly
        value={value}
        onClick={handleOpen}
        placeholder={placeholder}
        disabled={disabled}
        className={`cursor-pointer ${className}`}
      />
      <NumericKeypad
        isOpen={isOpen}
        value={tempValue}
        onValueChange={setTempValue}
        onConfirm={handleConfirm}
        onClose={handleClose}
        title={title}
        allowNegative={allowNegative}
        allowDecimal={allowDecimal}
        allowMultipleDots={allowMultipleDots}
        maxDecimalPlaces={maxDecimalPlaces}
      />
    </>
  )
}
