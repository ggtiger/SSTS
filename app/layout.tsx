import type { Metadata, Viewport } from 'next'
import './globals.css'
import TopAppBar from '@/components/ui/TopAppBar'
import AppReady from '@/components/AppReady'

export const metadata: Metadata = {
  title: 'METROLOGY X-1 | 侧滑控制系统',
  description: 'SSTS - 侧滑测试系统 精密工业监测与遥测接口',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="h-full overflow-hidden">
      <body className="font-inter text-on-background h-full overflow-hidden">
        <AppReady />
        <div className="flex flex-col h-screen">
          <TopAppBar />
          <main className="flex-1 min-h-0 overflow-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
