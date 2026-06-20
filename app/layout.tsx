import type { Metadata, Viewport } from 'next'
import './globals.css'
import TopAppBar from '@/components/ui/TopAppBar'
import AppReady from '@/components/AppReady'
import { MobileScaler } from '@/components/MobileScaler'

export const metadata: Metadata = {
  title: 'METROLOGY X-1 | 侧滑控制系统',
  description: 'VACDevice - 机动车角度综合校准装置 精密工业监测与遥测接口',
}

// viewport 使用 device-width（在 Android WebView 中 width=1200 不生效）
// 移动端缩放由 MobileScaler 组件动态 JS 控制
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="font-inter text-on-background h-full">
        <MobileScaler />
        <div id="__app_root__" className="h-full">
          <AppReady />
          <div className="flex flex-col h-full">
            <TopAppBar />
            <main className="flex-1 min-h-0 overflow-hidden">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
