import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";
import { useImageDataUrl } from "../hooks/useImageDataUrl";
import { IconImage } from "./icons";

interface CellProps {
  file: LibraryFile;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

function ImageGridCell({ file, selected, onSelect, onOpen }: CellProps) {
  const { url, loading, failed } = useImageDataUrl(file.path, 320);

  return (
    <article
      className={`image-grid-item ${selected ? "selected" : ""}`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      <div className="image-grid-thumb">
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
      </div>
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
  onPreview: (file: LibraryFile) => void;
  onOpen: (path: string) => void;
}

export function ImageGridView({ files, previewPath, onPreview, onOpen }: GridProps) {
  return (
    <div className="image-grid">
      {files.map((file) => (
        <ImageGridCell
          key={file.path}
          file={file}
          selected={previewPath === file.path}
          onSelect={() => onPreview(file)}
          onOpen={() => onOpen(file.path)}
        />
      ))}
    </div>
  );
}
