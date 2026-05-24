import { useEffect } from "react";
import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";
import { useImageDataUrl } from "../hooks/useImageDataUrl";
import { IconImage, IconLocate, IconOpen } from "./icons";

interface Props {
  file: LibraryFile;
  onOpen: (path: string) => void;
  onLocate: (path: string) => void;
  onClose: () => void;
}

export function ImagePreviewModal({ file, onOpen, onLocate, onClose }: Props) {
  const { url, loading, failed } = useImageDataUrl(file.path, 1280);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop image-preview-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog image-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="image-preview-title" className="image-preview-title" title={file.name}>
            {file.name}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="image-preview-body">
          {url ? (
            <img src={url} alt={file.name} className="image-preview-img" draggable={false} />
          ) : loading ? (
            <div className="image-preview-placeholder loading">加载预览…</div>
          ) : failed ? (
            <div className="image-preview-placeholder">
              <IconImage size={48} />
              <p>无法预览此格式</p>
              <p className="hint">可尝试用系统默认程序打开</p>
            </div>
          ) : null}
        </div>

        <footer className="modal-footer image-preview-footer">
          <span className="image-preview-meta">{formatBytes(file.size)}</span>
          <div className="image-preview-actions">
            <button type="button" className="btn btn-ghost" onClick={() => onLocate(file.path)}>
              <IconLocate size={16} />
              定位
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onOpen(file.path)}>
              <IconOpen size={16} />
              打开
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
