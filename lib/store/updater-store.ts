import { create } from 'zustand'
import type { UpdateInfo, UpdateProgress } from '@/lib/updater'

export type UpdateStage =
  | 'idle'          // 无更新
  | 'available'     // 发现新版本，等待用户确认
  | 'downloading'   // 下载中
  | 'downloaded'    // 下载完成，等待重启
  | 'error'         // 出错

interface UpdaterStore {
  // 全量更新状态
  stage: UpdateStage
  updateInfo: UpdateInfo | null
  progress: UpdateProgress | null
  errorMsg: string | null

  // Server 热更新就绪状态（AutoUpdater 下载完成后设置）
  serverUpdateReady: boolean
  serverUpdateVersion: string | null
  serverUpdatePath: string | null

  // 热更新完成 toast（server 重启/刷新后显示）
  serverUpdatedToast: string | null

  // actions
  setAvailable: (info: UpdateInfo) => void
  setDownloading: () => void
  setProgress: (progress: UpdateProgress) => void
  setDownloaded: () => void
  setError: (msg: string) => void
  dismiss: () => void
  reset: () => void

  // Server 热更新 actions
  setServerReady: (version: string, path: string) => void
  clearServerReady: () => void
  applyServerAndRelaunch: () => Promise<void>
  showServerUpdatedToast: (version: string) => void
  clearServerUpdatedToast: () => void
}

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  stage: 'idle',
  updateInfo: null,
  progress: null,
  errorMsg: null,
  serverUpdateReady: false,
  serverUpdateVersion: null,
  serverUpdatePath: null,
  serverUpdatedToast: null,

  setAvailable: (info) => set({ stage: 'available', updateInfo: info, errorMsg: null }),
  setDownloading: () => set({ stage: 'downloading', progress: { downloaded: 0, total: 0, percent: 0 } }),
  setProgress: (progress) => set({ progress }),
  setDownloaded: () => set({ stage: 'downloaded', progress: { downloaded: 0, total: 0, percent: 100 } }),
  setError: (msg) => set({ stage: 'error', errorMsg: msg }),
  dismiss: () => set({ stage: 'idle', updateInfo: null, progress: null, errorMsg: null }),
  reset: () => set({ stage: 'idle', updateInfo: null, progress: null, errorMsg: null, serverUpdateReady: false, serverUpdateVersion: null, serverUpdatePath: null }),

  setServerReady: (version, path) => set({ serverUpdateReady: true, serverUpdateVersion: version, serverUpdatePath: path }),
  clearServerReady: () => set({ serverUpdateReady: false, serverUpdateVersion: null, serverUpdatePath: null }),
  applyServerAndRelaunch: async () => {
    const { serverUpdatePath, serverUpdateVersion } = get()
    if (!serverUpdatePath || !serverUpdateVersion) return
    try {
      const { applyServerUpdate } = await import('@/lib/updater')
      await applyServerUpdate(serverUpdatePath, serverUpdateVersion, false)
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[UpdaterStore] applyServerAndRelaunch failed:', msg)
      set({ serverUpdateReady: false, serverUpdateVersion: null, serverUpdatePath: null, stage: 'error', errorMsg: msg })
    }
  },
  showServerUpdatedToast: (version) => set({ serverUpdatedToast: version }),
  clearServerUpdatedToast: () => set({ serverUpdatedToast: null }),
}))
