/**
 * Tauri 应用自动更新封装
 * 检查更新 → 下载 → 安装 → 重启
 *
 * 支持两种更新通道：
 * - Server 热更新：通过文件级补丁（覆盖式）更新 server/ 目录
 * - Tauri 全量更新：通过 tauri-plugin-updater 更新整个应用
 */

import { isTauri } from './tauri'
import { loadConfig, DEFAULT_CONFIG } from './config'

async function updateLog(msg: string) {
  console.log(msg);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_log', { message: msg });
  } catch {}
}

export interface UpdateProgress {
  /** 已下载字节数 */
  downloaded: number
  /** 总字节数（可能为 0） */
  total: number
  /** 下载百分比 0~100 */
  percent: number
}

export interface UpdateInfo {
  version: string
  date?: string
  body?: string
  /** Tauri updater check() 是否可用（false 表示需要手动下载安装） */
  canAutoInstall?: boolean
  /** 手动下载 URL（当 canAutoInstall=false 时提供） */
  downloadUrl?: string
}

export type UpdateStatus =
  | 'idle'          // 空闲
  | 'checking'      // 检查中
  | 'available'     // 发现新版本
  | 'downloading'   // 下载中
  | 'downloaded'    // 下载完成
  | 'error'         // 出错

// ============ Server Delta 类型 ============

export interface ServerDelta {
  from: string
  url: string
  size: number
  hash: string
}

export interface ServerFullPackage {
  url: string
  cdnUrl?: string
  size: number
  hash: string
}

export interface ServerUpdateInfo {
  /** 新 server 版本号 */
  version: string
  /** 匹配的 delta（null 表示无可用 delta，需走全量更新） */
  delta: ServerDelta | null
  /** 所有匹配的 delta 候选（用于 hash 校验失败时依次重试） */
  allDeltas?: ServerDelta[]
  /** 全量 server 包信息（delta 不可用时的 fallback） */
  serverFull: ServerFullPackage | null
  /** 更新类型标签 */
  label: string
  /** 更新说明 */
  notes?: string
}

// ============ 工具函数 ============

/** 比较两个 semver 版本号，返回 true 表示 remote 比 local 更新 */
function isVersionNewer(remote: string, local: string): boolean {
  const rParts = remote.split('.').map(Number)
  const lParts = local.split('.').map(Number)
  for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
    const r = rParts[i] ?? 0
    const l = lParts[i] ?? 0
    if (r > l) return true
    if (r < l) return false
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 获取当前平台标识（通过 Tauri plugin-os 获取准确信息） */
async function getPlatformKey(): Promise<string> {
  if (!isTauri()) return 'unknown'
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window === 'undefined' || !(window as any).__TAURI_OS_PLUGIN_INTERNALS__) {
      return 'unknown'
    }
    const { platform, arch } = await import('@tauri-apps/plugin-os')
    const osMap: Record<string, string> = { macos: 'darwin', windows: 'windows', linux: 'linux' }
    return `${osMap[platform()] ?? platform()}-${arch()}`
  } catch {
    return 'unknown'
  }
}

/**
 * 通过 Tauri Rust 端获取远程 JSON（绕过浏览器 CORS 限制）
 */
async function fetchJsonViaRust(url: string): Promise<Record<string, unknown> | null> {
  try {
    updateLog(`[Updater] fetchJsonViaRust 请求: ${url}`)
    const { invoke } = await import('@tauri-apps/api/core')
    const body = await invoke<string>('fetch_url', { url })
    const truncated = body.length > 500 ? body.substring(0, 500) + '...(truncated)' : body
    updateLog(`[Updater] fetchJsonViaRust 响应 (${body.length} chars): ${truncated}`)
    return JSON.parse(body) as Record<string, unknown>
  } catch (err) {
    updateLog(`[Updater] fetchJsonViaRust 失败: ${url} | 错误: ${err}`)
    return null
  }
}

/**
 * 带重试的 latest.json 获取（CDN + GitHub 双端点）
 */
async function fetchLatestJsonWithRetry(maxRetries = 2): Promise<Record<string, unknown> | null> {
  const config = await loadConfig()
  const cdnUrl = config.update.cdnUrl || DEFAULT_CONFIG.update.cdnUrl
  const githubRepo = config.update.githubRepo || DEFAULT_CONFIG.update.githubRepo

  const cdnEndpoint = `${cdnUrl}/latest.json?t=${Date.now()}`
  const githubEndpoint = `https://github.com/${githubRepo}/releases/latest/download/latest.json`
  updateLog(`[Updater] fetchLatestJsonWithRetry 开始 | CDN: ${cdnEndpoint} | GitHub: ${githubEndpoint} | maxRetries=${maxRetries}`)

  const endpoints: Array<{ label: string; fn: () => Promise<Record<string, unknown> | null> }> = [
    { label: 'CDN', fn: () => fetchJsonViaRust(cdnEndpoint) },
    { label: 'GitHub', fn: () => fetchJsonViaRust(githubEndpoint) },
  ]
  for (const ep of endpoints) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        updateLog(`[Updater] 尝试 ${ep.label} 端点 (attempt ${attempt + 1}/${maxRetries + 1})`)
        const result = await ep.fn()
        if (result) {
          updateLog(`[Updater] ${ep.label} 端点成功返回数据`)
          return result
        }
        updateLog(`[Updater] ${ep.label} 端点返回空结果`)
      } catch (err) {
        updateLog(`[Updater] ${ep.label} 端点异常 (attempt ${attempt + 1}): ${err}`)
      }
      if (attempt < maxRetries) await delay(Math.pow(2, attempt) * 1000)
    }
  }
  updateLog(`[Updater] fetchLatestJsonWithRetry 所有端点均失败`)
  return null
}

// ============ 全量更新（Tauri updater） ============

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null

  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    const currentVersion = await getVersion()
    updateLog(`[Updater] checkForUpdate | 当前版本: ${currentVersion}`)

    // 先通过自定义端点获取 latest.json
    updateLog(`[Updater] 开始获取 latest.json...`)
    const latestJson = await fetchLatestJsonWithRetry()
    if (latestJson) {
      const remoteVersion = (latestJson.version as string) || ''
      updateLog(`[Updater] latest.json 版本比对: 本地=${currentVersion}, 远端=${remoteVersion || 'N/A'}, 需更新=${remoteVersion ? isVersionNewer(remoteVersion, currentVersion) : false}`)
      if (!remoteVersion || !isVersionNewer(remoteVersion, currentVersion)) {
        updateLog(`[Updater] 全量更新: 无需更新，当前已是最新`)
        return null
      }
    } else {
      updateLog(`[Updater] latest.json 获取失败，尝试通过 Tauri updater 检查`)
    }

    // 调用 Tauri updater 获取完整更新信息
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let update: any = null
    try {
      updateLog(`[Updater] 调用 Tauri plugin-updater check()...`)
      const { check } = await import('@tauri-apps/plugin-updater')
      update = await check({ timeout: 15000 })
      updateLog(`[Updater] Tauri check() 结果: ${update ? `有更新 v${update.version}` : '无更新'}`)
    } catch (pluginErr) {
      updateLog(`[Updater] ERROR: Tauri plugin-updater check() 异常: ${pluginErr}`)
    }

    if (update) {
      updateLog(`[Updater] 全量更新可用: version=${update.version}, canAutoInstall=true`)
      return {
        version: update.version,
        date: update.date ?? undefined,
        body: update.body ?? undefined,
        canAutoInstall: true,
      }
    }

    // Tauri check() 失败，提供手动下载回退
    if (latestJson) {
      const remoteVersion = (latestJson.version as string) || ''
      if (remoteVersion && isVersionNewer(remoteVersion, currentVersion)) {
        const platformKey = await getPlatformKey()
        const platforms = latestJson.platforms as Record<string, { url?: string }> | undefined
        const platEntry = platforms?.[platformKey]
        updateLog(`[Updater] 全量更新回退手动下载: version=${remoteVersion}, platform=${platformKey}, downloadUrl=${platEntry?.url ?? 'N/A'}`)
        return {
          version: remoteVersion,
          body: '检测到新版本，但自动更新不可用，请手动下载安装。',
          canAutoInstall: false,
          downloadUrl: platEntry?.url,
        }
      }
    }

    updateLog(`[Updater] 全量更新检查完成: 无可用更新`)
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`全量更新检查失败: ${msg}`)
  }
}

// 缓存已下载的 update 对象
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pendingUpdate: any = null

export async function downloadUpdate(
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  if (!isTauri()) throw new Error('仅 Tauri 桌面模式支持更新')

  updateLog(`[Updater] ====== 全量更新下载开始 ======`)
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check({ timeout: 30000 })
  if (!update) throw new Error('没有可用更新')
  updateLog(`[Updater] 全量更新目标版本: ${update.version}`)

  let downloaded = 0
  let totalSize = 0
  let lastLogPercent = 0
  await update.download((event) => {
    switch (event.event) {
      case 'Started':
        downloaded = 0
        totalSize = event.data.contentLength ?? 0
        updateLog(`[Updater] 全量更新下载开始: totalSize=${totalSize} bytes`)
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        {
          const percent = totalSize > 0 ? Math.round(downloaded / totalSize * 100) : 0
          // 每 20% 打印一次进度日志
          if (percent >= lastLogPercent + 20) {
            lastLogPercent = percent
            updateLog(`[Updater] 全量更新下载进度: ${percent}% (${downloaded}/${totalSize} bytes)`)
          }
          onProgress?.({
            downloaded,
            total: totalSize,
            percent,
          })
        }
        break
      case 'Finished':
        updateLog(`[Updater] 全量更新下载完成: ${downloaded} bytes`)
        onProgress?.({ downloaded, total: totalSize || downloaded, percent: 100 })
        break
    }
  })

  _pendingUpdate = update
  updateLog(`[Updater] ====== 全量更新下载结束 ======`)
}

export async function installAndRelaunch(): Promise<void> {
  if (!_pendingUpdate) throw new Error('没有已下载的更新')
  updateLog(`[Updater] 开始安装全量更新并重启...`)
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await _pendingUpdate.install()
  updateLog(`[Updater] 全量更新安装完成，正在重启应用...`)
  await relaunch()
}

// ============ Server 热更新 ============

/** 获取当前 server 版本号 */
export async function getCurrentServerVersion(): Promise<string> {
  if (!isTauri()) return 'unknown'
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('get_current_server_version')
}

/**
 * 检查 server delta 更新
 */
export async function checkServerDelta(): Promise<ServerUpdateInfo | null> {
  if (!isTauri()) return null

  try {
    const currentVersion = await getCurrentServerVersion()
    const latestJson = await fetchLatestJsonWithRetry()

    if (!latestJson) return null

    const serverVersion = latestJson.serverVersion as string | undefined
    if (!serverVersion || !isVersionNewer(serverVersion, currentVersion)) {
      updateLog(`[Delta] 本地 server: ${currentVersion}, 远程 server: ${serverVersion ?? 'N/A'}, 需更新: false`)
      return null
    }

    updateLog(`[Delta] 本地 server: ${currentVersion}, 远程 server: ${serverVersion}, 需更新: ${isVersionNewer(serverVersion, currentVersion)}`)

    const notes = (latestJson.notes as string) || undefined
    const deltas = latestJson.serverDeltas as Record<string, ServerDelta[]> | undefined

    let matchedDelta: ServerDelta | null = null
    let allMatchedDeltas: ServerDelta[] = []
    if (deltas && typeof deltas === 'object') {
      const platformKey = await getPlatformKey()
      const platformDeltas = deltas[platformKey]
      updateLog(`[Delta] 平台: ${platformKey}, 可用 delta 数: ${platformDeltas?.length ?? 0}`)
      if (platformDeltas) {
        updateLog(`[Delta] delta 候选列表: ${JSON.stringify(platformDeltas.map(d => ({ from: d.from, url: d.url, size: d.size })))}`)
      }

      allMatchedDeltas = (platformDeltas
        ?.filter(d => {
          const parts = (v: string) => v.split('.').map(Number)
          const [fa, fb, fc] = parts(d.from)
          const [ca, cb, cc] = parts(currentVersion)
          return fa < ca || (fa === ca && fb < cb) || (fa === ca && fb === cb && fc <= cc)
        })
        ?.sort((a, b) => {
          const parts = (v: string) => v.split('.').map(Number)
          const [aa, ab, ac] = parts(a.from)
          const [ba, bb, bc] = parts(b.from)
          return (ba - aa) || (bb - ab) || (bc - ac)
        })) ?? []
      matchedDelta = allMatchedDeltas[0] ?? null
      updateLog(`[Delta] 版本过滤后匹配 delta 数: ${allMatchedDeltas.length}, 首选: ${matchedDelta ? `from=${matchedDelta.from}` : 'null'}`)
    }

    if (matchedDelta) {
      const sizeLabel = matchedDelta.size >= 1024 * 1024
        ? `~${(matchedDelta.size / 1024 / 1024).toFixed(1)} MB`
        : `~${(matchedDelta.size / 1024).toFixed(0)} KB`
      return { version: serverVersion, delta: matchedDelta, allDeltas: allMatchedDeltas, serverFull: null, label: `热更新 ${sizeLabel}`, notes }
    }

    const serverFull = latestJson.serverFullUrl as ServerFullPackage | undefined
    if (serverFull) {
      const sizeMB = (serverFull.size / 1024 / 1024).toFixed(1)
      updateLog(`[Delta] 无匹配 delta，使用全量包: url=${serverFull.url}, size=${sizeMB} MB`)
      return { version: serverVersion, delta: null, serverFull, label: `全量更新 ~${sizeMB} MB`, notes }
    }
    updateLog(`[Delta] 无匹配 delta，也无全量包信息`)
    return { version: serverVersion, delta: null, serverFull: null, label: '全量更新', notes }
  } catch (err) {
    updateLog(`[Delta] ERROR: 检查 server delta 失败: ${err}`)
    return null
  }
}

// ============ Server 更新下载与应用 ============

/**
 * 下载 server 更新包（delta 或全量），仅下载 + hash 校验，返回本地路径
 */
export async function downloadServerUpdate(
  info: ServerUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<{ localPath: string; version: string }> {
  if (!isTauri()) throw new Error('仅 Tauri 桌面模式支持更新')

  const { invoke } = await import('@tauri-apps/api/core')
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const dataDir = await appDataDir()

  // 收集所有候选 delta（allDeltas 优先，回退到单个 delta）
  const deltaCandidates = info.allDeltas?.length
    ? info.allDeltas
    : (info.delta ? [info.delta] : [])

  onProgress?.(0)

  // 依次尝试每个 delta 候选
  for (let i = 0; i < deltaCandidates.length; i++) {
    const candidate = deltaCandidates[i]
    const fileName = candidate.url.split('/').pop() ?? 'server.delta'
    const localPath = await join(dataDir, fileName)

    try {
      updateLog(`[Delta] 尝试候选 ${i + 1}/${deltaCandidates.length}: from=${candidate.from}, url=${candidate.url}`)
      await invoke('download_file', { url: candidate.url, path: localPath })

      // hash 校验
      if (candidate.hash) {
        const hashValid = await invoke<boolean>('verify_file_hash', {
          path: localPath,
          expectedHash: candidate.hash,
        })
        if (!hashValid) {
          updateLog(`[Delta] hash 校验失败 (from=${candidate.from})，尝试下一个候选...`)
          try { await invoke('plugin:fs|remove', { path: localPath }) } catch { /* ignore */ }
          continue
        }
      }

      onProgress?.(100)
      updateLog(`[Delta] 下载完成: ${localPath}`)
      return { localPath, version: info.version }
    } catch (err) {
      updateLog(`[Delta] 候选 ${i + 1} 下载失败 (from=${candidate.from}): ${err}`)
      try { await invoke('plugin:fs|remove', { path: localPath }) } catch { /* ignore */ }
    }
  }

  // 所有 delta 失败，尝试全量包
  if (info.serverFull) {
    updateLog('[Delta] 所有 delta 候选失败，回退到全量包')
    const downloadUrl = info.serverFull.cdnUrl ?? info.serverFull.url
    const fallbackUrl = info.serverFull.cdnUrl ? info.serverFull.url : undefined
    updateLog(`[Delta] 全量包下载 URL: ${downloadUrl}${fallbackUrl ? ` (fallback: ${fallbackUrl})` : ''}`)
    const expectedHash = info.serverFull.hash
    const fileName = info.serverFull.url.split('/').pop() ?? 'server-full.tar.gz'
    const localPath = await join(dataDir, fileName)

    onProgress?.(0)
    let downloaded = false
    try {
      updateLog(`[Delta] 开始下载全量包: ${downloadUrl}`)
      await invoke('download_file', { url: downloadUrl, path: localPath })
      downloaded = true
      updateLog(`[Delta] 全量包下载成功: ${localPath}`)
    } catch (err) {
      updateLog(`[Delta] 全量包下载失败: ${err}`)
      if (fallbackUrl) {
        updateLog(`[Delta] CDN 下载失败，回退到源地址: ${fallbackUrl}`)
        await invoke('download_file', { url: fallbackUrl, path: localPath })
        downloaded = true
      } else {
        const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : String(err))
        if (msg.includes('文件过小') || msg.includes('过小')) {
          throw new Error('下载的更新包无效（可能是网络返回了错误页面），请稍后重试')
        }
        throw new Error(`下载更新包失败: ${msg}`)
      }
    }

    if (!downloaded) throw new Error('下载更新包失败')
    onProgress?.(50)

    if (expectedHash) {
      const hashValid = await invoke<boolean>('verify_file_hash', {
        path: localPath,
        expectedHash,
      })
      if (!hashValid) {
        throw new Error('全量更新包 hash 校验失败，文件可能损坏')
      }
    }

    onProgress?.(100)
    updateLog(`[Delta] 全量包下载完成: ${localPath}`)
    return { localPath, version: info.version }
  }

  throw new Error('所有下载源均校验失败')
}

/**
 * 应用已下载的 server 更新包
 */
export async function applyServerUpdate(
  localPath: string,
  version: string,
  restartServer: boolean = true,
  willRelaunch: boolean = false,
): Promise<void> {
  if (!isTauri()) throw new Error('仅 Tauri 桌面模式支持更新')

  const { invoke } = await import('@tauri-apps/api/core')

  // 应用补丁
  let alreadyRestarted = false
  let restartedUrl = ''
  try {
    const result = await invoke<string>('apply_server_patch', {
      patchPath: localPath,
      expectedVersion: version,
      willRelaunch,
    })
    // Windows 上 Rust 会在补丁后自动重启 server，返回 "版本号|restarted:url"
    if (result.includes('|restarted:')) {
      const [newVersion, restartInfo] = result.split('|restarted:')
      updateLog(`[Delta] 应用成功: server version = ${newVersion}, Windows 已自动重启: ${restartInfo}`)
      alreadyRestarted = true
      restartedUrl = restartInfo
    } else {
      updateLog(`[Delta] 应用成功: server version = ${result}`)
    }
  } catch (err) {
    const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : String(err))
    if (msg.includes('文件过小') || msg.includes('delta 文件过小')) {
      throw new Error('更新包无效（可能下载失败），请稍后重试或等待全量更新')
    }
    throw new Error(`应用更新失败: ${msg}`)
  }

  // 重启 server（Windows 上 apply_server_patch 已自动重启 + 导航 webview，跳过）
  if (restartServer && !alreadyRestarted) {
    updateLog(`[Delta] 正在重启 server 进程...`)
    try {
      const serverUrl = await invoke<string>('restart_server')
      updateLog(`[Delta] Server 已重启: ${serverUrl}`)

      // 刷新 webview 以加载新代码
      try {
        await new Promise(resolve => setTimeout(resolve, 500))
        updateLog('[Delta] 刷新 webview 以加载新代码...')
        window.location.href = serverUrl
      } catch {
        // location.href 赋值会触发页面跳转，不会到这里
      }
    } catch (restartErr) {
      updateLog(`[Delta] ERROR: Server 重启失败: ${restartErr}`)
    }
  } else if (alreadyRestarted) {
    updateLog(`[Delta] Windows 已自动重启并导航 webview: ${restartedUrl}`)
  } else {
    updateLog(`[Delta] 应用成功，等待用户手动重启 server`)
  }

  // 清理下载文件
  try {
    const { invoke: inv } = await import('@tauri-apps/api/core')
    await inv('plugin:fs|remove', { path: localPath })
  } catch {
    // 清理失败不阻塞
  }
}

/**
 * 启动时更新检查：检查 → 下载 → 应用，一站式完成
 */
export async function startupUpdateCheck(
  onProgress?: (status: string, progress: number, detail: string) => void,
  onTauriUpdate?: (info: UpdateInfo) => void,
): Promise<boolean> {
  try {
    updateLog(`[Startup] ====== 启动时更新检查开始 ======`)
    onProgress?.('loading', 80, '检查更新...')

    // 1. 优先检查 Tauri 壳全量更新
    try {
      const tauriUpdate = await checkForUpdate()
      if (tauriUpdate) {
        if (tauriUpdate.canAutoInstall) {
          onTauriUpdate?.(tauriUpdate)
          onProgress?.('loading', 85, `发现新版本 v${tauriUpdate.version}，请前往设置安装`)
          updateLog(`[Startup] 发现 Tauri 全量更新 v${tauriUpdate.version}（可自动安装），跳过 server 热更新`)
          await delay(2000)
          onProgress?.('loading', 100, '启动中...')
          return false
        } else {
          updateLog(`[Startup] 发现 Tauri 全量更新 v${tauriUpdate.version}（仅手动下载），继续检查 server 热更新`)
        }
      }
    } catch (tauriErr) {
      updateLog(`[Startup] Tauri 全量更新检查失败，继续检查 server 热更新: ${tauriErr}`)
    }

    // 2. 无全量更新，再检查 server 热更新
    onProgress?.('loading', 82, '检查热更新...')
    const info = await checkServerDelta()
    if (!info) {
      updateLog(`[Startup] 无可用热更新，已是最新版本`)
      onProgress?.('loading', 100, '已是最新版本')
      updateLog(`[Startup] ====== 启动时更新检查结束: 无更新 ======`)
      return false
    }

    onProgress?.('loading', 85, `发现新版本 v${info.version}`)

    // 下载
    const result = await downloadServerUpdate(info, (percent) => {
      const progress = 85 + Math.floor(percent * 0.1) // 85-95%
      onProgress?.('loading', progress, `下载更新 ${percent}%`)
    })

    // 应用
    onProgress?.('loading', 96, '正在应用更新...')
    await applyServerUpdate(result.localPath, result.version, true)

    onProgress?.('loading', 100, '更新完成')
    updateLog(`[Startup] ====== 启动时更新检查结束: 已应用更新 ======`)
    return true
  } catch (err) {
    updateLog(`[Startup] ERROR: Startup update check failed: ${err}`)
    updateLog(`[Startup] ====== 启动时更新检查结束: 出错 ======`)
    onProgress?.('loading', 100, '启动中...')
    return false
  }
}

// ============ 自动更新调度 ============

export interface AutoUpdateCallbacks {
  /** 下载完成，等待用户操作 */
  onUpdateReady?: (version: string, localPath: string) => void
  /** server 热更新成功后的回调（通知 UI 刷新版本号） */
  onServerUpdated?: (newVersion: string) => void
  /** 发现 Tauri 全量更新时的回调（需要用户确认重启） */
  onTauriUpdate?: (info: UpdateInfo) => void
  /** 更新出错回调（仅用于日志，不影响应用运行） */
  onError?: (error: string) => void
}

export class AutoUpdater {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private checking = false

  /**
   * 启动自动更新检查
   * - 延迟 30s 首次检查
   * - 之后每 2 小时检查一次
   */
  start(callbacks: AutoUpdateCallbacks): void {
    if (!isTauri()) return
    setTimeout(() => this.runCheck(callbacks), 30_000)
    this.intervalId = setInterval(() => this.runCheck(callbacks), 2 * 60 * 60 * 1000)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /** 手动触发一次更新检查 */
  async checkNow(callbacks: AutoUpdateCallbacks): Promise<void> {
    await this.runCheck(callbacks)
  }

  private async runCheck(callbacks: AutoUpdateCallbacks): Promise<void> {
    if (this.checking) return
    this.checking = true
    try {
      // 1. 优先检查 Tauri 壳全量更新
      try {
        const tauriUpdate = await checkForUpdate()
        if (tauriUpdate) {
          callbacks.onTauriUpdate?.(tauriUpdate)
          if (tauriUpdate.canAutoInstall) {
            updateLog(`[AutoUpdater] 发现全量更新: ${tauriUpdate.version}（可自动安装），跳过 server 热更新`)
            return
          }
          updateLog(`[AutoUpdater] 发现全量更新: ${tauriUpdate.version}（仅手动下载），继续检查 server 热更新`)
        }
      } catch (tauriErr) {
        updateLog(`[AutoUpdater] Tauri 全量更新检查失败，继续检查 server 热更新: ${tauriErr}`)
      }

      // 2. 检查 server 热更新
      try {
        const serverUpdate = await checkServerDelta()
        if (serverUpdate) {
          updateLog(`[AutoUpdater] 发现 server 更新: ${serverUpdate.label}`)
          const result = await downloadServerUpdate(serverUpdate)
          updateLog(`[AutoUpdater] 更新下载完成: ${result.localPath}`)
          callbacks.onUpdateReady?.(result.version, result.localPath)
          return
        }
      } catch (deltaErr) {
        updateLog(`[AutoUpdater] server 更新检查/下载失败: ${deltaErr}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      updateLog(`[AutoUpdater] ERROR: 更新检查异常: ${msg}`)
      callbacks.onError?.(msg)
    } finally {
      this.checking = false
    }
  }
}
