import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────────

export interface SteeringMeasureRow {
  id: string
  label: string
  labelValue: string
  isEditable: boolean
  values: string[] // [示值1, 示值2, 示值3]
}

export interface SteeringRecord {
  id: number
  timestamp: string
  measureData: SteeringMeasureRow[]
  createdAt: string
}

// ─── Initial Data ────────────────────────────────────────────────────

export const initialSteeringData: SteeringMeasureRow[] = [
  { id: 'A1', label: 'A1', labelValue: '', isEditable: true, values: ['', '', ''] },
  { id: 'A2', label: 'A2', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'A3', label: 'A3', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'A4', label: 'A4', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'A5', label: 'A5', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'B1', label: 'B1', labelValue: '', isEditable: true, values: ['', '', ''] },
  { id: 'B2', label: 'B2', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'B3', label: 'B3', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'B4', label: 'B4', labelValue: '', isEditable: false, values: ['', '', ''] },
  { id: 'B5', label: 'B5', labelValue: '', isEditable: false, values: ['', '', ''] },
]

// ─── Store Interface ─────────────────────────────────────────────────

interface SteeringStore {
  // 测量数据
  measureData: SteeringMeasureRow[]
  setMeasureData: (data: SteeringMeasureRow[]) => void
  updateMeasureValue: (rowId: string, colIndex: number, value: string) => void
  updateMeasureLabelValue: (rowId: string, value: string) => void
  resetMeasureData: () => void

  // 自由测量
  freeAngle: string
  setFreeAngle: (angle: string) => void

  // 记录列表（从 SQLite 加载）
  recordHistory: SteeringRecord[]
  setRecordHistory: (records: SteeringRecord[]) => void

  // 选中状态
  selectedRow: string | null
  setSelectedRow: (row: string | null) => void

  // 当前查看/编辑的记录 ID
  viewingRecordId: number | null
  setViewingRecordId: (id: number | null) => void
}

// ─── Store Implementation ────────────────────────────────────────────

export const useSteeringStore = create<SteeringStore>((set) => ({
  // 测量数据
  measureData: initialSteeringData.map((r) => ({ ...r, values: [...r.values] })),

  setMeasureData: (data) => set({ measureData: data }),

  updateMeasureValue: (rowId, colIndex, value) =>
    set((state) => ({
      measureData: state.measureData.map((row) =>
        row.id === rowId
          ? { ...row, values: row.values.map((v, i) => (i === colIndex ? value : v)) }
          : row
      ),
    })),

  updateMeasureLabelValue: (rowId, value) =>
    set((state) => ({
      measureData: state.measureData.map((row) =>
        row.id === rowId ? { ...row, labelValue: value } : row
      ),
    })),

  resetMeasureData: () =>
    set({
      measureData: initialSteeringData.map((r) => ({ ...r, values: [...r.values] })),
    }),

  // 自由测量角度
  freeAngle: '',
  setFreeAngle: (angle) => set({ freeAngle: angle }),

  // 记录列表
  recordHistory: [],
  setRecordHistory: (records) => set({ recordHistory: records }),

  // 选中状态
  selectedRow: null,
  setSelectedRow: (row) => set({ selectedRow: row }),

  // 当前查看的记录 ID
  viewingRecordId: null,
  setViewingRecordId: (id) => set({ viewingRecordId: id }),
}))
