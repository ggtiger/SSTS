import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────────

export interface TorqueRow {
  id: string               // CW1-5, CCW1-5
  direction: 'cw' | 'ccw'
  standardPoint: string
  values: [string, string, string]
  average: number | null
  error: number | null
  repeatability: number | null
}

export interface TorqueRecord {
  id: number
  timestamp: string
  measureData: TorqueRow[]
  driftValues: { min0: string; min5: string; min10: string }
  unit: 'N' | 'Nm'
  createdAt: string
}

// ─── Initial Data ────────────────────────────────────────────────────

export const initialTorqueData: TorqueRow[] = [
  { id: 'CW1', direction: 'cw', standardPoint: 'A1', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CW2', direction: 'cw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CW3', direction: 'cw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CW4', direction: 'cw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CW5', direction: 'cw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CCW1', direction: 'ccw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CCW2', direction: 'ccw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CCW3', direction: 'ccw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CCW4', direction: 'ccw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
  { id: 'CCW5', direction: 'ccw', standardPoint: '', values: ['', '', ''], average: null, error: null, repeatability: null },
]

const defaultDriftValues = { min0: '', min5: '', min10: '' }

// ─── Store Interface ─────────────────────────────────────────────────

interface TorqueStore {
  // 测量数据
  measureData: TorqueRow[]
  setMeasureData: (data: TorqueRow[]) => void
  updateStandardPoint: (rowId: string, value: string) => void
  updateValue: (rowId: string, colIndex: number, value: string) => void
  resetMeasureData: () => void

  // 漂移测试
  driftValues: { min0: string; min5: string; min10: string }
  setDriftValues: (values: { min0: string; min5: string; min10: string }) => void
  resetDriftValues: () => void

  // 单位
  unit: 'N' | 'Nm'
  setUnit: (unit: 'N' | 'Nm') => void

  // 记录列表（从 SQLite 加载）
  recordHistory: TorqueRecord[]
  setRecordHistory: (records: TorqueRecord[]) => void

  // 当前查看/编辑的记录 ID
  viewingRecordId: number | null
  setViewingRecordId: (id: number | null) => void
}

// ─── Store Implementation ────────────────────────────────────────────

export const useTorqueStore = create<TorqueStore>((set) => ({
  // 测量数据
  measureData: initialTorqueData.map((r) => ({ ...r, values: [...r.values] as [string, string, string] })),

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
      measureData: initialTorqueData.map((r) => ({ ...r, values: [...r.values] as [string, string, string] })),
    }),

  // 漂移测试
  driftValues: { ...defaultDriftValues },

  setDriftValues: (values) => set({ driftValues: values }),

  resetDriftValues: () => set({ driftValues: { ...defaultDriftValues } }),

  // 单位
  unit: 'N',
  setUnit: (unit) => set({ unit }),

  // 记录列表
  recordHistory: [],
  setRecordHistory: (records) => set({ recordHistory: records }),

  // 当前查看的记录 ID
  viewingRecordId: null,
  setViewingRecordId: (id) => set({ viewingRecordId: id }),
}))
