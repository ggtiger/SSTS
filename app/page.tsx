export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">
          SSTS 侧滑测试系统
        </h1>
        <p className="text-lg text-gray-500">v0.1.0</p>
        <div className="flex items-center gap-2 text-green-600">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm font-medium">系统就绪</span>
        </div>
      </div>
    </div>
  )
}
