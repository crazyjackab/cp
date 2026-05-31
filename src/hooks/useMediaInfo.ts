import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryFile, MediaInfo, MediaInfoEntry } from "../types";
import { reportError } from "../utils/errors";
import {
  buildMediaInfoMapFromSession,
  filesCacheKey,
  listUncachedMediaFiles,
  setSessionMediaInfo,
} from "../utils/mediaInfoCache";

export function useMediaInfo(files: LibraryFile[], enabled: boolean) {
  const [mediaInfoMap, setMediaInfoMap] = useState<Record<string, MediaInfo>>({});
  const [loading, setLoading] = useState(false);

  const cacheKey = useMemo(() => filesCacheKey(files), [files]);

  useEffect(() => {
    if (!enabled || files.length === 0) {
      setMediaInfoMap({});
      setLoading(false);
      return;
    }

    const cachedMap = buildMediaInfoMapFromSession(files);
    const missing = listUncachedMediaFiles(files);

    if (missing.length === 0) {
      setMediaInfoMap(cachedMap);
      setLoading(false);
      return;
    }

    setMediaInfoMap(cachedMap);
    let cancelled = false;
    setLoading(true);

    invoke<MediaInfoEntry[]>("get_media_info_batch", {
      paths: missing.map((file) => file.path),
    })
      .then((entries) => {
        if (cancelled) return;
        const next = { ...cachedMap };
        for (const entry of entries) {
          const file = missing.find((item) => item.path === entry.path);
          if (file) {
            setSessionMediaInfo(file, entry.info);
          }
          next[entry.path] = entry.info;
        }
        setMediaInfoMap(next);
      })
      .catch((e) => {
        reportError("读取媒体信息", e, { warnOnly: true });
        if (!cancelled) {
          setMediaInfoMap(cachedMap);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, files.length]);

  return { mediaInfoMap, mediaInfoLoading: loading };
}
