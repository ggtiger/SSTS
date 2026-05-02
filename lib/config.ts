import { isTauri } from './tauri'

// 与 Rust 端 AppConfig 结构对应（camelCase 匹配 serde rename_all）
export interface AppConfig {
  device: {
    ip: string
    port: number
  }
  update: {
    cdnUrl: string
    githubRepo: string
  }
  app: {
    closeToTray: boolean
    theme: string
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  device: {
    ip: '192.168.4.1',
    port: 10001,
  },
  update: {
    cdnUrl: 'http://o09u11p5v.qnssl.com/ssts',
    githubRepo: 'ggtiger/SSTS',
  },
  app: {
    closeToTray: false,
    theme: 'light',
  },
}

const STORAGE_KEY = 'vacdevice-config'

/** 深度合并，确保缺失字段回退到默认值 */
function mergeConfig(partial: Partial<AppConfig>): AppConfig {
  return {
    device: { ...DEFAULT_CONFIG.device, ...partial.device },
    update: { ...DEFAULT_CONFIG.update, ...partial.update },
    app: { ...DEFAULT_CONFIG.app, ...partial.app },
  }
}

export async function loadConfig(): Promise<AppConfig> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const raw = await invoke<AppConfig>('get_app_config')
      return mergeConfig(raw)
    } catch (err) {
      console.warn('[Config] Failed to load from Tauri:', err)
      return { ...DEFAULT_CONFIG }
    }
  }
  // 非 Tauri 环境 fallback
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return mergeConfig(JSON.parse(stored))
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('set_app_config', { config })
    } catch (err) {
      console.warn('[Config] Failed to save to Tauri:', err)
    }
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }
}
