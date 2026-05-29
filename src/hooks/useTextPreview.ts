import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TextPreview } from "../types";

export function useTextPreview(path: string, enabled = true) {
  const [data, setData] = useState<TextPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !path) {
      setData(null);
      setFailed(false);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setError("");
    setData(null);

    invoke<TextPreview>("read_text_preview", { path, maxBytes: 32768 })
      .then((preview) => {
        if (!cancelled) setData(preview);
      })
      .catch((e) => {
        if (!cancelled) {
          setFailed(true);
          setError(String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, enabled]);

  return { data, loading, failed, error };
}
