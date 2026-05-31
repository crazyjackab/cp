use crate::media_info::{read_media_info, MediaInfo, MediaInfoEntry};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MediaCacheEntry {
    mtime: u64,
    size: u64,
    info: MediaInfo,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct MediaCacheFile {
    #[serde(default)]
    files: HashMap<String, MediaCacheEntry>,
}

struct MediaCacheState {
    data: MediaCacheFile,
    loaded: bool,
    dirty: bool,
}

static CACHE: OnceLock<Mutex<MediaCacheState>> = OnceLock::new();

fn cache() -> &'static Mutex<MediaCacheState> {
    CACHE.get_or_init(|| {
        Mutex::new(MediaCacheState {
            data: MediaCacheFile::default(),
            loaded: false,
            dirty: false,
        })
    })
}

pub fn media_cache_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    Ok(PathBuf::from(appdata)
        .join("FileManager")
        .join("media_cache.json"))
}

fn normalize_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn file_identity(path: &Path) -> Option<(u64, u64)> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some((mtime, meta.len()))
}

fn load_from_disk() -> Result<MediaCacheFile, String> {
    let path = media_cache_path()?;
    if !path.exists() {
        return Ok(MediaCacheFile::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取媒体缓存失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析媒体缓存失败: {e}"))
}

fn save_to_disk(store: &MediaCacheFile) -> Result<(), String> {
    let path = media_cache_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建媒体缓存目录失败: {e}"))?;
    }
    let content =
        serde_json::to_string_pretty(store).map_err(|e| format!("序列化媒体缓存失败: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("保存媒体缓存失败: {e}"))
}

fn ensure_loaded(guard: &mut MediaCacheState) -> Result<(), String> {
    if guard.loaded {
        return Ok(());
    }
    guard.data = load_from_disk()?;
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
    save_to_disk(&guard.data)?;
    guard.dirty = false;
    Ok(())
}

fn lookup(store: &MediaCacheFile, key: &str, mtime: u64, size: u64) -> Option<MediaInfo> {
    store.files.get(key).and_then(|entry| {
        if entry.mtime == mtime && entry.size == size {
            Some(entry.info.clone())
        } else {
            None
        }
    })
}

fn insert(store: &mut MediaCacheFile, key: String, mtime: u64, size: u64, info: MediaInfo) {
    store.files.insert(key, MediaCacheEntry { mtime, size, info });
}

pub fn read_media_info_cached(path: &str) -> MediaInfo {
    let path_buf = Path::new(path);
    let Some((mtime, size)) = file_identity(path_buf) else {
        return read_media_info(path).unwrap_or_default();
    };
    let key = normalize_key(path_buf);

    let mut guard = match cache().lock() {
        Ok(g) => g,
        Err(_) => return read_media_info(path).unwrap_or_default(),
    };
    if ensure_loaded(&mut guard).is_err() {
        return read_media_info(path).unwrap_or_default();
    }

    if let Some(info) = lookup(&guard.data, &key, mtime, size) {
        return info;
    }

    let info = read_media_info(path).unwrap_or_default();
    insert(&mut guard.data, key, mtime, size, info.clone());
    guard.dirty = true;
    drop(guard);
    crate::debounced_persist::schedule_media_cache();
    info
}

pub fn read_media_info_batch_cached(paths: Vec<String>) -> Vec<MediaInfoEntry> {
    let mut guard = match cache().lock() {
        Ok(g) => g,
        Err(_) => {
            return paths
                .into_iter()
                .map(|path| MediaInfoEntry {
                    info: read_media_info(&path).unwrap_or_default(),
                    path,
                })
                .collect();
        }
    };
    let _ = ensure_loaded(&mut guard);
    let mut dirty = false;
    let mut results = Vec::with_capacity(paths.len());

    for path in paths {
        let path_buf = Path::new(&path);
        let key = normalize_key(path_buf);
        let info = if let Some((mtime, size)) = file_identity(path_buf) {
            if let Some(cached) = lookup(&guard.data, &key, mtime, size) {
                cached
            } else {
                let info = read_media_info(&path).unwrap_or_default();
                insert(&mut guard.data, key, mtime, size, info.clone());
                dirty = true;
                info
            }
        } else {
            read_media_info(&path).unwrap_or_default()
        };
        results.push(MediaInfoEntry { path, info });
    }

    if dirty {
        guard.dirty = true;
        drop(guard);
        crate::debounced_persist::schedule_media_cache();
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_miss_when_size_changes() {
        let mut store = MediaCacheFile::default();
        let key = "c:\\test\\song.mp3".to_string();
        insert(
            &mut store,
            key.clone(),
            100,
            1024,
            MediaInfo {
                duration_secs: Some(120.0),
                ..Default::default()
            },
        );
        assert!(lookup(&store, &key, 100, 1024).is_some());
        assert!(lookup(&store, &key, 100, 2048).is_none());
        assert!(lookup(&store, &key, 101, 1024).is_none());
    }
}
