use btleplug::api::{Central, CharPropFlags, Manager as _, Peripheral as _, ScanFilter, WriteType, Characteristic};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::Mutex;

use super::scale_protocol::{self, ScaleData};

// ============ 数据结构 ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleDeviceInfo {
    pub name: String,
    pub address: String,
    pub rssi: Option<i16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleConnectionState {
    pub is_scanning: bool,
    pub is_connected: bool,
    pub device_name: String,
    pub device_address: String,
}

// ============ ScaleManager ============

pub struct ScaleManager {
    inner: Arc<Mutex<ScaleManagerInner>>,
}

struct ScaleManagerInner {
    adapter: Option<Adapter>,
    peripheral: Option<Peripheral>,
    is_connected: bool,
    is_scanning: bool,
    device_name: String,
    device_address: String,
    write_characteristic: Option<Characteristic>,
    notify_characteristic: Option<Characteristic>,
    app_handle: Option<AppHandle>,
}

impl ScaleManagerInner {
    fn new() -> Self {
        Self {
            adapter: None,
            peripheral: None,
            is_connected: false,
            is_scanning: false,
            device_name: String::new(),
            device_address: String::new(),
            write_characteristic: None,
            notify_characteristic: None,
            app_handle: None,
        }
    }

    fn connection_state(&self) -> ScaleConnectionState {
        ScaleConnectionState {
            is_scanning: self.is_scanning,
            is_connected: self.is_connected,
            device_name: self.device_name.clone(),
            device_address: self.device_address.clone(),
        }
    }
}

impl ScaleManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(ScaleManagerInner::new())),
        }
    }

    /// 初始化蓝牙适配器
    async fn ensure_adapter(inner: &mut ScaleManagerInner) -> Result<(), String> {
        if inner.adapter.is_some() {
            return Ok(());
        }

        let manager = Manager::new()
            .await
            .map_err(|e| format!("创建蓝牙管理器失败: {}", e))?;

        let adapters = manager
            .adapters()
            .await
            .map_err(|e| format!("获取蓝牙适配器失败: {}", e))?;

        let adapter = adapters
            .into_iter()
            .next()
            .ok_or_else(|| "未找到蓝牙适配器".to_string())?;

        log::info!("[Scale] 蓝牙适配器已初始化");
        inner.adapter = Some(adapter);
        Ok(())
    }

    /// 扫描 BLE 设备（约 3-5 秒）
    pub async fn scan_devices(&self) -> Result<Vec<ScaleDeviceInfo>, String> {
        // 1. 先初始化 adapter（短暂加锁）
        {
            let mut inner = self.inner.lock().await;
            Self::ensure_adapter(&mut inner).await?;
            inner.is_scanning = true;
        } // 锁在这里释放

        // 2. 克隆出 adapter 后释放锁
        let adapter = {
            let inner = self.inner.lock().await;
            inner.adapter.as_ref()
                .ok_or_else(|| "未找到蓝牙适配器".to_string())?
                .clone()
        }; // 锁释放

        // 3. 不持有锁的情况下执行异步 BLE 操作
        log::info!("[Scale] 开始扫描 BLE 设备...");
        adapter
            .start_scan(ScanFilter::default())
            .await
            .map_err(|e| format!("启动扫描失败: {}", e))?;

        // 扫描 3 秒
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

        adapter
            .stop_scan()
            .await
            .map_err(|e| format!("停止扫描失败: {}", e))?;

        let peripherals = adapter
            .peripherals()
            .await
            .map_err(|e| format!("获取设备列表失败: {}", e))?;

        // 4. 处理结果（不需要锁）
        let mut devices = Vec::new();
        for p in peripherals {
            if let Ok(Some(props)) = p.properties().await {
                let name = props.local_name.unwrap_or_default();
                let address = props.address.to_string();
                let rssi = props.rssi;

                // 列出所有有名称的设备
                if !name.is_empty() {
                    devices.push(ScaleDeviceInfo {
                        name,
                        address,
                        rssi,
                    });
                }
            }
        }

        // 5. 最后短暂加锁更新状态
        {
            let mut inner = self.inner.lock().await;
            inner.is_scanning = false;
        }

        log::info!("[Scale] 扫描完成，发现 {} 个有名设备", devices.len());
        Ok(devices)
    }

    /// 连接到指定地址的 BLE 设备
    pub async fn connect(&self, address: &str, app: AppHandle) -> Result<(), String> {
        // 1. 初始化 adapter 并克隆出来，释放锁
        {
            let mut inner = self.inner.lock().await;
            Self::ensure_adapter(&mut inner).await?;
        }

        let adapter = {
            let inner = self.inner.lock().await;
            inner.adapter.as_ref()
                .ok_or_else(|| "未找到蓝牙适配器".to_string())?
                .clone()
        };

        // 2. 用克隆的 adapter 查找和连接 peripheral（不持有锁）
        let peripherals = adapter
            .peripherals()
            .await
            .map_err(|e| format!("获取设备列表失败: {}", e))?;

        // 查找目标 peripheral
        let mut target: Option<Peripheral> = None;
        for p in peripherals {
            if let Ok(Some(props)) = p.properties().await {
                if props.address.to_string() == address {
                    target = Some(p);
                    break;
                }
            }
        }

        let peripheral = target.ok_or_else(|| format!("未找到设备: {}", address))?;

        // 连接
        log::info!("[Scale] 正在连接设备: {}", address);
        peripheral
            .connect()
            .await
            .map_err(|e| format!("连接设备失败: {}", e))?;

        // 3. 发现服务、查找特征（不持有锁）
        peripheral
            .discover_services()
            .await
            .map_err(|e| format!("发现服务失败: {}", e))?;

        // Windows GATT 缓存同步需要额外等待时间
        #[cfg(target_os = "windows")]
        {
            log::info!("[Scale] Windows: 等待 GATT 缓存同步...");
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        let services = peripheral.services();
        log::info!("[Scale] 发现 {} 个服务", services.len());

        let mut write_char: Option<Characteristic> = None;
        let mut write_char_no_resp: Option<Characteristic> = None;
        let mut notify_char: Option<Characteristic> = None;

        for service in &services {
            log::info!("[Scale]   Service UUID: {}", service.uuid);
            for characteristic in &service.characteristics {
                log::info!(
                    "[Scale]     Char UUID: {}, properties: {:?}",
                    characteristic.uuid,
                    characteristic.properties
                );
                // 查找 Notify 特征
                if characteristic
                    .properties
                    .contains(CharPropFlags::NOTIFY)
                    && notify_char.is_none()
                {
                    notify_char = Some(characteristic.clone());
                }
                // 优先查找支持 WRITE (WithResponse) 的特征
                if characteristic
                    .properties
                    .contains(CharPropFlags::WRITE)
                    && write_char.is_none()
                {
                    write_char = Some(characteristic.clone());
                }
                // 备选：仅支持 WRITE_WITHOUT_RESPONSE 的特征
                if characteristic
                    .properties
                    .contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
                    && write_char_no_resp.is_none()
                {
                    write_char_no_resp = Some(characteristic.clone());
                }
            }
        }

        // 优先使用支持 WRITE 的特征，其次用 WRITE_WITHOUT_RESPONSE
        let final_write_char = write_char.or(write_char_no_resp);

        let notify_c = notify_char
            .ok_or_else(|| "未找到 Notify 特征，无法接收数据".to_string())?;

        // 订阅通知（不持有锁）
        peripheral
            .subscribe(&notify_c)
            .await
            .map_err(|e| format!("订阅通知失败: {}", e))?;
        log::info!("[Scale] 已订阅通知特征: {}", notify_c.uuid);

        // 获取设备名称（不持有锁）
        let device_name = if let Ok(Some(props)) = peripheral.properties().await {
            props.local_name.unwrap_or_else(|| address.to_string())
        } else {
            address.to_string()
        };

        // 4. 短暂加锁，将状态存入 inner
        {
            let mut inner = self.inner.lock().await;
            inner.peripheral = Some(peripheral.clone());
            inner.write_characteristic = final_write_char;
            inner.notify_characteristic = Some(notify_c);
            inner.is_connected = true;
            inner.device_name = device_name.clone();
            inner.device_address = address.to_string();
            inner.app_handle = Some(app.clone());

            let state = inner.connection_state();
            let _ = app.emit("scale-connection-changed", &state);
        }

        log::info!("[Scale] 设备已连接: {} ({})", device_name, address);

        // 5. 启动数据接收循环（锁外）
        let inner_arc = self.inner.clone();
        let app_clone = app.clone();
        tokio::spawn(async move {
            Self::notification_loop(peripheral, inner_arc, app_clone).await;
        });

        Ok(())
    }

    /// 通知数据接收循环（节流 100ms）
    async fn notification_loop(
        peripheral: Peripheral,
        inner: Arc<Mutex<ScaleManagerInner>>,
        app: AppHandle,
    ) {
        let stream_result = peripheral.notifications().await;
        let mut stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                log::error!("[Scale] 获取通知流失败: {}", e);
                return;
            }
        };

        let mut last_emit = Instant::now();
        let throttle_interval = std::time::Duration::from_millis(100);

        while let Some(notification) = stream.next().await {
            // 检查连接状态
            {
                let guard = inner.lock().await;
                if !guard.is_connected {
                    break;
                }
            }

            // 解析帧数据
            match scale_protocol::parse_scale_frame(&notification.value) {
                Ok(frame) => {
                    let scale_data: ScaleData = frame.into();

                    // 节流：每 100ms 才 emit 一次
                    let now = Instant::now();
                    if now.duration_since(last_emit) >= throttle_interval {
                        let _ = app.emit("scale-data", &scale_data);
                        last_emit = now;
                    }
                }
                Err(e) => {
                    log::error!(
                        "[Scale] 帧解析失败: {}, 原始数据: {:02X?}",
                        e,
                        &notification.value
                    );
                }
            }
        }

        log::info!("[Scale] 通知接收循环已结束");

        // 标记断开
        let mut guard = inner.lock().await;
        if guard.is_connected {
            guard.is_connected = false;
            guard.device_name.clear();
            guard.device_address.clear();
            let state = guard.connection_state();
            let _ = app.emit("scale-connection-changed", &state);
        }
    }

    /// 断开 BLE 连接
    pub async fn disconnect(&self) -> Result<(), String> {
        // 1. 在锁内克隆出 peripheral 和 notify_characteristic，释放锁
        let (peripheral, notify_c, device_name, device_address) = {
            let inner = self.inner.lock().await;
            (
                inner.peripheral.clone(),
                inner.notify_characteristic.clone(),
                inner.device_name.clone(),
                inner.device_address.clone(),
            )
        };

        // 2. 用克隆的值执行 unsubscribe 和 disconnect（不持有锁）
        if let Some(peripheral) = peripheral {
            if let Some(ref notify_c) = notify_c {
                let _ = peripheral.unsubscribe(notify_c).await;
            }
            peripheral
                .disconnect()
                .await
                .map_err(|e| format!("断开连接失败: {}", e))?;

            log::info!(
                "[Scale] 已断开设备: {} ({})",
                device_name,
                device_address
            );
        }

        // 3. 最后短暂加锁清理状态
        {
            let mut inner = self.inner.lock().await;
            inner.peripheral = None;
            inner.write_characteristic = None;
            inner.notify_characteristic = None;
            inner.is_connected = false;
            inner.device_name.clear();
            inner.device_address.clear();

            // 发送连接状态变更事件通知前端
            if let Some(ref app) = inner.app_handle {
                let state = inner.connection_state();
                let _ = app.emit("scale-connection-changed", &state);
            }
            inner.app_handle = None;
        }

        Ok(())
    }

    /// 发送零点校准命令
    pub async fn zero_calibration(&self) -> Result<(), String> {
        let cmd = scale_protocol::build_zero_command();
        log::info!("[Scale] 发送零点校准命令: {:02X?}", cmd);
        self.write_to_device(&cmd).await
    }

    /// 发送砝码标定命令
    pub async fn weight_calibration(&self, weight_g: u32) -> Result<(), String> {
        let cmd = scale_protocol::build_calibrate_command(weight_g);
        log::info!("[Scale] 发送砝码标定命令 ({}g): {:02X?}", weight_g, cmd);
        self.write_to_device(&cmd).await
    }

    /// 获取当前连接状态
    pub async fn connection_state(&self) -> ScaleConnectionState {
        let inner = self.inner.lock().await;
        inner.connection_state()
    }

    /// 发送原始字节到设备（双重写入策略，兼容 Windows BLE 权限模型）
    async fn write_to_device(&self, data: &[u8]) -> Result<(), String> {
        let (peripheral, write_c) = {
            let inner = self.inner.lock().await;
            let p = inner.peripheral.as_ref()
                .ok_or_else(|| "设备未连接".to_string())?.clone();
            let c = inner.write_characteristic.as_ref()
                .ok_or_else(|| "未找到 Write 特征，无法发送命令".to_string())?.clone();
            (p, c)
        }; // 锁释放

        log::info!("[Scale] 写入数据 ({} bytes), 特征UUID: {}, 属性: {:?}",
            data.len(), write_c.uuid, write_c.properties);

        // 构建写入方式列表：Windows 优先 WithResponse，其他平台优先 WithoutResponse
        let write_types = {
            let has_write = write_c.properties.contains(CharPropFlags::WRITE);
            let has_write_no_resp = write_c.properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE);

            #[cfg(target_os = "windows")]
            {
                // Windows 平台：优先 WithResponse（更可靠，避免权限问题）
                match (has_write, has_write_no_resp) {
                    (true, true) => vec![WriteType::WithResponse, WriteType::WithoutResponse],
                    (true, false) => vec![WriteType::WithResponse],
                    (false, true) => vec![WriteType::WithoutResponse],
                    (false, false) => vec![WriteType::WithResponse], // 默认尝试
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                // 非 Windows 平台：优先 WithoutResponse
                match (has_write, has_write_no_resp) {
                    (true, true) => vec![WriteType::WithoutResponse, WriteType::WithResponse],
                    (true, false) => vec![WriteType::WithResponse],
                    (false, true) => vec![WriteType::WithoutResponse],
                    (false, false) => vec![WriteType::WithResponse],
                }
            }
        };

        let mut last_error = String::new();
        for write_type in &write_types {
            log::info!("[Scale] 尝试写入方式: {:?}", write_type);
            match peripheral.write(&write_c, data, *write_type).await {
                Ok(_) => {
                    log::info!("[Scale] 写入成功 ({:?})", write_type);
                    return Ok(());
                }
                Err(e) => {
                    last_error = format!("{}", e);
                    log::warn!("[Scale] 写入失败 ({:?}): {}", write_type, e);
                }
            }
        }

        Err(format!("写入数据失败: {}", last_error))
    }
}

impl Default for ScaleManager {
    fn default() -> Self {
        Self::new()
    }
}
