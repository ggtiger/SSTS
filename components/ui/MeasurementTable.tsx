"use client"

import NumericInput from './NumericInput'

export interface MeasurementRow {
  id: string
  label: string
  labelValue?: string
  isEditable?: boolean
  values: (string | number)[]
}

export interface ColumnGroup {
  label: string        // 组标题，如 "加速度 m/s²" 或 "仪器示值"
  columns: string[]    // 子列标题，如 [""] 或 ["1","2","3"]
  editable?: boolean   // 该组是否可编辑，默认跟随 row.isEditable
}

export interface MeasurementTableProps {
  title?: string
  columnHeaders: string[]
  columnGroupLabel?: string
  columnGroups?: ColumnGroup[]
  rowLabelHeader?: string
  rows: MeasurementRow[]
  onCellEdit?: (rowId: string, colIndex: number, value: string) => void
  onLabelEdit?: (rowId: string, value: string) => void
  highlightRow?: string | null
  onRowClick?: (rowId: string) => void
}

export default function MeasurementTable({
  columnHeaders,
  columnGroupLabel = '仪器示值°',
  columnGroups,
  rowLabelHeader = '标准点°',
  rows,
  onCellEdit,
  onLabelEdit,
  highlightRow,
  onRowClick,
}: MeasurementTableProps) {
  // columnGroups 模式：计算总列数和每列的可编辑性
  const useGroups = !!columnGroups && columnGroups.length > 0
  const totalColumns = useGroups
    ? columnGroups!.reduce((sum, g) => sum + g.columns.length, 0)
    : columnHeaders.length

  // 构建列的可编辑映射（columnGroups 模式下）
  const columnEditableMap: (boolean | undefined)[] = []
  if (useGroups) {
    columnGroups!.forEach(g => {
      g.columns.forEach(() => columnEditableMap.push(g.editable))
    })
  }

  return (
    <div className="w-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        {/* Two-level header */}
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="border border-slate-300 bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-24"
            >
              {rowLabelHeader}
            </th>
            {useGroups ? (
              columnGroups!.map((group, gi) => {
                const isSingleEmpty = group.columns.length === 1 && group.columns[0] === ''
                return (
                  <th
                    key={gi}
                    colSpan={isSingleEmpty ? undefined : group.columns.length}
                    rowSpan={isSingleEmpty ? 2 : undefined}
                    className="border border-slate-300 bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-pre-line"
                  >
                    {group.label}
                  </th>
                )
              })
            ) : (
              <th
                colSpan={columnHeaders.length}
                className="border border-slate-300 bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider"
              >
                {columnGroupLabel}
              </th>
            )}
          </tr>
          <tr>
            {useGroups ? (
              columnGroups!.flatMap((group, gi) => {
                if (group.columns.length === 1 && group.columns[0] === '') return []
                return group.columns.map((col, ci) => (
                  <th
                    key={`${gi}-${ci}`}
                    className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[80px]"
                  >
                    {col}
                  </th>
                ))
              })
            ) : (
              columnHeaders.map((header, i) => (
                <th
                  key={i}
                  className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[80px]"
                >
                  {header}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isHighlighted = highlightRow === row.id
            return (
              <tr
                key={row.id}
                className={`transition-colors ${
                  isHighlighted
                    ? 'bg-blue-100 border-l-4 border-l-blue-600 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)]'
                    : 'hover:bg-slate-50'
                } ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  // 点击输入框等交互元素时不触发行选中切换
                  if ((e.target as HTMLElement).closest('input, [role="textbox"]')) return
                  onRowClick?.(row.id)
                }}
              >
                <td className="border border-slate-300 px-1.5 py-0.5 font-semibold text-slate-700 text-xs">
                  {onLabelEdit ? (
                    <div className="flex items-center gap-1">
                      {onRowClick && (
                        <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isHighlighted ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-transparent hover:border-slate-400'
                        }`}>
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check</span>
                        </span>
                      )}
                      <span className="flex-shrink-0 text-slate-500 w-6">{row.label}</span>
                      <NumericInput
                        value={row.labelValue ?? ''}
                        onChange={(val) => onLabelEdit(row.id, val)}
                        className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        placeholder="°"
                        title={`${row.label} 标准点`}
                        maxDecimalPlaces={3}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {onRowClick && (
                        <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isHighlighted ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-transparent hover:border-slate-400'
                        }`}>
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check</span>
                        </span>
                      )}
                      <span>{row.label}</span>
                    </div>
                  )}
                </td>
                {Array.from({ length: totalColumns }, (_, colIdx) => {
                  const cellValue = row.values[colIdx] ?? ''
                  // 判断该列是否可编辑
                  const isCellEditable = useGroups
                    ? (columnEditableMap[colIdx] !== undefined ? columnEditableMap[colIdx] : row.isEditable)
                    : row.isEditable
                  return (
                    <td
                      key={colIdx}
                      className="border border-slate-300 px-1 py-0.5 text-center"
                    >
                      {isCellEditable ? (
                        <NumericInput
                          value={String(cellValue)}
                          onChange={(val) =>
                            onCellEdit?.(row.id, colIdx, val)
                          }
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          placeholder="—"
                          title={`${row.label} 仪器示值`}
                          maxDecimalPlaces={3}
                        />
                      ) : (
                        <span className="text-xs font-mono text-slate-700">
                          {cellValue !== '' ? String(cellValue) : '—'}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
