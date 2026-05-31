//! 合并 import_log / file_metadata / media_cache 的防抖落盘，避免每次写入都读写整份 JSON。

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const DEBOUNCE_MS: u64 = 400;

static FLUSHER_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn schedule_import_log() {
    start_flusher_if_needed();
}

pub fn schedule_file_metadata() {
    start_flusher_if_needed();
}

pub fn schedule_media_cache() {
    start_flusher_if_needed();
}

fn start_flusher_if_needed() {
    if FLUSHER_RUNNING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
        .is_err()
    {
        return;
    }

    std::thread::spawn(|| {
        loop {
            std::thread::sleep(Duration::from_millis(DEBOUNCE_MS));

            let _ = crate::import_log::persist_if_dirty();
            let _ = crate::file_metadata::persist_if_dirty();
            let _ = crate::media_cache::persist_if_dirty();

            if !crate::import_log::is_dirty()
                && !crate::file_metadata::is_dirty()
                && !crate::media_cache::is_dirty()
            {
                FLUSHER_RUNNING.store(false, Ordering::Release);
                if crate::import_log::is_dirty()
                    || crate::file_metadata::is_dirty()
                    || crate::media_cache::is_dirty()
                {
                    if FLUSHER_RUNNING
                        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
                        .is_ok()
                    {
                        continue;
                    }
                }
                break;
            }
        }
    });
}

/// 立即将内存缓存写入磁盘。
pub fn flush_all() -> Result<(), String> {
    crate::import_log::persist_if_dirty()?;
    crate::file_metadata::persist_if_dirty()?;
    crate::media_cache::persist_if_dirty()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flush_all_completes_without_panic() {
        let _ = flush_all();
    }
}
