mod config;
mod import_log;
mod library;
mod open_util;
mod scan;

use library::{ImportResult, LibraryFile, LibraryInfo, PendingImportFile};
use scan::ScanResult;
use std::path::PathBuf;
use tauri::{Manager, image::Image};

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
            open_util::open_file,
            open_util::show_file_in_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
