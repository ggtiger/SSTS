import { isTauri } from '@/lib/tauri'
import type { BrakeMeasureRow, BrakeRecord } from '@/lib/store/brake-store'

// 数据库单例
let db: any = null

// 初始化数据库连接 + 建表
export async function initBrakeDB(): Promise<void> {
  if (!isTauri() || db) return
  const Database = (await import('@tauri-apps/plugin-sql')).default
  db = await Database.load('sqlite:ssts_records.db')
  await db.execute(`
    CREATE TABLE IF NOT EXISTS brake_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      measure_data TEXT NOT NULL,
      summary_titles TEXT NOT NULL,
      summary_values TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)
}

// 保存一条记录
export async function saveBrakeRecord(record: {
  timestamp: string
  measureData: BrakeMeasureRow[]
  summaryTitles: string[]
  summaryValues: string[]
}): Promise<number | null> {
  if (!db) await initBrakeDB()
  if (!db) return null
  const result = await db.execute(
    'INSERT INTO brake_records (timestamp, measure_data, summary_titles, summary_values) VALUES (?, ?, ?, ?)',
    [
      record.timestamp,
      JSON.stringify(record.measureData),
      JSON.stringify(record.summaryTitles),
      JSON.stringify(record.summaryValues),
    ]
  )
  return result.lastInsertId ?? null
}

// 获取所有记录（时间倒序）
export async function getAllBrakeRecords(): Promise<BrakeRecord[]> {
  if (!db) await initBrakeDB()
  if (!db) return []
  const rows: any[] = await db.select('SELECT * FROM brake_records ORDER BY id DESC')
  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    measureData: JSON.parse(row.measure_data),
    summaryTitles: JSON.parse(row.summary_titles),
    summaryValues: JSON.parse(row.summary_values),
    createdAt: row.created_at,
  }))
}

// 更新指定记录
export async function updateBrakeRecord(id: number, record: {
  measureData: BrakeMeasureRow[]
  summaryTitles: string[]
  summaryValues: string[]
}): Promise<boolean> {
  if (!db) await initBrakeDB()
  if (!db) return false
  const result = await db.execute(
    'UPDATE brake_records SET measure_data = ?, summary_titles = ?, summary_values = ? WHERE id = ?',
    [
      JSON.stringify(record.measureData),
      JSON.stringify(record.summaryTitles),
      JSON.stringify(record.summaryValues),
      id,
    ]
  )
  return result.rowsAffected > 0
}

// 删除指定记录
export async function deleteBrakeRecord(id: number): Promise<boolean> {
  if (!db) await initBrakeDB()
  if (!db) return false
  const result = await db.execute('DELETE FROM brake_records WHERE id = ?', [id])
  return result.rowsAffected > 0
}
