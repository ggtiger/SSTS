import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────────

export interface BrakeMeasureRow {
  id: string
  label: string
  labelValue: string
  values: string[] // [加速度, 示值1, 示值2, 示值3]
}

export interface BrakeRecord {
  id: number
  timestamp: string
  measureData: BrakeMeasureRow[]
  summaryTitles: string[]
  summaryValues: string[]
  createdAt: string
}

// ─── Initial Data ────────────────────────────────────────────────────

export const defaultSummaryTitles = ['37°', '37.3°', '37.4°', '36.7°', '36.6°']

export const initialBrakeData: BrakeMeasureRow[] = [
  { id: 'A1', label: 'A1', labelValue: '', values: ['', '', '', ''] },
  { id: 'A2', label: 'A2', labelValue: '', values: ['', '', '', ''] },
  { id: 'A3', label: 'A3', labelValue: '', values: ['', '', '', ''] },
  { id: 'A4', label: 'A4', labelValue: '', values: ['', '', '', ''] },
  { id: 'A5', label: 'A5', labelValue: '', values: ['', '', '', ''] },
]

const defaultSummaryValues = ['', '', '', '', '']

// ─── Store Interface ─────────────────────────────────────────────────

interface BrakeStore {
  // 测量数据
  measureData: BrakeMeasureRow[]
  setMeasureData: (data: BrakeMeasureRow[]) => void
  updateMeasureValue: (rowId: string, colIndex: number, value: string) => void
  updateMeasureLabelValue: (rowId: string, value: string) => void
  resetMeasureData: () => void

  // 汇总表格
  summaryTitles: string[]
  setSummaryTitles: (titles: string[]) => void
  updateSummaryTitle: (index: number, value: string) => void
  summaryValues: string[]
  setSummaryValues: (values: string[]) => void
  updateSummaryValue: (index: number, value: string) => void

  // 自由测量角度
  freeAngle: string
  setFreeAngle: (angle: string) => void

  // 选中状态
  selectedRow: string | null
  setSelectedRow: (row: string | null) => void
  selectedSummaryCol: number | null
  setSelectedSummaryCol: (col: number | null) => void

  // 记录列表（从 SQLite 加载）
  recordHistory: BrakeRecord[]
  setRecordHistory: (records: BrakeRecord[]) => void

  // 当前查看/编辑的记录 ID
  viewingRecordId: number | null
  setViewingRecordId: (id: number | null) => void
}

// ─── Store Implementation ────────────────────────────────────────────

export const useBrakeStore = create<BrakeStore>((set) => ({
  // 测量数据
  measureData: initialBrakeData.map((r) => ({ ...r, values: [...r.values] })),

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
      measureData: initialBrakeData.map((r) => ({ ...r, values: [...r.values] })),
    }),

  // 汇总表格
  summaryTitles: [...defaultSummaryTitles],

  setSummaryTitles: (titles) => set({ summaryTitles: titles }),

  updateSummaryTitle: (index, value) =>
    set((state) => ({
      summaryTitles: state.summaryTitles.map((t, i) => (i === index ? value : t)),
    })),

  summaryValues: [...defaultSummaryValues],

  setSummaryValues: (values) => set({ summaryValues: values }),

  updateSummaryValue: (index, value) =>
    set((state) => ({
      summaryValues: state.summaryValues.map((v, i) => (i === index ? value : v)),
    })),

  // 自由测量角度
  freeAngle: '',
  setFreeAngle: (angle) => set({ freeAngle: angle }),

  // 选中状态
  selectedRow: null,
  setSelectedRow: (row) => set({ selectedRow: row }),
  selectedSummaryCol: null,
  setSelectedSummaryCol: (col) => set({ selectedSummaryCol: col }),

  // 记录列表
  recordHistory: [],
  setRecordHistory: (records) => set({ recordHistory: records }),

  // 当前查看的记录 ID
  viewingRecordId: null,
  setViewingRecordId: (id) => set({ viewingRecordId: id }),
}))
