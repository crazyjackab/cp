use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRecord {
    pub library_path: String,
    pub original_path: String,
    pub imported_at: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportRecordView {
    pub name: String,
    pub category: String,
    pub library_path: String,
    pub original_path: String,
    pub imported_at: u64,
    pub size: u64,
    pub library_exists: bool,
    pub original_exists: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct ImportLogFile {
    records: Vec<ImportRecord>,
}

struct ImportLogCache {
    data: ImportLogFile,
    loaded: bool,
    dirty: bool,
}

static CACHE: OnceLock<Mutex<ImportLogCache>> = OnceLock::new();

fn cache() -> &'static Mutex<ImportLogCache> {
    CACHE.get_or_init(|| {
        Mutex::new(ImportLogCache {
            data: ImportLogFile::default(),
            loaded: false,
            dirty: false,
        })
    })
}

pub fn log_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    Ok(PathBuf::from(appdata)
        .join("FileManager")
        .join("import_log.json"))
}

fn normalize_key(path: &Path) -> String {
    dunce::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn load_log_from_disk() -> Result<ImportLogFile, String> {
    let path = log_path()?;
    if !path.exists() {
        return Ok(ImportLogFile::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取收纳记录失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析收纳记录失败: {e}"))
}

fn save_log_to_disk(log: &ImportLogFile) -> Result<(), String> {
    let path = log_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建记录目录失败: {e}"))?;
    }
    let content =
        serde_json::to_string_pretty(log).map_err(|e| format!("写入收纳记录失败: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("保存收纳记录失败: {e}"))
}

fn ensure_loaded(guard: &mut ImportLogCache) -> Result<(), String> {
    if guard.loaded {
        return Ok(());
    }
    guard.data = load_log_from_disk()?;
    guard.loaded = true;
    Ok(())
}

pub(crate) fn is_dirty() -> bool {
    cache()
        .lock()
        .map(|g| g.dirty)
        .unwrap_or(false)
}

pub(crate) fn persist_if_dirty() -> Result<(), String> {
    let mut guard = cache().lock().map_err(|e| e.to_string())?;
    if !guard.dirty {
        return Ok(());
    }
    save_log_to_disk(&guard.data)?;
    guard.dirty = false;
    Ok(())
}

fn with_log_mut<R>(f: impl FnOnce(&mut ImportLogFile) -> R) -> R {
    let mut guard = cache().lock().expect("import log cache poisoned");
    let _ = ensure_loaded(&mut guard);
    let result = f(&mut guard.data);
    guard.dirty = true;
    drop(guard);
    crate::debounced_persist::schedule_import_log();
    result
}

fn with_log<R>(f: impl FnOnce(&ImportLogFile) -> R) -> Result<R, String> {
    let mut guard = cache().lock().map_err(|e| e.to_string())?;
    ensure_loaded(&mut guard)?;
    Ok(f(&guard.data))
}

pub fn add_record(library_path: &Path, original_path: &Path) {
    let library_key = normalize_key(library_path);
    let original =
        dunce::canonicalize(original_path).unwrap_or_else(|_| original_path.to_path_buf());

    with_log_mut(|log| {
        log.records
            .retain(|r| normalize_key(Path::new(&r.library_path)) != library_key);
        log.records.push(ImportRecord {
            library_path: dunce::canonicalize(library_path)
                .unwrap_or_else(|_| library_path.to_path_buf())
                .to_string_lossy()
                .into_owned(),
            original_path: original.to_string_lossy().into_owned(),
            imported_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        });
    });
}

/// 一次加载后的路径索引，供列表等批量场景复用（读内存缓存，不重复读盘）。
#[derive(Debug, Default, Clone)]
pub struct ImportLogIndex {
    originals: HashMap<String, String>,
}

impl ImportLogIndex {
    pub fn load() -> Result<Self, String> {
        with_log(|log| Self::from_log(log))
    }

    fn from_log(log: &ImportLogFile) -> Self {
        let mut originals = HashMap::new();
        for record in &log.records {
            let key = normalize_key(Path::new(&record.library_path));
            originals.insert(key, record.original_path.clone());
        }
        Self { originals }
    }

    pub fn find_original(&self, library_path: &Path) -> Option<String> {
        let key = normalize_key(library_path);
        self.originals.get(&key).cloned()
    }
}

pub fn find_original(library_path: &Path) -> Option<String> {
    ImportLogIndex::load()
        .ok()
        .and_then(|index| index.find_original(library_path))
}

pub fn list_records() -> Result<Vec<ImportRecordView>, String> {
    with_log(|log| {
        let mut records: Vec<ImportRecordView> = log
            .records
            .iter()
            .map(|record| {
                let library_path = PathBuf::from(&record.library_path);
                let size = library_path.metadata().map(|m| m.len()).unwrap_or(0);
                let name = library_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                let category = library_path
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("其他")
                    .to_string();
                let original_path = PathBuf::from(&record.original_path);

                ImportRecordView {
                    name,
                    category,
                    library_path: record.library_path.clone(),
                    original_path: record.original_path.clone(),
                    imported_at: record.imported_at,
                    size,
                    library_exists: library_path.is_file(),
                    original_exists: original_path.exists(),
                }
            })
            .collect();

        records.sort_by(|a, b| b.imported_at.cmp(&a.imported_at));
        records
    })
}

pub fn remove_record(library_path: &Path) {
    let key = normalize_key(library_path);
    with_log_mut(|log| {
        log.records
            .retain(|r| normalize_key(Path::new(&r.library_path)) != key);
    });
}

pub fn update_path(old_path: &Path, new_path: &Path) {
    let old_key = normalize_key(old_path);
    with_log_mut(|log| {
        for record in &mut log.records {
            if normalize_key(Path::new(&record.library_path)) == old_key {
                record.library_path = dunce::canonicalize(new_path)
                    .unwrap_or_else(|_| new_path.to_path_buf())
                    .to_string_lossy()
                    .into_owned();
                break;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_maps_library_paths() {
        let log = ImportLogFile {
            records: vec![ImportRecord {
                library_path: r"C:\test\library\doc\a.txt".to_string(),
                original_path: r"C:\test\original\a.txt".to_string(),
                imported_at: 1,
            }],
        };
        let index = ImportLogIndex::from_log(&log);
        assert_eq!(
            index.find_original(Path::new(r"C:\test\library\doc\a.txt")),
            Some(r"C:\test\original\a.txt".to_string())
        );
    }
}
