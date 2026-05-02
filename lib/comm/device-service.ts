import { invoke } from '@tauri-apps/api/core';
import type { DeviceState, ServoParams, LogEntry } from './types';

// ============ 连接管理 ============

export async function connect(ip: string, port: number): Promise<void> {
  return invoke('device_connect', { ip, port });
}

export async function disconnect(): Promise<void> {
  return invoke('device_disconnect');
}

export async function cancelConnect(): Promise<void> {
  return invoke('device_cancel_connect');
}

export async function getState(): Promise<DeviceState> {
  return invoke('device_get_state');
}

// ============ 运动控制 ============

export async function startHoming(): Promise<void> {
  return invoke('device_start_homing');
}

export async function emergencyStop(): Promise<void> {
  return invoke('device_emergency_stop');
}

export async function reset(): Promise<void> {
  return invoke('device_reset');
}

export async function moveTo(angle: number): Promise<void> {
  return invoke('device_move_to', { angle });
}

export async function jogStart(direction: '+' | '-'): Promise<void> {
  return invoke('device_jog_start', { direction });
}

export async function jogStop(): Promise<void> {
  return invoke('device_jog_stop');
}

// ============ IO 控制 ============

export async function relayOn(channel: number): Promise<void> {
  return invoke('device_relay_on', { channel });
}

export async function relayOff(channel: number): Promise<void> {
  return invoke('device_relay_off', { channel });
}

export async function relayAllOff(): Promise<void> {
  return invoke('device_relay_all_off');
}

export async function readInput(): Promise<void> {
  return invoke('device_read_input');
}

export async function stopIoTest(): Promise<void> {
  return invoke('device_stop_io_test');
}

// ============ 参数设置 ============

export async function setParams(params: ServoParams): Promise<void> {
  return invoke('device_set_params', { params });
}

// ============ 调试 ============

export async function sendRaw(command: string): Promise<void> {
  return invoke('device_send_raw', { command });
}

export async function getDebugLog(): Promise<LogEntry[]> {
  return invoke('device_get_debug_log');
}
