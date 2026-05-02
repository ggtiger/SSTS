'use client'

import { useEffect } from 'react'

/**
 * 版本变化检测 key（localStorage）
 * 启动时对比，如果版本号变了说明刚完成全量更新
 */
const LAST_VERSION_KEY = 'ssts_last_version'

export default function AppReady() {
  useEffect(() => {
    const doStartup = async () => {
      // 检查是否在 Tauri 环境
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return

      try {
        const { startupUpdateCheck } = await import('@/lib/updater')
        const { invoke } = await import('@tauri-apps/api/core')
        const { useUpdaterStore } = await import('@/lib/store/updater-store')

        // Windows 上 apply 需要更长时间（停 server + 等待句柄释放 + 重启）
        const isWindows = navigator.userAgent.includes('Windows')
        const timeoutMs = isWindows ? 45000 : 30000

        await Promise.race([
          startupUpdateCheck(
            // splash 进度回调
            async (status, progress, detail) => {
              try {
                await invoke('update_splash', { status, progress, detail })
              } catch {}
            },
            // 发现全量更新回调
            (info) => {
              useUpdaterStore.getState().setAvailable(info)
            }
          ),
          // 超时保护
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeoutMs)
          ),
        ])
      } catch (err) {
        // 超时或失败，不阻塞启动
        console.warn('[AppReady] Startup update check skipped:', err)
      }

      // 无论成功失败都调用 app_ready 关闭 splash
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        console.log('[AppReady] Calling app_ready...')
        await invoke('app_ready')
        console.log('[AppReady] app_ready called successfully')
      } catch (e) {
        if (typeof window !== 'undefined' && window.__TAURI__) {
          console.warn('[AppReady] Failed to call app_ready:', e)
        }
      }

      // 版本变化检测：全量更新后首次启动显示 toast
      try {
        const { getVersion } = await import('@tauri-apps/api/app')
        const currentVersion = await getVersion()
        const lastVersion = localStorage.getItem(LAST_VERSION_KEY)
        localStorage.setItem(LAST_VERSION_KEY, currentVersion)

        if (lastVersion && lastVersion !== currentVersion) {
          const { useUpdaterStore } = await import('@/lib/store/updater-store')
          useUpdaterStore.getState().showServerUpdatedToast(currentVersion)
        }
      } catch {}
    }

    // 延迟一点调用，确保页面已渲染
    const timer = setTimeout(doStartup, 100)
    return () => clearTimeout(timer)
  }, [])

  return null
}
