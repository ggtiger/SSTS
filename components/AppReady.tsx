'use client'

import { useEffect } from 'react'

export default function AppReady() {
  useEffect(() => {
    // 页面加载完成后通知 Tauri 关闭 splash
    const signalReady = async () => {
      try {
        // 动态导入 Tauri API（避免非 Tauri 环境报错）
        const { invoke } = await import('@tauri-apps/api/core')
        console.log('[AppReady] Calling app_ready...')
        await invoke('app_ready')
        console.log('[AppReady] app_ready called successfully')
      } catch (e) {
        // 非 Tauri 环境静默忽略
        if (typeof window !== 'undefined' && window.__TAURI__) {
          console.warn('[AppReady] Failed to call app_ready:', e)
        }
      }
    }

    // 延迟一点调用，确保页面已渲染
    const timer = setTimeout(signalReady, 100)
    return () => clearTimeout(timer)
  }, [])

  return null
}