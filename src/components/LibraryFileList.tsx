import { useEffect, useState, type RefObject } from "react";
import type {
  BackgroundTaskEvent,
  BatchOperationResult,
  ImportConflictStrategy,
  ImportResult,
  LibraryCategory,
  LibraryFile,
  LibraryInfo,
  MediaInfo,
  MediaSortKey,
  ReclassifyResult,
} from "../types";
import { formatBytes, formatNumber } from "../utils";
import {
  DEFAULT_LIBRARY_FILTERS,
  folderDisplayName,
  type LibraryFilters,
} from "../utils/libraryFilter";
import { navIcon } from "../utils/fileUi";
import { isBackgroundTaskRunning } from "../utils/taskProgress";
import type { ImportDropTarget } from "../utils/importTarget";
import { BatchActionBar } from "./BatchToolbar";
import { ImageGridView } from "./ImageGridView";
import { VirtualFileList } from "./VirtualFileList";
import { LibrarySearchBar } from "./LibrarySearchBar";
import { MediaSortBar } from "./MediaSortBar";
import { TaskProgressPanel } from "./TaskProgressPanel";
import { IconFolderNew, IconImport, IconRefresh, IconStar, IconStorage, IconFiles } from "./icons";

interface Props {
  scrollRef: RefObject<HTMLDivElement | null>;
  category: LibraryCategory;
  folderPath: string | null;
  info: LibraryInfo | null;
  files: LibraryFile[];
  conflictStrategy: ImportConflictStrategy;
  loadDeferred: boolean;
  deferThreshold: number;
  isDragging: boolean;
  currentFolderDropTarget: ImportDropTarget | null;
  initialLoading: boolean;
  pageStats: { count: number; bytes: number };
  visibleSourceFiles: LibraryFile[];
  filteredFiles: LibraryFile[];
  displayFiles: LibraryFile[];
  filtering: boolean;
  filters: LibraryFilters;
  onFiltersChange: (filters: LibraryFilters) => void;
  availableExtensions: string[];
  availableTags: string[];
  isMediaCategory: boolean;
  isVideoCategory: boolean;
  isAudioCategory: boolean;
  isImageGrid: boolean;
  mediaSort: MediaSortKey;
  onMediaSortChange: (key: MediaSortKey) => void;
  mediaInfoMap: Record<string, MediaInfo>;
  mediaInfoLoading: boolean;
  customRules: Record<string, string>;
  selectionActive: boolean;
  selectedCount: number;
  backgroundTaskBusy: boolean;
  showTaskProgress: boolean;
  showListTaskProgress: boolean;
  listTaskProgress: BackgroundTaskEvent<LibraryFile[]> | null;
  reclassifyTaskId: string | null;
  reclassifyTaskProgress: BackgroundTaskEvent<ReclassifyResult> | null;
  importTaskId: string | null;
  importTaskProgress: BackgroundTaskEvent<ImportResult> | null;
  batchTaskId: string | null;
  batchTaskLabel: string;
  batchTaskProgress: BackgroundTaskEvent<BatchOperationResult> | null;
  selectedFilesCount: number;
  onRefresh: () => void;
  onCancelListTask: () => void;
  onCancelReclassifyTask: () => void;
  onCancelImportTask: () => void;
  onCancelBatchTask: () => void;
  onSelectAll: () => void;
  onInvertSelection: () => void;
  onClearSelection: () => void;
  onBatchMove: () => void;
  onBatchFavorite: () => void;
  onBatchUnfavorite: () => void;
  onBatchRestore: () => void;
  onBatchDelete: () => void;
  previewPath: string | null;
  batchSelected: Set<string>;
  isSelected: (path: string) => boolean;
  onPreview: (file: LibraryFile) => void;
  onOpen: (path: string) => void;
  onToggleFavorite: (file: LibraryFile, favorite: boolean) => void;
  onEditTags: (file: LibraryFile) => void;
  onToggleSelect: (file: LibraryFile, index: number, shiftKey: boolean, ctrlKey: boolean) => void;
  onRename: (file: LibraryFile) => void;
  onSaveAs: (file: LibraryFile) => void;
  onDelete: (file: LibraryFile) => void;
  onBatchSaveAs: () => void;
  onRestore: (file: LibraryFile) => void;
  onShowInFolder: (path: string) => void;
  onTagFilter: (tag: string) => void;
}

export function LibraryFileList({
  scrollRef,
  category,
  folderPath,
  info,
  files,
  conflictStrategy,
  loadDeferred,
  deferThreshold,
  isDragging,
  currentFolderDropTarget,
  initialLoading,
  pageStats,
  visibleSourceFiles,
  filteredFiles,
  displayFiles,
  filtering,
  filters,
  onFiltersChange,
  availableExtensions,
  availableTags,
  isMediaCategory,
  isVideoCategory,
  isAudioCategory,
  isImageGrid,
  mediaSort,
  onMediaSortChange,
  mediaInfoMap,
  mediaInfoLoading,
  customRules,
  selectionActive,
  selectedCount,
  backgroundTaskBusy,
  showTaskProgress,
  showListTaskProgress,
  listTaskProgress,
  reclassifyTaskId,
  reclassifyTaskProgress,
  importTaskId,
  importTaskProgress,
  batchTaskId,
  batchTaskLabel,
  batchTaskProgress,
  selectedFilesCount,
  onRefresh,
  onCancelListTask,
  onCancelReclassifyTask,
  onCancelImportTask,
  onCancelBatchTask,
  onSelectAll,
  onInvertSelection,
  onClearSelection,
  onBatchMove,
  onBatchFavorite,
  onBatchUnfavorite,
  onBatchRestore,
  onBatchDelete,
  previewPath,
  batchSelected,
  isSelected,
  onPreview,
  onOpen,
  onToggleFavorite,
  onEditTags,
  onToggleSelect,
  onRename,
  onSaveAs,
  onDelete,
  onBatchSaveAs,
  onRestore,
  onShowInFolder,
  onTagFilter,
}: Props) {
  const listDisabled = backgroundTaskBusy || initialLoading;
  const [selectionMode, setSelectionMode] = useState(false);
  const listSelectionActive = selectionActive || selectionMode;

  useEffect(() => {
    if (selectedCount > 0) {
      setSelectionMode(true);
    }
  }, [selectedCount]);

  useEffect(() => {
    if (displayFiles.length === 0) {
      setSelectionMode(false);
    }
  }, [displayFiles.length]);

  return (
    <div
      ref={scrollRef}
      className={`content drop-zone ${isDragging ? "drop-zone-active" : ""}`}
      data-drop-target-path={currentFolderDropTarget?.path}
      data-drop-target-category={currentFolderDropTarget?.category}
    >
      {initialLoading && !showTaskProgress && <p className="loading-inline">正在加载…</p>}

      {showTaskProgress && (
        <div className="task-progress-overlay">
          {showListTaskProgress && (
            <TaskProgressPanel
              message={listTaskProgress?.message || "正在加载资料库…"}
              processed={listTaskProgress?.processed}
              onCancel={onCancelListTask}
            />
          )}
          {isBackgroundTaskRunning(reclassifyTaskId, reclassifyTaskProgress) && (
            <TaskProgressPanel
              message={reclassifyTaskProgress?.message || "正在整理分类…"}
              processed={reclassifyTaskProgress?.processed}
              onCancel={onCancelReclassifyTask}
            />
          )}
          {isBackgroundTaskRunning(importTaskId, importTaskProgress) && (
            <TaskProgressPanel
              message={importTaskProgress?.message || "正在收纳…"}
              processed={importTaskProgress?.processed}
              total={importTaskProgress?.total}
              progress={importTaskProgress?.progress}
              onCancel={onCancelImportTask}
            />
          )}
          {isBackgroundTaskRunning(batchTaskId, batchTaskProgress) && (
            <TaskProgressPanel
              message={batchTaskProgress?.message || `${batchTaskLabel}中…`}
              processed={batchTaskProgress?.processed}
              total={batchTaskProgress?.total ?? selectedFilesCount}
              progress={batchTaskProgress?.progress}
              onCancel={onCancelBatchTask}
            />
          )}
        </div>
      )}

      {loadDeferred && (
        <div className="empty-state empty-state-compact library-defer-prompt">
          <div className="empty-icon">
            <IconStorage size={32} />
          </div>
          <h2>资料库文件较多</h2>
          <p>
            当前资料库共 {formatNumber(info?.total_files ?? 0)} 个文件，已超过设定阈值（
            {formatNumber(deferThreshold)}）。为减少等待，进入分类时不会自动加载列表。
          </p>
          <button type="button" className="btn btn-primary" onClick={onRefresh}>
            <IconRefresh size={16} />
            加载资料库
          </button>
          <p className="hint">也可点击右上角刷新；可在设置中关闭此功能或调整阈值。</p>
        </div>
      )}

      {info && !loadDeferred && (
        <div className="stat-strip">
          <div className="stat-item">
            <span className="stat-icon">
              <IconFiles size={18} />
            </span>
            <div>
              <span className="stat-value">{formatNumber(pageStats.count)}</span>
              <span className="stat-label">{folderPath ? "本文件夹" : "文件"}</span>
            </div>
          </div>
          <div className="stat-item">
            <span className="stat-icon">
              <IconStorage size={18} />
            </span>
            <div>
              <span className="stat-value">{formatBytes(pageStats.bytes)}</span>
              <span className="stat-label">{folderPath ? "文件夹占用" : "占用空间"}</span>
            </div>
          </div>
          <div className="stat-item stat-item-muted">
            <span className="stat-value stat-value-sm">
              {info.import_mode === "copy" ? "复制收纳" : "移动收纳"}
            </span>
            <span className="stat-label">
              {filtering
                ? `筛选 ${filteredFiles.length} / ${visibleSourceFiles.length} 项`
                : category === "favorites"
                  ? `收藏 ${visibleSourceFiles.length} 项`
                  : `本页 ${visibleSourceFiles.length} 项 · 同名${conflictStrategy === "skip" ? "跳过" : conflictStrategy === "ask" ? "询问" : "重命名"}`}
            </span>
          </div>
        </div>
      )}

      {visibleSourceFiles.length > 0 && (
        <LibrarySearchBar
          filters={filters}
          onChange={onFiltersChange}
          availableExtensions={availableExtensions}
          availableTags={availableTags}
          resultCount={filteredFiles.length}
          totalCount={visibleSourceFiles.length}
          selection={
            displayFiles.length > 0
              ? {
                  totalCount: displayFiles.length,
                  selectedCount,
                  selectionMode,
                  disabled: listDisabled,
                  onEnterSelectionMode: () => setSelectionMode(true),
                  onExitSelectionMode: () => setSelectionMode(false),
                  onSelectAll,
                  onInvert: onInvertSelection,
                  onClear: onClearSelection,
                }
              : undefined
          }
        />
      )}

      {displayFiles.length > 0 && selectedCount > 0 && (
        <BatchActionBar
          totalCount={displayFiles.length}
          selectedCount={selectedCount}
          selectionMode={selectionMode}
          disabled={listDisabled}
          onEnterSelectionMode={() => setSelectionMode(true)}
          onExitSelectionMode={() => setSelectionMode(false)}
          onSelectAll={onSelectAll}
          onInvert={onInvertSelection}
          onClear={onClearSelection}
          onMove={onBatchMove}
          onFavorite={onBatchFavorite}
          onUnfavorite={onBatchUnfavorite}
          onRestore={onBatchRestore}
          onSaveAs={onBatchSaveAs}
          onDelete={onBatchDelete}
        />
      )}

      {isMediaCategory && displayFiles.length > 0 && (
        <MediaSortBar sortKey={mediaSort} onChange={onMediaSortChange} loading={mediaInfoLoading} />
      )}

      {initialLoading && files.length === 0 && !loadDeferred && !isDragging && !folderPath && (
        <div className="empty-state">
          <div className="empty-icon">
            <IconImport size={32} />
          </div>
          <h2>资料库还是空的</h2>
          <p>拖拽文件或文件夹到窗口，松开后自动按类型收纳。</p>
          <p className="hint">也可点击上方「收纳文件」或「桌面 / 下载」快捷收纳。</p>
        </div>
      )}

      {folderPath && !initialLoading && visibleSourceFiles.length === 0 && !isDragging && (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">
            <IconFolderNew size={32} />
          </div>
          <h2>文件夹还是空的</h2>
          <p>拖入文件或点击「收纳文件」，将直接放入「{folderDisplayName(folderPath)}」。</p>
          <p className="hint">也可从桌面 / 下载收纳，同样会放入当前文件夹。</p>
        </div>
      )}

      {files.length > 0 &&
        category === "favorites" &&
        visibleSourceFiles.length === 0 &&
        !folderPath && (
          <div className="empty-state empty-state-compact">
            <div className="empty-icon">
              <IconStar size={32} />
            </div>
            <h2>还没有收藏文件</h2>
            <p>在任意文件行点亮星标，就能在这里跨分类查看。</p>
          </div>
        )}

      {files.length > 0 &&
        category !== "all" &&
        category !== "favorites" &&
        visibleSourceFiles.length === 0 &&
        !folderPath && (
          <div className="empty-state empty-state-compact">
            <div className="empty-icon">{navIcon(category)}</div>
            <h2>「{category}」分类暂无文件</h2>
            <p>拖入对应类型的文件，或从其他位置收纳，会自动归入此分类。</p>
          </div>
        )}

      {visibleSourceFiles.length > 0 && filteredFiles.length === 0 && (
        <div className="empty-state empty-state-compact">
          <h2>没有匹配的文件</h2>
          <p>试试调整搜索词或筛选条件。</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onFiltersChange(DEFAULT_LIBRARY_FILTERS)}
          >
            清除筛选
          </button>
        </div>
      )}

      {displayFiles.length > 0 && isImageGrid ? (
        <ImageGridView
          scrollRef={scrollRef}
          files={displayFiles}
          previewPath={previewPath}
          batchSelected={batchSelected}
          selectionActive={listSelectionActive}
          selectionMode={selectionMode}
          onPreview={onPreview}
          onOpen={onOpen}
          onToggleFavorite={(file) => onToggleFavorite(file, !file.favorite)}
          onEditTags={onEditTags}
          onToggleSelect={onToggleSelect}
        />
      ) : displayFiles.length > 0 ? (
        <VirtualFileList
          scrollRef={scrollRef}
          files={displayFiles}
          mediaInfoMap={mediaInfoMap}
          selectedPaths={batchSelected}
          isSelected={isSelected}
          customRules={customRules}
          isMediaCategory={isMediaCategory}
          isVideoCategory={isVideoCategory}
          isAudioCategory={isAudioCategory}
          selectionActive={listSelectionActive}
          selectionMode={selectionMode}
          onToggleSelect={(file, index, shiftKey, ctrlKey) =>
            onToggleSelect(file, index, shiftKey, ctrlKey)
          }
          onOpenFile={onOpen}
          onPreview={onPreview}
          onSetFavorite={onToggleFavorite}
          onEditTags={onEditTags}
          onRename={onRename}
          onSaveAs={onSaveAs}
          onDelete={onDelete}
          onRestore={onRestore}
          onShowInFolder={onShowInFolder}
          onTagFilter={onTagFilter}
        />
      ) : null}

    </div>
  );
}
