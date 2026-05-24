use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRecord {
    pub library_path: String,
    pub original_path: String,
    pub imported_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ImportLogFile {
    records: Vec<ImportRecord>,
}

fn log_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    Ok(PathBuf::from(appdata).join("FileManager").join("import_log.json"))
}

fn normalize_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn load_log() -> Result<ImportLogFile, String> {
    let path = log_path()?;
    if !path.exists() {
        return Ok(ImportLogFile::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取收纳记录失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析收纳记录失败: {e}"))
}

fn save_log(log: &ImportLogFile) -> Result<(), String> {
    let path = log_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建记录目录失败: {e}"))?;
    }
    let content =
        serde_json::to_string_pretty(log).map_err(|e| format!("写入收纳记录失败: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("保存收纳记录失败: {e}"))
}

pub fn add_record(library_path: &Path, original_path: &Path) {
    let library_key = normalize_key(library_path);
    let original = original_path
        .canonicalize()
        .unwrap_or_else(|_| original_path.to_path_buf());

    let mut log = load_log().unwrap_or_default();
    log.records.retain(|r| normalize_key(Path::new(&r.library_path)) != library_key);
    log.records.push(ImportRecord {
        library_path: library_path
            .canonicalize()
            .unwrap_or_else(|_| library_path.to_path_buf())
            .to_string_lossy()
            .into_owned(),
        original_path: original.to_string_lossy().into_owned(),
        imported_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    });
    let _ = save_log(&log);
}

pub fn find_original(library_path: &Path) -> Option<String> {
    let key = normalize_key(library_path);
    let log = load_log().ok()?;
    log.records
        .iter()
        .find(|r| normalize_key(Path::new(&r.library_path)) == key)
        .map(|r| r.original_path.clone())
}

pub fn remove_record(library_path: &Path) {
    let key = normalize_key(library_path);
    if let Ok(mut log) = load_log() {
        log.records
            .retain(|r| normalize_key(Path::new(&r.library_path)) != key);
        let _ = save_log(&log);
    }
}

pub fn update_path(old_path: &Path, new_path: &Path) {
    let old_key = normalize_key(old_path);
    if let Ok(mut log) = load_log() {
        for record in &mut log.records {
            if normalize_key(Path::new(&record.library_path)) == old_key {
                record.library_path = new_path
                    .canonicalize()
                    .unwrap_or_else(|_| new_path.to_path_buf())
                    .to_string_lossy()
                    .into_owned();
                break;
            }
        }
        let _ = save_log(&log);
    }
}

pub fn lookup_map() -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Ok(log) = load_log() {
        for r in log.records {
            let key = normalize_key(Path::new(&r.library_path));
            map.insert(key, r.original_path);
        }
    }
    map
}
