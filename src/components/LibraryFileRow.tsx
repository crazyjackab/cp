import { useMemo } from "react";
import type { LibraryFile, MediaInfo } from "../types";
import { formatBytes } from "../utils";
import {
  formatDuration,
  formatMediaCodecs,
  formatResolution,
  mediaDisplayTitle,
} from "../utils/formatMedia";
import { collectLibraryDragPaths } from "../utils/importTarget";
import { FileDragHandle } from "./FileDragHandle";
import {
  fileIcon,
  fileTone,
  fileTypeLabel,
  inferLibraryCategory,
  isMisplacedInCategory,
} from "../utils/fileUi";
import { canPreview } from "../utils/previewKind";
import {
  IconEdit,
  IconEye,
  IconLocate,
  IconOpen,
  IconRestore,
  IconStar,
  IconTag,
  IconTrash,
} from "./icons";

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

export interface LibraryFileRowProps {
  file: LibraryFile;
  index: number;
  media?: MediaInfo;
  customRules: Record<string, string>;
  isMediaCategory: boolean;
  isVideoCategory: boolean;
  isAudioCategory: boolean;
  batchSelected: boolean;
  selectedPaths: Set<string>;
  selectionActive: boolean;
  selectionMode: boolean;
  onToggleSelect: (shiftKey: boolean, ctrlKey: boolean) => void;
  onOpenFile: (path: string) => void;
  onPreview: (file: LibraryFile) => void;
  onSetFavorite: (file: LibraryFile, favorite: boolean) => void;
  onEditTags: (file: LibraryFile) => void;
  onRename: (file: LibraryFile) => void;
  onDelete: (file: LibraryFile) => void;
  onRestore: (file: LibraryFile) => void;
  onShowInFolder: (path: string) => void;
  onTagFilter: (tag: string) => void;
}

export function LibraryFileRow({
  file,
  media,
  customRules,
  isMediaCategory,
  isVideoCategory,
  isAudioCategory,
  batchSelected,
  selectedPaths,
  selectionActive,
  selectionMode,
  onToggleSelect,
  onOpenFile,
  onPreview,
  onSetFavorite,
  onEditTags,
  onRename,
  onDelete,
  onRestore,
  onShowInFolder,
  onTagFilter,
}: LibraryFileRowProps) {
  const codecs = formatMediaCodecs(media);
  const resolution = formatResolution(media);
  const dragPaths = useMemo(
    () => collectLibraryDragPaths(file.path, selectedPaths, selectionActive),
    [file.path, selectedPaths, selectionActive],
  );
  const showCheckbox = selectionMode || selectionActive;

  return (
    <div
      className={`file-item ${batchSelected ? "batch-selected" : ""} ${
        selectionActive ? "selection-active" : ""
      } ${selectionMode ? "selection-mode" : ""}`}
      onDoubleClick={() => onOpenFile(file.path)}
    >
      <FileDragHandle paths={dragPaths} />
      {showCheckbox ? (
        <label
          className={`file-check ${batchSelected ? "checked" : ""}`}
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
      <div className={`file-icon-wrap ${fileTone(file.category, file.name)}`}>
        {isAudioCategory && media?.cover_data_url ? (
          <img src={media.cover_data_url} alt="" className="file-icon-cover" loading="lazy" />
        ) : (
          fileIcon(file.category, file.name)
        )}
      </div>
      <div className="file-main">
        <button
          type="button"
          className="file-name"
          title={file.path}
          onClick={() => (canPreview(file) ? onPreview(file) : void onOpenFile(file.path))}
        >
          {isMediaCategory ? mediaDisplayTitle(file.name, media) : file.name}
        </button>
        <div className="file-meta">
          {file.favorite && (
            <span className="favorite-pill">
              <IconStar size={12} />
              收藏
            </span>
          )}
          <span className={`category-pill ${fileTone(file.category, file.name)}`}>
            {fileTypeLabel(file.category, file.name)}
          </span>
          {isMisplacedInCategory(file, customRules) && (
            <span className="category-pill category-pill-warn" title="按扩展名应归入其他分类">
              应为 {inferLibraryCategory(file.name, customRules)}
            </span>
          )}
          {isMediaCategory && media?.duration_secs != null && (
            <span>{formatDuration(media.duration_secs)}</span>
          )}
          {isVideoCategory && codecs && <span>{codecs}</span>}
          {isVideoCategory && resolution && <span>{resolution}</span>}
          {isAudioCategory && media?.album && (
            <span className="file-meta-muted">{media.album}</span>
          )}
          <span>{formatBytes(file.size)}</span>
          <span>{formatDate(file.modified)}</span>
        </div>
        {(file.tags ?? []).length > 0 && (
          <div className="file-tags">
            {file.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="tag-chip tag-chip-action"
                onClick={() => onTagFilter(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="file-actions">
        <button
          type="button"
          className={`icon-btn icon-btn-star ${file.favorite ? "active" : ""}`}
          title={file.favorite ? "取消收藏" : "收藏"}
          onClick={() => void onSetFavorite(file, !file.favorite)}
        >
          <IconStar size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="编辑标签"
          onClick={() => onEditTags(file)}
        >
          <IconTag size={16} />
        </button>
        {canPreview(file) && (
          <button type="button" className="icon-btn" title="预览" onClick={() => onPreview(file)}>
            <IconEye size={16} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          title="打开"
          onClick={() => onOpenFile(file.path)}
        >
          <IconOpen size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="定位"
          onClick={() => onShowInFolder(file.path)}
        >
          <IconLocate size={16} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-warn"
          title={file.original_path ? `还原到：${file.original_path}` : "还原到桌面"}
          onClick={() => onRestore(file)}
        >
          <IconRestore size={16} />
        </button>
        <button type="button" className="icon-btn" title="重命名" onClick={() => onRename(file)}>
          <IconEdit size={16} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-danger"
          title="删除"
          onClick={() => onDelete(file)}
        >
          <IconTrash size={16} />
        </button>
      </div>
    </div>
  );
}
