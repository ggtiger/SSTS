"use client"

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { WindowControls } from './WindowControls'
import SettingsModal from './SettingsModal'

const navItems = [
  { label: '首页', icon: 'dashboard', href: '/' },
  { label: '制动', icon: 'car_repair', href: '/brake-test' },
  { label: '转向', icon: 'settings_input_component', href: '/steering-test' },
  { label: '力矩', icon: 'vibration', href: '/torque-test' },
  { label: '调试', icon: 'bug_report', href: '/debug' },
]

export default function TopAppBar() {
  const pathname = usePathname()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <header
      className="flex-shrink-0 z-50 flex items-center justify-between px-6 h-16 w-full bg-white border-b border-slate-200 shadow-sm font-inter text-body-md text-primary antialiased select-none draggable-region"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-8">
        <span className="text-lg font-black text-primary tracking-tighter flex items-center">
          <span className="material-symbols-outlined text-2xl mr-2">precision_manufacturing</span>
          4-Wheel Alignment
        </span>
        <nav className="hidden md:flex items-center gap-6 h-16">
          {navItems.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href) && item.href !== '#'
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-1 px-1 border-b-2 transition-colors ${
                  isActive
                    ? 'text-primary border-primary font-semibold'
                    : 'text-slate-500 border-transparent hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <button
          className="p-2 hover:bg-slate-50 transition-colors active:opacity-80 duration-150 rounded-full"
          onClick={() => setSettingsOpen(true)}
        >
          <span className="material-symbols-outlined">settings</span>
        </button>
        <WindowControls />
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  )
}
