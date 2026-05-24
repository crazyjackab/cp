use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const SKIP_DIR_NAMES: &[&str] = &[
    "$Recycle.Bin",
    "System Volume Information",
    "Windows",
    "Program Files",
    "Program Files (x86)",
    "ProgramData",
];

#[derive(Serialize, Clone)]
pub struct ExtensionStat {
    pub extension: String,
    pub count: u64,
    pub bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct DirStat {
    pub path: String,
    pub bytes: u64,
    pub file_count: u64,
}

#[derive(Serialize)]
pub struct ScanResult {
    pub root: String,
    pub file_count: u64,
    pub dir_count: u64,
    pub total_bytes: u64,
    pub by_extension: Vec<ExtensionStat>,
    pub largest_dirs: Vec<DirStat>,
}

fn should_skip(entry: &walkdir::DirEntry) -> bool {
    if entry.file_type().is_dir() {
        if let Some(name) = entry.file_name().to_str() {
            if name.starts_with('$') || SKIP_DIR_NAMES.contains(&name) {
                return true;
            }
        }
    }
    false
}

fn normalize_extension(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_else(|| "(无扩展名)".to_string())
}

pub fn scan_directory(root: &str) -> Result<ScanResult, String> {
    let root_path = PathBuf::from(root);
    if !root_path.exists() {
        return Err(format!("路径不存在: {root}"));
    }
    if !root_path.is_dir() {
        return Err(format!("不是文件夹: {root}"));
    }

    let mut file_count: u64 = 0;
    let mut dir_count: u64 = 0;
    let mut total_bytes: u64 = 0;
    let mut by_extension: HashMap<String, (u64, u64)> = HashMap::new();
    let mut dir_bytes: HashMap<PathBuf, (u64, u64)> = HashMap::new();

    for entry in WalkDir::new(&root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !should_skip(e))
    {
        let entry = entry.map_err(|e| format!("读取目录失败: {e}"))?;
        let path = entry.path();

        if path == root_path {
            continue;
        }

        if entry.file_type().is_dir() {
            dir_count += 1;
            continue;
        }

        if !entry.file_type().is_file() {
            continue;
        }

        let meta = entry.metadata().map_err(|e| format!("读取文件元数据失败: {e}"))?;
        let size = meta.len();
        file_count += 1;
        total_bytes += size;

        let ext = normalize_extension(path);
        let ext_entry = by_extension.entry(ext).or_insert((0, 0));
        ext_entry.0 += 1;
        ext_entry.1 += size;

        let mut current = path.parent();
        while let Some(parent) = current {
            if parent == root_path || !parent.starts_with(&root_path) {
                break;
            }
            let stat = dir_bytes.entry(parent.to_path_buf()).or_insert((0, 0));
            stat.0 += size;
            stat.1 += 1;
            current = parent.parent();
        }
    }

    let mut by_extension: Vec<ExtensionStat> = by_extension
        .into_iter()
        .map(|(extension, (count, bytes))| ExtensionStat {
            extension,
            count,
            bytes,
        })
        .collect();
    by_extension.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let mut largest_dirs: Vec<DirStat> = dir_bytes
        .into_iter()
        .map(|(path, (bytes, file_count))| DirStat {
            path: path.to_string_lossy().into_owned(),
            bytes,
            file_count,
        })
        .collect();
    largest_dirs.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    largest_dirs.truncate(15);

    Ok(ScanResult {
        root: root_path.to_string_lossy().into_owned(),
        file_count,
        dir_count,
        total_bytes,
        by_extension,
        largest_dirs,
    })
}
