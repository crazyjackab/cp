import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";
import { useImageDataUrl } from "../hooks/useImageDataUrl";
import { IconImage } from "./icons";

interface CellProps {
  file: LibraryFile;
  index: number;
  batchSelected: boolean;
  previewActive: boolean;
  onPreview: () => void;
  onOpen: () => void;
  onToggleSelect: (shiftKey: boolean, ctrlKey: boolean) => void;
}

function ImageGridCell({
  file,
  batchSelected,
  previewActive,
  onPreview,
  onOpen,
  onToggleSelect,
}: CellProps) {
  const { url, loading, failed } = useImageDataUrl(file.path, 320);

  return (
    <article
      className={`image-grid-item ${batchSelected ? "batch-selected" : ""} ${previewActive ? "preview-active" : ""}`}
      onDoubleClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      <label className="image-grid-check" title="选择">
        <input
          type="checkbox"
          checked={batchSelected}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect(e.shiftKey, e.ctrlKey || e.metaKey);
          }}
        />
      </label>
      <button type="button" className="image-grid-thumb" onClick={onPreview}>
        {url ? (
          <img src={url} alt={file.name} loading="lazy" draggable={false} />
        ) : loading ? (
          <span className="image-grid-placeholder loading">加载中…</span>
        ) : failed ? (
          <span className="image-grid-placeholder">
            <IconImage size={28} />
            <span>无法预览</span>
          </span>
        ) : null}
      </button>
      <div className="image-grid-meta">
        <span className="image-grid-name" title={file.name}>
          {file.name}
        </span>
        <span className="image-grid-size">{formatBytes(file.size)}</span>
      </div>
    </article>
  );
}

interface GridProps {
  files: LibraryFile[];
  previewPath: string | null;
  batchSelected: Set<string>;
  onPreview: (file: LibraryFile) => void;
  onOpen: (path: string) => void;
  onToggleSelect: (file: LibraryFile, index: number, shiftKey: boolean, ctrlKey: boolean) => void;
}

export function ImageGridView({
  files,
  previewPath,
  batchSelected,
  onPreview,
  onOpen,
  onToggleSelect,
}: GridProps) {
  return (
    <div className="image-grid">
      {files.map((file, index) => (
        <ImageGridCell
          key={file.path}
          file={file}
          index={index}
          batchSelected={batchSelected.has(file.path)}
          previewActive={previewPath === file.path}
          onPreview={() => onPreview(file)}
          onOpen={() => onOpen(file.path)}
          onToggleSelect={(shiftKey, ctrlKey) => onToggleSelect(file, index, shiftKey, ctrlKey)}
        />
      ))}
    </div>
  );
}
