mod config;
mod import_log;
mod library;
mod open_util;
mod preview;
mod scan;
mod thumbnail;

use library::{BatchOperationResult, ImportResult, LibraryFile, LibraryInfo, PendingImportFile, ReclassifyResult};
use scan::ScanResult;
use std::path::PathBuf;
use tauri::{Manager, image::Image};
use config::{AppConfigInfo, SetLibraryRootResult};

fn app_icon() -> Image<'static> {
    Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .expect("failed to load application icon")
}

#[tauri::command]
fn scan_directory(path: String) -> Result<ScanResult, String> {
    scan::scan_directory(&path)
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
fn list_library_files(category: Option<String>) -> Result<Vec<LibraryFile>, String> {
    library::list_library_files(category)
}

#[tauri::command]
fn import_files(paths: Vec<String>) -> Result<ImportResult, String> {
    library::import_paths(paths)
}

#[tauri::command]
fn list_desktop_import_candidates() -> Result<Vec<PendingImportFile>, String> {
    library::list_desktop_import_candidates()
}

#[tauri::command]
fn list_downloads_import_candidates() -> Result<Vec<PendingImportFile>, String> {
    library::list_downloads_import_candidates()
}

#[tauri::command]
fn restore_file(path: String) -> Result<String, String> {
    library::restore_file(&path)
}

#[tauri::command]
fn rename_library_file(path: String, new_name: String) -> Result<String, String> {
    library::rename_library_file(&path, new_name)
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
fn get_app_config() -> Result<AppConfigInfo, String> {
    config::get_app_config_info()
}

#[tauri::command]
fn set_import_mode(mode: String) -> Result<AppConfigInfo, String> {
    config::set_import_mode(&mode)
}

#[tauri::command]
fn set_library_root(new_root: String, migrate: bool) -> Result<SetLibraryRootResult, String> {
    library::set_library_root(new_root, migrate)
}

#[tauri::command]
fn reclassify_misplaced_files(
    category: Option<String>,
    dry_run: Option<bool>,
) -> Result<ReclassifyResult, String> {
    library::reclassify_misplaced(category, dry_run.unwrap_or(false))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let icon = app_icon();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(icon.clone())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            get_quick_paths,
            init_library,
            get_library_info,
            list_library_files,
            import_files,
            list_desktop_import_candidates,
            list_downloads_import_candidates,
            restore_file,
            rename_library_file,
            delete_library_file,
            get_image_data_url,
            get_image_thumbnail,
            get_app_config,
            set_import_mode,
            set_library_root,
            reclassify_misplaced_files,
            read_text_preview,
            batch_delete_library_files,
            batch_restore_files,
            batch_move_to_category,
            open_util::open_file,
            open_util::show_file_in_folder,
            open_util::open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
