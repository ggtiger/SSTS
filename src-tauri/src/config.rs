use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_device")]
    pub device: DeviceConfig,
    #[serde(default = "default_update")]
    pub update: UpdateConfig,
    #[serde(default = "default_app")]
    pub app: AppBehaviorConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConfig {
    #[serde(default = "default_ip")]
    pub ip: String,
    #[serde(default = "default_port")]
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConfig {
    #[serde(default = "default_cdn_url")]
    pub cdn_url: String,
    #[serde(default = "default_github_repo")]
    pub github_repo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBehaviorConfig {
    #[serde(default)]
    pub close_to_tray: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
}

// 默认值函数
fn default_device() -> DeviceConfig {
    DeviceConfig {
        ip: "192.168.4.1".into(),
        port: 10001,
    }
}
fn default_update() -> UpdateConfig {
    UpdateConfig {
        cdn_url: "http://o09u11p5v.qnssl.com/ssts".into(),
        github_repo: "ggtiger/SSTS".into(),
    }
}
fn default_app() -> AppBehaviorConfig {
    AppBehaviorConfig {
        close_to_tray: false,
        theme: "light".into(),
    }
}
fn default_ip() -> String {
    "192.168.4.1".into()
}
fn default_port() -> u16 {
    10001
}
fn default_cdn_url() -> String {
    "http://o09u11p5v.qnssl.com/ssts".into()
}
fn default_github_repo() -> String {
    "ggtiger/SSTS".into()
}
fn default_theme() -> String {
    "light".into()
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            device: default_device(),
            update: default_update(),
            app: default_app(),
        }
    }
}

// ============ 配置管理器 ============

pub struct ConfigManager {
    config: Mutex<AppConfig>,
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let config_path = app_data_dir.join("config.json");
        let config = Self::load_from_file(&config_path);
        let manager = ConfigManager {
            config: Mutex::new(config.clone()),
            config_path,
        };
        // 保存一次确保文件存在且包含所有默认字段
        manager.save_to_file(&config);
        manager
    }

    fn load_from_file(path: &PathBuf) -> AppConfig {
        if path.exists() {
            match fs::read_to_string(path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => AppConfig::default(),
            }
        } else {
            AppConfig::default()
        }
    }

    fn save_to_file(&self, config: &AppConfig) {
        if let Some(parent) = self.config_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(config) {
            let _ = fs::write(&self.config_path, json);
        }
    }

    pub fn get_config(&self) -> AppConfig {
        self.config.lock().unwrap().clone()
    }

    pub fn set_config(&self, config: AppConfig) {
        self.save_to_file(&config);
        *self.config.lock().unwrap() = config;
    }

    pub fn get_close_to_tray(&self) -> bool {
        self.config.lock().unwrap().app.close_to_tray
    }
}

// ============ Tauri Commands ============

#[tauri::command]
pub fn get_app_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    let manager = app.state::<ConfigManager>();
    Ok(manager.get_config())
}

#[tauri::command]
pub fn set_app_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let manager = app.state::<ConfigManager>();
    manager.set_config(config);
    Ok(())
}
