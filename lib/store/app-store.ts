import { create } from 'zustand'

interface PositionPoint {
  time: number
  position: number
  label: string
}

interface AppStore {
  // 连接信息
  ip: string
  port: string
  setIp: (ip: string) => void
  setPort: (port: string) => void

  // 运动控制
  targetAngle: string
  setTargetAngle: (angle: string) => void

  // 位置历史（趋势图数据）
  positionHistory: PositionPoint[]
  addPositionPoint: (point: { time: number; position: number }) => void
  clearPositionHistory: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  ip: '192.168.4.1',
  port: '10001',
  setIp: (ip) => set({ ip }),
  setPort: (port) => set({ port }),

  targetAngle: '',
  setTargetAngle: (angle) => set({ targetAngle: angle }),

  positionHistory: [],
  addPositionPoint: (point) =>
    set((state) => {
      const now = new Date(point.time)
      const label = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
      const history = [...state.positionHistory, { ...point, label }]
      if (history.length > 100) history.shift()
      return { positionHistory: history }
    }),
  clearPositionHistory: () => set({ positionHistory: [] }),
}))
