use super::protocol::{Command, ServoParams};
use super::state::{CommManager, DeviceState, LogEntry};

#[tauri::command]
pub async fn device_connect(
    ip: String,
    port: u16,
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    state.connect(&ip, port).await
}

#[tauri::command]
pub async fn device_disconnect(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    state.disconnect().await;
    Ok(())
}

#[tauri::command]
pub async fn device_get_state(
    state: tauri::State<'_, CommManager>,
) -> Result<DeviceState, String> {
    Ok(state.get_state().await)
}

// ============ 运动控制 ============

#[tauri::command]
pub async fn device_start_homing(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    let ds = state.get_state().await;
    if !ds.is_authenticated {
        return Err("未认证，请先连接设备".to_string());
    }
    if ds.is_moving {
        return Err("伺服正在运行中，请等待当前动作完成".to_string());
    }
    state.send_command(Command::StartHoming).await
}

#[tauri::command]
pub async fn device_emergency_stop(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    // 始终允许
    state.send_command(Command::EmergencyStop).await
}

#[tauri::command]
pub async fn device_reset(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    let ds = state.get_state().await;
    if !ds.is_authenticated {
        return Err("未认证，请先连接设备".to_string());
    }
    if ds.is_moving {
        return Err("伺服正在运行中，请先停止后再复位".to_string());
    }
    state.send_command(Command::Reset).await
}

#[tauri::command]
pub async fn device_move_to(
    angle: f64,
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    let ds = state.get_state().await;
    if !ds.is_authenticated {
        return Err("未认证，请先连接设备".to_string());
    }
    if !ds.is_homing_complete {
        return Err("请先完成调平操作".to_string());
    }
    if ds.is_moving {
        return Err("伺服正在运行中，请等待当前动作完成".to_string());
    }
    if angle.abs() > 1080.0 {
        return Err(format!("角度超出范围：±1080°，当前 {:.1}°", angle));
    }

    let pulses = (angle * 1000.0) as i64;
    state.send_command(Command::Position { pulses }).await
}

#[tauri::command]
pub async fn device_jog_start(
    direction: String,
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    let ds = state.get_state().await;
    if !ds.is_authenticated {
        return Err("未认证，请先连接设备".to_string());
    }
    if !ds.is_servo_on {
        return Err("伺服未开启".to_string());
    }
    if ds.is_moving {
        return Err("伺服正在运行中，请等待当前动作完成".to_string());
    }

    let cmd = match direction.as_str() {
        "+" => Command::JogPlus,
        "-" => Command::JogMinus,
        _ => return Err(format!("无效方向: {}，请使用 + 或 -", direction)),
    };
    state.send_command(cmd).await
}

#[tauri::command]
pub async fn device_jog_stop(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    // 始终允许
    state.send_command(Command::JogStop).await
}

// ============ IO 控制 ============

#[tauri::command]
pub async fn device_relay_on(
    channel: u8,
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    if channel < 1 || channel > 4 {
        return Err(format!("继电器通道范围 1-4，当前 {}", channel));
    }
    state.send_command(Command::RelayOn { channel }).await
}

#[tauri::command]
pub async fn device_relay_off(
    channel: u8,
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    if channel < 1 || channel > 4 {
        return Err(format!("继电器通道范围 1-4，当前 {}", channel));
    }
    state.send_command(Command::RelayOff { channel }).await
}

#[tauri::command]
pub async fn device_relay_all_off(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    state.send_command(Command::RelayAllOff).await
}

#[tauri::command]
pub async fn device_read_input(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    state.send_command(Command::ReadInput).await
}

#[tauri::command]
pub async fn device_stop_io_test(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    state.send_command(Command::StopIoTest).await
}

// ============ 参数设置 ============

#[tauri::command]
pub async fn device_set_params(
    params: ServoParams,
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    let params_str = params.to_command_string();
    state
        .send_command(Command::SetParams {
            params: params_str,
        })
        .await
}

// ============ 取消连接 ============

#[tauri::command]
pub async fn device_cancel_connect(
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    state.disconnect().await;
    Ok(())
}

// ============ 调试 ============

#[tauri::command]
pub async fn device_send_raw(
    command: String,
    state: tauri::State<'_, CommManager>,
) -> Result<(), String> {
    state.send_raw(&command).await
}

#[tauri::command]
pub async fn device_get_debug_log(
    state: tauri::State<'_, CommManager>,
) -> Result<Vec<LogEntry>, String> {
    Ok(state.get_debug_log().await)
}
