use crate::config;
use crate::file_metadata;
use crate::import_log;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub const CATEGORIES: &[&str] = &[
    "收件箱",
    "图片",
    "视频",
    "文档",
    "音频",
    "压缩包",
    "安装包",
    "其他",
];

/// 资料库内递归遍历的最大深度（相对当前分类/文件夹根目录）。
const LIBRARY_WALK_MAX_DEPTH: usize = 8;

/// 外部目录收纳预览时的递归深度。
const IMPORT_SOURCE_WALK_MAX_DEPTH: usize = 8;

const IMAGE_EXT: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "svg", "ico", "tif", "tiff", "raw",
    "arw", "cr2", "nef",
];
const VIDEO_EXT: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg", "3gp",
];
const DOC_EXT: &[&str] = &[
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "rtf", "odt", "ods", "odp",
    "csv", "pages", "wps", "et", "dps",
];
const AUDIO_EXT: &[&str] = &[
    "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "ape", "opus",
];
const ARCHIVE_EXT: &[&str] = &["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"];
const INSTALLER_EXT: &[&str] = &["exe", "msi", "msix", "dmg", "apk"];

#[derive(Serialize, Clone)]
pub struct CategoryStat {
    pub id: String,
    pub label: String,
    pub file_count: u64,
    pub bytes: u64,
}

#[derive(Serialize)]
pub struct LibraryInfo {
    pub root: String,
    pub import_mode: String,
    pub categories: Vec<CategoryStat>,
    pub total_files: u64,
    pub total_bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct LibraryFile {
    pub name: String,
    pub path: String,
    pub category: String,
    pub size: u64,
    pub modified: u64,
    pub original_path: Option<String>,
    pub can_restore: bool,
    pub favorite: bool,
    pub tags: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct LibraryFolder {
    pub name: String,
    pub path: String,
    pub category: String,
    pub modified: u64,
    pub subfolder_count: u32,
    pub children: Vec<LibraryFolder>,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub moved_count: u32,
    pub skipped_count: u32,
    #[serde(default)]
    pub skipped_items: Vec<SkippedImportItem>,
    pub failed: Vec<ImportFailure>,
}

#[derive(Serialize, Clone)]
pub struct SkippedImportItem {
    pub path: String,
    pub name: String,
    pub reason: String,
}

#[derive(Serialize, Clone)]
pub struct SkippedImportFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub reason: String,
}

#[derive(Serialize)]
pub struct ImportCandidatesResult {
    pub files: Vec<PendingImportFile>,
    pub skipped: Vec<SkippedImportFile>,
}

#[derive(Serialize)]
pub struct ImportFailure {
    pub path: String,
    pub reason: String,
}

#[derive(Serialize, Clone)]
pub struct PendingImportFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub target_category: String,
    pub target_exists: bool,
}

#[derive(Serialize, Clone)]
pub struct ReclassifyMove {
    pub name: String,
    pub from_category: String,
    pub to_category: String,
}

#[derive(Serialize)]
pub struct ReclassifyResult {
    pub moved_count: u32,
    pub already_correct: u32,
    pub moved: Vec<ReclassifyMove>,
    pub failed: Vec<ImportFailure>,
}

pub struct MigrationProgress {
    pub processed: u64,
    pub total: u64,
    pub message: String,
}

pub fn default_classify_extension(ext: &str) -> &'static str {
    let ext = ext.to_lowercase();
    let ext = ext.as_str();
    if IMAGE_EXT.contains(&ext) {
        "图片"
    } else if VIDEO_EXT.contains(&ext) {
        "视频"
    } else if DOC_EXT.contains(&ext) {
        "文档"
    } else if AUDIO_EXT.contains(&ext) {
        "音频"
    } else if ARCHIVE_EXT.contains(&ext) {
        "压缩包"
    } else if INSTALLER_EXT.contains(&ext) {
        "安装包"
    } else {
        "其他"
    }
}

pub fn classify_extension(ext: &str) -> String {
    let ext = ext.to_ascii_lowercase();
    let cfg = config::load_config();
    let rules = config::normalize_custom_extension_rules(cfg.custom_extension_rules);
    rules
        .get(&ext)
        .cloned()
        .unwrap_or_else(|| default_classify_extension(&ext).to_string())
}

pub fn classify_path(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(classify_extension)
        .unwrap_or_else(|| "其他".to_string())
}

pub fn resolve_import_category(path: &Path) -> String {
    let cfg = config::load_config();
    if config::normalize_import_destination(&cfg.import_destination) == "inbox" {
        "收件箱".to_string()
    } else {
        classify_path(path)
    }
}

pub fn ensure_library() -> Result<PathBuf, String> {
    let cfg = config::load_config();
    let root = PathBuf::from(&cfg.library_root);

    if let Some(parent) = root.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建资料库父目录失败: {e}"))?;
    }
    fs::create_dir_all(&root).map_err(|e| format!("创建资料库失败: {e}"))?;

    for cat in CATEGORIES {
        let p = root.join(cat);
        fs::create_dir_all(&p).map_err(|e| format!("创建分类目录「{cat}」失败: {e}"))?;
    }

    if let Ok(path) = config::config_path() {
        if !path.exists() {
            let _ = config::save_config(&cfg);
        }
    }

    Ok(root)
}

fn canonical_library_path(path: &Path) -> Result<PathBuf, String> {
    dunce::canonicalize(path).map_err(|e| format!("路径无效: {e}"))
}

pub fn validate_library_file_path(path: &str) -> Result<PathBuf, String> {
    let root = ensure_library()?;
    let root = canonical_library_path(&root)?;
    let src = PathBuf::from(path);

    if !src.is_file() {
        return Err("资料库中找不到该文件".to_string());
    }

    let src = canonical_library_path(&src)?;
    if !src.starts_with(&root) {
        return Err("拒绝操作资料库之外的文件".to_string());
    }

    Ok(src)
}

pub fn validate_library_directory(path: &str) -> Result<(PathBuf, String), String> {
    let root = ensure_library()?;
    let root = canonical_library_path(&root)?;
    let dir = PathBuf::from(path.trim());
    if !dir.is_dir() {
        return Err(format!("文件夹不存在: {path}"));
    }
    let dir = canonical_library_path(&dir)?;
    if !dir.starts_with(&root) {
        return Err("拒绝操作资料库之外的文件夹".to_string());
    }
    let category = category_for_path_under_root(&dir, &root)?;
    Ok((dir, category))
}

fn category_for_path_under_root(path: &Path, root: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "无法解析资料库相对路径".to_string())?;
    match relative.components().next() {
        Some(std::path::Component::Normal(cat)) => {
            let cat = cat.to_str().ok_or_else(|| "无法识别资料库分类目录".to_string())?;
            if CATEGORIES.contains(&cat) {
                Ok(cat.to_string())
            } else {
                Err("无法识别资料库分类目录".to_string())
            }
        }
        _ => Err("无法识别资料库分类目录".to_string()),
    }
}

pub fn category_directory(category: &str) -> Result<PathBuf, String> {
    if !CATEGORIES.contains(&category) {
        return Err(format!("未知分类: {category}"));
    }
    let root = ensure_library()?;
    Ok(root.join(category))
}

fn is_under_library(path: &Path, library_root: &Path) -> bool {
    let Ok(path) = dunce::canonicalize(path) else {
        return false;
    };
    let Ok(root) = dunce::canonicalize(library_root) else {
        return false;
    };
    path.starts_with(&root)
}

fn default_restore_destination(file_name: &str) -> Result<PathBuf, String> {
    let home = user_home()?;
    Ok(home.join("Desktop").join(file_name))
}

fn resolve_restore_destination(
    src: &Path,
    file_name: &str,
    library_root: &Path,
) -> Result<PathBuf, String> {
    let mut dest = if let Some(original) = import_log::find_original(src) {
        let path = PathBuf::from(original);
        if is_under_library(&path, library_root) {
            default_restore_destination(file_name)?
        } else {
            path
        }
    } else {
        default_restore_destination(file_name)?
    };

    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            dest = default_restore_destination(file_name)?;
        }
    }

    if dest.exists() {
        let parent = dest
            .parent()
            .ok_or_else(|| "无法确定还原目标目录".to_string())?;
        dest = unique_dest_path(parent, file_name);
    }

    Ok(dest)
}

fn resolve_import_original_path(src: &Path, library_root: &Path) -> PathBuf {
    let canonical_src = dunce::canonicalize(src).unwrap_or_else(|_| src.to_path_buf());

    if is_under_library(&canonical_src, library_root) {
        if let Some(original) = import_log::find_original(&canonical_src) {
            let original_path = PathBuf::from(&original);
            if !is_under_library(&original_path, library_root) {
                return original_path;
            }
        }
    }

    canonical_src
}

fn should_skip_desktop_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "desktop.ini"
        || lower == "thumbs.db"
        || lower.ends_with(".lnk")
        || name.starts_with('.')
}

pub fn import_skip_reason(name: &str, size: u64) -> Option<String> {
    if should_skip_desktop_file(name) {
        return Some("系统或快捷方式文件".to_string());
    }
    let min_kb = config::load_config().import_min_size_kb;
    if min_kb > 0 && size < (min_kb as u64) * 1024 {
        return Some(format!("小于 {min_kb} KB"));
    }
    None
}

fn unique_dest_path(dir: &Path, file_name: &str) -> PathBuf {
    let dest = dir.join(file_name);
    if !dest.exists() {
        return dest;
    }

    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = path.extension().and_then(|e| e.to_str());

    for i in 1..9999 {
        let new_name = match ext {
            Some(e) => format!("{stem} ({i}).{e}"),
            None => format!("{stem} ({i})"),
        };
        let candidate = dir.join(&new_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}_dup"))
}

fn normalize_conflict_strategy(strategy: Option<&str>) -> &str {
    match strategy {
        Some("rename") => "rename",
        Some("skip") => "skip",
        Some("ask") | None => "rename",
        _ => "rename",
    }
}

const FILE_IN_USE_HINT: &str = "文件正在被其他程序打开，请先关闭后再试";

fn file_in_use_hint(error: &std::io::Error) -> Option<&'static str> {
    #[cfg(windows)]
    match error.raw_os_error() {
        Some(32) | Some(33) | Some(1224) => return Some(FILE_IN_USE_HINT),
        Some(5) => {
            return Some("无法访问该文件，请检查是否被其他程序占用或缺少权限");
        }
        _ => {}
    }

    match error.kind() {
        std::io::ErrorKind::PermissionDenied => Some(FILE_IN_USE_HINT),
        _ => None,
    }
}

fn file_operation_error(action: &str, error: std::io::Error) -> String {
    if let Some(hint) = file_in_use_hint(&error) {
        return hint.to_string();
    }
    let text = error.to_string();
    if let Some(hint) = file_busy_message(&text) {
        return hint.to_string();
    }
    format!("{action}：{error}")
}

fn file_busy_message(error_text: &str) -> Option<&'static str> {
    let lower = error_text.to_ascii_lowercase();
    if lower.contains("being used by another process")
        || lower.contains("sharing violation")
        || lower.contains("used by another process")
        || lower.contains("另一个程序正在使用此文件")
        || lower.contains("process cannot access the file")
    {
        return Some(FILE_IN_USE_HINT);
    }
    None
}

fn trash_operation_error(error: trash::Error) -> String {
    let text = error.to_string();
    file_busy_message(&text)
        .map(str::to_string)
        .unwrap_or_else(|| format!("删除失败：{text}"))
}

fn copy_file(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    fs::copy(src, dest).map_err(|e| file_operation_error("复制文件失败", e))?;
    Ok(())
}
fn move_file(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let src = dunce::canonicalize(src).unwrap_or_else(|_| src.to_path_buf());
    let dest = if let (Some(parent), Some(name)) = (dest.parent(), dest.file_name()) {
        let parent = dunce::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
        parent.join(name)
    } else {
        dest.to_path_buf()
    };

    if src == dest {
        return Ok(());
    }

    match fs::rename(&src, &dest) {
        Ok(()) => Ok(()),
        Err(e) => {
            let raw = e.raw_os_error();
            // Windows ERROR_NOT_SAME_DEVICE = 17; cross-device move
            if raw == Some(17) || raw == Some(18) {
                fs::copy(&src, &dest).map_err(|e| file_operation_error("复制文件失败", e))?;
                if let Err(remove_error) = fs::remove_file(&src) {
                    return Err(if file_in_use_hint(&remove_error).is_some() {
                        "文件已复制到资料库，但原文件仍被其他程序占用，无法删除。请先关闭该文件，或在设置中改用「复制收纳」模式。".to_string()
                    } else {
                        file_operation_error("删除原文件失败", remove_error)
                    });
                }
                Ok(())
            } else if raw == Some(2) && !src.exists() && dest.exists() {
                // 重复收纳：源文件已被第一次移动带走，目标已存在
                Ok(())
            } else {
                Err(file_operation_error("移动文件失败", e))
            }
        }
    }
}

fn import_source_unavailable(src: &Path) -> bool {
    !src.exists()
}

fn import_not_file_error() -> String {
    "无法收纳：目标不是文件（若要收纳整个文件夹，请直接拖入文件夹）".to_string()
}

pub fn import_file(
    src: &Path,
    root: &Path,
    conflict_strategy: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    if !src.is_file() {
        if import_source_unavailable(src) {
            return Ok(None);
        }
        return Err(import_not_file_error());
    }

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;

    if should_skip_desktop_file(file_name) {
        return Ok(None);
    }

    let size = src
        .metadata()
        .map_err(|e| format!("读取文件信息失败: {e}"))?
        .len();
    if import_skip_reason(file_name, size).is_some() {
        return Ok(None);
    }

    let category = resolve_import_category(src);
    let dest_dir = root.join(&category);
    fs::create_dir_all(&dest_dir).map_err(|e| format!("创建分类目录失败: {e}"))?;
    let conflict_strategy = normalize_conflict_strategy(conflict_strategy);
    let direct_dest = dest_dir.join(file_name);

    if direct_dest.exists() && conflict_strategy == "skip" {
        return Ok(None);
    }

    let original_path = resolve_import_original_path(src, root);
    let dest = if direct_dest.exists() {
        unique_dest_path(&dest_dir, file_name)
    } else {
        direct_dest
    };
    let cfg = config::load_config();
    if cfg.import_mode == "copy" {
        copy_file(src, &dest)?;
    } else {
        move_file(src, &dest)?;
    }
    import_log::add_record(&dest, &original_path);
    Ok(Some(dest))
}

pub fn import_file_to_directory(
    src: &Path,
    dest_dir: &Path,
    conflict_strategy: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    if !src.is_file() {
        if import_source_unavailable(src) {
            return Ok(None);
        }
        return Err(import_not_file_error());
    }

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;

    if should_skip_desktop_file(file_name) {
        return Ok(None);
    }

    let size = src
        .metadata()
        .map_err(|e| format!("读取文件信息失败: {e}"))?
        .len();
    if import_skip_reason(file_name, size).is_some() {
        return Ok(None);
    }

    fs::create_dir_all(dest_dir).map_err(|e| format!("创建目标文件夹失败: {e}"))?;
    let conflict_strategy = normalize_conflict_strategy(conflict_strategy);
    let direct_dest = dest_dir.join(file_name);

    if direct_dest.exists() && conflict_strategy == "skip" {
        return Ok(None);
    }

    let library_root = ensure_library()?;
    let original_path = resolve_import_original_path(src, &library_root);
    let dest = if direct_dest.exists() {
        unique_dest_path(dest_dir, file_name)
    } else {
        direct_dest
    };
    let cfg = config::load_config();
    if cfg.import_mode == "copy" {
        copy_file(src, &dest)?;
    } else {
        move_file(src, &dest)?;
    }
    import_log::add_record(&dest, &original_path);
    Ok(Some(dest))
}

pub fn move_library_file_to_directory(
    library_path: &str,
    target_directory: &str,
) -> Result<String, String> {
    let src = validate_library_file_path(library_path)?;
    let (dest_dir, _) = validate_library_directory(target_directory)?;
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;

    if src.parent() == Some(dest_dir.as_path()) {
        return Ok(src.to_string_lossy().into_owned());
    }

    let dest = unique_dest_path(&dest_dir, file_name);
    move_file(&src, &dest)?;
    import_log::update_path(&src, &dest);
    file_metadata::update_path(&src, &dest);
    Ok(dest.to_string_lossy().into_owned())
}

pub fn restore_file(library_path: &str) -> Result<String, String> {
    let src = validate_library_file_path(library_path)?;
    let library_root = ensure_library()?;

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;

    let dest = resolve_restore_destination(&src, file_name, &library_root)?;

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建还原目录失败: {e}"))?;
    }

    move_file(&src, &dest)?;
    import_log::remove_record(&src);
    file_metadata::remove(&src);

    Ok(dest.to_string_lossy().into_owned())
}

fn validate_file_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("文件名不能为空".to_string());
    }
    if name == "." || name == ".." {
        return Err("文件名无效".to_string());
    }
    const INVALID: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    if name.chars().any(|c| INVALID.contains(&c)) {
        return Err("文件名不能包含 \\ / : * ? \" < > |".to_string());
    }
    Ok(())
}

pub fn resolve_create_folder_category(category: Option<&str>) -> Result<&'static str, String> {
    match category {
        None | Some("") | Some("all") | Some("全部") | Some("favorites") | Some("收藏") => {
            Ok("收件箱")
        }
        Some(c) if CATEGORIES.contains(&c) => Ok(
            CATEGORIES
                .iter()
                .copied()
                .find(|item| *item == c)
                .unwrap_or("收件箱"),
        ),
        Some(c) => Err(format!("未知分类: {c}")),
    }
}

pub fn create_library_folder(
    category: Option<String>,
    name: String,
    parent_directory: Option<String>,
) -> Result<String, String> {
    validate_file_name(&name)?;
    let name = name.trim();
    let root = ensure_library()?;

    let parent = if let Some(ref parent_path) = parent_directory {
        if parent_path.trim().is_empty() {
            return Err("父文件夹路径无效".to_string());
        }
        let (parent_dir, _) = validate_library_directory(parent_path)?;
        parent_dir
    } else {
        let cat = resolve_create_folder_category(category.as_deref())?;
        let parent = root.join(cat);
        fs::create_dir_all(&parent).map_err(|e| format!("创建分类目录「{cat}」失败: {e}"))?;
        parent
    };

    let dest = parent.join(name);
    if dest.exists() {
        return Err("该位置已有同名文件夹或文件".to_string());
    }

    fs::create_dir(&dest).map_err(|e| format!("创建文件夹失败: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

pub fn rename_library_file(path: &str, new_name: String) -> Result<String, String> {
    validate_file_name(&new_name)?;
    let new_name = new_name.trim();

    let src = validate_library_file_path(path)?;

    let parent = src
        .parent()
        .ok_or_else(|| "无法获取文件所在目录".to_string())?;
    let dest = parent.join(new_name);

    if dest.exists() {
        return Err("该目录下已有同名文件".to_string());
    }

    fs::rename(&src, &dest).map_err(|e| file_operation_error("重命名失败", e))?;
    import_log::update_path(&src, &dest);
    file_metadata::update_path(&src, &dest);

    Ok(dest.to_string_lossy().into_owned())
}

pub fn delete_library_file(path: &str) -> Result<(), String> {
    let src = validate_library_file_path(path)?;

    trash::delete(&src).map_err(trash_operation_error)?;
    import_log::remove_record(&src);
    file_metadata::remove(&src);

    Ok(())
}

#[derive(Serialize)]
pub struct BatchOperationResult {
    pub success_count: u32,
    pub failed: Vec<ImportFailure>,
}

pub fn move_file_to_category(path: &str, target_category: &str) -> Result<String, String> {
    if !CATEGORIES.contains(&target_category) {
        return Err(format!("未知分类: {target_category}"));
    }

    let root = ensure_library()?;
    let src = validate_library_file_path(path)?;

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;

    let dest_dir = root.join(target_category);
    fs::create_dir_all(&dest_dir).map_err(|e| format!("创建分类目录失败: {e}"))?;

    if src.parent() == Some(dest_dir.as_path()) {
        return Ok(src.to_string_lossy().into_owned());
    }

    let dest = unique_dest_path(&dest_dir, file_name);
    move_file(&src, &dest)?;
    import_log::update_path(&src, &dest);
    file_metadata::update_path(&src, &dest);
    Ok(dest.to_string_lossy().into_owned())
}

pub fn batch_delete_library_files(paths: Vec<String>) -> Result<BatchOperationResult, String> {
    if paths.is_empty() {
        return Err("请选择至少一个文件".to_string());
    }
    let mut success_count = 0u32;
    let mut failed = Vec::new();
    for path in paths {
        match delete_library_file(&path) {
            Ok(()) => success_count += 1,
            Err(e) => failed.push(ImportFailure { path, reason: e }),
        }
    }
    Ok(BatchOperationResult {
        success_count,
        failed,
    })
}

pub fn batch_restore_files(paths: Vec<String>) -> Result<BatchOperationResult, String> {
    if paths.is_empty() {
        return Err("请选择至少一个文件".to_string());
    }
    let mut success_count = 0u32;
    let mut failed = Vec::new();
    for path in paths {
        match restore_file(&path) {
            Ok(_) => success_count += 1,
            Err(e) => failed.push(ImportFailure { path, reason: e }),
        }
    }
    Ok(BatchOperationResult {
        success_count,
        failed,
    })
}

pub fn batch_move_to_category(
    paths: Vec<String>,
    target_category: String,
) -> Result<BatchOperationResult, String> {
    if paths.is_empty() {
        return Err("请选择至少一个文件".to_string());
    }
    let mut success_count = 0u32;
    let mut failed = Vec::new();
    for path in paths {
        match move_file_to_category(&path, &target_category) {
            Ok(_) => success_count += 1,
            Err(e) => failed.push(ImportFailure { path, reason: e }),
        }
    }
    Ok(BatchOperationResult {
        success_count,
        failed,
    })
}

fn path_dedupe_key(path: &Path) -> String {
    dunce::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn is_dir_ancestor_of(ancestor: &Path, file: &Path) -> bool {
    let Ok(ancestor) = dunce::canonicalize(ancestor) else {
        return false;
    };
    let Ok(file) = dunce::canonicalize(file) else {
        return false;
    };
    file.starts_with(&ancestor) && file != ancestor
}

fn expand_paths_to_files(paths: Vec<String>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut files = Vec::new();
    let mut explicit_files = Vec::new();
    let mut dirs = Vec::new();

    let mut add_file = |path: PathBuf| {
        if !path.is_file() {
            return;
        }
        let key = path_dedupe_key(&path);
        if seen.insert(key) {
            files.push(path);
        }
    };

    for p in paths {
        let trimmed = p.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = PathBuf::from(trimmed);
        if path.is_file() {
            explicit_files.push(path.clone());
            add_file(path);
        } else if path.is_dir() {
            dirs.push(path);
        }
    }

    for dir in dirs {
        if explicit_files.iter().any(|file| is_dir_ancestor_of(&dir, file)) {
            continue;
        }
        for entry in WalkDir::new(&dir)
            .min_depth(1)
            .max_depth(IMPORT_SOURCE_WALK_MAX_DEPTH)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            add_file(entry.into_path());
        }
    }

    files
}

pub struct ImportProgress {
    pub message: String,
    pub processed: u64,
    pub total: u64,
}

pub fn import_paths(
    paths: Vec<String>,
    conflict_strategy: Option<String>,
) -> Result<ImportResult, String> {
    import_paths_with_target(paths, conflict_strategy, None)
}

pub fn import_paths_with_target(
    paths: Vec<String>,
    conflict_strategy: Option<String>,
    target_directory: Option<String>,
) -> Result<ImportResult, String> {
    import_paths_with_progress(paths, conflict_strategy, target_directory, |_| Ok(()))
}

pub fn import_paths_with_progress<F>(
    paths: Vec<String>,
    conflict_strategy: Option<String>,
    target_directory: Option<String>,
    mut progress: F,
) -> Result<ImportResult, String>
where
    F: FnMut(ImportProgress) -> Result<(), String>,
{
    let root = ensure_library()?;
    let file_paths = expand_paths_to_files(paths);
    let mut moved_count = 0u32;
    let mut skipped_count = 0u32;
    let mut skipped_items = Vec::new();
    let mut failed = Vec::new();
    let strategy = conflict_strategy.unwrap_or_else(|| {
        let cfg = config::load_config();
        config::normalize_import_conflict_strategy(&cfg.import_conflict_strategy).to_string()
    });
    let fixed_dest = target_directory
        .as_deref()
        .map(validate_library_directory)
        .transpose()?
        .map(|(path, _)| path);

    if file_paths.is_empty() {
        return Err("未找到可收纳的文件（文件夹可能为空）".to_string());
    }

    let total = file_paths.len() as u64;
    progress(ImportProgress {
        message: "准备收纳".to_string(),
        processed: 0,
        total,
    })?;

    for (index, src) in file_paths.into_iter().enumerate() {
        let path_str = src.to_string_lossy().into_owned();
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let progress_message = if name.is_empty() {
            path_str.clone()
        } else {
            name.clone()
        };

        let size = src.metadata().map(|meta| meta.len()).unwrap_or(0);
        if let Some(reason) = import_skip_reason(&name, size) {
            skipped_count += 1;
            skipped_items.push(SkippedImportItem {
                path: path_str,
                name,
                reason,
            });
            progress(ImportProgress {
                message: progress_message,
                processed: (index + 1) as u64,
                total,
            })?;
            continue;
        }

        let import_result = if let Some(ref dest_dir) = fixed_dest {
            import_file_to_directory(&src, dest_dir, Some(&strategy))
        } else {
            import_file(&src, &root, Some(&strategy))
        };

        match import_result {
            Ok(Some(_)) => moved_count += 1,
            Ok(None) => skipped_count += 1,
            Err(e) => failed.push(ImportFailure {
                path: path_str,
                reason: e,
            }),
        }

        progress(ImportProgress {
            message: progress_message,
            processed: (index + 1) as u64,
            total,
        })?;
    }

    Ok(ImportResult {
        moved_count,
        skipped_count,
        skipped_items,
        failed,
    })
}

enum ImportPathInspect {
    Importable(PendingImportFile),
    Skipped(SkippedImportFile),
}

fn inspect_import_path(path: &Path, root: &Path) -> Result<Option<ImportPathInspect>, String> {
    if !path.is_file() {
        return Ok(None);
    }

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let meta = path
        .metadata()
        .map_err(|e| format!("读取文件信息失败: {e}"))?;
    let size = meta.len();
    let path_str = path.to_string_lossy().into_owned();

    if let Some(reason) = import_skip_reason(&name, size) {
        return Ok(Some(ImportPathInspect::Skipped(SkippedImportFile {
            name,
            path: path_str,
            size,
            reason,
        })));
    }

    let target_category = resolve_import_category(path);
    let target_exists = root.join(&target_category).join(&name).exists();

    Ok(Some(ImportPathInspect::Importable(PendingImportFile {
        name,
        path: path_str,
        size,
        target_category,
        target_exists,
    })))
}

fn collect_import_candidates(paths: Vec<String>) -> Result<ImportCandidatesResult, String> {
    let root = ensure_library()?;
    let mut files = Vec::new();
    let mut skipped = Vec::new();

    for path in expand_paths_to_files(paths) {
        match inspect_import_path(&path, &root)? {
            Some(ImportPathInspect::Importable(file)) => files.push(file),
            Some(ImportPathInspect::Skipped(file)) => skipped.push(file),
            None => {}
        }
    }

    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    skipped.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(ImportCandidatesResult { files, skipped })
}

pub fn preview_import_candidates(paths: Vec<String>) -> Result<ImportCandidatesResult, String> {
    collect_import_candidates(paths)
}

#[allow(dead_code)]
pub fn import_from_folder(folder: &Path) -> Result<ImportResult, String> {
    if !folder.is_dir() {
        return Err(format!("文件夹不存在: {}", folder.display()));
    }

    let root = ensure_library()?;
    let cfg = config::load_config();
    let strategy =
        config::normalize_import_conflict_strategy(&cfg.import_conflict_strategy).to_string();
    let mut moved_count = 0u32;
    let mut skipped_count = 0u32;
    let mut failed = Vec::new();

    let entries = fs::read_dir(folder).map_err(|e| format!("读取目录失败: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();
        match import_file(&path, &root, Some(&strategy)) {
            Ok(Some(_)) => moved_count += 1,
            Ok(None) => skipped_count += 1,
            Err(e) => failed.push(ImportFailure {
                path: path_str,
                reason: e,
            }),
        }
    }

    Ok(ImportResult {
        moved_count,
        skipped_count,
        skipped_items: Vec::new(),
        failed,
    })
}

pub fn list_import_candidates(folder: &Path) -> Result<ImportCandidatesResult, String> {
    if !folder.is_dir() {
        return Err(format!("文件夹不存在: {}", folder.display()));
    }

    let paths = fs::read_dir(folder)
        .map_err(|e| format!("读取目录失败: {e}"))?
        .flatten()
        .map(|entry| entry.path().to_string_lossy().into_owned())
        .collect();
    collect_import_candidates(paths)
}

pub fn list_desktop_import_candidates() -> Result<ImportCandidatesResult, String> {
    let home = user_home()?;
    list_import_candidates(&home.join("Desktop"))
}

pub fn list_downloads_import_candidates() -> Result<ImportCandidatesResult, String> {
    let home = user_home()?;
    list_import_candidates(&home.join("Downloads"))
}

pub fn collect_folder_file_paths(folder: &Path) -> Result<Vec<String>, String> {
    if !folder.is_dir() {
        return Err(format!("文件夹不存在: {}", folder.display()));
    }
    let mut paths = Vec::new();
    let entries = fs::read_dir(folder).map_err(|e| format!("读取目录失败: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            paths.push(path.to_string_lossy().into_owned());
        }
    }
    Ok(paths)
}

pub fn desktop_import_paths() -> Result<Vec<String>, String> {
    let home = user_home()?;
    collect_folder_file_paths(&home.join("Desktop"))
}

pub fn downloads_import_paths() -> Result<Vec<String>, String> {
    let home = user_home()?;
    collect_folder_file_paths(&home.join("Downloads"))
}

pub fn import_from_desktop() -> Result<ImportResult, String> {
    import_paths(desktop_import_paths()?, None)
}

pub fn import_from_downloads() -> Result<ImportResult, String> {
    import_paths(downloads_import_paths()?, None)
}

fn user_home() -> Result<PathBuf, String> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .map_err(|_| "无法获取用户主目录".to_string())
}

pub fn get_library_info() -> Result<LibraryInfo, String> {
    let cfg = config::load_config();
    let root = ensure_library()?;

    let mut categories = Vec::new();
    let mut total_files = 0u64;
    let mut total_bytes = 0u64;

    for cat in CATEGORIES {
        let dir = root.join(cat);
        let (count, bytes) = count_dir_files(&dir);
        total_files += count;
        total_bytes += bytes;
        categories.push(CategoryStat {
            id: (*cat).to_string(),
            label: (*cat).to_string(),
            file_count: count,
            bytes,
        });
    }

    Ok(LibraryInfo {
        root: cfg.library_root,
        import_mode: cfg.import_mode,
        categories,
        total_files,
        total_bytes,
    })
}

fn count_dir_files(dir: &Path) -> (u64, u64) {
    if !dir.is_dir() {
        return (0, 0);
    }
    let mut count = 0u64;
    let mut bytes = 0u64;
    for entry in WalkDir::new(dir)
        .min_depth(1)
        .max_depth(LIBRARY_WALK_MAX_DEPTH)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        if let Ok(meta) = entry.metadata() {
            count += 1;
            bytes += meta.len();
        }
    }
    (count, bytes)
}

pub struct ListLibraryProgress {
    pub message: String,
    pub processed: u64,
}

const MAX_FOLDER_DEPTH: usize = 8;

fn folder_modified_secs(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn list_folders_in_dir(dir: &Path, category: &str, depth: usize) -> Result<Vec<LibraryFolder>, String> {
    if depth >= MAX_FOLDER_DEPTH {
        return Ok(Vec::new());
    }

    let mut folders = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| format!("读取文件夹失败: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取文件夹失败: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("读取文件夹类型失败: {e}"))?;
        if !file_type.is_dir() {
            continue;
        }

        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }

        let children = list_folders_in_dir(&path, category, depth + 1)?;
        folders.push(LibraryFolder {
            name,
            path: path.to_string_lossy().into_owned(),
            category: category.to_string(),
            modified: folder_modified_secs(&path),
            subfolder_count: children.len() as u32,
            children,
        });
    }

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(folders)
}

pub fn list_library_folders(category: Option<String>) -> Result<Vec<LibraryFolder>, String> {
    let root = ensure_library()?;
    let cats: Vec<&str> = match category.as_deref() {
        None | Some("all") | Some("全部") => CATEGORIES.to_vec(),
        Some("favorites") | Some("收藏") => return Ok(Vec::new()),
        Some(c) if CATEGORIES.contains(&c) => vec![c],
        Some(c) => return Err(format!("未知分类: {c}")),
    };

    let mut folders = Vec::new();
    for cat in cats {
        let dir = root.join(cat);
        if !dir.is_dir() {
            continue;
        }
        folders.extend(list_folders_in_dir(&dir, cat, 0)?);
    }

    folders.sort_by(|a, b| {
        a.category
            .cmp(&b.category)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(folders)
}

fn push_library_file_from_path(
    path: &Path,
    category: &str,
    import_index: &import_log::ImportLogIndex,
    metadata_lookup: &file_metadata::MetadataLookup,
    files: &mut Vec<LibraryFile>,
    processed: &mut u64,
    progress: &mut impl FnMut(ListLibraryProgress) -> Result<(), String>,
) -> Result<(), String> {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return Ok(()),
    };
    if !meta.is_file() {
        return Ok(());
    }

    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let path_str = path.to_string_lossy().into_owned();
    let original_path = import_index.find_original(path);
    let metadata = metadata_lookup.get(path);

    files.push(LibraryFile {
        name: name.clone(),
        path: path_str,
        category: category.to_string(),
        size: meta.len(),
        modified,
        original_path,
        can_restore: true,
        favorite: metadata.favorite,
        tags: metadata.tags,
    });

    *processed += 1;
    progress(ListLibraryProgress {
        message: name,
        processed: *processed,
    })
}

fn list_direct_files_in_directory(
    dir: &Path,
    category: &str,
    import_index: &import_log::ImportLogIndex,
    metadata_lookup: &file_metadata::MetadataLookup,
    files: &mut Vec<LibraryFile>,
    processed: &mut u64,
    progress: &mut impl FnMut(ListLibraryProgress) -> Result<(), String>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取文件夹失败: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取文件夹失败: {e}"))?;
        let path = entry.path();
        push_library_file_from_path(
            &path,
            category,
            import_index,
            metadata_lookup,
            files,
            processed,
            progress,
        )?;
    }
    Ok(())
}

pub fn list_library_files(
    category: Option<String>,
    directory: Option<String>,
) -> Result<Vec<LibraryFile>, String> {
    list_library_files_with_progress(category, directory, |_| Ok(()))
}

pub fn list_library_files_with_progress<F>(
    category: Option<String>,
    directory: Option<String>,
    mut progress: F,
) -> Result<Vec<LibraryFile>, String>
where
    F: FnMut(ListLibraryProgress) -> Result<(), String>,
{
    let root = ensure_library()?;
    let mut files = Vec::new();
    let import_index = import_log::ImportLogIndex::load().unwrap_or_default();
    let metadata_lookup = file_metadata::MetadataLookup::load().unwrap_or_default();
    let mut processed = 0u64;

    if let Some(ref dir_path) = directory {
        if !dir_path.trim().is_empty() {
            let (dir, cat) = validate_library_directory(dir_path)?;
            list_direct_files_in_directory(
                &dir,
                &cat,
                &import_index,
                &metadata_lookup,
                &mut files,
                &mut processed,
                &mut progress,
            )?;
            files.sort_by(|a, b| b.modified.cmp(&a.modified));
            return Ok(files);
        }
    }

    let cats: Vec<&str> = match category.as_deref() {
        None | Some("all") | Some("全部") => CATEGORIES.to_vec(),
        Some(c) if CATEGORIES.contains(&c) => vec![c],
        Some(c) => return Err(format!("未知分类: {c}")),
    };

    for cat in cats {
        let dir = root.join(cat);
        if !dir.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&dir)
            .min_depth(1)
            .max_depth(LIBRARY_WALK_MAX_DEPTH)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            push_library_file_from_path(
                entry.path(),
                cat,
                &import_index,
                &metadata_lookup,
                &mut files,
                &mut processed,
                &mut progress,
            )?;
        }
    }

    files.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(files)
}

fn prepare_library_root(root: &Path) -> Result<(), String> {
    if let Some(parent) = root.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建资料库父目录失败: {e}"))?;
    }
    fs::create_dir_all(root).map_err(|e| format!("创建资料库失败: {e}"))?;
    for cat in CATEGORIES {
        fs::create_dir_all(root.join(cat))
            .map_err(|e| format!("创建分类目录「{cat}」失败: {e}"))?;
    }
    Ok(())
}

pub fn migrate_library_with_progress<F>(
    old_root: &Path,
    new_root: &Path,
    mut progress: F,
) -> Result<u32, String>
where
    F: FnMut(MigrationProgress) -> Result<(), String>,
{
    if !old_root.is_dir() {
        return Ok(0);
    }

    prepare_library_root(new_root)?;

    let mut sources = Vec::new();
    for cat in CATEGORIES {
        let old_cat = old_root.join(cat);
        if !old_cat.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&old_cat)
            .min_depth(1)
            .max_depth(LIBRARY_WALK_MAX_DEPTH)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            sources.push(((*cat).to_string(), entry.into_path()));
        }
    }

    let total = sources.len() as u64;
    progress(MigrationProgress {
        processed: 0,
        total,
        message: "准备迁移资料库".to_string(),
    })?;

    let mut count = 0u32;
    for (cat, src) in sources {
        let file_name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "无效文件名".to_string())?;
        progress(MigrationProgress {
            processed: count as u64,
            total,
            message: file_name.to_string(),
        })?;
        let new_cat = new_root.join(cat);
        let dest = unique_dest_path(&new_cat, file_name);
        move_file(&src, &dest)?;
        import_log::update_path(&src, &dest);
        file_metadata::update_path(&src, &dest);
        count += 1;
    }

    progress(MigrationProgress {
        processed: count as u64,
        total,
        message: "资料库迁移完成".to_string(),
    })?;

    Ok(count)
}

pub fn set_library_root_with_progress<F>(
    new_root: String,
    migrate: bool,
    progress: F,
) -> Result<config::SetLibraryRootResult, String>
where
    F: FnMut(MigrationProgress) -> Result<(), String>,
{
    set_library_root_inner(new_root, migrate, progress)
}

pub fn set_library_root(
    new_root: String,
    migrate: bool,
) -> Result<config::SetLibraryRootResult, String> {
    set_library_root_inner(new_root, migrate, |_| Ok(()))
}

fn set_library_root_inner<F>(
    new_root: String,
    migrate: bool,
    progress: F,
) -> Result<config::SetLibraryRootResult, String>
where
    F: FnMut(MigrationProgress) -> Result<(), String>,
{
    let new_root = new_root.trim().to_string();
    if new_root.is_empty() {
        return Err("资料库路径不能为空".to_string());
    }

    let cfg = config::load_config();
    let old_root = PathBuf::from(&cfg.library_root);
    let new_path = PathBuf::from(&new_root);

    if old_root == new_path {
        return Ok(config::SetLibraryRootResult {
            library_root: new_root,
            migrated_files: 0,
            message: "资料库路径未变更".to_string(),
        });
    }

    let migrated_files = if migrate && old_root.is_dir() {
        migrate_library_with_progress(&old_root, &new_path, progress)?
    } else {
        prepare_library_root(&new_path)?;
        0
    };

    let mut updated = cfg;
    updated.library_root = new_root.clone();
    config::save_config(&updated)?;

    let message = if migrated_files > 0 {
        format!("已迁移 {migrated_files} 个文件到新资料库")
    } else if migrate {
        "已切换到新资料库（原位置无文件可迁移）".to_string()
    } else {
        "已切换到新资料库（原位置文件保留）".to_string()
    };

    Ok(config::SetLibraryRootResult {
        library_root: new_root,
        migrated_files,
        message,
    })
}

fn categories_to_scan(category: Option<String>) -> Result<Vec<String>, String> {
    match category.as_deref() {
        None | Some("all") | Some("全部") => {
            Ok(CATEGORIES.iter().map(|c| (*c).to_string()).collect())
        }
        Some(c) if CATEGORIES.contains(&c) => Ok(vec![c.to_string()]),
        Some(c) => Err(format!("未知分类: {c}")),
    }
}

pub struct ReclassifyProgress {
    pub message: String,
    pub processed: u64,
}

pub fn reclassify_misplaced(
    category: Option<String>,
    dry_run: bool,
) -> Result<ReclassifyResult, String> {
    reclassify_misplaced_with_progress(category, dry_run, |_| Ok(()))
}

pub fn reclassify_misplaced_with_progress<F>(
    category: Option<String>,
    dry_run: bool,
    mut progress: F,
) -> Result<ReclassifyResult, String>
where
    F: FnMut(ReclassifyProgress) -> Result<(), String>,
{
    let root = ensure_library()?;
    let cats = categories_to_scan(category)?;

    let mut moved = Vec::new();
    let mut failed = Vec::new();
    let mut moved_count = 0u32;
    let mut already_correct = 0u32;
    let mut processed = 0u64;

    for cat in cats {
        let dir = root.join(&cat);
        if !dir.is_dir() {
            continue;
        }

        for entry in WalkDir::new(&dir)
            .min_depth(1)
            .max_depth(LIBRARY_WALK_MAX_DEPTH)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let src = entry.path();
            let file_name = src.file_name().and_then(|n| n.to_str()).unwrap_or("");

            if should_skip_desktop_file(file_name) {
                continue;
            }

            processed += 1;
            progress(ReclassifyProgress {
                message: file_name.to_string(),
                processed,
            })?;

            let expected = classify_path(src);
            if expected == cat {
                already_correct += 1;
                continue;
            }

            let item = ReclassifyMove {
                name: file_name.to_string(),
                from_category: cat.clone(),
                to_category: expected.clone(),
            };

            if dry_run {
                moved.push(item);
                moved_count += 1;
                continue;
            }

            let dest_dir = root.join(&expected);
            fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("创建分类目录「{expected}」失败: {e}"))?;
            let dest = unique_dest_path(&dest_dir, file_name);

            match move_file(src, &dest) {
                Ok(()) => {
                    import_log::update_path(src, &dest);
                    file_metadata::update_path(src, &dest);
                    moved.push(item);
                    moved_count += 1;
                }
                Err(e) => failed.push(ImportFailure {
                    path: src.to_string_lossy().into_owned(),
                    reason: e,
                }),
            }
        }
    }

    Ok(ReclassifyResult {
        moved_count,
        already_correct,
        moved,
        failed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn unique_temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "file-manager-{name}-{}-{nanos}",
            std::process::id()
        ))
    }

    #[test]
    fn default_classification_maps_common_extensions() {
        assert_eq!(default_classify_extension("JPG"), "图片");
        assert_eq!(default_classify_extension("mp4"), "视频");
        assert_eq!(default_classify_extension("PDF"), "文档");
        assert_eq!(default_classify_extension("zip"), "压缩包");
        assert_eq!(default_classify_extension("unknown"), "其他");
    }

    #[test]
    fn validate_file_name_blocks_empty_path_segments_and_windows_invalid_chars() {
        assert!(validate_file_name("report.pdf").is_ok());
        assert!(validate_file_name("").is_err());
        assert!(validate_file_name("..").is_err());
        assert!(validate_file_name("bad/name.txt").is_err());
        assert!(validate_file_name("bad:name.txt").is_err());
    }

    #[test]
    fn library_file_path_guard_accepts_inside_file_and_rejects_outside_file() {
        let _guard = env_lock().lock().unwrap();
        let old_appdata = std::env::var_os("APPDATA");
        let temp = unique_temp_dir("path-guard");
        let appdata = temp.join("appdata");
        let root = temp.join("library");
        let config_dir = appdata.join("FileManager");
        fs::create_dir_all(&config_dir).unwrap();

        let config = serde_json::json!({
            "library_root": root.to_string_lossy(),
            "import_mode": "move",
            "import_conflict_strategy": "rename",
            "custom_extension_rules": {},
            "smart_reminder_enabled": true,
            "smart_reminder_threshold": 10
        });
        fs::write(config_dir.join("config.json"), config.to_string()).unwrap();
        std::env::set_var("APPDATA", &appdata);

        ensure_library().unwrap();
        let inside_dir = root.join("文档");
        let inside_file = inside_dir.join("inside.txt");
        fs::write(&inside_file, "inside").unwrap();
        let outside_file = temp.join("outside.txt");
        fs::write(&outside_file, "outside").unwrap();

        let validated = validate_library_file_path(&inside_file.to_string_lossy()).unwrap();
        assert_eq!(
            validated.canonicalize().unwrap(),
            inside_file.canonicalize().unwrap()
        );
        assert!(validate_library_file_path(&outside_file.to_string_lossy()).is_err());

        match old_appdata {
            Some(value) => std::env::set_var("APPDATA", value),
            None => std::env::remove_var("APPDATA"),
        }
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn import_skip_reason_detects_system_and_small_files() {
        assert_eq!(
            import_skip_reason("desktop.ini", 1024),
            Some("系统或快捷方式文件".to_string())
        );
        assert_eq!(
            import_skip_reason("shortcut.lnk", 1024),
            Some("系统或快捷方式文件".to_string())
        );
        assert!(import_skip_reason("notes.txt", 1024).is_none());
    }
}
