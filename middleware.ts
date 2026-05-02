import { NextResponse } from 'next/server'

export async function middleware() {
  // 桌面应用本地运行，无需认证，直接放行所有请求
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
}
