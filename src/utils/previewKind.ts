import type { LibraryFile } from "../types";
import { getExtension } from "./fileUi";

export type PreviewKind = "image" | "pdf" | "video" | "text" | "none";

const IMAGE_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
  "svg",
  "ico",
  "tif",
  "tiff",
]);

const VIDEO_EXT = new Set([
  "mp4",
  "mkv",
  "avi",
  "mov",
  "wmv",
  "flv",
  "webm",
  "m4v",
  "mpeg",
  "mpg",
  "3gp",
]);

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "jsonl",
  "xml",
  "html",
  "htm",
  "log",
  "yaml",
  "yml",
  "ini",
  "cfg",
  "conf",
  "toml",
  "env",
  "sql",
  "js",
  "ts",
  "tsx",
  "jsx",
  "css",
  "scss",
  "less",
  "rs",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "sh",
  "bat",
  "ps1",
  "vue",
]);

export function getPreviewKind(file: LibraryFile): PreviewKind {
  const ext = getExtension(file.name);

  if (file.category === "图片" || IMAGE_EXT.has(ext)) {
    return "image";
  }
  if (ext === "pdf") {
    return "pdf";
  }
  if (file.category === "视频" || VIDEO_EXT.has(ext)) {
    return "video";
  }
  if (TEXT_EXT.has(ext)) {
    return "text";
  }
  if (file.category === "文档" && (ext === "txt" || ext === "md" || ext === "csv")) {
    return "text";
  }
  return "none";
}

export function canPreview(file: LibraryFile): boolean {
  return getPreviewKind(file) !== "none";
}
