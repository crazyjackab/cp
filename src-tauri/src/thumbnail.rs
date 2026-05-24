use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::GenericImageView;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const THUMB_MAX: u32 = 320;

fn thumbnail_cache_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA 目录".to_string())?;
    Ok(PathBuf::from(appdata)
        .join("FileManager")
        .join("thumbnails"))
}

fn file_modified_secs(path: &Path) -> Result<u64, String> {
    let meta = fs::metadata(path).map_err(|e| format!("读取文件信息失败: {e}"))?;
    let modified = meta
        .modified()
        .map_err(|e| format!("读取修改时间失败: {e}"))?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("时间戳无效: {e}"))?
        .as_secs())
}

fn cache_path(source: &Path, modified: u64, max_size: u32) -> Result<PathBuf, String> {
    let name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image");
    let safe = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '_' })
        .collect::<String>();
    let key = format!("{safe}_{modified}_{max_size}.jpg");
    Ok(thumbnail_cache_dir()?.join(key))
}

fn encode_jpeg_data_url(bytes: &[u8]) -> String {
    format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes))
}

fn resize_image(img: image::DynamicImage, max_size: u32) -> image::DynamicImage {
    let (w, h) = img.dimensions();
    if w <= max_size && h <= max_size {
        return img;
    }
    img.thumbnail(max_size, max_size)
}

fn render_jpeg(img: image::DynamicImage) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    img.write_to(
        &mut Cursor::new(&mut buf),
        image::ImageFormat::Jpeg,
    )
    .map_err(|e| format!("生成缩略图失败: {e}"))?;
    Ok(buf)
}

pub fn get_image_data_url(path: &str, max_size: u32) -> Result<String, String> {
    let max_size = max_size.clamp(64, 2048);
    let source = PathBuf::from(path);
    if !source.is_file() {
        return Err("文件不存在".to_string());
    }

    let modified = file_modified_secs(&source)?;
    let cache_file = cache_path(&source, modified, max_size)?;

    if cache_file.is_file() {
        let bytes = fs::read(&cache_file).map_err(|e| format!("读取缓存失败: {e}"))?;
        if !bytes.is_empty() {
            return Ok(encode_jpeg_data_url(&bytes));
        }
    }

    let img = image::open(&source).map_err(|e| format!("无法解码图片（可能是不支持的格式）: {e}"))?;
    let thumb = resize_image(img, max_size);
    let bytes = render_jpeg(thumb)?;

    if let Some(parent) = cache_file.parent() {
        let _ = fs::create_dir_all(parent);
        let _ = fs::write(&cache_file, &bytes);
    }

    Ok(encode_jpeg_data_url(&bytes))
}

pub fn get_image_thumbnail(path: &str) -> Result<String, String> {
    get_image_data_url(path, THUMB_MAX)
}
