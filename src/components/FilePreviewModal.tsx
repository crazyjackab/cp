import { useCallback, useEffect } from "react";
import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";
import { getPreviewKind } from "../utils/previewKind";
import { IconChevronRight, IconLocate, IconOpen, IconSaveAs } from "./icons";
import { ImagePreviewContent } from "./preview/ImagePreviewContent";
import { PdfPreviewContent } from "./preview/PdfPreviewContent";
import { TextPreviewContent } from "./preview/TextPreviewContent";
import { VideoPreviewContent } from "./preview/VideoPreviewContent";

interface Props {
  file: LibraryFile;
  files: LibraryFile[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onOpen: (path: string) => void;
  onLocate: (path: string) => void;
  onSaveAs: (file: LibraryFile) => void;
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function FilePreviewModal({
  file,
  files,
  currentIndex,
  onNavigate,
  onOpen,
  onLocate,
  onSaveAs,
  onClose,
}: Props) {
  const canNavigate = files.length > 1;
  const canGoPrev = canNavigate && currentIndex > 0;
  const canGoNext = canNavigate && currentIndex < files.length - 1;

  const goPrev = useCallback(() => {
    if (canGoPrev) onNavigate(currentIndex - 1);
  }, [canGoPrev, currentIndex, onNavigate]);

  const goNext = useCallback(() => {
    if (canGoNext) onNavigate(currentIndex + 1);
  }, [canGoNext, currentIndex, onNavigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, onClose]);

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

        <div className="file-preview-body-wrap">
          {canNavigate ? (
            <button
              type="button"
              className="file-preview-nav file-preview-nav-prev"
              disabled={!canGoPrev}
              aria-label="上一个文件"
              title="上一个 (←)"
              onClick={goPrev}
            >
              <IconChevronRight size={22} className="file-preview-nav-icon-prev" />
            </button>
          ) : null}

          <div className="file-preview-body">
            <PreviewBody key={file.path} file={file} />
          </div>

          {canNavigate ? (
            <button
              type="button"
              className="file-preview-nav file-preview-nav-next"
              disabled={!canGoNext}
              aria-label="下一个文件"
              title="下一个 (→)"
              onClick={goNext}
            >
              <IconChevronRight size={22} />
            </button>
          ) : null}
        </div>

        <footer className="modal-footer file-preview-footer">
          <div className="file-preview-footer-start">
            {canNavigate ? (
              <span className="file-preview-counter">
                {currentIndex + 1} / {files.length}
              </span>
            ) : null}
            <span className="file-preview-meta">{formatBytes(file.size)}</span>
          </div>
          <div className="file-preview-actions">
            <button type="button" className="btn btn-ghost" onClick={() => onLocate(file.path)}>
              <IconLocate size={16} />
              定位
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onSaveAs(file)}>
              <IconSaveAs size={16} />
              另存为
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
