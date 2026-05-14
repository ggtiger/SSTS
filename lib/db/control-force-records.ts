import { isTauri } from '@/lib/tauri'
import type { ControlForceRow, ControlForceExtra, ControlForceRecord } from '@/lib/store/control-force-store'

// 数据库单例
let db: any = null

// 初始化数据库连接 + 建表
export async function initControlForceDB(): Promise<void> {
  if (!isTauri() || db) return
  const Database = (await import('@tauri-apps/plugin-sql')).default
  db = await Database.load('sqlite:ssts_records.db')
  await db.execute(`
    CREATE TABLE IF NOT EXISTS control_force_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      measure_data TEXT NOT NULL,
      extra_data TEXT NOT NULL,
      drift_values TEXT NOT NULL,
      unit TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)
}

// 保存一条记录
export async function saveControlForceRecord(record: {
  timestamp: string
  measureData: ControlForceRow[]
  extraData: ControlForceExtra
  driftValues: { min0: string; min5: string; min10: string }
  unit: 'pedal' | 'handbrake'
}): Promise<number | null> {
  if (!db) await initControlForceDB()
  if (!db) return null
  const result = await db.execute(
    'INSERT INTO control_force_records (timestamp, measure_data, extra_data, drift_values, unit) VALUES (?, ?, ?, ?, ?)',
    [
      record.timestamp,
      JSON.stringify(record.measureData),
      JSON.stringify(record.extraData),
      JSON.stringify(record.driftValues),
      record.unit,
    ]
  )
  return result.lastInsertId ?? null
}

// 获取所有记录（时间倒序）
export async function getAllControlForceRecords(): Promise<ControlForceRecord[]> {
  if (!db) await initControlForceDB()
  if (!db) return []
  const rows: any[] = await db.select('SELECT * FROM control_force_records ORDER BY id DESC')
  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    measureData: JSON.parse(row.measure_data),
    extraData: JSON.parse(row.extra_data),
    driftValues: JSON.parse(row.drift_values),
    unit: row.unit,
    createdAt: row.created_at,
  }))
}

// 更新指定记录
export async function updateControlForceRecord(id: number, record: {
  measureData: ControlForceRow[]
  extraData: ControlForceExtra
  driftValues: { min0: string; min5: string; min10: string }
  unit: 'pedal' | 'handbrake'
}): Promise<boolean> {
  if (!db) await initControlForceDB()
  if (!db) return false
  const result = await db.execute(
    'UPDATE control_force_records SET measure_data = ?, extra_data = ?, drift_values = ?, unit = ? WHERE id = ?',
    [
      JSON.stringify(record.measureData),
      JSON.stringify(record.extraData),
      JSON.stringify(record.driftValues),
      record.unit,
      id,
    ]
  )
  return result.rowsAffected > 0
}

// 删除指定记录
export async function deleteControlForceRecord(id: number): Promise<boolean> {
  if (!db) await initControlForceDB()
  if (!db) return false
  const result = await db.execute('DELETE FROM control_force_records WHERE id = ?', [id])
  return result.rowsAffected > 0
}
