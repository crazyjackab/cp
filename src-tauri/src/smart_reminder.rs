use crate::config;
use crate::library::{self, ImportResult};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, UserAttentionType};
use tauri_plugin_notification::NotificationExt;

const MENU_OPEN: &str = "open";
const MENU_IMPORT_DESKTOP: &str = "import_desktop";
const MENU_IMPORT_DOWNLOADS: &str = "import_downloads";
const MENU_CHECK_NOW: &str = "check_now";
const MENU_QUIT: &str = "quit";

const CHECK_INTERVAL: Duration = Duration::from_secs(15 * 60);
const NOTIFY_COOLDOWN: Duration = Duration::from_secs(60 * 60);

#[derive(Debug, Clone, Serialize)]
pub struct SmartReminderStatus {
    pub desktop_count: u32,
    pub downloads_count: u32,
    pub total_count: u32,
    pub threshold: u32,
    pub enabled: bool,
}

#[derive(Debug, Default)]
struct ReminderState {
    last_notified: Option<Instant>,
}

pub fn quick_candidate_counts() -> (u32, u32) {
    let desktop = library::list_desktop_import_candidates()
        .map(|items| items.files.len() as u32)
        .unwrap_or(0);
    let downloads = library::list_downloads_import_candidates()
        .map(|items| items.files.len() as u32)
        .unwrap_or(0);
    (desktop, downloads)
}

pub fn status() -> SmartReminderStatus {
    let cfg = config::load_config();
    let (desktop_count, downloads_count) = quick_candidate_counts();
    SmartReminderStatus {
        desktop_count,
        downloads_count,
        total_count: desktop_count + downloads_count,
        threshold: cfg.smart_reminder_threshold.clamp(1, 500),
        enabled: cfg.smart_reminder_enabled,
    }
}

pub fn import_desktop() -> Result<ImportResult, String> {
    library::import_from_desktop()
}

pub fn import_downloads() -> Result<ImportResult, String> {
    library::import_from_downloads()
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn notify<R: Runtime>(app: &AppHandle<R>, status: &SmartReminderStatus) {
    let body = format!(
        "桌面 {} 个，下载 {} 个。可从托盘一键收纳。",
        status.desktop_count, status.downloads_count
    );
    let sent = app
        .notification()
        .builder()
        .title("File Manager 可收纳文件提醒")
        .body(body)
        .show()
        .is_ok();

    if !sent {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.request_user_attention(Some(UserAttentionType::Informational));
        }
    }
}

fn check_and_notify<R: Runtime>(
    app: &AppHandle<R>,
    state: &Arc<Mutex<ReminderState>>,
    force: bool,
) {
    let status = status();
    if !status.enabled {
        return;
    }
    if status.total_count < status.threshold {
        return;
    }

    let should_notify = {
        let mut state = state.lock().unwrap();
        let elapsed = state
            .last_notified
            .map(|time| time.elapsed() >= NOTIFY_COOLDOWN)
            .unwrap_or(true);
        if force || elapsed {
            state.last_notified = Some(Instant::now());
            true
        } else {
            false
        }
    };

    if should_notify {
        notify(app, &status);
    }
}

fn import_and_notify<R: Runtime>(app: &AppHandle<R>, source: &str) {
    let (paths, label) = match source {
        "desktop" => match crate::library::desktop_import_paths() {
            Ok(paths) => (paths, "桌面"),
            Err(err) => {
                let _ = app
                    .notification()
                    .builder()
                    .title("File Manager 收纳失败")
                    .body(err)
                    .show();
                return;
            }
        },
        "downloads" => match crate::library::downloads_import_paths() {
            Ok(paths) => (paths, "下载"),
            Err(err) => {
                let _ = app
                    .notification()
                    .builder()
                    .title("File Manager 收纳失败")
                    .body(err)
                    .show();
                return;
            }
        },
        _ => return,
    };

    if paths.is_empty() {
        let _ = app
            .notification()
            .builder()
            .title("File Manager")
            .body(format!("{label}没有可收纳的文件。"))
            .show();
        return;
    }

    let _ = crate::spawn_import_files_background(app.clone(), paths, None, None, Some(label));
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, MENU_OPEN, "打开 File Manager", true, None::<&str>)?;
    let import_desktop =
        MenuItem::with_id(app, MENU_IMPORT_DESKTOP, "一键收纳桌面", true, None::<&str>)?;
    let import_downloads = MenuItem::with_id(
        app,
        MENU_IMPORT_DOWNLOADS,
        "一键收纳下载",
        true,
        None::<&str>,
    )?;
    let check_now = MenuItem::with_id(
        app,
        MENU_CHECK_NOW,
        "立即检查可收纳文件",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &import_desktop,
            &import_downloads,
            &check_now,
            &separator,
            &quit,
        ],
    )?;

    let state = Arc::new(Mutex::new(ReminderState::default()));
    let menu_state = Arc::clone(&state);

    TrayIconBuilder::with_id("file-manager-tray")
        .icon(crate::app_icon())
        .tooltip("File Manager")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            MENU_OPEN => show_main_window(app),
            MENU_IMPORT_DESKTOP => {
                import_and_notify(app, "desktop");
                show_main_window(app);
            }
            MENU_IMPORT_DOWNLOADS => {
                import_and_notify(app, "downloads");
                show_main_window(app);
            }
            MENU_CHECK_NOW => check_and_notify(app, &menu_state, true),
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    start_background_checker(app.clone(), state);
    Ok(())
}

fn start_background_checker<R: Runtime>(app: AppHandle<R>, state: Arc<Mutex<ReminderState>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(CHECK_INTERVAL);
        check_and_notify(&app, &state, false);
    });
}
