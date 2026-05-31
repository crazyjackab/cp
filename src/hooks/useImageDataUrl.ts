import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { reportError } from "../utils/errors";

export function useImageDataUrl(path: string, maxSize: number, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !path) {
      setUrl(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setUrl(null);

    invoke<string>("get_image_data_url", { path, maxSize })
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl);
      })
      .catch((e) => {
        reportError("加载图片预览", e, { warnOnly: true });
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, maxSize, enabled]);

  return { url, loading, failed };
}
