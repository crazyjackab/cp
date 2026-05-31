use crate::library::CATEGORIES;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub const DEFAULT_LIBRARY_ROOT: &str = r"D:\FileManager\资料库";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub library_root: String,
    #[serde(default = "default_import_mode")]
    pub import_mode: String,
    #[serde(default = "default_import_conflict_strategy")]
    pub import_conflict_strategy: String,
    #[serde(default)]
    pub custom_extension_rules: HashMap<String, String>,
    #[serde(default = "default_smart_reminder_enabled")]
    pub smart_reminder_enabled: bool,
    #[serde(default = "default_smart_reminder_threshold")]
    pub smart_reminder_threshold: u32,
    #[serde(default = "default_defer_library_load_enabled")]
    pub defer_library_load_enabled: bool,
    #[serde(default = "default_defer_library_load_threshold")]
    pub defer_library_load_threshold: u32,
    #[serde(default = "default_import_destination")]
    pub import_destination: String,
    #[serde(default)]
    pub import_min_size_kb: u32,
}

#[derive(Serialize)]
pub struct AppConfigInfo {
    pub library_root: String,
    pub import_mode: String,
    pub import_conflict_strategy: String,
    pub custom_extension_rules: HashMap<String, String>,
    pub smart_reminder_enabled: bool,
    pub smart_reminder_threshold: u32,
    pub defer_library_load_enabled: bool,
    pub defer_library_load_threshold: u32,
    pub import_destination: String,
    pub import_min_size_kb: u32,
    pub config_path: String,
    pub import_log_path: String,
    pub file_metadata_path: String,
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

fn default_import_conflict_strategy() -> String {
    "rename".to_string()
}

fn default_smart_reminder_enabled() -> bool {
    true
}

fn default_smart_reminder_threshold() -> u32 {
    10
}

fn default_defer_library_load_enabled() -> bool {
    false
}

fn default_defer_library_load_threshold() -> u32 {
    500
}

fn default_import_destination() -> String {
    "classify".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            library_root: DEFAULT_LIBRARY_ROOT.to_string(),
            import_mode: "move".to_string(),
            import_conflict_strategy: "rename".to_string(),
            custom_extension_rules: HashMap::new(),
            smart_reminder_enabled: true,
            smart_reminder_threshold: 10,
            defer_library_load_enabled: false,
            defer_library_load_threshold: 500,
            import_destination: "classify".to_string(),
            import_min_size_kb: 0,
        }
    }
}

pub fn config_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA 目录".to_string())?;
    Ok(PathBuf::from(appdata)
        .join("FileManager")
        .join("config.json"))
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

pub fn get_app_config_info() -> Result<AppConfigInfo, String> {
    let cfg = load_config();
    Ok(AppConfigInfo {
        library_root: cfg.library_root,
        import_mode: cfg.import_mode,
        import_conflict_strategy: normalize_import_conflict_strategy(&cfg.import_conflict_strategy)
            .to_string(),
        custom_extension_rules: normalize_custom_extension_rules(cfg.custom_extension_rules),
        smart_reminder_enabled: cfg.smart_reminder_enabled,
        smart_reminder_threshold: cfg.smart_reminder_threshold.clamp(1, 500),
        defer_library_load_enabled: cfg.defer_library_load_enabled,
        defer_library_load_threshold: cfg.defer_library_load_threshold.clamp(1, 100_000),
        import_destination: normalize_import_destination(&cfg.import_destination).to_string(),
        import_min_size_kb: cfg.import_min_size_kb,
        config_path: config_path()?.to_string_lossy().into_owned(),
        import_log_path: crate::import_log::log_path()?
            .to_string_lossy()
            .into_owned(),
        file_metadata_path: crate::file_metadata::metadata_path()?
            .to_string_lossy()
            .into_owned(),
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

pub fn normalize_extension(ext: &str) -> Result<String, String> {
    let ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    if ext.is_empty() {
        return Err("扩展名不能为空".to_string());
    }
    if ext.len() > 32
        || !ext
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("扩展名只能包含字母、数字、横线或下划线".to_string());
    }
    Ok(ext)
}

pub fn is_valid_category(category: &str) -> bool {
    CATEGORIES.contains(&category)
}

pub fn normalize_custom_extension_rules(rules: HashMap<String, String>) -> HashMap<String, String> {
    let mut normalized = HashMap::new();
    for (ext, category) in rules {
        if let Ok(ext) = normalize_extension(&ext) {
            if is_valid_category(&category) {
                normalized.insert(ext, category);
            }
        }
    }
    normalized
}

pub fn set_custom_extension_rule(extension: &str, category: &str) -> Result<AppConfigInfo, String> {
    let extension = normalize_extension(extension)?;
    if !is_valid_category(category) {
        return Err(format!("未知分类: {category}"));
    }

    let mut cfg = load_config();
    cfg.custom_extension_rules =
        normalize_custom_extension_rules(std::mem::take(&mut cfg.custom_extension_rules));
    cfg.custom_extension_rules
        .insert(extension, category.to_string());
    save_config(&cfg)?;
    get_app_config_info()
}

pub fn remove_custom_extension_rule(extension: &str) -> Result<AppConfigInfo, String> {
    let extension = normalize_extension(extension)?;
    let mut cfg = load_config();
    cfg.custom_extension_rules =
        normalize_custom_extension_rules(std::mem::take(&mut cfg.custom_extension_rules));
    cfg.custom_extension_rules.remove(&extension);
    save_config(&cfg)?;
    get_app_config_info()
}

pub fn set_smart_reminder(enabled: bool, threshold: u32) -> Result<AppConfigInfo, String> {
    let mut cfg = load_config();
    cfg.smart_reminder_enabled = enabled;
    cfg.smart_reminder_threshold = threshold.clamp(1, 500);
    save_config(&cfg)?;
    get_app_config_info()
}

pub fn set_defer_library_load(enabled: bool, threshold: u32) -> Result<AppConfigInfo, String> {
    let mut cfg = load_config();
    cfg.defer_library_load_enabled = enabled;
    cfg.defer_library_load_threshold = threshold.clamp(1, 100_000);
    save_config(&cfg)?;
    get_app_config_info()
}

pub fn normalize_import_conflict_strategy(strategy: &str) -> &str {
    match strategy {
        "rename" | "skip" | "ask" => strategy,
        _ => "rename",
    }
}

pub fn set_import_conflict_strategy(strategy: &str) -> Result<AppConfigInfo, String> {
    let strategy = normalize_import_conflict_strategy(strategy);
    let mut cfg = load_config();
    cfg.import_conflict_strategy = strategy.to_string();
    save_config(&cfg)?;
    get_app_config_info()
}

pub fn normalize_import_destination(destination: &str) -> &str {
    match destination {
        "classify" | "inbox" => destination,
        _ => "classify",
    }
}

pub fn set_import_destination(destination: &str) -> Result<AppConfigInfo, String> {
    let destination = normalize_import_destination(destination);
    let mut cfg = load_config();
    cfg.import_destination = destination.to_string();
    save_config(&cfg)?;
    get_app_config_info()
}

pub fn set_import_min_size_kb(min_kb: u32) -> Result<AppConfigInfo, String> {
    let mut cfg = load_config();
    cfg.import_min_size_kb = min_kb.min(102_400);
    save_config(&cfg)?;
    get_app_config_info()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_extension_trims_dot_and_lowercases() {
        assert_eq!(normalize_extension(" .PDF ").unwrap(), "pdf");
        assert_eq!(normalize_extension("tar-gz").unwrap(), "tar-gz");
        assert_eq!(normalize_extension("RAW_1").unwrap(), "raw_1");
    }

    #[test]
    fn normalize_extension_rejects_empty_or_path_like_values() {
        assert!(normalize_extension("").is_err());
        assert!(normalize_extension(".").is_err());
        assert!(normalize_extension("bad/ext").is_err());
        assert!(normalize_extension("bad ext").is_err());
    }

    #[test]
    fn custom_extension_rules_keep_only_known_categories() {
        let mut rules = HashMap::new();
        rules.insert(".PSD".to_string(), "图片".to_string());
        rules.insert("tmp".to_string(), "不存在".to_string());
        rules.insert("bad/ext".to_string(), "文档".to_string());

        let normalized = normalize_custom_extension_rules(rules);

        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized.get("psd").map(String::as_str), Some("图片"));
    }

    #[test]
    fn invalid_conflict_strategy_falls_back_to_rename() {
        assert_eq!(normalize_import_conflict_strategy("rename"), "rename");
        assert_eq!(normalize_import_conflict_strategy("skip"), "skip");
        assert_eq!(normalize_import_conflict_strategy("ask"), "ask");
        assert_eq!(normalize_import_conflict_strategy("overwrite"), "rename");
    }

    #[test]
    fn invalid_import_destination_falls_back_to_classify() {
        assert_eq!(normalize_import_destination("classify"), "classify");
        assert_eq!(normalize_import_destination("inbox"), "inbox");
        assert_eq!(normalize_import_destination("direct"), "classify");
    }
}
