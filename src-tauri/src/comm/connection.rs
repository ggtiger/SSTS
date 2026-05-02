use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use super::protocol::{Command, Response};

pub struct DeviceConnection {
    stream: Option<Arc<Mutex<TcpStream>>>,
    pub ip: String,
    pub port: u16,
    pub running: Arc<AtomicBool>,
}

impl DeviceConnection {
    pub fn new() -> Self {
        Self {
            stream: None,
            ip: String::new(),
            port: 0,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// 建立 TCP 连接，set_nodelay(true)，10 秒超时
    pub async fn connect(&mut self, ip: &str, port: u16) -> Result<(), String> {
        let addr = format!("{}:{}", ip, port);
        let stream = tokio::time::timeout(
            tokio::time::Duration::from_secs(10),
            TcpStream::connect(&addr),
        )
        .await
        .map_err(|_| format!("连接超时（10秒）: {}", addr))?
        .map_err(|e| format!("TCP 连接失败 {}: {}", addr, e))?;

        stream
            .set_nodelay(true)
            .map_err(|e| format!("设置 NoDelay 失败: {}", e))?;

        self.ip = ip.to_string();
        self.port = port;
        self.running.store(true, Ordering::SeqCst);
        self.stream = Some(Arc::new(Mutex::new(stream)));

        Ok(())
    }

    /// 断开连接
    pub async fn disconnect(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(stream) = self.stream.take() {
            let mut guard = stream.lock().await;
            let _ = guard.shutdown().await;
        }
    }

    /// 发送命令
    pub async fn send(&self, cmd: &Command) -> Result<(), String> {
        let frame = format!("{}\n", cmd.to_frame());
        self.send_bytes(frame.as_bytes()).await
    }

    /// 直接发送原始字符串 + "\n"
    pub async fn send_raw(&self, data: &str) -> Result<(), String> {
        let frame = format!("{}\n", data);
        self.send_bytes(frame.as_bytes()).await
    }

    async fn send_bytes(&self, data: &[u8]) -> Result<(), String> {
        match &self.stream {
            Some(stream) => {
                let mut guard = stream.lock().await;
                guard
                    .write_all(data)
                    .await
                    .map_err(|e| format!("发送失败: {}", e))?;
                guard
                    .flush()
                    .await
                    .map_err(|e| format!("flush 失败: {}", e))?;
                Ok(())
            }
            None => Err("未连接".to_string()),
        }
    }

    /// 获取 stream 的 clone（用于 receive loop）
    pub fn get_stream(&self) -> Option<Arc<Mutex<TcpStream>>> {
        self.stream.clone()
    }

    /// 启动异步接收任务
    pub fn start_receive_loop(
        stream: Arc<Mutex<TcpStream>>,
        running: Arc<AtomicBool>,
        tx: tokio::sync::mpsc::UnboundedSender<Response>,
    ) {
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            let mut remainder = String::new();

            while running.load(Ordering::SeqCst) {
                let read_result = {
                    let mut guard = stream.lock().await;
                    tokio::select! {
                        result = guard.read(&mut buf) => result,
                        _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {
                            continue;
                        }
                    }
                };

                match read_result {
                    Ok(0) => {
                        // 连接关闭
                        println!("[Comm] TCP 连接已关闭");
                        running.store(false, Ordering::SeqCst);
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]);
                        remainder.push_str(&data);

                        // 按 \n 分行提取完整帧
                        while let Some(pos) = remainder.find('\n') {
                            let line = remainder[..pos].replace('\r', "");
                            remainder = remainder[pos + 1..].to_string();

                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            let response = Response::parse(trimmed);
                            if tx.send(response).is_err() {
                                // receiver 已关闭
                                running.store(false, Ordering::SeqCst);
                                return;
                            }
                        }
                    }
                    Err(e) => {
                        if running.load(Ordering::SeqCst) {
                            println!("[Comm] 接收错误: {}", e);
                        }
                        running.store(false, Ordering::SeqCst);
                        break;
                    }
                }
            }
        });
    }
}
