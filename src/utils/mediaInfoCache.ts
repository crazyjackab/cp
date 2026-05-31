import type { LibraryFile, MediaInfo } from "../types";

/** 与 Rust 侧失效键一致：path + modified + size */
export function mediaInfoCacheKey(file: Pick<LibraryFile, "path" | "modified" | "size">): string {
  return `${file.path}\0${file.modified}\0${file.size}`;
}

const sessionCache = new Map<string, MediaInfo>();

export function getSessionMediaInfo(
  file: Pick<LibraryFile, "path" | "modified" | "size">,
): MediaInfo | undefined {
  return sessionCache.get(mediaInfoCacheKey(file));
}

export function setSessionMediaInfo(
  file: Pick<LibraryFile, "path" | "modified" | "size">,
  info: MediaInfo,
): void {
  sessionCache.set(mediaInfoCacheKey(file), info);
}

export function buildMediaInfoMapFromSession(files: LibraryFile[]): Record<string, MediaInfo> {
  const map: Record<string, MediaInfo> = {};
  for (const file of files) {
    const cached = getSessionMediaInfo(file);
    if (cached) {
      map[file.path] = cached;
    }
  }
  return map;
}

export function listUncachedMediaFiles(files: LibraryFile[]): LibraryFile[] {
  return files.filter((file) => !getSessionMediaInfo(file));
}

export function filesCacheKey(files: LibraryFile[]): string {
  return files.map((file) => mediaInfoCacheKey(file)).join("\n");
}
