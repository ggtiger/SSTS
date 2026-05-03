import { isTauri } from '@/lib/tauri'
import type { TorqueRow, TorqueRecord } from '@/lib/store/torque-store'

// 数据库单例
let db: any = null

// 初始化数据库连接 + 建表
export async function initTorqueDB(): Promise<void> {
  if (!isTauri() || db) return
  const Database = (await import('@tauri-apps/plugin-sql')).default
  db = await Database.load('sqlite:ssts_records.db')
  await db.execute(`
    CREATE TABLE IF NOT EXISTS torque_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      measure_data TEXT NOT NULL,
      drift_values TEXT NOT NULL,
      unit TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)
}

// 保存一条记录
export async function saveTorqueRecord(record: {
  timestamp: string
  measureData: TorqueRow[]
  driftValues: { min0: string; min5: string; min10: string }
  unit: 'N' | 'Nm'
}): Promise<number | null> {
  if (!db) await initTorqueDB()
  if (!db) return null
  const result = await db.execute(
    'INSERT INTO torque_records (timestamp, measure_data, drift_values, unit) VALUES (?, ?, ?, ?)',
    [
      record.timestamp,
      JSON.stringify(record.measureData),
      JSON.stringify(record.driftValues),
      record.unit,
    ]
  )
  return result.lastInsertId ?? null
}

// 获取所有记录（时间倒序）
export async function getAllTorqueRecords(): Promise<TorqueRecord[]> {
  if (!db) await initTorqueDB()
  if (!db) return []
  const rows: any[] = await db.select('SELECT * FROM torque_records ORDER BY id DESC')
  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    measureData: JSON.parse(row.measure_data),
    driftValues: JSON.parse(row.drift_values),
    unit: row.unit,
    createdAt: row.created_at,
  }))
}

// 更新指定记录
export async function updateTorqueRecord(id: number, record: {
  measureData: TorqueRow[]
  driftValues: { min0: string; min5: string; min10: string }
  unit: 'N' | 'Nm'
}): Promise<boolean> {
  if (!db) await initTorqueDB()
  if (!db) return false
  const result = await db.execute(
    'UPDATE torque_records SET measure_data = ?, drift_values = ?, unit = ? WHERE id = ?',
    [
      JSON.stringify(record.measureData),
      JSON.stringify(record.driftValues),
      record.unit,
      id,
    ]
  )
  return result.rowsAffected > 0
}

// 删除指定记录
export async function deleteTorqueRecord(id: number): Promise<boolean> {
  if (!db) await initTorqueDB()
  if (!db) return false
  const result = await db.execute('DELETE FROM torque_records WHERE id = ?', [id])
  return result.rowsAffected > 0
}
