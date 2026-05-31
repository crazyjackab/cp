use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter, Runtime};

static NEXT_TASK_ID: AtomicU64 = AtomicU64::new(1);

fn registry() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone)]
pub struct BackgroundTask {
    id: String,
    cancel: Arc<AtomicBool>,
}

impl BackgroundTask {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}

#[derive(Serialize, Clone)]
pub struct BackgroundTaskEvent {
    pub task_id: String,
    pub kind: String,
    pub status: String,
    pub message: String,
    pub processed: u64,
    pub total: Option<u64>,
    pub progress: Option<f32>,
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_label: Option<String>,
}

pub fn create(kind: &str) -> BackgroundTask {
    let id = format!("{kind}-{}", NEXT_TASK_ID.fetch_add(1, Ordering::SeqCst));
    let cancel = Arc::new(AtomicBool::new(false));
    registry()
        .lock()
        .unwrap()
        .insert(id.clone(), Arc::clone(&cancel));
    BackgroundTask { id, cancel }
}

pub fn cancel(task_id: &str) -> bool {
    let Some(cancel) = registry().lock().unwrap().get(task_id).cloned() else {
        return false;
    };
    cancel.store(true, Ordering::SeqCst);
    true
}

pub fn finish(task_id: &str) {
    registry().lock().unwrap().remove(task_id);
}

pub fn emit<R: Runtime>(app: &AppHandle<R>, event: BackgroundTaskEvent) {
    let _ = app.emit("background-task", event);
}
