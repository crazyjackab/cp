mod background_task;
mod config;
mod debounced_persist;
mod duplicate;
mod file_metadata;
mod import_log;
mod library;
mod media_cache;
mod media_info;
mod open_util;
mod preview;
mod scan;
mod smart_reminder;
mod thumbnail;

use config::{AppConfigInfo, SetLibraryRootResult};
use duplicate::DuplicateScanResult;
use file_metadata::{FileMetadata, TagStat};
use import_log::ImportRecordView;
use library::{
    BatchOperationResult, ImportCandidatesResult, ImportResult, LibraryFile, LibraryInfo,
    PendingImportFile, ReclassifyResult,
};
use scan::ScanResult;
use serde_json::json;
use smart_reminder::SmartReminderStatus;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{image::Image, Emitter, Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;

const BACKGROUND_PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(250);

fn is_main_window_active<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    app.get_webview_window("main")
        .map(|window| {
            window.is_visible().unwrap_or(false)
                && window.is_focused().unwrap_or(false)
                && !window.is_minimized().unwrap_or(false)
        })
        .unwrap_or(false)
}

fn import_notification_body(result: &ImportResult) -> String {
    let skipped = result.skipped_count;
    let failed = result.failed.len();
    let policy_skipped = &result.skipped_items;
    let skip_detail = if policy_skipped.is_empty() {
        String::new()
    } else {
        let mut system = 0u32;
        let mut small = 0u32;
        for item in policy_skipped {
            if item.reason.contains("系统") {
                system += 1;
            } else if item.reason.contains("小于") {
                small += 1;
            }
        }
        let mut parts = Vec::new();
        if system > 0 {
            parts.push(format!("{system} 个系统/快捷方式"));
        }
        if small > 0 {
            parts.push(format!("{small} 个过小"));
        }
        if parts.is_empty() {
            format!("（{} 个按规则跳过）", policy_skipped.len())
        } else {
            format!("（跳过 {}）", parts.join("、"))
        }
    };
    if failed > 0 {
        format!(
            "已收纳 {} 个，跳过 {} 个{}，{} 个失败。",
            result.moved_count, skipped, skip_detail, failed
        )
    } else if skipped > 0 {
        format!(
            "已收纳 {} 个，跳过 {} 个{}。",
            result.moved_count, skipped, skip_detail
        )
    } else {
        format!("已收纳 {} 个文件。", result.moved_count)
    }
}

fn show_import_result_notification<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    source_label: Option<&str>,
    result: &ImportResult,
) {
    let title = match source_label {
        Some(label) => format!("File Manager {label}收纳完成"),
        None => "File Manager 收纳完成".to_string(),
    };
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(import_notification_body(result))
        .show();
}

fn show_import_failure_notification<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    source_label: Option<&str>,
    message: &str,
) {
    let title = match source_label {
        Some(label) => format!("File Manager {label}收纳失败"),
        None => "File Manager 收纳失败".to_string(),
    };
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(message)
        .show();
}

fn app_icon() -> Image<'static> {
    Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .expect("failed to load application icon")
}

#[tauri::command]
fn scan_directory(path: String) -> Result<ScanResult, String> {
    scan::scan_directory(&path)
}

#[tauri::command]
fn start_scan_directory_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<String, String> {
    let task = background_task::create("scan-directory");
    let task_id = task.id().to_string();
    let app_for_thread = app.clone();
    let task_for_thread = task.clone();
    let task_id_for_thread = task_id.clone();

    std::thread::spawn(move || {
        background_task::emit(
            &app_for_thread,
            background_task::BackgroundTaskEvent {
                task_id: task_id_for_thread.clone(),
                kind: "scan-directory".to_string(),
                status: "running".to_string(),
                message: "正在扫描目录".to_string(),
                processed: 0,
                total: None,
                progress: None,
                result: None,
                source_label: None,
            },
        );

        let mut last_emit = Instant::now() - BACKGROUND_PROGRESS_EMIT_INTERVAL;
        let result = scan::scan_directory_with_progress(&path, |progress| {
            if task_for_thread.is_cancelled() {
                return Err("任务已取消".to_string());
            }
            if progress.processed > 0 && last_emit.elapsed() < BACKGROUND_PROGRESS_EMIT_INTERVAL {
                return Ok(());
            }
            last_emit = Instant::now();
            background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "scan-directory".to_string(),
                    status: "running".to_string(),
                    message: progress.message,
                    processed: progress.processed,
                    total: None,
                    progress: None,
                    result: None,
                    source_label: None,
                },
            );
            Ok(())
        });

        match result {
            Ok(result) => background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "scan-directory".to_string(),
                    status: "completed".to_string(),
                    message: "扫描完成".to_string(),
                    processed: result.file_count,
                    total: Some(result.file_count),
                    progress: Some(1.0),
                    result: Some(json!(result)),
                    source_label: None,
                },
            ),
            Err(err) if task_for_thread.is_cancelled() || err == "任务已取消" => {
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "scan-directory".to_string(),
                        status: "cancelled".to_string(),
                        message: "扫描已取消".to_string(),
                        processed: 0,
                        total: None,
                        progress: None,
                        result: None,
                        source_label: None,
                    },
                );
            }
            Err(err) => background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "scan-directory".to_string(),
                    status: "failed".to_string(),
                    message: err,
                    processed: 0,
                    total: None,
                    progress: None,
                    result: None,
                    source_label: None,
                },
            ),
        }

        background_task::finish(&task_id_for_thread);
    });

    Ok(task_id)
}

#[tauri::command]
fn cancel_background_task(task_id: String) -> Result<bool, String> {
    Ok(background_task::cancel(&task_id))
}

#[tauri::command]
fn get_quick_paths() -> Result<Vec<(String, String)>, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "无法获取用户主目录".to_string())?;
    let home = PathBuf::from(home);
    let mut paths = Vec::new();

    for (label, sub) in [
        ("桌面", "Desktop"),
        ("下载", "Downloads"),
        ("文档", "Documents"),
    ] {
        let p = home.join(sub);
        if p.is_dir() {
            paths.push((label.to_string(), p.to_string_lossy().into_owned()));
        }
    }

    Ok(paths)
}

#[tauri::command]
fn init_library() -> Result<LibraryInfo, String> {
    library::get_library_info()
}

#[tauri::command]
fn get_library_info() -> Result<LibraryInfo, String> {
    library::get_library_info()
}

#[tauri::command]
fn list_library_files(
    category: Option<String>,
    directory: Option<String>,
) -> Result<Vec<LibraryFile>, String> {
    library::list_library_files(category, directory)
}

#[tauri::command]
fn list_library_folders(category: Option<String>) -> Result<Vec<library::LibraryFolder>, String> {
    library::list_library_folders(category)
}

#[tauri::command]
fn start_list_library_files_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    category: Option<String>,
    directory: Option<String>,
) -> Result<String, String> {
    let task = background_task::create("list-library-files");
    let task_id = task.id().to_string();
    let app_for_thread = app.clone();
    let task_for_thread = task.clone();
    let task_id_for_thread = task_id.clone();

    std::thread::spawn(move || {
        background_task::emit(
            &app_for_thread,
            background_task::BackgroundTaskEvent {
                task_id: task_id_for_thread.clone(),
                kind: "list-library-files".to_string(),
                status: "running".to_string(),
                message: "正在加载资料库".to_string(),
                processed: 0,
                total: None,
                progress: None,
                result: None,
                source_label: None,
            },
        );

        let mut last_emit = Instant::now() - BACKGROUND_PROGRESS_EMIT_INTERVAL;
        let result =
            library::list_library_files_with_progress(category, directory, |progress| {
            if task_for_thread.is_cancelled() {
                return Err("任务已取消".to_string());
            }
            if progress.processed > 0 && last_emit.elapsed() < BACKGROUND_PROGRESS_EMIT_INTERVAL {
                return Ok(());
            }
            last_emit = Instant::now();
            background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "list-library-files".to_string(),
                    status: "running".to_string(),
                    message: progress.message,
                    processed: progress.processed,
                    total: None,
                    progress: None,
                    result: None,
                    source_label: None,
                },
            );
            Ok(())
        });

        match result {
            Ok(files) => {
                let count = files.len() as u64;
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "list-library-files".to_string(),
                        status: "completed".to_string(),
                        message: "资料库列表已更新".to_string(),
                        processed: count,
                        total: Some(count),
                        progress: Some(1.0),
                        result: Some(json!(files)),
                        source_label: None,
                    },
                );
            }
            Err(err) if task_for_thread.is_cancelled() || err == "任务已取消" => {
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "list-library-files".to_string(),
                        status: "cancelled".to_string(),
                        message: "加载已取消".to_string(),
                        processed: 0,
                        total: None,
                        progress: None,
                        result: None,
                        source_label: None,
                    },
                );
            }
            Err(err) => background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "list-library-files".to_string(),
                    status: "failed".to_string(),
                    message: err,
                    processed: 0,
                    total: None,
                    progress: None,
                    result: None,
                    source_label: None,
                },
            ),
        }

        background_task::finish(&task_id_for_thread);
    });

    Ok(task_id)
}

#[tauri::command]
fn import_files(
    paths: Vec<String>,
    conflict_strategy: Option<String>,
    target_directory: Option<String>,
) -> Result<ImportResult, String> {
    library::import_paths_with_target(paths, conflict_strategy, target_directory)
}

pub(crate) fn spawn_import_files_background<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    conflict_strategy: Option<String>,
    target_directory: Option<String>,
    source_label: Option<&'static str>,
) -> Result<String, String> {
    if paths.is_empty() {
        return Err("没有可收纳的文件".to_string());
    }

    let task = background_task::create("import-files");
    let task_id = task.id().to_string();
    let app_for_thread = app.clone();
    let task_for_thread = task.clone();
    let task_id_for_thread = task_id.clone();

    std::thread::spawn(move || {
        emit_batch_progress(
            &app_for_thread,
            &task_id_for_thread,
            "import-files",
            "准备收纳".to_string(),
            0,
            0,
        );

        let mut last_emit = Instant::now() - BACKGROUND_PROGRESS_EMIT_INTERVAL;
        let result = library::import_paths_with_progress(
            paths,
            conflict_strategy,
            target_directory,
            |progress| {
            if task_for_thread.is_cancelled() {
                return Err("任务已取消".to_string());
            }
            if progress.processed > 0 && last_emit.elapsed() < BACKGROUND_PROGRESS_EMIT_INTERVAL {
                return Ok(());
            }
            last_emit = Instant::now();
            emit_batch_progress(
                &app_for_thread,
                &task_id_for_thread,
                "import-files",
                progress.message,
                progress.processed,
                progress.total,
            );
            Ok(())
        });

        match result {
            Ok(result) => {
                let _ = app_for_thread.emit("library:changed", ());
                if !is_main_window_active(&app_for_thread) {
                    show_import_result_notification(&app_for_thread, source_label, &result);
                }
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "import-files".to_string(),
                        status: "completed".to_string(),
                        message: "收纳完成".to_string(),
                        processed: result.moved_count as u64 + result.skipped_count as u64,
                        total: Some(
                            result.moved_count as u64
                                + result.skipped_count as u64
                                + result.failed.len() as u64,
                        ),
                        progress: Some(1.0),
                        result: Some(json!(result)),
                        source_label: source_label.map(str::to_string),
                    },
                );
            }
            Err(err) if task_for_thread.is_cancelled() || err == "任务已取消" => {
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "import-files".to_string(),
                        status: "cancelled".to_string(),
                        message: "收纳已取消".to_string(),
                        processed: 0,
                        total: None,
                        progress: None,
                        result: None,
                        source_label: source_label.map(str::to_string),
                    },
                );
            }
            Err(err) => {
                if !is_main_window_active(&app_for_thread) {
                    show_import_failure_notification(&app_for_thread, source_label, &err);
                }
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "import-files".to_string(),
                        status: "failed".to_string(),
                        message: err,
                        processed: 0,
                        total: None,
                        progress: None,
                        result: None,
                        source_label: source_label.map(str::to_string),
                    },
                );
            }
        }

        background_task::finish(&task_id_for_thread);
    });

    Ok(task_id)
}

#[tauri::command]
fn start_import_files_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    conflict_strategy: Option<String>,
    targetDirectory: Option<String>,
) -> Result<String, String> {
    spawn_import_files_background(app, paths, conflict_strategy, targetDirectory, None)
}

#[tauri::command]
fn move_library_file_to_directory(
    app: tauri::AppHandle,
    path: String,
    targetDirectory: String,
) -> Result<String, String> {
    let result = library::move_library_file_to_directory(&path, &targetDirectory)?;
    let _ = app.emit("library:changed", ());
    Ok(result)
}

#[tauri::command]
fn start_import_from_desktop_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let paths = library::desktop_import_paths()?;
    spawn_import_files_background(app, paths, None, None, Some("桌面"))
}

#[tauri::command]
fn start_import_from_downloads_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let paths = library::downloads_import_paths()?;
    spawn_import_files_background(app, paths, None, None, Some("下载"))
}

#[tauri::command]
fn preview_import_candidates(paths: Vec<String>) -> Result<ImportCandidatesResult, String> {
    library::preview_import_candidates(paths)
}

#[tauri::command]
fn list_desktop_import_candidates() -> Result<ImportCandidatesResult, String> {
    library::list_desktop_import_candidates()
}

#[tauri::command]
fn list_downloads_import_candidates() -> Result<ImportCandidatesResult, String> {
    library::list_downloads_import_candidates()
}

#[tauri::command]
fn restore_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let result = library::restore_file(&path)?;
    let _ = app.emit("library:changed", ());
    Ok(result)
}

#[tauri::command]
fn rename_library_file(path: String, new_name: String) -> Result<String, String> {
    library::rename_library_file(&path, new_name)
}

#[tauri::command]
fn create_library_folder(
    app: tauri::AppHandle,
    category: Option<String>,
    name: String,
    parentDirectory: Option<String>,
) -> Result<String, String> {
    let path = library::create_library_folder(category, name, parentDirectory)?;
    let _ = app.emit("library:changed", ());
    Ok(path)
}

#[tauri::command]
fn delete_library_file(path: String) -> Result<(), String> {
    library::delete_library_file(&path)
}

#[tauri::command]
fn get_image_data_url(path: String, max_size: Option<u32>) -> Result<String, String> {
    thumbnail::get_image_data_url(&path, max_size.unwrap_or(320))
}

#[tauri::command]
fn get_image_thumbnail(path: String) -> Result<String, String> {
    thumbnail::get_image_thumbnail(&path)
}

#[tauri::command]
fn get_media_info(path: String) -> Result<media_info::MediaInfo, String> {
    Ok(media_cache::read_media_info_cached(&path))
}

#[tauri::command]
fn get_media_info_batch(paths: Vec<String>) -> Vec<media_info::MediaInfoEntry> {
    media_cache::read_media_info_batch_cached(paths)
}

#[tauri::command]
fn get_app_config() -> Result<AppConfigInfo, String> {
    config::get_app_config_info()
}

#[tauri::command]
fn set_import_mode(mode: String) -> Result<AppConfigInfo, String> {
    config::set_import_mode(&mode)
}

#[tauri::command]
fn set_import_conflict_strategy(strategy: String) -> Result<AppConfigInfo, String> {
    config::set_import_conflict_strategy(&strategy)
}

#[tauri::command]
fn set_import_destination(destination: String) -> Result<AppConfigInfo, String> {
    config::set_import_destination(&destination)
}

#[tauri::command]
fn set_import_min_size_kb(min_kb: u32) -> Result<AppConfigInfo, String> {
    config::set_import_min_size_kb(min_kb)
}

#[tauri::command]
fn set_custom_extension_rule(extension: String, category: String) -> Result<AppConfigInfo, String> {
    config::set_custom_extension_rule(&extension, &category)
}

#[tauri::command]
fn remove_custom_extension_rule(extension: String) -> Result<AppConfigInfo, String> {
    config::remove_custom_extension_rule(&extension)
}

#[tauri::command]
fn set_smart_reminder(enabled: bool, threshold: u32) -> Result<AppConfigInfo, String> {
    config::set_smart_reminder(enabled, threshold)
}

#[tauri::command]
fn set_defer_library_load(enabled: bool, threshold: u32) -> Result<AppConfigInfo, String> {
    config::set_defer_library_load(enabled, threshold)
}

#[tauri::command]
fn get_smart_reminder_status() -> Result<SmartReminderStatus, String> {
    Ok(smart_reminder::status())
}

#[tauri::command]
fn import_from_desktop_quick() -> Result<ImportResult, String> {
    smart_reminder::import_desktop()
}

#[tauri::command]
fn import_from_downloads_quick() -> Result<ImportResult, String> {
    smart_reminder::import_downloads()
}

#[tauri::command]
fn set_library_root(new_root: String, migrate: bool) -> Result<SetLibraryRootResult, String> {
    library::set_library_root(new_root, migrate)
}

#[tauri::command]
fn start_set_library_root_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    new_root: String,
    migrate: bool,
) -> Result<String, String> {
    let task = background_task::create("library-migration");
    let task_id = task.id().to_string();
    let app_for_thread = app.clone();
    let task_for_thread = task.clone();
    let task_id_for_thread = task_id.clone();

    std::thread::spawn(move || {
        background_task::emit(
            &app_for_thread,
            background_task::BackgroundTaskEvent {
                task_id: task_id_for_thread.clone(),
                kind: "library-migration".to_string(),
                status: "running".to_string(),
                message: if migrate {
                    "正在迁移资料库".to_string()
                } else {
                    "正在切换资料库路径".to_string()
                },
                processed: 0,
                total: None,
                progress: None,
                result: None,
                source_label: None,
            },
        );

        let mut last_emit = Instant::now() - BACKGROUND_PROGRESS_EMIT_INTERVAL;
        let result = library::set_library_root_with_progress(new_root, migrate, |progress| {
            if task_for_thread.is_cancelled() {
                return Err("任务已取消".to_string());
            }
            if progress.processed > 0 && last_emit.elapsed() < BACKGROUND_PROGRESS_EMIT_INTERVAL {
                return Ok(());
            }
            last_emit = Instant::now();
            let ratio = if progress.total > 0 {
                Some((progress.processed as f32 / progress.total as f32).clamp(0.0, 1.0))
            } else {
                None
            };
            background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "library-migration".to_string(),
                    status: "running".to_string(),
                    message: progress.message,
                    processed: progress.processed,
                    total: Some(progress.total),
                    progress: ratio,
                    result: None,
                    source_label: None,
                },
            );
            Ok(())
        });

        match result {
            Ok(result) => background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "library-migration".to_string(),
                    status: "completed".to_string(),
                    message: result.message.clone(),
                    processed: result.migrated_files as u64,
                    total: Some(result.migrated_files as u64),
                    progress: Some(1.0),
                    result: Some(json!(result)),
                    source_label: None,
                },
            ),
            Err(err) if task_for_thread.is_cancelled() || err == "任务已取消" => {
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "library-migration".to_string(),
                        status: "cancelled".to_string(),
                        message: "资料库迁移已取消".to_string(),
                        processed: 0,
                        total: None,
                        progress: None,
                        result: None,
                        source_label: None,
                    },
                );
            }
            Err(err) => background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "library-migration".to_string(),
                    status: "failed".to_string(),
                    message: err,
                    processed: 0,
                    total: None,
                    progress: None,
                    result: None,
                    source_label: None,
                },
            ),
        }

        background_task::finish(&task_id_for_thread);
    });

    Ok(task_id)
}

#[tauri::command]
fn reclassify_misplaced_files(
    category: Option<String>,
    dry_run: Option<bool>,
) -> Result<ReclassifyResult, String> {
    library::reclassify_misplaced(category, dry_run.unwrap_or(false))
}

#[tauri::command]
fn start_reclassify_misplaced_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    category: Option<String>,
) -> Result<String, String> {
    let task = background_task::create("reclassify-files");
    let task_id = task.id().to_string();
    let app_for_thread = app.clone();
    let task_for_thread = task.clone();
    let task_id_for_thread = task_id.clone();

    std::thread::spawn(move || {
        background_task::emit(
            &app_for_thread,
            background_task::BackgroundTaskEvent {
                task_id: task_id_for_thread.clone(),
                kind: "reclassify-files".to_string(),
                status: "running".to_string(),
                message: "正在整理分类".to_string(),
                processed: 0,
                total: None,
                progress: None,
                result: None,
                source_label: None,
            },
        );

        let mut last_emit = Instant::now() - BACKGROUND_PROGRESS_EMIT_INTERVAL;
        let result = library::reclassify_misplaced_with_progress(category, false, |progress| {
            if task_for_thread.is_cancelled() {
                return Err("任务已取消".to_string());
            }
            if progress.processed > 0 && last_emit.elapsed() < BACKGROUND_PROGRESS_EMIT_INTERVAL {
                return Ok(());
            }
            last_emit = Instant::now();
            background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "reclassify-files".to_string(),
                    status: "running".to_string(),
                    message: progress.message,
                    processed: progress.processed,
                    total: None,
                    progress: None,
                    result: None,
                    source_label: None,
                },
            );
            Ok(())
        });

        match result {
            Ok(result) => {
                let _ = app_for_thread.emit("library:changed", ());
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "reclassify-files".to_string(),
                        status: "completed".to_string(),
                        message: "分类整理完成".to_string(),
                        processed: result.moved_count as u64,
                        total: Some(result.moved_count as u64),
                        progress: Some(1.0),
                        result: Some(json!(result)),
                        source_label: None,
                    },
                );
            }
            Err(err) if task_for_thread.is_cancelled() || err == "任务已取消" => {
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "reclassify-files".to_string(),
                        status: "cancelled".to_string(),
                        message: "整理已取消".to_string(),
                        processed: 0,
                        total: None,
                        progress: None,
                        result: None,
                        source_label: None,
                    },
                );
            }
            Err(err) => background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "reclassify-files".to_string(),
                    status: "failed".to_string(),
                    message: err,
                    processed: 0,
                    total: None,
                    progress: None,
                    result: None,
                    source_label: None,
                },
            ),
        }

        background_task::finish(&task_id_for_thread);
    });

    Ok(task_id)
}

#[tauri::command]
fn read_text_preview(path: String, max_bytes: Option<u64>) -> Result<preview::TextPreview, String> {
    preview::read_text_preview(&path, max_bytes)
}

#[tauri::command]
fn batch_delete_library_files(paths: Vec<String>) -> Result<BatchOperationResult, String> {
    library::batch_delete_library_files(paths)
}

#[tauri::command]
fn batch_restore_files(paths: Vec<String>) -> Result<BatchOperationResult, String> {
    library::batch_restore_files(paths)
}

#[tauri::command]
fn batch_move_to_category(
    paths: Vec<String>,
    target_category: String,
) -> Result<BatchOperationResult, String> {
    library::batch_move_to_category(paths, target_category)
}

fn emit_batch_progress<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    task_id: &str,
    kind: &str,
    message: String,
    processed: u64,
    total: u64,
) {
    let progress = if total > 0 {
        Some((processed as f32 / total as f32).clamp(0.0, 1.0))
    } else {
        None
    };
    background_task::emit(
        app,
        background_task::BackgroundTaskEvent {
            task_id: task_id.to_string(),
            kind: kind.to_string(),
            status: "running".to_string(),
            message,
            processed,
            total: Some(total),
            progress,
            result: None,
            source_label: None,
        },
    );
}

fn start_batch_task<R, F>(
    app: tauri::AppHandle<R>,
    kind: &'static str,
    paths: Vec<String>,
    mut operation: F,
) -> Result<String, String>
where
    R: tauri::Runtime,
    F: FnMut(&str) -> Result<(), String> + Send + 'static,
{
    if paths.is_empty() {
        return Err("请选择至少一个文件".to_string());
    }

    let task = background_task::create(kind);
    let task_id = task.id().to_string();
    let app_for_thread = app.clone();
    let task_for_thread = task.clone();
    let task_id_for_thread = task_id.clone();

    std::thread::spawn(move || {
        let total = paths.len() as u64;
        let mut success_count = 0u32;
        let mut failed = Vec::new();

        emit_batch_progress(
            &app_for_thread,
            &task_id_for_thread,
            kind,
            "准备处理批量任务".to_string(),
            0,
            total,
        );

        for (index, path) in paths.into_iter().enumerate() {
            if task_for_thread.is_cancelled() {
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: kind.to_string(),
                        status: "cancelled".to_string(),
                        message: "批量任务已取消".to_string(),
                        processed: index as u64,
                        total: Some(total),
                        progress: None,
                        result: None,
                        source_label: None,
                    },
                );
                background_task::finish(&task_id_for_thread);
                return;
            }

            let name = PathBuf::from(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let progress_message = if name.is_empty() {
                path.clone()
            } else {
                name
            };

            match operation(&path) {
                Ok(()) => success_count += 1,
                Err(reason) => failed.push(library::ImportFailure { path, reason }),
            }

            emit_batch_progress(
                &app_for_thread,
                &task_id_for_thread,
                kind,
                progress_message,
                (index + 1) as u64,
                total,
            );
        }

        let result = BatchOperationResult {
            success_count,
            failed,
        };
        if success_count > 0 {
            let _ = app_for_thread.emit("library:changed", ());
        }
        background_task::emit(
            &app_for_thread,
            background_task::BackgroundTaskEvent {
                task_id: task_id_for_thread.clone(),
                kind: kind.to_string(),
                status: "completed".to_string(),
                message: "批量任务完成".to_string(),
                processed: total,
                total: Some(total),
                progress: Some(1.0),
                result: Some(json!(result)),
                source_label: None,
            },
        );
        background_task::finish(&task_id_for_thread);
    });

    Ok(task_id)
}

#[tauri::command]
fn start_batch_delete_library_files_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
) -> Result<String, String> {
    start_batch_task(app, "batch-delete", paths, library::delete_library_file)
}

#[tauri::command]
fn start_batch_restore_files_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
) -> Result<String, String> {
    start_batch_task(app, "batch-restore", paths, |path| {
        library::restore_file(path).map(|_| ())
    })
}

#[tauri::command]
fn start_batch_move_to_category_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    target_category: String,
) -> Result<String, String> {
    start_batch_task(app, "batch-move", paths, move |path| {
        library::move_file_to_category(path, &target_category).map(|_| ())
    })
}

#[tauri::command]
fn list_import_records() -> Result<Vec<ImportRecordView>, String> {
    import_log::list_records()
}

#[tauri::command]
fn scan_library_duplicates() -> Result<DuplicateScanResult, String> {
    duplicate::scan_library_duplicates()
}

#[tauri::command]
fn start_scan_library_duplicates_task<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let task = background_task::create("scan-duplicates");
    let task_id = task.id().to_string();
    let app_for_thread = app.clone();
    let task_for_thread = task.clone();
    let task_id_for_thread = task_id.clone();

    std::thread::spawn(move || {
        background_task::emit(
            &app_for_thread,
            background_task::BackgroundTaskEvent {
                task_id: task_id_for_thread.clone(),
                kind: "scan-duplicates".to_string(),
                status: "running".to_string(),
                message: "正在扫描资料库".to_string(),
                processed: 0,
                total: None,
                progress: None,
                result: None,
                source_label: None,
            },
        );

        let mut last_emit = Instant::now() - BACKGROUND_PROGRESS_EMIT_INTERVAL;
        let result = duplicate::scan_library_duplicates_with_progress(|progress| {
            if task_for_thread.is_cancelled() {
                return Err("任务已取消".to_string());
            }
            if progress.processed > 0 && last_emit.elapsed() < BACKGROUND_PROGRESS_EMIT_INTERVAL {
                return Ok(());
            }
            last_emit = Instant::now();
            let ratio = progress
                .total
                .filter(|total| *total > 0)
                .map(|total| (progress.processed as f32 / total as f32).clamp(0.0, 1.0));
            background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "scan-duplicates".to_string(),
                    status: "running".to_string(),
                    message: progress.message,
                    processed: progress.processed,
                    total: progress.total,
                    progress: ratio,
                    result: None,
                    source_label: None,
                },
            );
            Ok(())
        });

        match result {
            Ok(result) => background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "scan-duplicates".to_string(),
                    status: "completed".to_string(),
                    message: "重复文件扫描完成".to_string(),
                    processed: result.hashed_file_count,
                    total: Some(result.hashed_file_count),
                    progress: Some(1.0),
                    result: Some(json!(result)),
                    source_label: None,
                },
            ),
            Err(err) if task_for_thread.is_cancelled() || err == "任务已取消" => {
                background_task::emit(
                    &app_for_thread,
                    background_task::BackgroundTaskEvent {
                        task_id: task_id_for_thread.clone(),
                        kind: "scan-duplicates".to_string(),
                        status: "cancelled".to_string(),
                        message: "扫描已取消".to_string(),
                        processed: 0,
                        total: None,
                        progress: None,
                        result: None,
                        source_label: None,
                    },
                );
            }
            Err(err) => background_task::emit(
                &app_for_thread,
                background_task::BackgroundTaskEvent {
                    task_id: task_id_for_thread.clone(),
                    kind: "scan-duplicates".to_string(),
                    status: "failed".to_string(),
                    message: err,
                    processed: 0,
                    total: None,
                    progress: None,
                    result: None,
                    source_label: None,
                },
            ),
        }

        background_task::finish(&task_id_for_thread);
    });

    Ok(task_id)
}

#[tauri::command]
fn set_file_favorite(path: String, favorite: bool) -> Result<FileMetadata, String> {
    let path = library::validate_library_file_path(&path)?;
    file_metadata::set_favorite(path.as_path(), favorite)
}

#[tauri::command]
fn set_file_tags(path: String, tags: Vec<String>) -> Result<FileMetadata, String> {
    let path = library::validate_library_file_path(&path)?;
    file_metadata::set_tags(path.as_path(), tags)
}

#[tauri::command]
fn list_file_tags() -> Result<Vec<String>, String> {
    file_metadata::all_tag_names()
}

#[tauri::command]
fn get_tag_stats() -> Result<Vec<TagStat>, String> {
    file_metadata::tag_stats()
}

#[tauri::command]
fn get_file_metadata_path() -> Result<String, String> {
    Ok(file_metadata::metadata_path()?
        .to_string_lossy()
        .into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let icon = app_icon();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(icon.clone())?;
                let window_for_close = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = debounced_persist::flush_all();
                        let _ = window_for_close.hide();
                    }
                });
            }
            smart_reminder::setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            start_scan_directory_task,
            cancel_background_task,
            get_quick_paths,
            init_library,
            get_library_info,
            list_library_files,
            list_library_folders,
            start_list_library_files_task,
            import_files,
            start_import_files_task,
            move_library_file_to_directory,
            start_import_from_desktop_task,
            start_import_from_downloads_task,
            preview_import_candidates,
            list_desktop_import_candidates,
            list_downloads_import_candidates,
            restore_file,
            rename_library_file,
            create_library_folder,
            delete_library_file,
            get_image_data_url,
            get_image_thumbnail,
            get_media_info,
            get_media_info_batch,
            get_app_config,
            set_import_mode,
            set_import_conflict_strategy,
            set_import_destination,
            set_import_min_size_kb,
            set_custom_extension_rule,
            remove_custom_extension_rule,
            set_smart_reminder,
            set_defer_library_load,
            get_smart_reminder_status,
            import_from_desktop_quick,
            import_from_downloads_quick,
            set_library_root,
            start_set_library_root_task,
            reclassify_misplaced_files,
            start_reclassify_misplaced_task,
            read_text_preview,
            batch_delete_library_files,
            batch_restore_files,
            batch_move_to_category,
            start_batch_delete_library_files_task,
            start_batch_restore_files_task,
            start_batch_move_to_category_task,
            list_import_records,
            scan_library_duplicates,
            start_scan_library_duplicates_task,
            set_file_favorite,
            set_file_tags,
            list_file_tags,
            get_tag_stats,
            get_file_metadata_path,
            open_util::open_file,
            open_util::show_file_in_folder,
            open_util::open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
