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

#[derive(Serialize)]
pub struct AppConfigInfo {
    pub library_root: String,
    pub import_mode: String,
    pub config_path: String,
    pub import_log_path: String,
}

#[derive(Serialize)]
pub struct SetLibraryRootResult {
    pub library_root: String,
    pub migrated_files: u32,
    pub message: String,
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

pub fn get_app_config_info() -> Result<AppConfigInfo, String> {
    let cfg = load_config();
    Ok(AppConfigInfo {
        library_root: cfg.library_root,
        import_mode: cfg.import_mode,
        config_path: config_path()?.to_string_lossy().into_owned(),
        import_log_path: crate::import_log::log_path()?.to_string_lossy().into_owned(),
    })
}

pub fn set_import_mode(mode: &str) -> Result<AppConfigInfo, String> {
    if mode != "move" && mode != "copy" {
        return Err("收纳模式无效，请选择移动或复制".to_string());
    }
    let mut cfg = load_config();
    cfg.import_mode = mode.to_string();
    save_config(&cfg)?;
    get_app_config_info()
}
