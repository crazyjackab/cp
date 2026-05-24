import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useDragDropImport } from "../hooks/useDragDropImport";
import {
  DEFAULT_LIBRARY_FILTERS,
  collectExtensions,
  filterLibraryFiles,
  hasActiveFilters,
  type LibraryFilters,
} from "../utils/libraryFilter";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { ImageGridView } from "./ImageGridView";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { ImportConfirmModal } from "./ImportConfirmModal";
import { LibrarySearchBar } from "./LibrarySearchBar";
import { RenameModal } from "./RenameModal";
import type {
  ImportResult,
  LibraryCategory,
  LibraryFile,
  LibraryInfo,
  PendingImportFile,
} from "../types";
import { formatBytes, formatNumber } from "../utils";
import { fileIcon, fileTone, fileTypeLabel } from "../utils/fileUi";
import {
  IconDesktop,
  IconDownload,
  IconEdit,
  IconFiles,
  IconImport,
  IconLocate,
  IconOpen,
  IconRefresh,
  IconRestore,
  IconStorage,
  IconTrash,
} from "./icons";

interface Props {
  category: LibraryCategory;
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

export function LibraryView({ category }: Props) {
  const [info, setInfo] = useState<LibraryInfo | null>(null);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importModal, setImportModal] = useState<{
    title: string;
    sourceLabel: string;
    files: PendingImportFile[];
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<LibraryFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryFile | null>(null);
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);

  useEffect(() => {
    setFilters(DEFAULT_LIBRARY_FILTERS);
    setPreviewFile(null);
  }, [category]);

  const availableExtensions = useMemo(() => collectExtensions(files), [files]);
  const filteredFiles = useMemo(
    () => filterLibraryFiles(files, filters),
    [files, filters],
  );
  const filtering = hasActiveFilters(filters);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const lib = await invoke<LibraryInfo>("get_library_info");
      setInfo(lib);
      const list = await invoke<LibraryFile[]>("list_library_files", {
        category: category === "all" ? "all" : category,
      });
      setFiles(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    invoke("init_library").catch(() => {});
    refresh();
  }, [refresh]);

  const importPaths = useCallback(
    async (paths: string[]) => {
      setLoading(true);
      setError("");
      setMessage("");
      try {
        const result = await invoke<ImportResult>("import_files", { paths });
        const fail = result.failed.length;
        setMessage(
          fail > 0
            ? `已收纳 ${result.moved_count} 个文件，${fail} 个失败`
            : `已收纳 ${result.moved_count} 个文件`,
        );
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const { isDragging } = useDragDropImport(importPaths);

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
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const candidates = await invoke<PendingImportFile[]>(command);
      setImportModal({ title, sourceLabel, files: candidates });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const importDesktop = () =>
    openImportModal(
      "list_desktop_import_candidates",
      "从桌面收纳",
      "桌面",
    );

  const importDownloads = () =>
    openImportModal(
      "list_downloads_import_candidates",
      "从下载收纳",
      "下载文件夹",
    );

  const confirmModalImport = async (paths: string[]) => {
    setImportModal(null);
    if (paths.length === 0) return;
    await importPaths(paths);
  };

  const categoryLabel = category === "all" ? "全部文件" : category;
  const isImageGrid = category === "图片";

  const openFile = async (path: string) => {
    setError("");
    try {
      await invoke("open_file", { path });
    } catch (e) {
      setError(String(e));
    }
  };

  const showInFolder = async (path: string) => {
    setError("");
    try {
      await invoke("show_file_in_folder", { path });
    } catch (e) {
      setError(String(e));
    }
  };

  const confirmRename = async (newName: string) => {
    if (!renameTarget) return;
    setRenameTarget(null);
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const newPath = await invoke<string>("rename_library_file", {
        path: renameTarget.path,
        newName,
      });
      setMessage(`已重命名为：${newPath.split(/[/\\]/).pop()}`);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await invoke("delete_library_file", { path: target.path });
      setMessage(`已删除「${target.name}」（已移至回收站）`);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const restoreToOriginal = async (file: LibraryFile) => {
    const hint = file.original_path
      ? `确定将「${file.name}」还原到原位置？\n${file.original_path}`
      : `未找到原路径记录，将把「${file.name}」还原到桌面。确定继续？`;

    if (!confirm(hint)) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const restored = await invoke<string>("restore_file", { path: file.path });
      setMessage(`已还原：${restored}`);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {importModal && (
        <ImportConfirmModal
          title={importModal.title}
          sourceLabel={importModal.sourceLabel}
          files={importModal.files}
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

      {previewFile && (
        <ImagePreviewModal
          file={previewFile}
          onOpen={openFile}
          onLocate={showInFolder}
          onClose={() => setPreviewFile(null)}
        />
      )}

      <header className="page-header">
        <div className="page-header-main">
          <h1 className="page-title">{categoryLabel}</h1>
          <p className="page-subtitle" title={info?.root ?? ""}>
            {info?.root ?? "D:\\FileManager\\资料库"}
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={pickAndImport}
            disabled={loading}
          >
            <IconImport size={16} />
            收纳文件
          </button>
          <button type="button" className="btn btn-ghost" onClick={importDesktop} disabled={loading}>
            <IconDesktop size={16} />
            桌面
          </button>
          <button type="button" className="btn btn-ghost" onClick={importDownloads} disabled={loading}>
            <IconDownload size={16} />
            下载
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={refresh}
            disabled={loading}
            title="刷新"
            aria-label="刷新"
          >
            <IconRefresh size={16} />
          </button>
        </div>
      </header>

      <div className={`content drop-zone ${isDragging ? "drop-zone-active" : ""}`}>
        {isDragging && (
          <div className="drop-overlay" aria-hidden>
            <div className="drop-overlay-inner">
              <span className="drop-icon">↓</span>
              <p>松开鼠标，将文件收纳进资料库</p>
              <p className="hint">支持多个文件或整个文件夹</p>
            </div>
          </div>
        )}

        {message && <p className="toast">{message}</p>}
        {error && <p className="alert alert-error">{error}</p>}
        {loading && <p className="loading-inline">处理中…</p>}

        {info && !loading && (
          <div className="stat-strip">
            <div className="stat-item">
              <span className="stat-icon"><IconFiles size={18} /></span>
              <div>
                <span className="stat-value">{formatNumber(info.total_files)}</span>
                <span className="stat-label">文件</span>
              </div>
            </div>
            <div className="stat-item">
              <span className="stat-icon"><IconStorage size={18} /></span>
              <div>
                <span className="stat-value">{formatBytes(info.total_bytes)}</span>
                <span className="stat-label">占用空间</span>
              </div>
            </div>
            <div className="stat-item stat-item-muted">
              <span className="stat-value stat-value-sm">
                {info.import_mode === "copy" ? "复制收纳" : "移动收纳"}
              </span>
              <span className="stat-label">
                {filtering
                  ? `筛选 ${filteredFiles.length} / ${files.length} 项`
                  : `本页 ${files.length} 项`}
              </span>
            </div>
          </div>
        )}

        {!loading && files.length > 0 && (
          <LibrarySearchBar
            filters={filters}
            onChange={setFilters}
            availableExtensions={availableExtensions}
            resultCount={filteredFiles.length}
            totalCount={files.length}
          />
        )}

        {!loading && files.length === 0 && !isDragging && (
          <div className="empty-state">
            <div className="empty-icon"><IconImport size={32} /></div>
            <h2>资料库还是空的</h2>
            <p>拖拽文件或文件夹到窗口，松开后自动按类型收纳。</p>
            <p className="hint">也可点击上方「收纳文件」或「桌面 / 下载」快捷收纳。</p>
          </div>
        )}

        {!loading && files.length > 0 && filteredFiles.length === 0 && (
          <div className="empty-state empty-state-compact">
            <h2>没有匹配的文件</h2>
            <p>试试调整搜索词或筛选条件。</p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setFilters(DEFAULT_LIBRARY_FILTERS)}
            >
              清除筛选
            </button>
          </div>
        )}

        {filteredFiles.length > 0 && isImageGrid ? (
          <ImageGridView
            files={filteredFiles}
            previewPath={previewFile?.path ?? null}
            onPreview={setPreviewFile}
            onOpen={openFile}
          />
        ) : filteredFiles.length > 0 ? (
          <div className="file-list">
            {filteredFiles.map((f) => (
              <div
                key={f.path}
                className="file-item"
                onDoubleClick={() => openFile(f.path)}
              >
                <div className={`file-icon-wrap ${fileTone(f.category, f.name)}`}>
                  {fileIcon(f.category, f.name)}
                </div>
                <div className="file-main">
                  <button
                    type="button"
                    className="file-name"
                    title={f.path}
                    onClick={() => openFile(f.path)}
                  >
                    {f.name}
                  </button>
                  <div className="file-meta">
                    <span className={`category-pill ${fileTone(f.category, f.name)}`}>
                      {fileTypeLabel(f.category, f.name)}
                    </span>
                    <span>{formatBytes(f.size)}</span>
                    <span>{formatDate(f.modified)}</span>
                  </div>
                </div>
                <div className="file-actions">
                  <button type="button" className="icon-btn" title="打开" onClick={() => openFile(f.path)}>
                    <IconOpen size={16} />
                  </button>
                  <button type="button" className="icon-btn" title="定位" onClick={() => showInFolder(f.path)}>
                    <IconLocate size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-warn"
                    title={f.original_path ? `还原到：${f.original_path}` : "还原到桌面"}
                    onClick={() => restoreToOriginal(f)}
                  >
                    <IconRestore size={16} />
                  </button>
                  <button type="button" className="icon-btn" title="重命名" onClick={() => setRenameTarget(f)}>
                    <IconEdit size={16} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-danger" title="删除" onClick={() => setDeleteTarget(f)}>
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
