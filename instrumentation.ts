/**
 * Next.js Instrumentation Hook
 * 服务端启动时自动初始化定时任务调度器
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // TODO: 初始化服务端定时任务或其他启动逻辑
  }
}
