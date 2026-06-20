"use client"

import { useEffect, useCallback, useState } from 'react'

export interface NumericKeypadProps {
  isOpen: boolean
  value: string
  onValueChange: (value: string) => void
  onConfirm: (value: string) => void
  onClose: () => void
  title?: string
  allowNegative?: boolean
  allowDecimal?: boolean
  allowMultipleDots?: boolean // IP 模式：允许多个小数点
  maxDecimalPlaces?: number
  anchorRect?: DOMRect | null
}

export default function NumericKeypad({
  isOpen,
  value,
  onValueChange,
  onConfirm,
  onClose,
  title,
  allowNegative = true,
  allowDecimal = true,
  allowMultipleDots = false,
  maxDecimalPlaces,
}: NumericKeypadProps) {
  // 全选状态：键盘刚打开且有值时，数字高亮选中，按数字键替换整个内容
  const [allSelected, setAllSelected] = useState(false)

  // 当键盘打开且有值时，自动进入全选状态
  useEffect(() => {
    if (isOpen && value) {
      setAllSelected(true)
    } else {
      setAllSelected(false)
    }
  }, [isOpen])

  // 全选状态下替换值的辅助函数
  const replaceOrAppend = useCallback((newVal: string) => {
    if (allSelected) {
      onValueChange(newVal)
      setAllSelected(false)
    } else {
      onValueChange(value + newVal)
    }
  }, [allSelected, value, onValueChange])

  const formatAndConfirm = useCallback((val: string) => {
    if (maxDecimalPlaces !== undefined && !allowMultipleDots && val !== '') {
      const num = parseFloat(val)
      if (!isNaN(num)) {
        onConfirm(num.toFixed(maxDecimalPlaces))
        return
      }
    }
    onConfirm(val)
  }, [maxDecimalPlaces, allowMultipleDots, onConfirm])

  // Keyboard support
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Enter') {
        e.preventDefault()
        formatAndConfirm(value)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        if (allSelected) {
          onValueChange('')
          setAllSelected(false)
        } else {
          onValueChange(value.slice(0, -1))
        }
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        if (maxDecimalPlaces !== undefined && !allowMultipleDots) {
          const checkVal = allSelected ? '' : value
          const dotIndex = checkVal.indexOf('.')
          if (dotIndex !== -1) {
            const decimalPart = checkVal.substring(dotIndex + 1)
            if (decimalPart.length >= maxDecimalPlaces) {
              return
            }
          }
        }
        replaceOrAppend(e.key)
      } else if (e.key === '.' && allowDecimal) {
        e.preventDefault()
        if (allSelected) {
          onValueChange('0.')
          setAllSelected(false)
        } else if (allowMultipleDots || !value.includes('.')) {
          onValueChange(value + '.')
        }
      } else if (e.key === '-' && allowNegative) {
        e.preventDefault()
        if (allSelected) {
          onValueChange('-')
          setAllSelected(false)
        } else if (value.startsWith('-')) {
          onValueChange(value.slice(1))
        } else {
          onValueChange('-' + value)
        }
      }
    },
    [isOpen, value, onValueChange, onClose, allowDecimal, allowNegative, allowMultipleDots, maxDecimalPlaces, formatAndConfirm, allSelected, replaceOrAppend]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  const handleDigit = (digit: string) => {
    if (maxDecimalPlaces !== undefined && !allowMultipleDots) {
      const checkVal = allSelected ? '' : value
      const dotIndex = checkVal.indexOf('.')
      if (dotIndex !== -1) {
        const decimalPart = checkVal.substring(dotIndex + 1)
        if (decimalPart.length >= maxDecimalPlaces) {
          return
        }
      }
    }
    replaceOrAppend(digit)
  }

  const handleDot = () => {
    if (!allowDecimal) return
    if (allSelected) {
      onValueChange('0.')
      setAllSelected(false)
    } else if (!allowMultipleDots && value.includes('.')) {
      return
    } else {
      onValueChange(value + '.')
    }
  }

  const handleBackspace = () => {
    if (allSelected) {
      onValueChange('')
      setAllSelected(false)
    } else {
      onValueChange(value.slice(0, -1))
    }
  }

  const handleClear = () => {
    onValueChange('')
    setAllSelected(false)
  }

  const handleToggleSign = () => {
    if (!allowNegative) return
    if (allSelected) {
      onValueChange('-')
      setAllSelected(false)
    } else if (value.startsWith('-')) {
      onValueChange(value.slice(1))
    } else {
      onValueChange('-' + value)
    }
  }

  const handleConfirm = () => {
    formatAndConfirm(value)
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Button base styles
  const digitBtn =
    'flex items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-semibold text-slate-800 transition-all active:scale-95 active:bg-slate-100 hover:bg-slate-50 select-none'
  const backspaceBtn =
    'flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 transition-all active:scale-95 active:bg-amber-200 hover:bg-amber-100 select-none'
  const clearBtn =
    'flex items-center justify-center rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-600 transition-all active:scale-95 active:bg-red-200 hover:bg-red-100 select-none'
  const confirmBtn =
    'flex items-center justify-center rounded-lg bg-primary text-on-primary text-base font-bold transition-all active:scale-95 active:brightness-90 hover:brightness-95 select-none'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-fade-in"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[340px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            {title ? (
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {title}
              </div>
            ) : (
              <div />
            )}
            <button
              className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-all select-none"
              onClick={onClose}
              aria-label="关闭"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
          <div className={`w-full px-4 py-3 border rounded-xl text-right ${
            allSelected && value
              ? 'bg-blue-100 border-blue-400'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-2xl font-mono font-bold tracking-wide ${
              allSelected && value ? 'text-blue-700' : 'text-slate-800'
            }`}>
              {value || <span className="text-slate-300">0</span>}
            </span>
          </div>
        </div>

        {/* Keypad grid */}
        <div className="px-5 pb-5">
          <div className="grid grid-cols-4 gap-2" style={{ gridTemplateRows: 'repeat(4, 52px)' }}>
            {/* Row 1: 7 8 9 ← */}
            <button className={digitBtn} onClick={() => handleDigit('7')}>7</button>
            <button className={digitBtn} onClick={() => handleDigit('8')}>8</button>
            <button className={digitBtn} onClick={() => handleDigit('9')}>9</button>
            <button className={backspaceBtn} onClick={handleBackspace}>
              <span className="material-symbols-outlined text-lg">backspace</span>
            </button>

            {/* Row 2: 4 5 6 C */}
            <button className={digitBtn} onClick={() => handleDigit('4')}>4</button>
            <button className={digitBtn} onClick={() => handleDigit('5')}>5</button>
            <button className={digitBtn} onClick={() => handleDigit('6')}>6</button>
            <button className={clearBtn} onClick={handleClear}>
              C
            </button>

            {/* Row 3: 1 2 3 确定(top) */}
            <button className={digitBtn} onClick={() => handleDigit('1')}>1</button>
            <button className={digitBtn} onClick={() => handleDigit('2')}>2</button>
            <button className={digitBtn} onClick={() => handleDigit('3')}>3</button>
            <button
              className={`${confirmBtn} row-span-2`}
              style={{ gridRow: 'span 2' }}
              onClick={handleConfirm}
            >
              确定
            </button>

            {/* Row 4: ± 0 . */}
            {allowNegative ? (
              <button className={digitBtn} onClick={handleToggleSign}>
                ±
              </button>
            ) : (
              <button className={digitBtn} onClick={() => handleDigit('0')}>
                00
              </button>
            )}
            <button className={digitBtn} onClick={() => handleDigit('0')}>0</button>
            {allowDecimal ? (
              <button className={digitBtn} onClick={handleDot}>
                .
              </button>
            ) : (
              <div />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
