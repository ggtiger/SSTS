use tauri::State;
use tauri::AppHandle;
use super::bluetooth::{ScaleManager, ScaleDeviceInfo, ScaleConnectionState};

/// ScaleState 类型别名，用于 Tauri State 管理
/// ScaleManager 内部已用 Arc<Mutex<...>>，无需额外包装
pub type ScaleState = ScaleManager;

#[tauri::command]
pub async fn scale_scan(
    state: State<'_, ScaleState>,
) -> Result<Vec<ScaleDeviceInfo>, String> {
    state.scan_devices().await
}

#[tauri::command]
pub async fn scale_connect(
    address: String,
    state: State<'_, ScaleState>,
    app: AppHandle,
) -> Result<(), String> {
    state.connect(&address, app).await
}

#[tauri::command]
pub async fn scale_disconnect(
    state: State<'_, ScaleState>,
) -> Result<(), String> {
    state.disconnect().await
}

#[tauri::command]
pub async fn scale_zero(
    state: State<'_, ScaleState>,
) -> Result<(), String> {
    state.zero_calibration().await
}

#[tauri::command]
pub async fn scale_calibrate(
    weight: u32,
    state: State<'_, ScaleState>,
) -> Result<(), String> {
    state.weight_calibration(weight).await
}

#[tauri::command]
pub async fn scale_connection_state(
    state: State<'_, ScaleState>,
) -> Result<ScaleConnectionState, String> {
    Ok(state.connection_state().await)
}
