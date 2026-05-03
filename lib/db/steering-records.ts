import { isTauri } from '@/lib/tauri'
import type { SteeringMeasureRow, SteeringRecord } from '@/lib/store/steering-store'

// 数据库单例
let db: any = null

// 初始化数据库连接 + 建表
export async function initSteeringDB(): Promise<void> {
  if (!isTauri() || db) return
  const Database = (await import('@tauri-apps/plugin-sql')).default
  db = await Database.load('sqlite:ssts_records.db')
  await db.execute(`
    CREATE TABLE IF NOT EXISTS steering_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      measure_data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)
}

// 保存一条记录
export async function saveSteeringRecord(record: {
  timestamp: string
  measureData: SteeringMeasureRow[]
}): Promise<number | null> {
  if (!db) await initSteeringDB()
  if (!db) return null
  const result = await db.execute(
    'INSERT INTO steering_records (timestamp, measure_data) VALUES (?, ?)',
    [
      record.timestamp,
      JSON.stringify(record.measureData),
    ]
  )
  return result.lastInsertId ?? null
}

// 获取所有记录（时间倒序）
export async function getAllSteeringRecords(): Promise<SteeringRecord[]> {
  if (!db) await initSteeringDB()
  if (!db) return []
  const rows: any[] = await db.select('SELECT * FROM steering_records ORDER BY id DESC')
  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    measureData: JSON.parse(row.measure_data),
    createdAt: row.created_at,
  }))
}

// 更新指定记录
export async function updateSteeringRecord(id: number, record: {
  measureData: SteeringMeasureRow[]
}): Promise<boolean> {
  if (!db) await initSteeringDB()
  if (!db) return false
  const result = await db.execute(
    'UPDATE steering_records SET measure_data = ? WHERE id = ?',
    [
      JSON.stringify(record.measureData),
      id,
    ]
  )
  return result.rowsAffected > 0
}

// 删除指定记录
export async function deleteSteeringRecord(id: number): Promise<boolean> {
  if (!db) await initSteeringDB()
  if (!db) return false
  const result = await db.execute('DELETE FROM steering_records WHERE id = ?', [id])
  return result.rowsAffected > 0
}
