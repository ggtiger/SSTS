import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────────

export interface ControlForceRow {
  id: string           // 'A1'-'A5', 'A6'
  standardPoint: string
  values: [string, string, string]
  average: number | null
  error: number | null
  repeatability: number | null
}

export interface ControlForceExtra {
  discriminationValue: string     // 鉴别力阈-仪器示值1
  divisionValue: string           // 分度值
  discriminationRepeat: string    // 鉴别力阈-重复性
  measureRange: string            // 测量范围
}

export interface ControlForceRecord {
  id: number
  timestamp: string
  measureData: ControlForceRow[]
  extraData: ControlForceExtra
  driftValues: { min0: string; min5: string; min10: string }
  unit: 'pedal' | 'handbrake'
  createdAt: string
}

// ─── Initial Data ────────────────────────────────────────────────────

export const initialControlForceData: ControlForceRow[] = [
  { id: 'A1', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'A2', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'A3', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'A4', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'A5', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'A6', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
]

export const defaultExtraData: ControlForceExtra = {
  discriminationValue: '',
  divisionValue: '',
  discriminationRepeat: '',
  measureRange: '',
}

const defaultDriftValues = { min0: '', min5: '', min10: '' }

// ─── Store Interface ─────────────────────────────────────────────────

interface ControlForceStore {
  // 测量数据
  measureData: ControlForceRow[]
  setMeasureData: (data: ControlForceRow[]) => void
  updateStandardPoint: (rowId: string, value: string) => void
  updateValue: (rowId: string, colIndex: number, value: string) => void
  resetMeasureData: () => void

  // 附加数据
  extraData: ControlForceExtra
  setExtraData: (data: ControlForceExtra) => void
  resetExtraData: () => void

  // 漂移测试
  driftValues: { min0: string; min5: string; min10: string }
  setDriftValues: (values: { min0: string; min5: string; min10: string }) => void
  resetDriftValues: () => void

  // 单位
  unit: 'pedal' | 'handbrake'
  setUnit: (unit: 'pedal' | 'handbrake') => void

  // 记录列表（从 SQLite 加载）
  recordHistory: ControlForceRecord[]
  setRecordHistory: (records: ControlForceRecord[]) => void

  // 当前查看/编辑的记录 ID
  viewingRecordId: number | null
  setViewingRecordId: (id: number | null) => void
}

// ─── Store Implementation ────────────────────────────────────────────

export const useControlForceStore = create<ControlForceStore>((set) => ({
  // 测量数据
  measureData: initialControlForceData.map((r) => ({ ...r, values: [...r.values] as [string, string, string] })),

  setMeasureData: (data) => set({ measureData: data }),

  updateStandardPoint: (rowId, value) =>
    set((state) => ({
      measureData: state.measureData.map((row) =>
        row.id === rowId ? { ...row, standardPoint: value } : row
      ),
    })),

  updateValue: (rowId, colIndex, value) =>
    set((state) => ({
      measureData: state.measureData.map((row) => {
        if (row.id !== rowId) return row
        const newValues: [string, string, string] = [...row.values]
        newValues[colIndex] = value
        return { ...row, values: newValues }
      }),
    })),

  resetMeasureData: () =>
    set({
      measureData: initialControlForceData.map((r) => ({ ...r, values: [...r.values] as [string, string, string] })),
    }),

  // 附加数据
  extraData: { ...defaultExtraData },

  setExtraData: (data) => set({ extraData: data }),

  resetExtraData: () => set({ extraData: { ...defaultExtraData } }),

  // 漂移测试
  driftValues: { ...defaultDriftValues },

  setDriftValues: (values) => set({ driftValues: values }),

  resetDriftValues: () => set({ driftValues: { ...defaultDriftValues } }),

  // 单位
  unit: 'pedal',
  setUnit: (unit) => set({ unit }),

  // 记录列表
  recordHistory: [],
  setRecordHistory: (records) => set({ recordHistory: records }),

  // 当前查看的记录 ID
  viewingRecordId: null,
  setViewingRecordId: (id) => set({ viewingRecordId: id }),
}))
