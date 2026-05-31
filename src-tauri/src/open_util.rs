use std::path::Path;

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = Path::new(path.trim());
    if !p.exists() {
        return Err(format!("路径不存在: {path}"));
    }
    if !p.is_dir() {
        return Err(format!("不是文件夹: {path}"));
    }
    open::that(p).map_err(|e| format!("无法打开文件夹: {e}"))
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let p = Path::new(path.trim());
    if !p.exists() {
        return Err(format!("文件不存在: {path}"));
    }
    if !p.is_file() {
        return Err(format!("不是文件: {path}"));
    }

    open::that(p).map_err(|e| format!("无法用默认程序打开: {e}"))
}

#[tauri::command]
pub fn show_file_in_folder(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    let p = Path::new(trimmed);
    if !p.exists() {
        return Err(format!("路径不存在: {trimmed}"));
    }

    // 使用 Shell API（SHOpenFolderAndSelectItems）精确定位并选中文件，
    // 避免 explorer /select 与 canonicalize 的 \\?\ 前缀导致定位偏移。
    tauri_plugin_opener::reveal_item_in_dir(p)
        .map_err(|e| format!("无法在资源管理器中显示: {e}"))
}
