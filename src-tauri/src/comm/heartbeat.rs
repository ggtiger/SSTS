use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use super::protocol::Command;
use super::connection::DeviceConnection;

pub struct HeartbeatManager {
    pub running: Arc<AtomicBool>,
    pub timeout_count: Arc<AtomicU32>,
}

#[allow(dead_code)]
impl HeartbeatManager {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            timeout_count: Arc::new(AtomicU32::new(0)),
        }
    }

    /// 启动心跳定时任务，每 2 秒发送 HEARTBEAT
    /// timeout_count >= 4 时通过 disconnect_tx 通知断开
    pub fn start(
        &self,
        connection: Arc<tokio::sync::Mutex<DeviceConnection>>,
        disconnect_tx: tokio::sync::mpsc::UnboundedSender<()>,
    ) {
        self.running.store(true, Ordering::SeqCst);
        self.timeout_count.store(0, Ordering::SeqCst);

        let running = self.running.clone();
        let timeout_count = self.timeout_count.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2));
            interval.tick().await; // 跳过第一个立即触发的 tick

            while running.load(Ordering::SeqCst) {
                interval.tick().await;

                if !running.load(Ordering::SeqCst) {
                    break;
                }

                // 发送心跳
                let send_result = {
                    let conn = connection.lock().await;
                    conn.send(&Command::Heartbeat).await
                };

                if let Err(e) = send_result {
                    println!("[Comm] 心跳发送失败: {}", e);
                    let _ = disconnect_tx.send(());
                    break;
                }

                // 递增超时计数
                let count = timeout_count.fetch_add(1, Ordering::SeqCst) + 1;
                if count >= 4 {
                    println!("[Comm] 心跳超时 ({}次)，触发断开", count);
                    let _ = disconnect_tx.send(());
                    break;
                }
            }
        });
    }

    /// 收到任何有效数据时调用，重置超时计数
    pub fn reset_timeout(&self) {
        self.timeout_count.store(0, Ordering::SeqCst);
    }

    /// 停止心跳
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}
