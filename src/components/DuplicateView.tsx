import { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  BatchOperationResult,
  DuplicateFile,
  DuplicateGroup,
  DuplicateScanResult,
} from "../types";
import { formatBytes, formatNumber } from "../utils";
import { fileIcon, fileTone, fileTypeLabel } from "../utils/fileUi";
import { IconDuplicate, IconLocate, IconRefresh, IconTrash } from "./icons";
import { TaskProgressPanel } from "./TaskProgressPanel";
import { useOperationToast } from "../hooks/useOperationToast";
import { createFinishedTaskRegistry, useBackgroundTask } from "../hooks/useBackgroundTask";
import { reportToastError } from "../utils/errors";

function formatDate(ts: number): string {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

function initialKeepMap(groups: DuplicateGroup[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const group of groups) {
    if (group.files[0]) {
      map[group.hash] = group.files[0].path;
    }
  }
  return map;
}

export function DuplicateView() {
  const { toastSuccess, toastError, toastInfo } = useOperationToast();
  const [result, setResult] = useState<DuplicateScanResult | null>(null);
  const [keepByHash, setKeepByHash] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const finishedTaskIdsRef = useRef(createFinishedTaskRegistry());

  const scanRef = useRef<() => Promise<void>>(async () => {});

  const {
    taskId,
    progress: taskProgress,
    isRunning: scanRunning,
    assignTask: assignScanTask,
    resetProgress: resetScanProgress,
    cancelTask: cancelScan,
  } = useBackgroundTask<DuplicateScanResult>({
    kind: "scan-duplicates",
    listenContext: "订阅查重扫描任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: (payload) => {
        if (payload.result) {
          setResult(payload.result);
          setKeepByHash(initialKeepMap(payload.result.groups));
          toastSuccess(
            payload.result.duplicate_group_count > 0
              ? `发现 ${payload.result.duplicate_group_count} 组重复文件`
              : "没有发现重复文件",
          );
        }
        setLoading(false);
      },
      onFailed: (payload) => {
        toastError(payload.message);
        setLoading(false);
      },
      onCancelled: () => {
        toastInfo("扫描已取消");
        setLoading(false);
      },
    },
  });

  const {
    taskId: deleteTaskId,
    progress: deleteTaskProgress,
    isRunning: deleteRunning,
    assignTask: assignDeleteTask,
    resetProgress: resetDeleteProgress,
    cancelTask: cancelDelete,
  } = useBackgroundTask<BatchOperationResult>({
    kind: "batch-delete",
    listenContext: "订阅查重删除任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: (payload) => {
        if (payload.result) {
          const fail = payload.result.failed.length;
          toastSuccess(
            fail > 0
              ? `已删除 ${payload.result.success_count} 个重复文件，${fail} 个失败`
              : `已删除 ${payload.result.success_count} 个重复文件`,
          );
        }
        setLoading(false);
        void scanRef.current();
      },
      onFailed: (payload) => {
        toastError(payload.message);
        setLoading(false);
      },
      onCancelled: () => {
        toastInfo("删除已取消");
        setLoading(false);
      },
    },
  });

  const selectedDeletePaths = useMemo(() => {
    if (!result) return [];
    return result.groups.flatMap((group) => {
      const keepPath = keepByHash[group.hash] ?? group.files[0]?.path;
      return group.files.filter((file) => file.path !== keepPath).map((file) => file.path);
    });
  }, [result, keepByHash]);

  const selectedDeleteBytes = useMemo(() => {
    if (!result) return 0;
    return result.groups.reduce((sum, group) => {
      const keepPath = keepByHash[group.hash] ?? group.files[0]?.path;
      const deleteCount = group.files.filter((file) => file.path !== keepPath).length;
      return sum + deleteCount * group.size;
    }, 0);
  }, [result, keepByHash]);

  const scan = useCallback(async () => {
    setLoading(true);
    resetScanProgress();
    try {
      const nextTaskId = await invoke<string>("start_scan_library_duplicates_task");
      if (!assignScanTask(nextTaskId)) return;
    } catch (e) {
      reportToastError(toastError, "启动查重扫描", e);
      setLoading(false);
    }
  }, [assignScanTask, resetScanProgress, toastError]);

  scanRef.current = scan;

  const locateFile = async (path: string) => {
    try {
      await invoke("show_file_in_folder", { path });
    } catch (e) {
      reportToastError(toastError, "定位文件", e);
    }
  };

  const deleteSelected = async () => {
    if (selectedDeletePaths.length === 0) return;
    if (
      !confirm(
        `确定删除 ${selectedDeletePaths.length} 个重复文件吗？\n文件会移至系统回收站，预计释放 ${formatBytes(selectedDeleteBytes)}。`,
      )
    ) {
      return;
    }

    setLoading(true);
    resetDeleteProgress();
    try {
      const nextTaskId = await invoke<string>("start_batch_delete_library_files_task", {
        paths: selectedDeletePaths,
      });
      if (!assignDeleteTask(nextTaskId)) return;
    } catch (e) {
      reportToastError(toastError, "删除重复文件", e);
      setLoading(false);
    }
  };

  const chooseKeep = (group: DuplicateGroup, file: DuplicateFile) => {
    setKeepByHash((current) => ({ ...current, [group.hash]: file.path }));
  };

  return (
    <>
      <header className="page-header">
        <div className="page-header-main">
          <h1 className="page-title">重复文件</h1>
          <p className="page-subtitle">
            按大小预筛 → BLAKE3 内容哈希 → 字节级比对确认；删除前请人工核对保留项
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void scan()}
            disabled={loading}
          >
            <IconRefresh size={16} />
            {result ? "重新扫描" : "开始扫描"}
          </button>
          {loading && taskId && !deleteTaskId && (
            <button type="button" className="btn btn-ghost" onClick={() => void cancelScan()}>
              取消扫描
            </button>
          )}
          {loading && deleteTaskId && (
            <button type="button" className="btn btn-ghost" onClick={() => void cancelDelete()}>
              取消删除
            </button>
          )}
          {result && result.groups.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              onClick={() => void deleteSelected()}
              disabled={loading || selectedDeletePaths.length === 0}
            >
              <IconTrash size={16} />
              删除重复项
            </button>
          )}
        </div>
      </header>

      <div className="content duplicate-content">
        {deleteRunning && (
          <TaskProgressPanel
            message={deleteTaskProgress?.message || "正在删除重复文件…"}
            processed={deleteTaskProgress?.processed}
            total={deleteTaskProgress?.total ?? selectedDeletePaths.length}
            progress={deleteTaskProgress?.progress}
            onCancel={() => void cancelDelete()}
          />
        )}
        {scanRunning && (
          <TaskProgressPanel
            message={taskProgress?.message || "正在扫描资料库，请稍候…"}
            processed={taskProgress?.processed}
            total={taskProgress?.total}
            progress={taskProgress?.progress}
            onCancel={() => void cancelScan()}
            cancelLabel="取消扫描"
          />
        )}

        <div className="stat-strip">
          <div className="stat-item stat-item-muted">
            <span className="stat-value">
              {result ? formatNumber(result.scanned_file_count) : "-"}
            </span>
            <span className="stat-label">扫描文件</span>
          </div>
          <div className="stat-item stat-item-muted">
            <span className="stat-value">
              {result ? formatNumber(result.hashed_file_count) : "-"}
            </span>
            <span className="stat-label">哈希确认</span>
          </div>
          <div className="stat-item stat-item-muted">
            <span className="stat-value">
              {result ? formatNumber(result.duplicate_group_count) : "-"}
            </span>
            <span className="stat-label">重复组</span>
          </div>
          <div className="stat-item stat-item-muted">
            <span className="stat-value">
              {result ? formatBytes(result.reclaimable_bytes) : "-"}
            </span>
            <span className="stat-label">最多可释放</span>
          </div>
        </div>

        {!result && !loading && (
          <div className="empty-state">
            <div className="empty-icon">
              <IconDuplicate size={32} />
            </div>
            <h2>扫描资料库中的重复文件</h2>
            <p>同大小文件经 BLAKE3 哈希与逐字节比对确认完全一致；删除前请再次核对保留项。</p>
          </div>
        )}

        {result && result.groups.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-icon">
              <IconDuplicate size={32} />
            </div>
            <h2>没有发现重复文件</h2>
            <p>当前资料库里没有大小与内容都相同的文件。</p>
          </div>
        )}

        {result && result.failed.length > 0 && (
          <div className="duplicate-failures">
            <strong>有 {result.failed.length} 个文件未能读取</strong>
            {result.failed.slice(0, 4).map((item) => (
              <p key={item.path} title={item.path}>
                {item.path}：{item.reason}
              </p>
            ))}
          </div>
        )}

        {result && result.groups.length > 0 && (
          <>
            <div className="duplicate-bulk-bar">
              <span>
                默认保留每组最新文件，将删除 {formatNumber(selectedDeletePaths.length)} 个副本，
                预计释放 {formatBytes(selectedDeleteBytes)}。删除前请确认保留项无误。
              </span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void deleteSelected()}
                disabled={loading || selectedDeletePaths.length === 0}
              >
                删除选中的重复项
              </button>
            </div>

            <div className="duplicate-group-list">
              {result.groups.map((group, index) => {
                const keepPath = keepByHash[group.hash] ?? group.files[0]?.path;
                return (
                  <section className="duplicate-group" key={group.hash}>
                    <header className="duplicate-group-header">
                      <div>
                        <h2>重复组 {index + 1}</h2>
                        <p>
                          {group.files.length} 个文件 · 每个 {formatBytes(group.size)} · 可释放{" "}
                          {formatBytes(group.size * (group.files.length - 1))}
                        </p>
                      </div>
                      <span className="duplicate-hash" title={group.hash}>
                        {group.hash.slice(0, 16)}…
                      </span>
                    </header>

                    <div className="duplicate-file-list">
                      {group.files.map((file) => {
                        const isKeep = file.path === keepPath;
                        const tone = fileTone(file.category, file.name);
                        return (
                          <div
                            key={file.path}
                            className={`duplicate-file ${isKeep ? "duplicate-file-keep" : ""}`}
                          >
                            <label className="duplicate-keep">
                              <input
                                type="radio"
                                name={`keep-${group.hash}`}
                                checked={isKeep}
                                onChange={() => chooseKeep(group, file)}
                              />
                              <span>{isKeep ? "保留" : "删除"}</span>
                            </label>
                            <div className={`file-icon-wrap ${tone}`}>
                              {fileIcon(file.category, file.name)}
                            </div>
                            <div className="duplicate-file-main">
                              <div className="duplicate-file-title">
                                <span title={file.path}>{file.name}</span>
                                <span className={`category-pill ${tone}`}>
                                  {fileTypeLabel(file.category, file.name)}
                                </span>
                              </div>
                              <div className="duplicate-file-meta">
                                <span>{formatDate(file.modified)}</span>
                                <span title={file.path}>{file.path}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="icon-btn"
                              title="定位文件"
                              onClick={() => void locateFile(file.path)}
                            >
                              <IconLocate size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
