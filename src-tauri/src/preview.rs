use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::Path;

const DEFAULT_TEXT_MAX: u64 = 32 * 1024;

#[derive(Serialize)]
pub struct TextPreview {
    pub content: String,
    pub truncated: bool,
    pub byte_count: u64,
}

fn looks_like_text(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return true;
    }
    if bytes.contains(&0) {
        return false;
    }
    let sample = &bytes[..bytes.len().min(4096)];
    let non_text = sample
        .iter()
        .filter(|&&b| b != b'\n' && b != b'\r' && b != b'\t' && (b < 0x20 || b == 0x7f))
        .count();
    non_text * 10 <= sample.len()
}

pub fn read_text_preview(path: &str, max_bytes: Option<u64>) -> Result<TextPreview, String> {
    let max_bytes = max_bytes.unwrap_or(DEFAULT_TEXT_MAX).clamp(512, 256 * 1024);
    let path = Path::new(path);
    if !path.is_file() {
        return Err("文件不存在".to_string());
    }

    let total_size = path
        .metadata()
        .map_err(|e| format!("读取文件信息失败: {e}"))?
        .len();

    let mut file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut buf = vec![0u8; max_bytes as usize];
    let read = file
        .read(&mut buf)
        .map_err(|e| format!("读取文件失败: {e}"))?;
    buf.truncate(read);

    if !looks_like_text(&buf) {
        return Err("该文件可能为二进制格式，无法以文本预览".to_string());
    }

    let content = String::from_utf8_lossy(&buf).into_owned();
    Ok(TextPreview {
        content,
        truncated: total_size > read as u64,
        byte_count: read as u64,
    })
}
