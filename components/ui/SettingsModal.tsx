"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { isTauri } from '@/lib/tauri'
import { checkForUpdate, getCurrentServerVersion } from '@/lib/updater'
import { useUpdaterStore } from '@/lib/store'

interface SettingsData {
  defaultIp: string
  defaultPort: string
  theme: 'light' | 'dark'
}

const DEFAULT_SETTINGS: SettingsData = {
  defaultIp: '192.168.1.100',
  defaultPort: '8080',
  theme: 'light',
}

const STORAGE_KEY = 'ssts-settings'

function loadSettings(): SettingsData {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS
}

function saveSettings(data: SettingsData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [activeTab, setActiveTab] = useState<'connection' | 'display' | 'about'>('connection')
  const [appVersion, setAppVersion] = useState('0.1.1')
  const [serverVersion, setServerVersion] = useState('--')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [checkResult, setCheckResult] = useState<'latest' | 'error' | null>(null)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setSettings(loadSettings())
      setActiveTab('connection')
      setCheckResult(null)
      setCheckingUpdate(false)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
    }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        if (isTauri()) {
          const { getVersion } = await import('@tauri-apps/api/app')
          const version = await getVersion()
          setAppVersion(version)
        }
      } catch {
        // 非 Tauri 环境，使用默认值
      }
      try {
        const sv = await getCurrentServerVersion()
        if (sv && sv !== 'unknown') setServerVersion(sv)
      } catch {
        // 获取 server 版本失败，保持默认
      }
    })()
  }, [])

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true)
    setCheckResult(null)
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current)

    try {
      const update = await checkForUpdate()
      if (update) {
        useUpdaterStore.getState().setAvailable(update)
        onClose()
      } else {
        setCheckResult('latest')
        resultTimerRef.current = setTimeout(() => setCheckResult(null), 3000)
      }
    } catch {
      setCheckResult('error')
      resultTimerRef.current = setTimeout(() => setCheckResult(null), 3000)
    } finally {
      setCheckingUpdate(false)
    }
  }, [onClose])

  const handleSave = useCallback(() => {
    saveSettings(settings)
    onClose()
  }, [settings, onClose])

  if (!open) return null

  const tabs = [
    { key: 'connection' as const, label: '连接设置', icon: 'lan' },
    { key: 'display' as const, label: '显示设置', icon: 'palette' },
    { key: 'about' as const, label: '关于', icon: 'info' },
  ]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* 弹窗 */}
      <div
        className="relative w-full max-w-lg mx-4 bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden animate-[slideIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-xl">settings</span>
            设置
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 transition-colors"
          >
            <span className="material-symbols-outlined text-xl text-slate-500">close</span>
          </button>
        </div>

        {/* Tab 导航 */}
        <div className="flex border-b border-slate-200 px-6 gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 py-3 px-1 text-sm border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'text-primary border-primary font-semibold'
                  : 'text-slate-500 border-transparent hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="px-6 py-5 min-h-[220px]">
          {activeTab === 'connection' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">默认 IP 地址</label>
                <input
                  type="text"
                  value={settings.defaultIp}
                  onChange={(e) => setSettings((s) => ({ ...s, defaultIp: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">默认端口</label>
                <input
                  type="text"
                  value={settings.defaultPort}
                  onChange={(e) => setSettings((s) => ({ ...s, defaultPort: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="8080"
                />
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">主题</label>
                <div className="flex gap-3">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSettings((s) => ({ ...s, theme: t }))}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                        settings.theme === t
                          ? 'border-primary bg-primary/5 text-primary font-semibold'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {t === 'light' ? 'light_mode' : 'dark_mode'}
                      </span>
                      {t === 'light' ? '浅色' : '深色'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">深色模式暂未实装，后续版本支持</p>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-3xl text-primary">precision_manufacturing</span>
                <div>
                  <h3 className="font-bold text-base text-primary">4-Wheel Alignment</h3>
                  <p className="text-slate-500">四轮定位检测系统</p>
                </div>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-slate-600">
                <span className="text-slate-400">应用版本</span>
                <span className="font-mono">{appVersion}</span>
                <span className="text-slate-400">Server 版本</span>
                <span className="font-mono">{serverVersion}</span>
                <span className="text-slate-400">框架</span>
                <span>Tauri + Next.js</span>
                <span className="text-slate-400">技术支持</span>
                <span>support@ssts.local</span>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                    checkingUpdate
                      ? 'bg-primary/60 text-white cursor-not-allowed'
                      : 'bg-primary text-white hover:bg-primary/90'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${checkingUpdate ? 'animate-spin' : ''}`}>
                    {checkingUpdate ? 'progress_activity' : 'system_update'}
                  </span>
                  {checkingUpdate ? '正在检查...' : '检查更新'}
                </button>

                {checkResult === 'latest' && (
                  <span className="inline-flex items-center gap-1 text-sm text-green-600">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    当前已是最新版本
                  </span>
                )}
                {checkResult === 'error' && (
                  <span className="inline-flex items-center gap-1 text-sm text-red-500">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    检查失败，请稍后重试
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        {activeTab !== 'about' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
            >
              保存
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
