use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FileMetadata {
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TagStat {
    pub name: String,
    pub count: u64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct MetadataFile {
    #[serde(default)]
    files: HashMap<String, FileMetadata>,
}

struct MetadataCache {
    data: MetadataFile,
    loaded: bool,
    dirty: bool,
}

static CACHE: OnceLock<Mutex<MetadataCache>> = OnceLock::new();

fn cache() -> &'static Mutex<MetadataCache> {
    CACHE.get_or_init(|| {
        Mutex::new(MetadataCache {
            data: MetadataFile::default(),
            loaded: false,
            dirty: false,
        })
    })
}

pub fn metadata_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    Ok(PathBuf::from(appdata)
        .join("FileManager")
        .join("file_metadata.json"))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn normalize_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn load_store_from_disk() -> Result<MetadataFile, String> {
    let path = metadata_path()?;
    if !path.exists() {
        return Ok(MetadataFile::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取文件元数据失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析文件元数据失败: {e}"))
}

fn save_store_to_disk(store: &MetadataFile) -> Result<(), String> {
    let path = metadata_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建元数据目录失败: {e}"))?;
    }
    let content =
        serde_json::to_string_pretty(store).map_err(|e| format!("写入文件元数据失败: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("保存文件元数据失败: {e}"))
}

fn ensure_loaded(guard: &mut MetadataCache) -> Result<(), String> {
    if guard.loaded {
        return Ok(());
    }
    guard.data = load_store_from_disk()?;
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
    save_store_to_disk(&guard.data)?;
    guard.dirty = false;
    Ok(())
}

fn with_store_mut<R>(f: impl FnOnce(&mut MetadataFile) -> R) -> Result<R, String> {
    let mut guard = cache().lock().map_err(|e| e.to_string())?;
    ensure_loaded(&mut guard)?;
    let result = f(&mut guard.data);
    guard.dirty = true;
    drop(guard);
    crate::debounced_persist::schedule_file_metadata();
    Ok(result)
}

fn with_store<R>(f: impl FnOnce(&MetadataFile) -> R) -> Result<R, String> {
    let mut guard = cache().lock().map_err(|e| e.to_string())?;
    ensure_loaded(&mut guard)?;
    Ok(f(&guard.data))
}

fn normalize_tag(tag: &str) -> Option<String> {
    let tag = tag.trim().trim_start_matches('#').trim();
    if tag.is_empty() {
        return None;
    }
    let sanitized: String = tag
        .chars()
        .filter(|c| {
            !matches!(
                c,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | ','
            )
        })
        .take(24)
        .collect();
    let sanitized = sanitized.trim().to_string();
    if sanitized.is_empty() {
        None
    } else {
        Some(sanitized)
    }
}

pub fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut normalized = Vec::new();
    for tag in tags {
        if let Some(tag) = normalize_tag(&tag) {
            let key = tag.to_lowercase();
            if seen.insert(key) {
                normalized.push(tag);
            }
        }
        if normalized.len() >= 12 {
            break;
        }
    }
    normalized
}

fn prune_empty(store: &mut MetadataFile) {
    store
        .files
        .retain(|_, meta| meta.favorite || !meta.tags.is_empty());
}

/// 一次加载后的内存索引，供列表等批量场景复用（读内存缓存，不重复读盘）。
#[derive(Debug, Default, Clone)]
pub struct MetadataLookup {
    files: HashMap<String, FileMetadata>,
}

impl MetadataLookup {
    pub fn load() -> Result<Self, String> {
        with_store(|store| Self {
            files: store.files.clone(),
        })
    }

    pub fn get(&self, path: &Path) -> FileMetadata {
        let key = normalize_key(path);
        self.files.get(&key).cloned().unwrap_or_default()
    }
}

/// 单路径查询；批量场景请用 [`MetadataLookup`].
#[allow(dead_code)]
pub fn get(path: &Path) -> FileMetadata {
    MetadataLookup::load()
        .map(|lookup| lookup.get(path))
        .unwrap_or_default()
}

pub fn set_favorite(path: &Path, favorite: bool) -> Result<FileMetadata, String> {
    let key = normalize_key(path);
    with_store_mut(|store| {
        let meta = store.files.entry(key).or_default();
        meta.favorite = favorite;
        meta.updated_at = now_secs();
        let result = meta.clone();
        prune_empty(store);
        result
    })
}

pub fn set_tags(path: &Path, tags: Vec<String>) -> Result<FileMetadata, String> {
    let key = normalize_key(path);
    let tags = normalize_tags(tags);
    with_store_mut(|store| {
        let meta = store.files.entry(key).or_default();
        meta.tags = tags;
        meta.updated_at = now_secs();
        let result = meta.clone();
        prune_empty(store);
        result
    })
}

pub fn update_path(old_path: &Path, new_path: &Path) {
    let old_key = normalize_key(old_path);
    let _ = with_store_mut(|store| {
        if let Some(meta) = store.files.remove(&old_key) {
            store.files.insert(normalize_key(new_path), meta);
        }
    });
}

pub fn remove(path: &Path) {
    let key = normalize_key(path);
    let _ = with_store_mut(|store| {
        store.files.remove(&key);
    });
}

pub fn tag_stats() -> Result<Vec<TagStat>, String> {
    with_store(|store| {
        let mut counts: HashMap<String, u64> = HashMap::new();
        for (path, meta) in &store.files {
            if !PathBuf::from(path).is_file() {
                continue;
            }
            for tag in &meta.tags {
                *counts.entry(tag.clone()).or_default() += 1;
            }
        }
        let mut tags: Vec<TagStat> = counts
            .into_iter()
            .map(|(name, count)| TagStat { name, count })
            .collect();
        tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
        tags
    })
}

pub fn all_tag_names() -> Result<Vec<String>, String> {
    Ok(tag_stats()?.into_iter().map(|tag| tag.name).collect())
}
