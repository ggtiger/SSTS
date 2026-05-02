/** 设备完整状态（与 Rust DeviceState 对应） */
export interface DeviceState {
  is_connected: boolean;
  is_authenticated: boolean;
  is_authenticating: boolean;
  is_servo_on: boolean;
  is_homing_complete: boolean;
  is_moving: boolean;
  has_alarm: boolean;
  has_error: boolean;
  heartbeat_timeout_count: number;
  auth_attempts: number;
  position: number;        // 脉冲值
  speed: number;
  error_code: number;
  status_word: number;
  homing_status: number;   // 0=未动作, 1=调平中, 2=完成
  pr_status: number;       // 0=空闲, 1-99=执行中, 1000=停止中, 10000+=已发送, 20000+=到位
  modbus_connected: boolean;
  modbus_errors: number;
  incline_x: number;       // 水平仪 X 轴角度 (°)
  incline_y: number;       // 水平仪 Y 轴角度 (°)
  inputs: [boolean, boolean, boolean, boolean];
  relay_states: [boolean, boolean, boolean, boolean];
}

/** 伺服参数（14个） */
export interface ServoParams {
  control_mode: number;
  feedback_mode: number;
  lead_screw: number;
  encoder_resolution: number;
  max_speed: number;
  acceleration: number;
  position_gain: number;
  speed_gain: number;
  torque_gain: number;
  speed_feed_forward: number;
  position_feed_forward: number;
  friction_compensation: number;
  dead_band_compensation: number;
  home_offset: number;
}

/** 调试日志条目 */
export interface LogEntry {
  timestamp: string;     // ISO 8601
  direction: 'TX' | 'RX';
  content: string;
}

/** 连接状态 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'authenticated';

/** PR 状态显示文字 */
export function getPrStatusText(prStatus: number): string {
  if (prStatus === 0) return '空闲';
  if (prStatus >= 1 && prStatus <= 99) return `执行中(PR#${prStatus})`;
  if (prStatus === 1000) return '停止中';
  if (prStatus >= 10000 && prStatus < 20000) return `已发(PR#${prStatus - 10000})`;
  if (prStatus >= 20000) return `到位(PR#${prStatus - 20000})`;
  return '未知';
}

/** 脉冲 ↔ 角度换算 */
export function pulsesToAngle(pulses: number): number {
  return pulses / 1000;
}

export function angleToPulses(angle: number): number {
  return Math.round(angle * 1000);
}

/** 获取连接状态 */
export function getConnectionStatus(state: DeviceState): ConnectionStatus {
  if (state.is_authenticated) return 'authenticated';
  if (state.is_connected || state.is_authenticating) return 'connecting';
  return 'disconnected';
}

/** 默认状态 */
export const DEFAULT_DEVICE_STATE: DeviceState = {
  is_connected: false,
  is_authenticated: false,
  is_authenticating: false,
  is_servo_on: false,
  is_homing_complete: false,
  is_moving: false,
  has_alarm: false,
  has_error: false,
  heartbeat_timeout_count: 0,
  auth_attempts: 0,
  position: 0,
  speed: 0,
  error_code: 0,
  status_word: 0,
  homing_status: 0,
  pr_status: 0,
  modbus_connected: false,
  modbus_errors: 0,
  incline_x: 0,
  incline_y: 0,
  inputs: [false, false, false, false],
  relay_states: [false, false, false, false],
};
