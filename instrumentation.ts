/**
 * Next.js Instrumentation Hook
 * 服务端启动时自动执行的初始化逻辑
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 服务端启动完成，当前无需额外初始化
    console.log('[SSTS] Server runtime initialized')
  }
}
