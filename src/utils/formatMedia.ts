import type { MediaInfo } from "../types";

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function mediaDisplayTitle(name: string, info?: MediaInfo): string {
  if (!info) return name;
  const parts = [info.artist, info.title].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : name;
}

export function formatMediaCodecs(info?: MediaInfo): string | null {
  if (!info) return null;
  const parts: string[] = [];
  if (info.video_codec) parts.push(info.video_codec);
  if (info.audio_codec) parts.push(info.audio_codec);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatResolution(info?: MediaInfo): string | null {
  if (!info?.width || !info?.height) return null;
  return `${info.width}×${info.height}`;
}
