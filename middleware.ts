import { NextRequest, NextResponse } from 'next/server'

// 不需要认证的路径前缀
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/health',
  '/login',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 静态资源和 Next.js 内部路径直接放行
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // 公开路径直接放行
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // TODO: 添加认证逻辑
  // 当前默认放行所有请求，后续根据业务需求添加 token 验证
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
}
