use crate::config;
use crate::import_log;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub const CATEGORIES: &[&str] = &[
    "收件箱", "图片", "视频", "文档", "音频", "压缩包", "安装包", "其他",
];

const IMAGE_EXT: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "svg", "ico", "tif", "tiff",
    "raw", "arw", "cr2", "nef",
];
const VIDEO_EXT: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg", "3gp",
];
const DOC_EXT: &[&str] = &[
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "rtf", "odt", "ods",
    "odp", "csv", "pages", "wps", "et", "dps",
];
const AUDIO_EXT: &[&str] = &["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "ape", "opus"];
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
}

#[derive(Serialize)]
pub struct ImportResult {
    pub moved_count: u32,
    pub failed: Vec<ImportFailure>,
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

pub fn classify_extension(ext: &str) -> &'static str {
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

pub fn classify_path(path: &Path) -> &'static str {
    path.extension()
        .and_then(|e| e.to_str())
        .map(classify_extension)
        .unwrap_or("其他")
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

fn should_skip_desktop_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "desktop.ini"
        || lower == "thumbs.db"
        || lower.ends_with(".lnk")
        || name.starts_with('.')
}

fn unique_dest_path(dir: &Path, file_name: &str) -> PathBuf {
    let dest = dir.join(file_name);
    if !dest.exists() {
        return dest;
    }

    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
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

fn copy_file(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    fs::copy(src, dest).map_err(|e| format!("复制文件失败: {e}"))?;
    Ok(())
}
fn move_file(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }

    match fs::rename(src, dest) {
        Ok(()) => Ok(()),
        Err(e) => {
            let raw = e.raw_os_error();
            // Windows ERROR_NOT_SAME_DEVICE = 17; cross-device move
            if raw == Some(17) || raw == Some(18) {
                fs::copy(src, dest).map_err(|e| format!("复制文件失败: {e}"))?;
                fs::remove_file(src).map_err(|e| format!("删除原文件失败: {e}"))?;
                Ok(())
            } else {
                Err(format!("移动文件失败: {e}"))
            }
        }
    }
}

pub fn import_file(src: &Path, root: &Path) -> Result<PathBuf, String> {
    if !src.is_file() {
        return Err("不是文件".to_string());
    }

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;

    if should_skip_desktop_file(file_name) {
        return Err("已跳过系统或快捷方式文件".to_string());
    }

    let category = classify_path(src);
    let dest_dir = root.join(category);
    fs::create_dir_all(&dest_dir).map_err(|e| format!("创建分类目录失败: {e}"))?;

    let original_path = src
        .canonicalize()
        .unwrap_or_else(|_| src.to_path_buf());
    let dest = unique_dest_path(&dest_dir, file_name);
    let cfg = config::load_config();
    if cfg.import_mode == "copy" {
        copy_file(src, &dest)?;
    } else {
        move_file(src, &dest)?;
    }
    import_log::add_record(&dest, &original_path);
    Ok(dest)
}

pub fn restore_file(library_path: &str) -> Result<String, String> {
    let src = PathBuf::from(library_path);
    if !src.is_file() {
        return Err("资料库中找不到该文件".to_string());
    }

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;

    let original = import_log::find_original(&src).unwrap_or_else(|| {
        user_home()
            .map(|h| h.join("Desktop").join(file_name).to_string_lossy().into_owned())
            .unwrap_or_else(|_| library_path.to_string())
    });

    let mut dest = PathBuf::from(&original);
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            let home = user_home()?;
            dest = home.join("Desktop").join(file_name);
        }
    }

    if dest.exists() {
        let parent = dest
            .parent()
            .ok_or_else(|| "无法确定还原目标目录".to_string())?;
        dest = unique_dest_path(parent, file_name);
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建还原目录失败: {e}"))?;
    }

    move_file(&src, &dest)?;
    import_log::remove_record(&src);

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

pub fn rename_library_file(path: &str, new_name: String) -> Result<String, String> {
    validate_file_name(&new_name)?;
    let new_name = new_name.trim();

    let src = PathBuf::from(path);
    if !src.is_file() {
        return Err("资料库中找不到该文件".to_string());
    }

    let parent = src
        .parent()
        .ok_or_else(|| "无法获取文件所在目录".to_string())?;
    let dest = parent.join(new_name);

    if dest.exists() {
        return Err("该目录下已有同名文件".to_string());
    }

    fs::rename(&src, &dest).map_err(|e| format!("重命名失败: {e}"))?;
    import_log::update_path(&src, &dest);

    Ok(dest.to_string_lossy().into_owned())
}

pub fn delete_library_file(path: &str) -> Result<(), String> {
    let src = PathBuf::from(path);
    if !src.is_file() {
        return Err("资料库中找不到该文件".to_string());
    }

    trash::delete(&src).map_err(|e| format!("删除失败（将尝试放入回收站）: {e}"))?;
    import_log::remove_record(&src);

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
    let src = PathBuf::from(path);
    if !src.is_file() {
        return Err("资料库中找不到该文件".to_string());
    }

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

fn expand_paths_to_files(paths: Vec<String>) -> Vec<PathBuf> {
    let mut files = Vec::new();

    for p in paths {
        let path = PathBuf::from(&p);
        if path.is_file() {
            files.push(path);
        } else if path.is_dir() {
            for entry in WalkDir::new(&path)
                .min_depth(1)
                .max_depth(8)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
            {
                files.push(entry.into_path());
            }
        }
    }

    files
}

pub fn import_paths(paths: Vec<String>) -> Result<ImportResult, String> {
    let root = ensure_library()?;
    let file_paths = expand_paths_to_files(paths);
    let mut moved_count = 0u32;
    let mut failed = Vec::new();

    if file_paths.is_empty() {
        return Err("未找到可收纳的文件（文件夹可能为空）".to_string());
    }

    for src in file_paths {
        let path_str = src.to_string_lossy().into_owned();
        match import_file(&src, &root) {
            Ok(_) => moved_count += 1,
            Err(e) => failed.push(ImportFailure {
                path: path_str,
                reason: e,
            }),
        }
    }

    Ok(ImportResult {
        moved_count,
        failed,
    })
}

pub fn import_from_folder(folder: &Path) -> Result<ImportResult, String> {
    if !folder.is_dir() {
        return Err(format!("文件夹不存在: {}", folder.display()));
    }

    let root = ensure_library()?;
    let mut moved_count = 0u32;
    let mut failed = Vec::new();

    let entries = fs::read_dir(folder).map_err(|e| format!("读取目录失败: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();
        match import_file(&path, &root) {
            Ok(_) => moved_count += 1,
            Err(e) => failed.push(ImportFailure {
                path: path_str,
                reason: e,
            }),
        }
    }

    Ok(ImportResult {
        moved_count,
        failed,
    })
}

pub fn list_import_candidates(folder: &Path) -> Result<Vec<PendingImportFile>, String> {
    if !folder.is_dir() {
        return Err(format!("文件夹不存在: {}", folder.display()));
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(folder).map_err(|e| format!("读取目录失败: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if should_skip_desktop_file(&name) {
            continue;
        }
        let meta = entry.metadata().map_err(|e| format!("读取文件信息失败: {e}"))?;
        files.push(PendingImportFile {
            name,
            path: path.to_string_lossy().into_owned(),
            size: meta.len(),
            target_category: classify_path(&path).to_string(),
        });
    }

    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

pub fn list_desktop_import_candidates() -> Result<Vec<PendingImportFile>, String> {
    let home = user_home()?;
    list_import_candidates(&home.join("Desktop"))
}

pub fn list_downloads_import_candidates() -> Result<Vec<PendingImportFile>, String> {
    let home = user_home()?;
    list_import_candidates(&home.join("Downloads"))
}

pub fn import_from_desktop() -> Result<ImportResult, String> {
    let home = user_home()?;
    let desktop = home.join("Desktop");
    import_from_folder(&desktop)
}

pub fn import_from_downloads() -> Result<ImportResult, String> {
    let home = user_home()?;
    let downloads = home.join("Downloads");
    import_from_folder(&downloads)
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
        .max_depth(5)
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

pub fn list_library_files(category: Option<String>) -> Result<Vec<LibraryFile>, String> {
    let root = ensure_library()?;
    let mut files = Vec::new();

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
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let path_str = path.to_string_lossy().into_owned();
            let original_path = import_log::find_original(path);

            files.push(LibraryFile {
                name: path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string(),
                path: path_str,
                category: (*cat).to_string(),
                size: meta.len(),
                modified,
                original_path,
                can_restore: true,
            });
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
        fs::create_dir_all(root.join(cat)).map_err(|e| format!("创建分类目录「{cat}」失败: {e}"))?;
    }
    Ok(())
}

pub fn migrate_library(old_root: &Path, new_root: &Path) -> Result<u32, String> {
    if !old_root.is_dir() {
        return Ok(0);
    }

    prepare_library_root(new_root)?;

    let mut count = 0u32;
    for cat in CATEGORIES {
        let old_cat = old_root.join(cat);
        if !old_cat.is_dir() {
            continue;
        }
        let new_cat = new_root.join(cat);
        for entry in WalkDir::new(&old_cat)
            .min_depth(1)
            .max_depth(5)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let src = entry.path();
            let file_name = src
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "无效文件名".to_string())?;
            let dest = unique_dest_path(&new_cat, file_name);
            move_file(src, &dest)?;
            import_log::update_path(src, &dest);
            count += 1;
        }
    }
    Ok(count)
}

pub fn set_library_root(new_root: String, migrate: bool) -> Result<config::SetLibraryRootResult, String> {
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
        migrate_library(&old_root, &new_path)?
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
        None | Some("all") | Some("全部") => Ok(CATEGORIES.iter().map(|c| (*c).to_string()).collect()),
        Some(c) if CATEGORIES.contains(&c) => Ok(vec![c.to_string()]),
        Some(c) => Err(format!("未知分类: {c}")),
    }
}

pub fn reclassify_misplaced(category: Option<String>, dry_run: bool) -> Result<ReclassifyResult, String> {
    let root = ensure_library()?;
    let cats = categories_to_scan(category)?;

    let mut moved = Vec::new();
    let mut failed = Vec::new();
    let mut moved_count = 0u32;
    let mut already_correct = 0u32;

    for cat in cats {
        let dir = root.join(&cat);
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
            let src = entry.path();
            let file_name = src
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            if should_skip_desktop_file(file_name) {
                continue;
            }

            let expected = classify_path(src);
            if expected == cat.as_str() {
                already_correct += 1;
                continue;
            }

            let item = ReclassifyMove {
                name: file_name.to_string(),
                from_category: cat.clone(),
                to_category: expected.to_string(),
            };

            if dry_run {
                moved.push(item);
                moved_count += 1;
                continue;
            }

            let dest_dir = root.join(expected);
            fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("创建分类目录「{expected}」失败: {e}"))?;
            let dest = unique_dest_path(&dest_dir, file_name);

            match move_file(src, &dest) {
                Ok(()) => {
                    import_log::update_path(src, &dest);
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
