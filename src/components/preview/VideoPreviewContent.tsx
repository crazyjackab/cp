import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { LibraryFile } from "../../types";
import { IconVideo } from "../icons";

interface Props {
  file: LibraryFile;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoPreviewContent({ file }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);

  const src = useMemo(() => {
    try {
      return convertFileSrc(file.path);
    } catch {
      return "";
    }
  }, [file.path]);

  useEffect(() => {
    setFailed(false);
    setDuration(null);
    setResolution(null);
  }, [file.path]);

  const onLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    setDuration(el.duration);
    if (el.videoWidth && el.videoHeight) {
      setResolution(`${el.videoWidth} × ${el.videoHeight}`);
    }
  };

  if (!src || failed) {
    return (
      <div className="file-preview-placeholder">
        <IconVideo size={48} />
        <p>无法内嵌播放</p>
        <p className="hint">请用系统默认程序打开</p>
      </div>
    );
  }

  return (
    <div className="file-preview-video-wrap">
      <video
        ref={videoRef}
        className="file-preview-video"
        src={src}
        controls
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onError={() => setFailed(true)}
      />
      <div className="file-preview-video-meta">
        {duration !== null && <span>时长 {formatDuration(duration)}</span>}
        {resolution && <span>{resolution}</span>}
      </div>
    </div>
  );
}
