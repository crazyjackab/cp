use std::path::PathBuf;
use std::sync::mpsc::channel;

#[tauri::command]
pub fn start_native_file_drag(
    window: tauri::WebviewWindow,
    paths: Vec<String>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (window, paths);
        return Err("当前平台暂不支持拖出文件到外部应用".to_string());
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        let files: Vec<PathBuf> = paths
            .into_iter()
            .map(|p| PathBuf::from(p.trim()))
            .filter(|p| p.is_file())
            .collect();

        if files.is_empty() {
            return Err("没有可拖出的文件".to_string());
        }

        let preview = drag::Image::File(
            files
                .first()
                .cloned()
                .unwrap_or_else(|| PathBuf::from(".")),
        );
        let (tx, rx) = channel();
        let window_for_drag = window.clone();

        window
            .run_on_main_thread(move || {
                let result = drag::start_drag(
                    &window_for_drag,
                    drag::DragItem::Files(files),
                    preview,
                    |_result, _cursor| {},
                    drag::Options::default(),
                )
                .map_err(|e| e.to_string());
                let _ = tx.send(result);
            })
            .map_err(|e| format!("启动拖放失败: {e}"))?;

        rx.recv()
            .map_err(|_| "拖放操作未完成".to_string())?
    }
}
