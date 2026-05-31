import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";
import { useImageDataUrl } from "../hooks/useImageDataUrl";
import { collectLibraryDragPaths } from "../utils/importTarget";
import { FileDragHandle } from "./FileDragHandle";
import { IconImage, IconStar, IconTag } from "./icons";

const GRID_COL_MIN_PX = 140;
const GRID_GAP_PX = 14;
const GRID_ROW_HEIGHT_PX = 210;

interface CellProps {
  file: LibraryFile;
  batchSelected: boolean;
  selectedPaths: Set<string>;
  selectionActive: boolean;
  selectionMode: boolean;
  previewActive: boolean;
  onPreview: () => void;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onEditTags: () => void;
  onToggleSelect: (shiftKey: boolean, ctrlKey: boolean) => void;
}

function ImageGridCell({
  file,
  batchSelected,
  selectedPaths,
  selectionActive,
  selectionMode,
  previewActive,
  onPreview,
  onOpen,
  onToggleFavorite,
  onEditTags,
  onToggleSelect,
}: CellProps) {
  const { url, loading, failed } = useImageDataUrl(file.path, 320);
  const dragPaths = collectLibraryDragPaths(file.path, selectedPaths, selectionActive);
  const showCheckbox = selectionMode || selectionActive;

  return (
    <article
      className={`image-grid-item ${batchSelected ? "batch-selected" : ""} ${
        selectionActive ? "selection-active" : ""
      } ${selectionMode ? "selection-mode" : ""} ${previewActive ? "preview-active" : ""}`}
      onDoubleClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      <FileDragHandle paths={dragPaths} className="image-grid-drag-handle" />
      {showCheckbox ? (
        <label
          className={`image-grid-check ${batchSelected ? "checked" : ""}`}
          title="选择"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={batchSelected}
            readOnly
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(e.shiftKey, e.ctrlKey || e.metaKey);
            }}
          />
        </label>
      ) : null}
      <div className={`image-grid-quick-actions ${file.favorite ? "has-active" : ""}`}>
        <button
          type="button"
          className={`image-grid-action ${file.favorite ? "active" : ""}`}
          title={file.favorite ? "取消收藏" : "收藏"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          <IconStar size={15} />
        </button>
        <button
          type="button"
          className="image-grid-action"
          title="编辑标签"
          onClick={(e) => {
            e.stopPropagation();
            onEditTags();
          }}
        >
          <IconTag size={15} />
        </button>
      </div>
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
        {(file.tags ?? []).length > 0 ? (
          <span className="image-grid-tags" title={file.tags.map((tag) => `#${tag}`).join(" ")}>
            {file.tags
              .slice(0, 2)
              .map((tag) => `#${tag}`)
              .join(" ")}
          </span>
        ) : null}
      </div>
    </article>
  );
}

interface GridProps {
  scrollRef: RefObject<HTMLElement | null>;
  files: LibraryFile[];
  previewPath: string | null;
  batchSelected: Set<string>;
  selectionActive: boolean;
  selectionMode: boolean;
  onPreview: (file: LibraryFile) => void;
  onOpen: (path: string) => void;
  onToggleFavorite: (file: LibraryFile) => void;
  onEditTags: (file: LibraryFile) => void;
  onToggleSelect: (file: LibraryFile, index: number, shiftKey: boolean, ctrlKey: boolean) => void;
}

function useGridColumnCount(containerRef: RefObject<HTMLElement | null>): number {
  const [columnCount, setColumnCount] = useState(4);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      const width = element.clientWidth;
      setColumnCount(
        Math.max(1, Math.floor((width + GRID_GAP_PX) / (GRID_COL_MIN_PX + GRID_GAP_PX))),
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  return columnCount;
}

export function ImageGridView({
  scrollRef,
  files,
  previewPath,
  batchSelected,
  selectionActive,
  selectionMode,
  onPreview,
  onOpen,
  onToggleFavorite,
  onEditTags,
  onToggleSelect,
}: GridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const columnCount = useGridColumnCount(gridRef);
  const rowCount = Math.ceil(files.length / columnCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT_PX + GRID_GAP_PX,
    overscan: 2,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [columnCount, files.length, rowVirtualizer]);

  return (
    <div ref={gridRef} className="image-grid virtual-image-grid">
      <div
        className="virtual-image-grid-body"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowFiles = files.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.key}
              className="image-grid-row"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: `${GRID_GAP_PX}px`,
              }}
            >
              {rowFiles.map((file, columnIndex) => {
                const index = startIndex + columnIndex;
                return (
                  <ImageGridCell
                    key={file.path}
                    file={file}
                    batchSelected={batchSelected.has(file.path)}
                    selectedPaths={batchSelected}
                    selectionActive={selectionActive}
                    selectionMode={selectionMode}
                    previewActive={previewPath === file.path}
                    onPreview={() => onPreview(file)}
                    onOpen={() => onOpen(file.path)}
                    onToggleFavorite={() => onToggleFavorite(file)}
                    onEditTags={() => onEditTags(file)}
                    onToggleSelect={(shiftKey, ctrlKey) =>
                      onToggleSelect(file, index, shiftKey, ctrlKey)
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
