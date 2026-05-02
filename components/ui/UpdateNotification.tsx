"use client"

import { useCallback, useEffect } from 'react'
import { useUpdaterStore } from '@/lib/store'
import { downloadUpdate, installAndRelaunch } from '@/lib/updater'

export default function UpdateNotification() {
  const {
    stage, updateInfo, progress, errorMsg,
    setDownloading, setProgress, setDownloaded, setError, dismiss,
    serverUpdateReady, serverUpdateVersion, applyServerAndRelaunch, clearServerReady,
    serverUpdatedToast, clearServerUpdatedToast,
  } = useUpdaterStore()

  // 自动清除 toast（5 秒后）
  useEffect(() => {
    if (!serverUpdatedToast) return
    const timer = setTimeout(() => clearServerUpdatedToast(), 5000)
    return () => clearTimeout(timer)
  }, [serverUpdatedToast, clearServerUpdatedToast])

  const handleUpdate = useCallback(async () => {
    try {
      setDownloading()
      await downloadUpdate((p) => setProgress(p))
      setDownloaded()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    }
  }, [setDownloading, setProgress, setDownloaded, setError])

  const handleRestart = useCallback(async () => {
    try {
      await installAndRelaunch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    }
  }, [setError])

  const handleManualDownload = useCallback(async () => {
    if (updateInfo?.downloadUrl) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener')
        await openUrl(updateInfo.downloadUrl)
      } catch (e) {
        console.error('[Updater] 打开下载链接失败:', e)
      }
    }
    dismiss()
  }, [updateInfo, dismiss])

  const handleApplyServerUpdate = useCallback(async () => {
    await applyServerAndRelaunch()
  }, [applyServerAndRelaunch])

  // Toast: 更新完成提示（全量更新后首次启动 / 热更新完成）
  if (serverUpdatedToast) {
    return (
      <div className="fixed bottom-4 right-4 z-[200] w-[320px] animate-[slideIn_0.25s_ease-out]">
        <div className="bg-white rounded-xl border border-emerald-200 shadow-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="material-symbols-outlined text-lg text-emerald-500">check_circle</span>
            <span className="text-sm text-slate-700">
              已更新到 <span className="font-mono font-semibold text-primary">v{serverUpdatedToast}</span>
            </span>
            <button
              onClick={clearServerUpdatedToast}
              className="ml-auto p-1 rounded-full hover:bg-slate-100 transition-colors"
            >
              <span className="material-symbols-outlined text-base text-slate-400">close</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Server 热更新就绪通知（AutoUpdater 下载完成，等待用户确认重启）
  if (serverUpdateReady && serverUpdateVersion) {
    return (
      <div className="fixed bottom-4 right-4 z-[200] w-[380px] animate-[slideIn_0.25s_ease-out]">
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-primary">system_update</span>
              <span className="text-sm font-semibold text-primary">热更新已就绪</span>
            </div>
            <button
              onClick={clearServerReady}
              className="p-1 rounded-full hover:bg-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined text-base text-slate-400">close</span>
            </button>
          </div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-sm text-slate-600">
              新版本 <span className="font-mono font-semibold text-primary">v{serverUpdateVersion}</span> 已下载完成，重启应用以完成更新。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={clearServerReady}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                稍后重启
              </button>
              <button
                onClick={handleApplyServerUpdate}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">restart_alt</span>
                立即重启
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 全量更新通知
  if (stage === 'idle') return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[380px] animate-[slideIn_0.25s_ease-out]">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-primary">
              {stage === 'error' ? 'error' : stage === 'downloaded' ? 'check_circle' : 'system_update'}
            </span>
            <span className="text-sm font-semibold text-primary">
              {stage === 'available' && '发现新版本'}
              {stage === 'downloading' && '正在下载更新'}
              {stage === 'downloaded' && '更新已就绪'}
              {stage === 'error' && '更新失败'}
            </span>
          </div>
          {(stage === 'available' || stage === 'error') && (
            <button
              onClick={dismiss}
              className="p-1 rounded-full hover:bg-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined text-base text-slate-400">close</span>
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className="px-4 py-3">
          {/* 发现新版本 */}
          {stage === 'available' && updateInfo && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                新版本 <span className="font-mono font-semibold text-primary">v{updateInfo.version}</span> 已发布
                {updateInfo.body && (
                  <span className="block mt-1 text-xs text-slate-400">{updateInfo.body}</span>
                )}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={dismiss}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  稍后提醒
                </button>
                {updateInfo.canAutoInstall ? (
                  <button
                    onClick={handleUpdate}
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                  >
                    立即更新
                  </button>
                ) : updateInfo.downloadUrl ? (
                  <button
                    onClick={handleManualDownload}
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                  >
                    手动下载
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* 下载中 */}
          {stage === 'downloading' && progress && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">正在下载更新包…</p>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 text-right">{progress.percent}%</p>
            </div>
          )}

          {/* 下载完成 */}
          {stage === 'downloaded' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                更新已下载完成，重启应用以完成安装。
              </p>
              <div className="flex justify-end">
                <button
                  onClick={handleRestart}
                  className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">restart_alt</span>
                  立即重启
                </button>
              </div>
            </div>
          )}

          {/* 错误 */}
          {stage === 'error' && (
            <div className="space-y-2">
              <p className="text-sm text-red-600">{errorMsg || '更新过程中发生未知错误'}</p>
              <div className="flex justify-end">
                <button
                  onClick={dismiss}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
