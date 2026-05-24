use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const DEFAULT_LIBRARY_ROOT: &str = r"D:\FileManager\资料库";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub library_root: String,
    #[serde(default = "default_import_mode")]
    pub import_mode: String,
}

fn default_import_mode() -> String {
    "move".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            library_root: DEFAULT_LIBRARY_ROOT.to_string(),
            import_mode: "move".to_string(),
        }
    }
}

pub fn config_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA 目录".to_string())?;
    Ok(PathBuf::from(appdata).join("FileManager").join("config.json"))
}

pub fn load_config() -> AppConfig {
    let path = match config_path() {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };
    if !path.exists() {
        return AppConfig::default();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return AppConfig::default(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("写入配置失败: {e}"))?;
    Ok(())
}

pub fn library_root() -> PathBuf {
    PathBuf::from(load_config().library_root)
}
