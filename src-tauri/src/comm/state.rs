use std::sync::Arc;
use std::sync::atomic::Ordering;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::Manager;

use super::connection::DeviceConnection;
use super::heartbeat::HeartbeatManager;
use super::protocol::{Command, Response};

// ============ DeviceState ============

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceState {
    pub is_connected: bool,
    pub is_authenticated: bool,
    pub is_authenticating: bool,
    pub is_servo_on: bool,
    pub is_homing_complete: bool,
    pub is_moving: bool,
    pub has_alarm: bool,
    pub has_error: bool,
    pub heartbeat_timeout_count: u32,
    pub auth_attempts: u8,
    pub position: i64,
    pub speed: i32,
    pub error_code: u32,
    pub status_word: u32,
    pub homing_status: i32,
    pub pr_status: i32,
    pub modbus_connected: bool,
    pub modbus_errors: i32,
    pub incline_x: f64,
    pub incline_y: f64,
    pub inputs: [bool; 4],
    pub relay_states: [bool; 4],
}

// ============ LogEntry ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub direction: String,
    pub content: String,
}

// ============ 认证密钥 ============

const AUTH_KEY: &str = "YourSecureAuthenticationKey123";
const MAX_AUTH_ATTEMPTS: u8 = 3;

// ============ CommManager ============

pub struct CommManager {
    connection: tokio::sync::Mutex<DeviceConnection>,
    heartbeat: tokio::sync::Mutex<HeartbeatManager>,
    state: tokio::sync::RwLock<DeviceState>,
    debug_log: tokio::sync::RwLock<Vec<LogEntry>>,
    app_handle: tokio::sync::OnceCell<tauri::AppHandle>,
}

impl CommManager {
    pub fn new() -> Self {
        Self {
            connection: tokio::sync::Mutex::new(DeviceConnection::new()),
            heartbeat: tokio::sync::Mutex::new(HeartbeatManager::new()),
            state: tokio::sync::RwLock::new(DeviceState::default()),
            debug_log: tokio::sync::RwLock::new(Vec::new()),
            app_handle: tokio::sync::OnceCell::new(),
        }
    }

    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        let _ = self.app_handle.set(handle);
    }

    /// 完整连接流程：TCP + 认证 + 心跳
    pub async fn connect(&self, ip: &str, port: u16) -> Result<(), String> {
        // 1. TCP 连接
        {
            let mut conn = self.connection.lock().await;
            conn.connect(ip, port).await?;
        }

        {
            let mut state = self.state.write().await;
            state.is_connected = true;
            state.is_authenticating = true;
            state.auth_attempts = 0;
        }

        self.add_log("SYS", &format!("TCP 已连接 {}:{}", ip, port)).await;

        // 2. 启动接收循环
        let (resp_tx, mut resp_rx) = tokio::sync::mpsc::unbounded_channel::<Response>();
        {
            let conn = self.connection.lock().await;
            if let Some(stream) = conn.get_stream() {
                DeviceConnection::start_receive_loop(stream, conn.running.clone(), resp_tx);
            }
        }

        // 3. 认证流程
        let auth_result = self.do_authenticate(&mut resp_rx).await;

        if let Err(e) = auth_result {
            self.disconnect().await;
            return Err(e);
        }

        // 4. 认证成功，标记状态
        {
            let mut state = self.state.write().await;
            state.is_authenticated = true;
            state.is_authenticating = false;
            self.emit_state(&state);
        }

        self.add_log("SYS", "认证成功，启动心跳").await;

        // 5. 启动心跳
        let (disconnect_tx, disconnect_rx) = tokio::sync::mpsc::unbounded_channel::<()>();
        self.start_heartbeat(disconnect_tx).await;

        // 6. 启动后台任务处理接收到的消息和断开通知
        self.spawn_message_handler(resp_rx, disconnect_rx);

        Ok(())
    }

    /// 认证流程
    async fn do_authenticate(
        &self,
        rx: &mut tokio::sync::mpsc::UnboundedReceiver<Response>,
    ) -> Result<(), String> {
        for attempt in 1..=MAX_AUTH_ATTEMPTS {
            {
                let mut state = self.state.write().await;
                state.auth_attempts = attempt;
            }

            let cmd = Command::Auth {
                key: AUTH_KEY.to_string(),
                attempt,
            };

            // 发送认证命令
            {
                let conn = self.connection.lock().await;
                conn.send(&cmd).await?;
            }
            self.add_log("TX", &cmd.to_frame()).await;

            // 等待认证响应（超时 5 秒）
            let timeout = tokio::time::Duration::from_secs(5);
            match tokio::time::timeout(timeout, Self::wait_auth_response(rx)).await {
                Ok(Ok(true)) => {
                    self.add_log("RX", "AUTH_OK").await;
                    return Ok(());
                }
                Ok(Ok(false)) => {
                    self.add_log("RX", "AUTH_FAIL").await;
                    println!("[Comm] 认证失败，尝试 {}/{}", attempt, MAX_AUTH_ATTEMPTS);
                    if attempt == MAX_AUTH_ATTEMPTS {
                        return Err(format!(
                            "认证失败，已重试 {} 次",
                            MAX_AUTH_ATTEMPTS
                        ));
                    }
                }
                Ok(Err(e)) => {
                    return Err(format!("认证过程中连接断开: {}", e));
                }
                Err(_) => {
                    println!(
                        "[Comm] 认证超时，尝试 {}/{}",
                        attempt, MAX_AUTH_ATTEMPTS
                    );
                    if attempt == MAX_AUTH_ATTEMPTS {
                        return Err("认证超时".to_string());
                    }
                }
            }
        }

        Err("认证失败".to_string())
    }

    /// 等待认证响应
    async fn wait_auth_response(
        rx: &mut tokio::sync::mpsc::UnboundedReceiver<Response>,
    ) -> Result<bool, String> {
        while let Some(resp) = rx.recv().await {
            match resp {
                Response::AuthOk => return Ok(true),
                Response::AuthFail => return Ok(false),
                _ => {
                    // 认证阶段忽略其他消息
                    continue;
                }
            }
        }
        Err("通道关闭".to_string())
    }

    /// 启动心跳
    async fn start_heartbeat(
        &self,
        disconnect_tx: tokio::sync::mpsc::UnboundedSender<()>,
    ) {
        let conn = self.connection.lock().await;
        let stream = conn.get_stream();
        let running = conn.running.clone();
        drop(conn);

        if let Some(stream) = stream {
            // 在单次锁内完成所有初始化，避免死锁
            let (hb_running, timeout_count) = {
                let hb = self.heartbeat.lock().await;
                hb.timeout_count.store(0, Ordering::SeqCst);
                hb.running.store(true, Ordering::SeqCst);
                (hb.running.clone(), hb.timeout_count.clone())
            };

            let hb_running_clone = hb_running.clone();
            let stream_clone = stream.clone();

            tokio::spawn(async move {
                use tokio::io::AsyncWriteExt;
                let mut interval =
                    tokio::time::interval(tokio::time::Duration::from_secs(2));
                interval.tick().await;

                while hb_running_clone.load(Ordering::SeqCst)
                    && running.load(Ordering::SeqCst)
                {
                    interval.tick().await;

                    if !hb_running_clone.load(Ordering::SeqCst)
                        || !running.load(Ordering::SeqCst)
                    {
                        break;
                    }

                    // 发送心跳
                    let send_result = {
                        let mut guard = stream_clone.lock().await;
                        guard.write_all(b"HEARTBEAT\n").await
                    };

                    if let Err(e) = send_result {
                        println!("[Comm] 心跳发送失败: {}", e);
                        let _ = disconnect_tx.send(());
                        break;
                    }

                    let count = timeout_count.fetch_add(1, Ordering::SeqCst) + 1;
                    if count >= 4 {
                        println!("[Comm] 心跳超时 ({}次)，触发断开", count);
                        let _ = disconnect_tx.send(());
                        break;
                    }
                }
            });
        }
    }

    /// 后台消息处理任务
    fn spawn_message_handler(
        &self,
        mut resp_rx: tokio::sync::mpsc::UnboundedReceiver<Response>,
        mut disconnect_rx: tokio::sync::mpsc::UnboundedReceiver<()>,
    ) {
        // 需要获取共享引用来在 spawn 中使用
        // 由于 CommManager 通过 tauri::State 管理，我们需要 AppHandle
        let app_handle = self.app_handle.get().cloned();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(response) = resp_rx.recv() => {
                        if let Some(ref app) = app_handle {
                            let manager = app.state::<CommManager>();
                            manager.handle_response(response).await;
                        }
                    }
                    Some(()) = disconnect_rx.recv() => {
                        println!("[Comm] 收到断开通知");
                        if let Some(ref app) = app_handle {
                            let manager = app.state::<CommManager>();
                            manager.disconnect().await;
                        }
                        break;
                    }
                    else => break,
                }
            }
        });
    }

    /// 断开连接
    pub async fn disconnect(&self) {
        // 停止心跳
        {
            let hb = self.heartbeat.lock().await;
            hb.stop();
        }

        // 断开 TCP
        {
            let mut conn = self.connection.lock().await;
            conn.disconnect().await;
        }

        // 重置状态
        {
            let mut state = self.state.write().await;
            *state = DeviceState::default();
            self.emit_state(&state);
        }

        self.add_log("SYS", "已断开连接").await;
    }

    /// 发送命令
    pub async fn send_command(&self, cmd: Command) -> Result<(), String> {
        let frame = cmd.to_frame();
        self.add_log("TX", &frame).await;

        let conn = self.connection.lock().await;
        conn.send(&cmd).await
    }

    /// 发送原始命令
    pub async fn send_raw(&self, data: &str) -> Result<(), String> {
        self.add_log("TX", data).await;

        let conn = self.connection.lock().await;
        conn.send_raw(data).await
    }

    /// 获取当前状态
    pub async fn get_state(&self) -> DeviceState {
        self.state.read().await.clone()
    }

    /// 处理上行消息
    pub async fn handle_response(&self, response: Response) {
        // 任何有效数据都重置心跳超时
        {
            let hb = self.heartbeat.lock().await;
            hb.reset_timeout();
        }

        // 更新心跳超时计数到状态
        {
            let hb = self.heartbeat.lock().await;
            let mut state = self.state.write().await;
            state.heartbeat_timeout_count = hb.timeout_count.load(Ordering::SeqCst);
        }

        match response {
            Response::AuthOk | Response::AuthFail => {
                // 认证阶段已处理，这里不再重复
            }
            Response::HeartbeatResponse => {
                // 纯心跳响应，不做其他处理
            }
            Response::Status(status) => {
                self.add_log("RX", &format!("STATUS:seq={}", status.seq)).await;

                // 立即回复 ACK
                let ack = Command::Ack { seq: status.seq };
                let conn = self.connection.lock().await;
                let _ = conn.send(&ack).await;
                drop(conn);

                // 更新状态
                {
                    let mut state = self.state.write().await;
                    state.is_servo_on = status.is_servo_on();
                    state.has_alarm = status.has_alarm();
                    state.has_error = status.has_error();
                    state.is_homing_complete = status.is_homing_complete();
                    state.is_moving = status.is_moving();
                    state.position = status.position;
                    state.speed = status.speed;
                    state.error_code = status.error_code;
                    state.status_word = status.status_word;
                    state.homing_status = status.homing_status;
                    state.pr_status = status.pr_status;
                    state.modbus_connected = status.modbus_connected;
                    state.modbus_errors = status.modbus_errors;
                    state.incline_x = status.incline_x;
                    state.incline_y = status.incline_y;
                    // 更新输入状态 (0=ON, 1=OFF)
                    for i in 0..4 {
                        state.inputs[i] = status.inputs[i] == 0;
                    }
                    self.emit_state(&state);
                }
            }
            Response::ServoStatus { position } => {
                self.add_log("RX", &format!("SERVO_STATUS:{}", position)).await;
                let mut state = self.state.write().await;
                state.position = position;
                self.emit_state(&state);
            }
            Response::InputStatus { inputs } => {
                self.add_log("RX", &format!("INPUT_STATUS:{:?}", inputs)).await;
                let mut state = self.state.write().await;
                state.inputs = inputs;
                self.emit_state(&state);
            }
            Response::Sensor { values } => {
                self.add_log("RX", &format!("SENSOR:{:?}", values)).await;
                let mut state = self.state.write().await;
                state.inputs = values;
                self.emit_state(&state);
            }
            Response::Unknown(line) => {
                self.add_log("RX", &line).await;
            }
        }
    }

    /// 发送状态变更事件到前端
    fn emit_state(&self, state: &DeviceState) {
        if let Some(app) = self.app_handle.get() {
            let _ = app.emit("device-state-changed", state);
        }
    }

    /// 添加调试日志
    pub async fn add_log(&self, direction: &str, content: &str) {
        let entry = LogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            direction: direction.to_string(),
            content: content.to_string(),
        };

        // emit 事件
        if let Some(app) = self.app_handle.get() {
            let _ = app.emit("device-debug-log", &entry);
        }

        let mut log = self.debug_log.write().await;
        log.push(entry);
        // 保留最新 1000 条
        if log.len() > 1000 {
            let drain_count = log.len() - 1000;
            log.drain(..drain_count);
        }
    }

    /// 获取调试日志
    pub async fn get_debug_log(&self) -> Vec<LogEntry> {
        self.debug_log.read().await.clone()
    }
}
