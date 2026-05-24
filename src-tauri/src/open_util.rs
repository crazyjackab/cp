use std::path::Path;

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
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
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {path}"));
    }

    #[cfg(target_os = "windows")]
    {
        let canon = p
            .canonicalize()
            .map_err(|e| format!("路径无效: {e}"))?;
        let arg = format!("/select,\"{}\"", canon.display());
        std::process::Command::new("explorer")
            .arg(arg)
            .spawn()
            .map_err(|e| format!("无法在资源管理器中显示: {e}"))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(parent) = p.parent() {
            open::that(parent).map_err(|e| format!("无法打开所在文件夹: {e}"))?;
        }
    }

    Ok(())
}
