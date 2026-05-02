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

  // actions
  setAvailable: (info: UpdateInfo) => void
  setDownloading: () => void
  setProgress: (progress: UpdateProgress) => void
  setDownloaded: () => void
  setError: (msg: string) => void
  dismiss: () => void
  reset: () => void
}

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  stage: 'idle',
  updateInfo: null,
  progress: null,
  errorMsg: null,

  setAvailable: (info) => set({ stage: 'available', updateInfo: info, errorMsg: null }),
  setDownloading: () => set({ stage: 'downloading', progress: { downloaded: 0, total: 0, percent: 0 } }),
  setProgress: (progress) => set({ progress }),
  setDownloaded: () => set({ stage: 'downloaded', progress: { downloaded: 0, total: 0, percent: 100 } }),
  setError: (msg) => set({ stage: 'error', errorMsg: msg }),
  dismiss: () => set({ stage: 'idle', updateInfo: null, progress: null, errorMsg: null }),
  reset: () => set({ stage: 'idle', updateInfo: null, progress: null, errorMsg: null }),
}))
