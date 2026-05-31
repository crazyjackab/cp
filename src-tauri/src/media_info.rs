use base64::{engine::general_purpose::STANDARD, Engine as _};
use lofty::file::TaggedFileExt;
use lofty::picture::PictureType;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::path::Path;
use symphonia::core::codecs::{
    CodecType, CODEC_TYPE_AAC, CODEC_TYPE_FLAC, CODEC_TYPE_MP3, CODEC_TYPE_NULL, CODEC_TYPE_OPUS,
    CODEC_TYPE_VORBIS,
};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

const MAX_COVER_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MediaInfo {
    pub duration_secs: Option<f64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub artist: Option<String>,
    pub title: Option<String>,
    pub album: Option<String>,
    pub cover_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MediaInfoEntry {
    pub path: String,
    pub info: MediaInfo,
}

fn is_audio_ext(ext: &str) -> bool {
    matches!(
        ext,
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" | "ape" | "opus"
    )
}

fn is_video_ext(ext: &str) -> bool {
    matches!(
        ext,
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpeg" | "mpg" | "3gp"
    )
}

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn is_audio_codec(codec: CodecType) -> bool {
    matches!(
        codec,
        CODEC_TYPE_MP3 | CODEC_TYPE_AAC | CODEC_TYPE_FLAC | CODEC_TYPE_VORBIS | CODEC_TYPE_OPUS
    )
}

fn codec_label(codec: CodecType) -> Option<String> {
    if codec == CODEC_TYPE_NULL {
        return None;
    }
    if let Some(label) = match codec {
        CODEC_TYPE_MP3 => Some("MP3"),
        CODEC_TYPE_AAC => Some("AAC"),
        CODEC_TYPE_FLAC => Some("FLAC"),
        CODEC_TYPE_VORBIS => Some("Vorbis"),
        CODEC_TYPE_OPUS => Some("Opus"),
        _ => None,
    } {
        return Some(label.to_string());
    }
    Some(format!("{codec:?}"))
}

fn picture_to_data_url(mime: &str, data: &[u8]) -> Option<String> {
    if data.is_empty() || data.len() > MAX_COVER_BYTES {
        return None;
    }
    let mime = match mime {
        "image/jpeg" | "image/jpg" => "image/jpeg",
        "image/png" => "image/png",
        "image/gif" => "image/gif",
        "image/webp" => "image/webp",
        _ => "image/jpeg",
    };
    Some(format!("data:{mime};base64,{}", STANDARD.encode(data)))
}

fn read_audio_tags(path: &Path, info: &mut MediaInfo) {
    let tagged = match Probe::open(path).and_then(|p| p.read()) {
        Ok(t) => t,
        Err(_) => return,
    };

    if let Some(tag) = tagged.primary_tag() {
        info.artist = tag.artist().map(|s| s.to_string());
        info.title = tag.title().map(|s| s.to_string());
        info.album = tag.album().map(|s| s.to_string());
    }

    if info.cover_data_url.is_none() {
        if let Some(tag) = tagged.primary_tag() {
            for picture in tag.pictures() {
                if picture.pic_type() == PictureType::CoverFront || info.cover_data_url.is_none() {
                    let mime = picture
                        .mime_type()
                        .map(|m| m.as_str())
                        .unwrap_or("image/jpeg");
                    if let Some(url) = picture_to_data_url(mime, picture.data()) {
                        info.cover_data_url = Some(url);
                        break;
                    }
                }
            }
        }
    }
}

fn is_video_codec(codec: CodecType) -> bool {
    codec != CODEC_TYPE_NULL && !is_audio_codec(codec)
}

fn probe_symphonia(path: &Path, info: &mut MediaInfo) {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return,
    };

    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let hint = Hint::new();
    let probed = match symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    ) {
        Ok(p) => p,
        Err(_) => return,
    };

    let format = probed.format;
    let mut best_duration: Option<f64> = None;

    for track in format.tracks() {
        let params = &track.codec_params;
        if let Some(label) = codec_label(params.codec) {
            if params.sample_rate.is_some() {
                if info.audio_codec.is_none() {
                    info.audio_codec = Some(label);
                }
            } else if is_video_codec(params.codec) && info.video_codec.is_none() {
                info.video_codec = Some(label);
            }
        }

        if let (Some(n_frames), Some(tb)) = (params.n_frames, params.time_base) {
            let time = tb.calc_time(n_frames);
            let secs = time.seconds as f64 + time.frac as f64 / u32::MAX as f64;
            best_duration = Some(best_duration.map_or(secs, |d| d.max(secs)));
        }
    }

    if info.duration_secs.is_none() {
        info.duration_secs = best_duration;
    }
}

fn try_ffprobe(path: &Path, info: &mut MediaInfo) {
    if info.duration_secs.is_some() && info.video_codec.is_some() {
        return;
    }

    let path_str = match path.to_str() {
        Some(s) => s,
        None => return,
    };

    let output = match std::process::Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path_str,
        ])
        .output()
    {
        Ok(o) if o.status.success() => o.stdout,
        _ => return,
    };

    let json: serde_json::Value = match serde_json::from_slice(&output) {
        Ok(v) => v,
        Err(_) => return,
    };

    if info.duration_secs.is_none() {
        if let Some(dur) = json
            .pointer("/format/duration")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
        {
            info.duration_secs = Some(dur);
        }
    }

    if let Some(streams) = json.get("streams").and_then(|s| s.as_array()) {
        for stream in streams {
            let codec_type = stream.get("codec_type").and_then(|v| v.as_str());
            let codec_name = stream
                .get("codec_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_uppercase());
            match codec_type {
                Some("video") if info.video_codec.is_none() => {
                    info.video_codec = codec_name;
                    info.width = stream
                        .get("width")
                        .and_then(|v| v.as_u64())
                        .map(|w| w as u32);
                    info.height = stream
                        .get("height")
                        .and_then(|v| v.as_u64())
                        .map(|h| h as u32);
                }
                Some("audio") if info.audio_codec.is_none() => {
                    info.audio_codec = codec_name;
                }
                _ => {}
            }
        }
    }
}

pub fn read_media_info(path: &str) -> Result<MediaInfo, String> {
    let path = Path::new(path);
    if !path.is_file() {
        return Err("文件不存在".to_string());
    }

    let ext = file_extension(path);
    let mut info = MediaInfo::default();

    if is_audio_ext(&ext) {
        read_audio_tags(path, &mut info);
    }

    probe_symphonia(path, &mut info);

    if is_video_ext(&ext) {
        try_ffprobe(path, &mut info);
    } else if is_audio_ext(&ext) && info.duration_secs.is_none() {
        try_ffprobe(path, &mut info);
    }

    Ok(info)
}

pub fn read_media_info_batch(paths: Vec<String>) -> Vec<MediaInfoEntry> {
    paths
        .into_iter()
        .map(|path| {
            let info = read_media_info(&path).unwrap_or_default();
            MediaInfoEntry { path, info }
        })
        .collect()
}
