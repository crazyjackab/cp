import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useDragDropImport } from "../hooks/useDragDropImport";
import { useFileSelection } from "../hooks/useFileSelection";
import { useLibraryBackgroundTasks } from "../hooks/useLibraryBackgroundTasks";
import { useLibraryDisplayFiles } from "../hooks/useLibraryDisplayFiles";
import { useLibraryRefresh } from "../hooks/useLibraryRefresh";
import { useOperationToast } from "../hooks/useOperationToast";
import {
  DEFAULT_LIBRARY_FILTERS,
  filtersForCategoryChange,
  folderDisplayName,
  type LibraryFilters,
} from "../utils/libraryFilter";
import { reportError, reportToastError } from "../utils/errors";
import { saveLibraryFileAs, saveLibraryFilesAsBatch } from "../utils/saveLibraryFileAs";
import { createFinishedTaskRegistry } from "../utils/taskProgress";
import {
  categoryFromFolderPath,
  formatImportDropTargetLabel,
  isDuplicateExternalDrop,
  isLibraryCategoryNav,
  normalizeExternalDropPaths,
  resolveDropTargetFromClientPoint,
  resolveImportDropTarget,
  type ImportDropTarget,
} from "../utils/importTarget";
import { ExternalDropOverlay } from "./ExternalDropOverlay";
import { InternalDragHint } from "./InternalDragHint";
import { useInternalFileDragging } from "../hooks/useInternalFileMoveSession";
import type {
  FileMetadata,
  ImportCandidatesResult,
  LibraryCategory,
  LibraryFile,
  LibraryMoveTarget,
  MediaSortKey,
  PendingImportFile,
  SkippedImportFile,
} from "../types";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { BatchDeleteModal } from "./BatchDeleteModal";
import { BatchMoveModal } from "./BatchMoveModal";
import { FilePreviewModal } from "./FilePreviewModal";
import { ImportConfirmModal } from "./ImportConfirmModal";
import { RenameModal } from "./RenameModal";
import { NewFolderModal } from "./NewFolderModal";
import { TagEditModal } from "./TagEditModal";
import { InboxOrganizeBanner } from "./InboxOrganizeBanner";
import { LibraryFileList } from "./LibraryFileList";
import { LibraryToolbar, libraryCategoryLabel } from "./LibraryToolbar";

interface Props {
  category: LibraryCategory;
  folderPath?: string | null;
  dropHoverTarget?: ImportDropTarget | null;
  onFolderCreated?: (path: string, category: LibraryCategory) => void;
  onDropHoverChange?: (target: ImportDropTarget | null) => void;
}

export function LibraryView({
  category,
  folderPath = null,
  dropHoverTarget = null,
  onFolderCreated,
  onDropHoverChange,
}: Props) {
  const [importModal, setImportModal] = useState<{
    title: string;
    sourceLabel: string;
    files: PendingImportFile[];
    skipped: SkippedImportFile[];
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<LibraryFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryFile | null>(null);
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null);
  const [tagTarget, setTagTarget] = useState<LibraryFile | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);
  const [mediaSort, setMediaSort] = useState<MediaSortKey>("modified-desc");
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);

  const selection = useFileSelection();
  const lastDropHoverTargetRef = useRef<ImportDropTarget | null>(null);
  const finishedTaskIdsRef = useRef(createFinishedTaskRegistry());
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const { toastSuccess, toastError, toastInfo, noteImportTask } = useOperationToast();

  const {
    info,
    files,
    setFiles,
    loading,
    setLoading,
    tagSuggestions,
    setTagSuggestions,
    conflictStrategy,
    setConflictStrategy,
    customRules,
    setCustomRules,
    loadDeferred,
    deferThreshold,
    refresh,
    loadLibraryInfoExtras,
    listTaskProgress,
    listTaskBusy,
    showListTaskProgress,
    cancelListTask,
    refreshRef,
  } = useLibraryRefresh({
    folderPath,
    toastError,
    toastInfo,
    finishedTaskIdsRef,
  });

  const {
    batchTaskId,
    batchTaskLabel,
    batchTaskProgress,
    importTaskId,
    importTaskProgress,
    reclassifyTaskId,
    reclassifyTaskProgress,
    backgroundTaskBusy,
    showOperationTaskProgress,
    startBatchOp,
    importPaths,
    reclassifyMisplaced,
    organizeInbox,
    cancelBatchTask,
    cancelImportTask,
    cancelReclassifyTask,
  } = useLibraryBackgroundTasks({
    category,
    folderPath,
    info,
    conflictStrategy,
    setConflictStrategy,
    setCustomRules,
    setLoading,
    refreshRef,
    selectionClear: selection.clear,
    finishedTaskIdsRef,
    toastSuccess,
    toastError,
    toastInfo,
    noteImportTask,
  });

  useEffect(() => {
    setFilters((prev) => filtersForCategoryChange(prev));
    setMediaSort("modified-desc");
    setPreviewFile(null);
    selection.clear();
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [category, folderPath, selection.clear]);

  const {
    visibleSourceFiles,
    pageStats,
    availableExtensions,
    availableTags,
    filteredFiles,
    displayFiles,
    filtering,
    misplacedCount,
    visiblePaths,
    isVideoCategory,
    isAudioCategory,
    isMediaCategory,
    isImageGrid,
    mediaInfoMap,
    mediaInfoLoading,
  } = useLibraryDisplayFiles({
    category,
    folderPath,
    files,
    info,
    filters,
    mediaSort,
    customRules,
  });

  const selectedFiles = useMemo(
    () => displayFiles.filter((f) => selection.isSelected(f.path)),
    [displayFiles, selection.selected, selection.isSelected],
  );
  const selectionActive = selection.selectedCount > 0;

  const previewIndex = useMemo(() => {
    if (!previewFile) return -1;
    return displayFiles.findIndex((f) => f.path === previewFile.path);
  }, [previewFile, displayFiles]);

  useEffect(() => {
    if (previewFile && previewIndex < 0) {
      setPreviewFile(null);
    }
  }, [previewFile, previewIndex]);

  const handlePreviewNavigate = useCallback(
    (index: number) => {
      const next = displayFiles[index];
      if (next) setPreviewFile(next);
    },
    [displayFiles],
  );

  const handleExternalDrop = useCallback(
    async ({ paths, clientX, clientY }: { paths: string[]; clientX: number; clientY: number }) => {
      const normalizedPaths = normalizeExternalDropPaths(paths);
      if (normalizedPaths.length === 0) return;

      const hoverTarget = lastDropHoverTargetRef.current;
      let cfg: { library_root: string } | null = null;
      try {
        cfg = await invoke<{ library_root: string }>("get_app_config");
      } catch (e) {
        reportError("读取应用配置", e, { toast: toastError });
      }
      const libraryRoot = info?.root ?? cfg?.library_root ?? "";
      const hitTarget = resolveDropTargetFromClientPoint(clientX, clientY) ?? hoverTarget;
      lastDropHoverTargetRef.current = null;
      const target = resolveImportDropTarget(hitTarget, category, folderPath, libraryRoot);
      if (isDuplicateExternalDrop(normalizedPaths, target?.path ?? null)) {
        return;
      }
      await importPaths(normalizedPaths, "拖入收纳", target);
    },
    [category, folderPath, importPaths, info?.root, toastError],
  );

  const handleDragPositionChange = useCallback(
    (point: { clientX: number; clientY: number } | null) => {
      if (!point) {
        lastDropHoverTargetRef.current = null;
        onDropHoverChange?.(null);
        return;
      }
      const target = resolveDropTargetFromClientPoint(point.clientX, point.clientY);
      lastDropHoverTargetRef.current = target;
      onDropHoverChange?.(target);
    },
    [onDropHoverChange],
  );

  const { isDragging } = useDragDropImport(handleExternalDrop, handleDragPositionChange);
  const internalFileDragging = useInternalFileDragging();

  const pickAndImport = async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "选择要收纳的文件（将移动到资料库）",
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await importPaths(paths);
  };

  const openImportModal = async (
    command: "list_desktop_import_candidates" | "list_downloads_import_candidates",
    title: string,
    sourceLabel: string,
  ) => {
    setLoading(true);
    try {
      const result = await invoke<ImportCandidatesResult>(command);
      setImportModal({
        title,
        sourceLabel,
        files: result.files,
        skipped: result.skipped,
      });
    } catch (e) {
      reportToastError(toastError, "加载待收纳文件", e);
    } finally {
      setLoading(false);
    }
  };

  const confirmModalImport = async (paths: string[]) => {
    const sourceLabel = importModal?.sourceLabel ?? "";
    setImportModal(null);
    if (paths.length === 0) return;
    await importPaths(paths, sourceLabel === "下载文件夹" ? "下载" : sourceLabel);
  };

  const patchFileMetadata = (path: string, metadata: FileMetadata) => {
    setFiles((current) =>
      current.map((file) =>
        file.path === path ? { ...file, favorite: metadata.favorite, tags: metadata.tags } : file,
      ),
    );
    setPreviewFile((file) =>
      file?.path === path ? { ...file, favorite: metadata.favorite, tags: metadata.tags } : file,
    );
    setTagTarget((file) =>
      file?.path === path ? { ...file, favorite: metadata.favorite, tags: metadata.tags } : file,
    );
  };

  const openFile = async (path: string) => {
    try {
      await invoke("open_file", { path });
    } catch (e) {
      reportToastError(toastError, "打开文件", e);
    }
  };

  const showInFolder = async (path: string) => {
    try {
      await invoke("show_file_in_folder", { path });
    } catch (e) {
      reportToastError(toastError, "在资源管理器中显示", e);
    }
  };

  const saveAs = async (file: LibraryFile) => {
    try {
      const savedPath = await saveLibraryFileAs(file);
      if (!savedPath) return;
      const name = savedPath.split(/[/\\]/).pop() ?? savedPath;
      toastSuccess(`已另存为：${name}`);
    } catch (e) {
      reportToastError(toastError, "另存为", e);
    }
  };

  const batchSaveAs = async () => {
    if (selectedFiles.length === 0) return;
    try {
      const result = await saveLibraryFilesAsBatch(selectedFiles);
      if (!result) return;
      if (result.failed.length === 0) {
        toastSuccess(`已将 ${result.success_count} 个文件另存到所选文件夹`);
      } else {
        toastError(
          `另存为完成：成功 ${result.success_count} 个，失败 ${result.failed.length} 个`,
        );
        reportError("批量另存为", result.failed.map((f) => `${f.path}: ${f.reason}`).join("\n"));
      }
      selection.clear();
    } catch (e) {
      reportToastError(toastError, "批量另存为", e);
    }
  };

  const confirmCreateFolder = async (name: string, targetCategory: LibraryMoveTarget) => {
    setNewFolderOpen(false);
    try {
      const createdPath = await invoke<string>("create_library_folder", {
        category: targetCategory,
        name,
        parentDirectory: folderPath,
      });
      const locationLabel = folderPath ? folderDisplayName(folderPath) : targetCategory;
      toastSuccess(`已在「${locationLabel}」创建文件夹「${name}」`);
      loadLibraryInfoExtras();
      onFolderCreated?.(createdPath, targetCategory);
      await refresh({ silent: true });
      await invoke("show_file_in_folder", { path: createdPath });
    } catch (e) {
      reportToastError(toastError, "创建文件夹", e);
    }
  };

  const confirmRename = async (newName: string) => {
    if (!renameTarget) return;
    setRenameTarget(null);
    setLoading(true);
    try {
      const newPath = await invoke<string>("rename_library_file", {
        path: renameTarget.path,
        newName,
      });
      toastSuccess(`已重命名为：${newPath.split(/[/\\]/).pop()}`);
      await refresh({ silent: true });
    } catch (e) {
      reportToastError(toastError, "重命名文件", e);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    void startBatchOp(`已删除「${target.name}」`, "start_batch_delete_library_files_task", {
      paths: [target.path],
    });
  };

  const setFavorite = async (file: LibraryFile, favorite: boolean, quiet = false) => {
    try {
      const metadata = await invoke<FileMetadata>("set_file_favorite", {
        path: file.path,
        favorite,
      });
      patchFileMetadata(file.path, metadata);
      if (!quiet) {
        toastSuccess(favorite ? `已收藏「${file.name}」` : `已取消收藏「${file.name}」`);
      }
    } catch (e) {
      reportToastError(toastError, "设置收藏", e);
    }
  };

  const confirmTags = async (tags: string[]) => {
    if (!tagTarget) return;
    const target = tagTarget;
    setTagTarget(null);
    try {
      const metadata = await invoke<FileMetadata>("set_file_tags", {
        path: target.path,
        tags,
      });
      patchFileMetadata(target.path, metadata);
      const allTags = await invoke<string[]>("list_file_tags");
      setTagSuggestions(allTags);
      toastSuccess(
        tags.length > 0 ? `已更新「${target.name}」的标签` : `已清除「${target.name}」的标签`,
      );
    } catch (e) {
      reportToastError(toastError, "更新标签", e);
    }
  };

  const restoreToOriginal = async (file: LibraryFile) => {
    const hint = file.original_path
      ? `确定将「${file.name}」还原到原位置？\n${file.original_path}`
      : `未找到原路径记录，将把「${file.name}」还原到桌面。确定继续？`;
    if (!confirm(hint)) return;
    void startBatchOp("已还原", "start_batch_restore_files_task", {
      paths: [file.path],
    });
  };

  const confirmBatchDelete = () => {
    if (selectedFiles.length === 0) return;
    void startBatchOp("已删除", "start_batch_delete_library_files_task", {
      paths: selectedFiles.map((f) => f.path),
    });
    setBatchDeleteOpen(false);
  };

  const confirmBatchMove = (target: LibraryMoveTarget) => {
    if (selectedFiles.length === 0) return;
    void startBatchOp(`已移动到「${target}」`, "start_batch_move_to_category_task", {
      paths: selectedFiles.map((f) => f.path),
      targetCategory: target,
    });
    setBatchMoveOpen(false);
  };

  const batchRestore = () => {
    if (selectedFiles.length === 0) return;
    if (
      !confirm(`确定将选中的 ${selectedFiles.length} 个文件还原到原位置（无记录则还原到桌面）？`)
    ) {
      return;
    }
    void startBatchOp("已还原", "start_batch_restore_files_task", {
      paths: selectedFiles.map((f) => f.path),
    });
  };

  const batchSetFavorite = async (favorite: boolean) => {
    if (selectedFiles.length === 0) return;
    setLoading(true);
    try {
      let success = 0;
      for (const file of selectedFiles) {
        const metadata = await invoke<FileMetadata>("set_file_favorite", {
          path: file.path,
          favorite,
        });
        patchFileMetadata(file.path, metadata);
        success += 1;
      }
      toastSuccess(favorite ? `已收藏 ${success} 个文件` : `已取消收藏 ${success} 个文件`);
      selection.clear();
    } catch (e) {
      reportToastError(toastError, "批量设置收藏", e);
    } finally {
      setLoading(false);
    }
  };

  const onToggleSelect = (
    file: LibraryFile,
    index: number,
    shiftKey: boolean,
    ctrlKey: boolean,
  ) => {
    if (shiftKey) {
      selection.handleSelect(visiblePaths, file.path, index, true, ctrlKey);
    } else {
      selection.toggleOne(file.path, index);
    }
  };

  const categoryLabel = libraryCategoryLabel(category, folderPath, folderDisplayName);
  const pageSubtitle = folderPath ?? info?.root ?? "D:\\FileManager\\资料库";
  const isInboxView = category === "收件箱";
  const inboxOrganizeCount = isInboxView
    ? misplacedCount > 0
      ? misplacedCount
      : visibleSourceFiles.length
    : 0;
  const currentFolderDropTarget = useMemo(() => {
    if (!folderPath) return null;
    const libraryRoot = info?.root;
    if (!libraryRoot) return null;
    const targetCategory =
      categoryFromFolderPath(folderPath, libraryRoot) ??
      (isLibraryCategoryNav(category) ? category : null);
    if (!targetCategory) return null;
    return { path: folderPath, category: targetCategory };
  }, [category, folderPath, info?.root]);

  const externalDropPreview = useMemo(() => {
    if (!isDragging || !info?.root) return null;
    const resolved = resolveImportDropTarget(dropHoverTarget, category, folderPath, info.root);
    return formatImportDropTargetLabel(resolved, category, folderPath);
  }, [isDragging, dropHoverTarget, category, folderPath, info?.root]);

  const initialLoading = loading && files.length === 0;
  const showTaskProgress = showListTaskProgress || showOperationTaskProgress;
  const toolbarDisabled = backgroundTaskBusy || listTaskBusy || initialLoading;

  return (
    <>
      <ExternalDropOverlay
        visible={isDragging}
        title={externalDropPreview?.title ?? "松开以收纳到资料库"}
        hint={externalDropPreview?.hint ?? "拖到左侧可指定分类或文件夹"}
      />

      <InternalDragHint
        visible={internalFileDragging && !isDragging}
        target={dropHoverTarget}
      />

      {importModal && (
        <ImportConfirmModal
          title={importModal.title}
          sourceLabel={importModal.sourceLabel}
          files={importModal.files}
          skipped={importModal.skipped}
          onConfirm={confirmModalImport}
          onCancel={() => setImportModal(null)}
        />
      )}

      {renameTarget && (
        <RenameModal
          file={renameTarget}
          onConfirm={confirmRename}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          file={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {previewIndex >= 0 && (
        <FilePreviewModal
          file={displayFiles[previewIndex]}
          files={displayFiles}
          currentIndex={previewIndex}
          onNavigate={handlePreviewNavigate}
          onOpen={openFile}
          onLocate={showInFolder}
          onSaveAs={saveAs}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {batchDeleteOpen && (
        <BatchDeleteModal
          files={selectedFiles}
          onConfirm={confirmBatchDelete}
          onCancel={() => setBatchDeleteOpen(false)}
        />
      )}

      {batchMoveOpen && (
        <BatchMoveModal
          files={selectedFiles}
          onConfirm={confirmBatchMove}
          onCancel={() => setBatchMoveOpen(false)}
        />
      )}

      {tagTarget && (
        <TagEditModal
          file={tagTarget}
          suggestions={tagSuggestions}
          onConfirm={confirmTags}
          onCancel={() => setTagTarget(null)}
        />
      )}

      {newFolderOpen && (
        <NewFolderModal
          category={category}
          folderPath={folderPath}
          libraryRoot={info?.root ?? "D:\\FileManager\\资料库"}
          onConfirm={(name, targetCategory) => void confirmCreateFolder(name, targetCategory)}
          onCancel={() => setNewFolderOpen(false)}
        />
      )}

      <LibraryToolbar
        categoryLabel={categoryLabel}
        pageSubtitle={pageSubtitle}
        canReclassify={category !== "favorites" && !isInboxView}
        reclassifyLabel={category === "all" ? "整理全库" : "整理分类"}
        misplacedCount={misplacedCount}
        disabled={toolbarDisabled}
        onPickAndImport={() => void pickAndImport()}
        onNewFolder={() => setNewFolderOpen(true)}
        onImportDesktop={() =>
          void openImportModal("list_desktop_import_candidates", "从桌面收纳", "桌面")
        }
        onImportDownloads={() =>
          void openImportModal("list_downloads_import_candidates", "从下载收纳", "下载文件夹")
        }
        onReclassify={() => void reclassifyMisplaced()}
        onRefresh={() => void refresh()}
      />

      {isInboxView && inboxOrganizeCount > 0 ? (
        <InboxOrganizeBanner
          count={inboxOrganizeCount}
          disabled={toolbarDisabled}
          onOrganize={() => void organizeInbox()}
        />
      ) : null}

      <LibraryFileList
        scrollRef={contentScrollRef}
        category={category}
        folderPath={folderPath}
        info={info}
        files={files}
        conflictStrategy={conflictStrategy}
        loadDeferred={loadDeferred}
        deferThreshold={deferThreshold}
        isDragging={isDragging}
        currentFolderDropTarget={currentFolderDropTarget}
        initialLoading={initialLoading}
        pageStats={pageStats}
        visibleSourceFiles={visibleSourceFiles}
        filteredFiles={filteredFiles}
        displayFiles={displayFiles}
        filtering={filtering}
        filters={filters}
        onFiltersChange={setFilters}
        availableExtensions={availableExtensions}
        availableTags={availableTags}
        isMediaCategory={isMediaCategory}
        isVideoCategory={isVideoCategory}
        isAudioCategory={isAudioCategory}
        isImageGrid={isImageGrid}
        mediaSort={mediaSort}
        onMediaSortChange={setMediaSort}
        mediaInfoMap={mediaInfoMap}
        mediaInfoLoading={mediaInfoLoading}
        customRules={customRules}
        selectionActive={selectionActive}
        selectedCount={selection.selectedCount}
        backgroundTaskBusy={backgroundTaskBusy || listTaskBusy}
        showTaskProgress={showTaskProgress}
        showListTaskProgress={showListTaskProgress}
        listTaskProgress={listTaskProgress}
        reclassifyTaskId={reclassifyTaskId}
        reclassifyTaskProgress={reclassifyTaskProgress}
        importTaskId={importTaskId}
        importTaskProgress={importTaskProgress}
        batchTaskId={batchTaskId}
        batchTaskLabel={batchTaskLabel}
        batchTaskProgress={batchTaskProgress}
        selectedFilesCount={selectedFiles.length}
        onRefresh={() => void refresh()}
        onCancelListTask={() => void cancelListTask()}
        onCancelReclassifyTask={() => void cancelReclassifyTask()}
        onCancelImportTask={() => void cancelImportTask()}
        onCancelBatchTask={() => void cancelBatchTask()}
        onSelectAll={() => selection.selectAll(visiblePaths)}
        onInvertSelection={() => selection.invert(visiblePaths)}
        onClearSelection={selection.clear}
        onBatchMove={() => setBatchMoveOpen(true)}
        onBatchFavorite={() => void batchSetFavorite(true)}
        onBatchUnfavorite={() => void batchSetFavorite(false)}
        onBatchRestore={batchRestore}
        onBatchSaveAs={() => void batchSaveAs()}
        onBatchDelete={() => setBatchDeleteOpen(true)}
        previewPath={previewFile?.path ?? null}
        batchSelected={selection.selected}
        isSelected={selection.isSelected}
        onPreview={setPreviewFile}
        onOpen={openFile}
        onToggleFavorite={(file, favorite) => void setFavorite(file, favorite)}
        onEditTags={setTagTarget}
        onToggleSelect={onToggleSelect}
        onRename={setRenameTarget}
        onSaveAs={(file) => void saveAs(file)}
        onDelete={setDeleteTarget}
        onRestore={restoreToOriginal}
        onShowInFolder={showInFolder}
        onTagFilter={(tag) =>
          setFilters((current) => ({
            ...current,
            tags: current.tags.includes(tag) ? current.tags : [...current.tags, tag],
          }))
        }
      />
    </>
  );
}
