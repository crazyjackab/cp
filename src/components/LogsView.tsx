import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BatchOperationResult, ImportRecord } from "../types";
import { TaskProgressPanel } from "./TaskProgressPanel";
import { formatBytes, formatNumber } from "../utils";
import { fileIcon, fileTone, fileTypeLabel } from "../utils/fileUi";
import { IconLocate, IconOpen, IconRefresh, IconRestore } from "./icons";
import { useOperationToast } from "../hooks/useOperationToast";
import { createFinishedTaskRegistry, useBackgroundTask } from "../hooks/useBackgroundTask";
import { reportToastError } from "../utils/errors";

function formatDate(ts: number): string {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

function parentPath(path: string): string {
  const normalized = path.replace(/\//g, "\\");
  const index = normalized.lastIndexOf("\\");
  return index > 0 ? normalized.slice(0, index) : path;
}

export function LogsView() {
  const { toastSuccess, toastError, toastInfo } = useOperationToast();
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const finishedTaskIdsRef = useRef(createFinishedTaskRegistry());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<ImportRecord[]>("list_import_records");
      setRecords(list);
    } catch (e) {
      reportToastError(toastError, "加载收纳记录", e);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const {
    taskId: restoreTaskId,
    progress: restoreTaskProgress,
    isRunning: restoreTaskRunning,
    assignTask: assignRestoreTask,
    resetProgress: resetRestoreProgress,
    cancelTask: cancelRestoreTask,
  } = useBackgroundTask<BatchOperationResult>({
    kind: "batch-restore",
    listenContext: "订阅批量还原任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: (payload) => {
        if (payload.result) {
          const fail = payload.result.failed.length;
          toastSuccess(
            fail > 0
              ? `已还原 ${payload.result.success_count} 个，${fail} 个失败`
              : `已还原 ${payload.result.success_count} 个文件`,
          );
        }
        setLoading(false);
        void refreshRef.current();
      },
      onFailed: (payload) => {
        toastError(payload.message);
        setLoading(false);
      },
      onCancelled: () => {
        toastInfo("还原已取消");
        setLoading(false);
      },
    },
  });

  const existingCount = useMemo(
    () => records.filter((record) => record.library_exists).length,
    [records],
  );
  const totalBytes = useMemo(
    () => records.reduce((sum, record) => sum + record.size, 0),
    [records],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openFile = async (path: string) => {
    try {
      await invoke("open_file", { path });
    } catch (e) {
      reportToastError(toastError, "打开文件", e);
    }
  };

  const locatePath = async (path: string, existsAsFile = true) => {
    try {
      if (existsAsFile) {
        await invoke("show_file_in_folder", { path });
      } else {
        await invoke("open_folder", { path: parentPath(path) });
      }
    } catch (e) {
      reportToastError(toastError, "定位文件", e);
    }
  };

  const restoreRecord = async (record: ImportRecord) => {
    if (!confirm(`确定将「${record.name}」还原到原位置吗？\n${record.original_path}`)) {
      return;
    }

    setLoading(true);
    resetRestoreProgress();
    try {
      const nextTaskId = await invoke<string>("start_batch_restore_files_task", {
        paths: [record.library_path],
      });
      if (!assignRestoreTask(nextTaskId)) return;
    } catch (e) {
      reportToastError(toastError, "启动还原任务", e);
      setLoading(false);
    }
  };

  return (
    <>
      <header className="page-header">
        <div className="page-header-main">
          <h1 className="page-title">操作日志</h1>
          <p className="page-subtitle">查看最近收纳记录，追踪来源与资料库位置</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => void refresh()}
            disabled={loading}
            title="刷新"
            aria-label="刷新"
          >
            <IconRefresh size={16} />
          </button>
        </div>
      </header>

      <div className="content">
        {loading && !restoreTaskId && <p className="loading-inline">读取日志中…</p>}
        {restoreTaskRunning && (
          <TaskProgressPanel
            message={restoreTaskProgress?.message || "正在还原…"}
            processed={restoreTaskProgress?.processed}
            total={restoreTaskProgress?.total ?? 1}
            progress={restoreTaskProgress?.progress}
            onCancel={() => void cancelRestoreTask()}
          />
        )}

        <div className="stat-strip">
          <div className="stat-item stat-item-muted">
            <span className="stat-value">{formatNumber(records.length)}</span>
            <span className="stat-label">收纳记录</span>
          </div>
          <div className="stat-item stat-item-muted">
            <span className="stat-value">{formatNumber(existingCount)}</span>
            <span className="stat-label">仍在资料库</span>
          </div>
          <div className="stat-item stat-item-muted">
            <span className="stat-value">{formatBytes(totalBytes)}</span>
            <span className="stat-label">当前记录体积</span>
          </div>
        </div>

        {!loading && records.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <IconRestore size={32} />
            </div>
            <h2>还没有收纳记录</h2>
            <p>从桌面、下载或拖拽收纳文件后，这里会显示来源路径与资料库位置。</p>
          </div>
        )}

        {records.length > 0 && (
          <div className="log-list">
            {records.map((record) => {
              const tone = fileTone(record.category, record.name);
              return (
                <div
                  key={`${record.library_path}-${record.imported_at}`}
                  className={`log-item ${!record.library_exists ? "log-item-missing" : ""}`}
                >
                  <div className={`file-icon-wrap ${tone}`}>
                    {fileIcon(record.category, record.name)}
                  </div>
                  <div className="log-main">
                    <div className="log-title-row">
                      <span className="log-name" title={record.library_path}>
                        {record.name || "(无文件名)"}
                      </span>
                      <span className={`category-pill ${tone}`}>
                        {fileTypeLabel(record.category, record.name)}
                      </span>
                      {!record.library_exists && (
                        <span className="category-pill category-pill-warn">库内文件不存在</span>
                      )}
                    </div>
                    <div className="log-meta">
                      <span>{formatDate(record.imported_at)}</span>
                      <span>{record.size > 0 ? formatBytes(record.size) : "大小未知"}</span>
                      <span>{record.original_exists ? "原路径可定位" : "原路径可能已移动"}</span>
                    </div>
                    <div className="log-path-grid">
                      <span className="log-path-label">来源</span>
                      <span className="log-path-value" title={record.original_path}>
                        {record.original_path}
                      </span>
                      <span className="log-path-label">库内</span>
                      <span className="log-path-value" title={record.library_path}>
                        {record.library_path}
                      </span>
                    </div>
                  </div>
                  <div className="file-actions log-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="打开库内文件"
                      disabled={!record.library_exists}
                      onClick={() => void openFile(record.library_path)}
                    >
                      <IconOpen size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="定位库内文件"
                      disabled={!record.library_exists}
                      onClick={() => void locatePath(record.library_path)}
                    >
                      <IconLocate size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="定位原路径"
                      onClick={() => void locatePath(record.original_path, record.original_exists)}
                    >
                      <IconLocate size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-warn"
                      title="还原到原位置"
                      disabled={!record.library_exists}
                      onClick={() => void restoreRecord(record)}
                    >
                      <IconRestore size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
