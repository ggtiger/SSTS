import { invoke } from '@tauri-apps/api/core';
import type { ScaleDeviceInfo, ScaleConnectionState } from './types';

// ============ 蓝牙称重设备管理 ============

export async function scaleScan(): Promise<ScaleDeviceInfo[]> {
  return invoke('scale_scan');
}

export async function scaleConnect(address: string): Promise<void> {
  return invoke('scale_connect', { address });
}

export async function scaleDisconnect(): Promise<void> {
  return invoke('scale_disconnect');
}

// ============ 称重操作 ============

export async function scaleZero(): Promise<void> {
  return invoke('scale_zero');
}

export async function scaleCalibrate(weight: number): Promise<void> {
  return invoke('scale_calibrate', { weight });
}

// ============ 状态查询 ============

export async function scaleConnectionState(): Promise<ScaleConnectionState> {
  return invoke('scale_connection_state');
}
