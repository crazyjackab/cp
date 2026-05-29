import { useEffect } from "react";
import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";
import { getPreviewKind } from "../utils/previewKind";
import { IconLocate, IconOpen } from "./icons";
import { ImagePreviewContent } from "./preview/ImagePreviewContent";
import { PdfPreviewContent } from "./preview/PdfPreviewContent";
import { TextPreviewContent } from "./preview/TextPreviewContent";
import { VideoPreviewContent } from "./preview/VideoPreviewContent";

interface Props {
  file: LibraryFile;
  onOpen: (path: string) => void;
  onLocate: (path: string) => void;
  onClose: () => void;
}

function PreviewBody({ file }: { file: LibraryFile }) {
  switch (getPreviewKind(file)) {
    case "image":
      return <ImagePreviewContent file={file} />;
    case "pdf":
      return <PdfPreviewContent file={file} />;
    case "video":
      return <VideoPreviewContent file={file} />;
    case "text":
      return <TextPreviewContent file={file} />;
    default:
      return <div className="file-preview-placeholder">不支持预览此类型</div>;
  }
}

export function FilePreviewModal({ file, onOpen, onLocate, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop file-preview-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog file-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="file-preview-title" className="file-preview-title" title={file.name}>
            {file.name}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="file-preview-body">
          <PreviewBody file={file} />
        </div>

        <footer className="modal-footer file-preview-footer">
          <span className="file-preview-meta">{formatBytes(file.size)}</span>
          <div className="file-preview-actions">
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
