"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { isTauri } from '@/lib/tauri'
import { checkForUpdate, getCurrentServerVersion } from '@/lib/updater'
import { useUpdaterStore } from '@/lib/store'
import { loadConfig, saveConfig, DEFAULT_CONFIG, type AppConfig } from '@/lib/config'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'connection' | 'general' | 'about'>('connection')
  const [appVersion, setAppVersion] = useState('0.1.1')
  const [serverVersion, setServerVersion] = useState('--')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [checkResult, setCheckResult] = useState<'latest' | 'error' | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 打开弹窗时加载配置
  useEffect(() => {
    if (open) {
      setActiveTab('connection')
      setCheckResult(null)
      setCheckingUpdate(false)
      setAdvancedOpen(false)
      setLoading(true)
      loadConfig()
        .then((c) => setConfig(c))
        .finally(() => setLoading(false))
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

  const handleSave = useCallback(async () => {
    await saveConfig(config)
    onClose()
  }, [config, onClose])

  if (!open) return null

  const tabs = [
    { key: 'connection' as const, label: '连接设置', icon: 'lan' },
    { key: 'general' as const, label: '通用', icon: 'tune' },
    { key: 'about' as const, label: '关于', icon: 'info' },
  ]

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors'

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
          {loading ? (
            <div className="flex items-center justify-center h-[180px] text-slate-400 text-sm">
              <span className="material-symbols-outlined animate-spin mr-2 text-base">progress_activity</span>
              加载配置...
            </div>
          ) : (
            <>
              {/* ====== 连接设置 Tab ====== */}
              {activeTab === 'connection' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">默认 IP 地址</label>
                    <input
                      type="text"
                      value={config.device.ip}
                      onChange={(e) =>
                        setConfig((c: AppConfig) => ({ ...c, device: { ...c.device, ip: e.target.value } }))
                      }
                      className={inputClass}
                      placeholder="192.168.4.1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">默认端口</label>
                    <input
                      type="text"
                      value={String(config.device.port)}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '')
                        setConfig((c: AppConfig) => ({
                          ...c,
                          device: { ...c.device, port: v ? Number(v) : 0 },
                        }))
                      }}
                      className={inputClass}
                      placeholder="10001"
                    />
                  </div>

                  {/* 高级设置（可折叠） */}
                  <div className="pt-2">
                    <button
                      onClick={() => setAdvancedOpen((v: boolean) => !v)}
                      className="flex items-center gap-1 text-sm text-slate-500 hover:text-primary transition-colors"
                    >
                      <span
                        className={`material-symbols-outlined text-[16px] transition-transform ${
                          advancedOpen ? 'rotate-180' : ''
                        }`}
                      >
                        expand_more
                      </span>
                      高级设置
                    </button>

                    {advancedOpen && (
                      <div className="mt-3 space-y-4 pl-1 border-l-2 border-slate-200 ml-1 pl-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            CDN 更新源
                          </label>
                          <input
                            type="text"
                            value={config.update.cdnUrl}
                            onChange={(e) =>
                              setConfig((c: AppConfig) => ({
                                ...c,
                                update: { ...c.update, cdnUrl: e.target.value },
                              }))
                            }
                            className={inputClass}
                            placeholder={DEFAULT_CONFIG.update.cdnUrl}
                          />
                          <p className="mt-1 text-xs text-slate-400">自定义 CDN 更新源地址</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            GitHub 仓库
                          </label>
                          <input
                            type="text"
                            value={config.update.githubRepo}
                            onChange={(e) =>
                              setConfig((c: AppConfig) => ({
                                ...c,
                                update: { ...c.update, githubRepo: e.target.value },
                              }))
                            }
                            className={inputClass}
                            placeholder={DEFAULT_CONFIG.update.githubRepo}
                          />
                          <p className="mt-1 text-xs text-slate-400">
                            格式: owner/repo，用于 GitHub Releases 更新检查
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ====== 通用 Tab ====== */}
              {activeTab === 'general' && (
                <div className="space-y-5">
                  {/* 关闭到托盘 */}
                  <div className="flex items-center justify-between">
                    <div className="pr-4">
                      <p className="text-sm font-medium text-slate-700">关闭到托盘</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        关闭窗口时最小化到系统托盘，而非退出应用
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={config.app.closeToTray}
                      onClick={() =>
                        setConfig((c: AppConfig) => ({
                          ...c,
                          app: { ...c.app, closeToTray: !c.app.closeToTray },
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                        config.app.closeToTray ? 'bg-primary' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          config.app.closeToTray ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 主题选择 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">主题</label>
                    <div className="flex gap-3">
                      {(['light', 'dark'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() =>
                            setConfig((c: AppConfig) => ({ ...c, app: { ...c.app, theme: t } }))
                          }
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                            config.app.theme === t
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

              {/* ====== 关于 Tab ====== */}
              {activeTab === 'about' && (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-3xl text-primary">precision_manufacturing</span>
                    <div>
                      <h3 className="font-bold text-base text-primary">VACDevice</h3>
                      <p className="text-slate-500">机动车角度综合校准装置</p>
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
                    <span>support@vacdevice.local</span>
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
            </>
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
