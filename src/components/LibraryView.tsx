import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useDragDropImport } from "../hooks/useDragDropImport";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { ImportConfirmModal } from "./ImportConfirmModal";
import { RenameModal } from "./RenameModal";
import type {
  ImportResult,
  LibraryCategory,
  LibraryFile,
  LibraryInfo,
  PendingImportFile,
} from "../types";
import { formatBytes, formatNumber } from "../utils";

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

  const categoryLabel =
    category === "all" ? "全部文件" : category;

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

      <header className="toolbar">
        <div className="path-display has-path" title={info?.root ?? ""}>
          资料库：{info?.root ?? "D:\\FileManager\\资料库"}
        </div>
        <button type="button" className="btn btn-primary" onClick={pickAndImport} disabled={loading}>
          收纳文件
        </button>
        <button type="button" className="btn" onClick={importDesktop} disabled={loading}>
          从桌面收纳
        </button>
        <button type="button" className="btn" onClick={importDownloads} disabled={loading}>
          从下载收纳
        </button>
        <button type="button" className="btn" onClick={refresh} disabled={loading}>
          刷新
        </button>
      </header>

      <div
        className={`content drop-zone ${isDragging ? "drop-zone-active" : ""}`}
      >
        {isDragging && (
          <div className="drop-overlay" aria-hidden>
            <div className="drop-overlay-inner">
              <span className="drop-icon">↓</span>
              <p>松开鼠标，将文件收纳进资料库</p>
              <p className="hint">支持多个文件或整个文件夹</p>
            </div>
          </div>
        )}

        {message && <div className="toast">{message}</div>}
        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">处理中…</div>}

        {info && !loading && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="label">资料库文件</div>
              <div className="value">{formatNumber(info.total_files)}</div>
            </div>
            <div className="stat-card">
              <div className="label">总占用</div>
              <div className="value">{formatBytes(info.total_bytes)}</div>
            </div>
            <div className="stat-card">
              <div className="label">收纳方式</div>
              <div className="value value-sm">移动</div>
            </div>
            <div className="stat-card">
              <div className="label">当前视图</div>
              <div className="value value-sm">{categoryLabel}</div>
            </div>
          </div>
        )}

        {!loading && files.length === 0 && !isDragging && (
          <div className="empty">
            <p>资料库还是空的。</p>
            <p>
              <strong>拖拽文件或文件夹到本窗口</strong>，松开后自动按类型收纳。
            </p>
            <p>也可点击「从桌面收纳」或「收纳文件」。</p>
            <p className="hint">文件会移动到 D:\FileManager\资料库 下的 图片、视频、文档 等文件夹。</p>
          </div>
        )}

        {files.length > 0 && (
          <div className="panel">
            <div className="panel-header">
              {categoryLabel}（{files.length}）
            </div>
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>分类</th>
                  <th>大小</th>
                  <th>修改时间</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr
                    key={f.path}
                    className="file-row"
                    onDoubleClick={() => openFile(f.path)}
                  >
                    <td className="name-cell" title={f.path}>
                      <button
                        type="button"
                        className="name-link"
                        onClick={() => openFile(f.path)}
                      >
                        {f.name}
                      </button>
                    </td>
                    <td>{f.category}</td>
                    <td>{formatBytes(f.size)}</td>
                    <td>{formatDate(f.modified)}</td>
                    <td className="action-cell">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openFile(f.path)}
                      >
                        打开
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => showInFolder(f.path)}
                      >
                        定位
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-restore"
                        title={
                          f.original_path
                            ? `还原到：${f.original_path}`
                            : "还原到桌面"
                        }
                        onClick={() => restoreToOriginal(f)}
                      >
                        还原
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setRenameTarget(f)}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => setDeleteTarget(f)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
