use crate::library::{self, CATEGORIES};
use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const HASH_BUFFER_BYTES: usize = 64 * 1024;

#[derive(Serialize, Clone)]
pub struct DuplicateFile {
    pub name: String,
    pub path: String,
    pub category: String,
    pub size: u64,
    pub modified: u64,
}

#[derive(Serialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub files: Vec<DuplicateFile>,
}

#[derive(Serialize)]
pub struct DuplicateFailure {
    pub path: String,
    pub reason: String,
}

#[derive(Serialize)]
pub struct DuplicateScanResult {
    pub scanned_file_count: u64,
    pub hashed_file_count: u64,
    pub duplicate_group_count: u64,
    pub duplicate_file_count: u64,
    pub reclaimable_bytes: u64,
    pub groups: Vec<DuplicateGroup>,
    pub failed: Vec<DuplicateFailure>,
}

pub struct DuplicateProgress {
    pub processed: u64,
    pub total: Option<u64>,
    pub message: String,
}

fn modified_secs(path: &Path) -> u64 {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string()
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; HASH_BUFFER_BYTES];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("读取文件失败: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}

fn files_equal(left: &Path, right: &Path) -> Result<bool, String> {
    let mut left_file = File::open(left).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut right_file = File::open(right).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut left_buf = [0u8; 64 * 1024];
    let mut right_buf = [0u8; 64 * 1024];

    loop {
        let left_read = left_file
            .read(&mut left_buf)
            .map_err(|e| format!("读取文件失败: {e}"))?;
        let right_read = right_file
            .read(&mut right_buf)
            .map_err(|e| format!("读取文件失败: {e}"))?;

        if left_read != right_read {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
        if left_buf[..left_read] != right_buf[..right_read] {
            return Ok(false);
        }
    }
}

fn split_exact_groups(files: Vec<DuplicateFile>) -> Vec<Vec<DuplicateFile>> {
    let mut exact_groups: Vec<Vec<DuplicateFile>> = Vec::new();

    'files: for file in files {
        for group in &mut exact_groups {
            let reference = PathBuf::from(&group[0].path);
            let candidate = PathBuf::from(&file.path);
            if files_equal(&reference, &candidate).unwrap_or(false) {
                group.push(file);
                continue 'files;
            }
        }
        exact_groups.push(vec![file]);
    }

    exact_groups
}

pub fn scan_library_duplicates() -> Result<DuplicateScanResult, String> {
    scan_library_duplicates_with_progress(|_| Ok(()))
}

pub fn scan_library_duplicates_with_progress<F>(
    mut progress: F,
) -> Result<DuplicateScanResult, String>
where
    F: FnMut(DuplicateProgress) -> Result<(), String>,
{
    let root = library::ensure_library()?;
    let mut by_size: HashMap<u64, Vec<DuplicateFile>> = HashMap::new();
    let mut scanned_file_count = 0u64;

    progress(DuplicateProgress {
        processed: 0,
        total: None,
        message: "准备扫描资料库".to_string(),
    })?;

    for category in CATEGORIES {
        let dir = root.join(category);
        if !dir.is_dir() {
            continue;
        }

        for entry in WalkDir::new(&dir)
            .min_depth(1)
            .max_depth(5)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            scanned_file_count += 1;
            if scanned_file_count % 200 == 0 {
                progress(DuplicateProgress {
                    processed: scanned_file_count,
                    total: None,
                    message: format!("正在扫描「{category}」"),
                })?;
            }
            by_size.entry(meta.len()).or_default().push(DuplicateFile {
                name: file_name(path),
                path: path.to_string_lossy().into_owned(),
                category: (*category).to_string(),
                size: meta.len(),
                modified: modified_secs(path),
            });
        }
    }

    progress(DuplicateProgress {
        processed: scanned_file_count,
        total: None,
        message: "正在筛选可能重复的文件".to_string(),
    })?;

    let mut by_hash: HashMap<(u64, String), Vec<DuplicateFile>> = HashMap::new();
    let mut hashed_file_count = 0u64;
    let mut failed = Vec::new();
    let hash_total: u64 = by_size
        .values()
        .filter(|files| files.len() > 1)
        .map(|files| files.len() as u64)
        .sum();

    progress(DuplicateProgress {
        processed: 0,
        total: Some(hash_total),
        message: "正在计算 BLAKE3 内容哈希".to_string(),
    })?;

    for (size, files) in by_size.into_iter().filter(|(_, files)| files.len() > 1) {
        for file in files {
            progress(DuplicateProgress {
                processed: hashed_file_count,
                total: Some(hash_total),
                message: file.name.clone(),
            })?;
            match hash_file(PathBuf::from(&file.path).as_path()) {
                Ok(hash) => {
                    hashed_file_count += 1;
                    by_hash.entry((size, hash)).or_default().push(file);
                }
                Err(reason) => failed.push(DuplicateFailure {
                    path: file.path,
                    reason,
                }),
            }
        }
    }

    progress(DuplicateProgress {
        processed: hashed_file_count,
        total: Some(hash_total),
        message: "正在整理重复文件结果".to_string(),
    })?;

    let mut groups: Vec<DuplicateGroup> = by_hash
        .into_iter()
        .flat_map(|((size, hash), files)| {
            split_exact_groups(files)
                .into_iter()
                .filter_map(move |mut files| {
                    if files.len() < 2 {
                        return None;
                    }
                    files.sort_by(|a, b| {
                        b.modified
                            .cmp(&a.modified)
                            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                    });
                    Some(DuplicateGroup {
                        hash: hash.clone(),
                        size,
                        files,
                    })
                })
        })
        .collect();

    groups.retain(|group| group.files.len() > 1);
    for group in &mut groups {
        group.files.sort_by(|a, b| {
            b.modified
                .cmp(&a.modified)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
    }

    groups.sort_by(|a, b| {
        b.size.cmp(&a.size).then_with(|| {
            a.files[0]
                .name
                .to_lowercase()
                .cmp(&b.files[0].name.to_lowercase())
        })
    });

    let duplicate_file_count = groups
        .iter()
        .map(|group| group.files.len().saturating_sub(1) as u64)
        .sum();
    let reclaimable_bytes = groups
        .iter()
        .map(|group| group.size * group.files.len().saturating_sub(1) as u64)
        .sum();

    Ok(DuplicateScanResult {
        scanned_file_count,
        hashed_file_count,
        duplicate_group_count: groups.len() as u64,
        duplicate_file_count,
        reclaimable_bytes,
        groups,
        failed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "file-manager-dup-test-{}-{name}",
            std::process::id()
        ))
    }

    #[test]
    fn blake3_hash_differs_for_different_content() {
        let dir = test_dir("hash");
        let _ = std::fs::create_dir_all(&dir);
        let left = dir.join("a.bin");
        let right = dir.join("b.bin");
        std::fs::write(&left, b"alpha").expect("write");
        std::fs::write(&right, b"beta").expect("write");

        let left_hash = hash_file(&left).expect("hash left");
        let right_hash = hash_file(&right).expect("hash right");
        assert_ne!(left_hash, right_hash);
        assert_eq!(left_hash.len(), 64);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn split_exact_groups_separates_different_files() {
        let dir = test_dir("split");
        let _ = std::fs::create_dir_all(&dir);
        let left = dir.join("left.txt");
        let right = dir.join("right.txt");
        std::fs::write(&left, b"file-one").expect("write");
        std::fs::write(&right, b"file-two").expect("write");

        let files = vec![
            DuplicateFile {
                name: "left.txt".to_string(),
                path: left.to_string_lossy().into_owned(),
                category: "文档".to_string(),
                size: 8,
                modified: 0,
            },
            DuplicateFile {
                name: "right.txt".to_string(),
                path: right.to_string_lossy().into_owned(),
                category: "文档".to_string(),
                size: 8,
                modified: 0,
            },
        ];

        let groups = split_exact_groups(files);
        assert_eq!(groups.len(), 2);
        assert!(groups.iter().all(|group| group.len() == 1));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
