import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ScanResult } from "../types";
import { TaskProgressPanel } from "./TaskProgressPanel";
import { formatBytes, formatNumber } from "../utils";
import { useOperationToast } from "../hooks/useOperationToast";
import { createFinishedTaskRegistry, useBackgroundTask } from "../hooks/useBackgroundTask";
import { reportError, reportToastError } from "../utils/errors";

export function OverviewView() {
  const { toastError, toastInfo } = useOperationToast();
  const [rootPath, setRootPath] = useState("");
  const [quickPaths, setQuickPaths] = useState<[string, string][]>([]);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const finishedTaskIdsRef = useRef(createFinishedTaskRegistry());

  const { taskId, progress, isRunning, assignTask, resetProgress, cancelTask } =
    useBackgroundTask<ScanResult>({
      kind: "scan-directory",
      listenContext: "订阅总览扫描任务",
      finishedTaskIdsRef,
      handlers: {
        onCompleted: (payload) => {
          if (payload.result) {
            setScan(payload.result);
            setRootPath(payload.result.root);
          }
          setLoading(false);
        },
        onFailed: (payload) => {
          toastError(payload.message);
          setScan(null);
          setLoading(false);
        },
        onCancelled: () => {
          toastInfo("扫描已取消");
          setLoading(false);
        },
      },
    });

  useEffect(() => {
    invoke<[string, string][]>("get_quick_paths")
      .then(setQuickPaths)
      .catch((e) => reportError("加载快捷路径", e, { toast: toastError }));
  }, [toastError]);

  const runScan = useCallback(
    async (path: string) => {
      if (!path) return;
      setLoading(true);
      resetProgress();
      try {
        const nextTaskId = await invoke<string>("start_scan_directory_task", { path });
        if (!assignTask(nextTaskId)) return;
        setRootPath(path);
      } catch (e) {
        reportToastError(toastError, "启动目录扫描", e);
        setScan(null);
        setLoading(false);
      }
    },
    [assignTask, resetProgress, toastError],
  );

  const pickFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择要扫描的文件夹",
    });
    if (selected && typeof selected === "string") {
      setRootPath(selected);
      await runScan(selected);
    }
  };

  const maxExtBytes = scan?.by_extension[0]?.bytes ?? 1;

  return (
    <>
      <header className="page-header">
        <div className="page-header-main">
          <h1 className="page-title">总览扫描</h1>
          <p className="page-subtitle" title={rootPath || undefined}>
            {rootPath || "扫描任意文件夹，查看占用与类型分布"}
          </p>
        </div>
        <div className="page-actions">
          <div className="quick-paths">
            {quickPaths.map(([label, path]) => (
              <button
                key={path}
                type="button"
                className="btn btn-ghost"
                onClick={() => runScan(path)}
                disabled={loading}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" onClick={pickFolder} disabled={loading}>
            选择目录
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => runScan(rootPath)}
            disabled={loading || !rootPath}
          >
            {loading ? "扫描中…" : "开始扫描"}
          </button>
          {loading && taskId && (
            <button type="button" className="btn btn-ghost" onClick={() => void cancelTask()}>
              取消
            </button>
          )}
        </div>
      </header>

      <div className="content">
        {isRunning && (
          <TaskProgressPanel
            message={progress?.message || "正在扫描，请稍候…"}
            processed={progress?.processed}
            onCancel={() => void cancelTask()}
            cancelLabel="取消扫描"
          />
        )}

        {!loading && !scan && (
          <div className="empty">用于了解某个文件夹的占用情况，与资料库收纳互补。</div>
        )}

        {scan && !loading && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">文件数</div>
                <div className="value">{formatNumber(scan.file_count)}</div>
              </div>
              <div className="stat-card">
                <div className="label">子文件夹</div>
                <div className="value">{formatNumber(scan.dir_count)}</div>
              </div>
              <div className="stat-card">
                <div className="label">总占用</div>
                <div className="value">{formatBytes(scan.total_bytes)}</div>
              </div>
              <div className="stat-card">
                <div className="label">扩展名种类</div>
                <div className="value">{formatNumber(scan.by_extension.length)}</div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">按扩展名分布（Top 20）</div>
              <table>
                <thead>
                  <tr>
                    <th>扩展名</th>
                    <th>数量</th>
                    <th>占用</th>
                    <th>占比</th>
                  </tr>
                </thead>
                <tbody>
                  {scan.by_extension.slice(0, 20).map((row) => (
                    <tr key={row.extension}>
                      <td>.{row.extension}</td>
                      <td>{formatNumber(row.count)}</td>
                      <td>{formatBytes(row.bytes)}</td>
                      <td>
                        <div className="bar-cell">
                          <div
                            className="bar"
                            style={{
                              width: `${Math.max(4, (row.bytes / maxExtBytes) * 120)}px`,
                            }}
                          />
                          {scan.total_bytes > 0
                            ? `${((row.bytes / scan.total_bytes) * 100).toFixed(1)}%`
                            : "—"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <div className="panel-header">占用最大的子文件夹（Top 15）</div>
              <table>
                <thead>
                  <tr>
                    <th>路径</th>
                    <th>文件数</th>
                    <th>占用</th>
                  </tr>
                </thead>
                <tbody>
                  {scan.largest_dirs.map((row) => (
                    <tr key={row.path}>
                      <td className="path-cell" title={row.path}>
                        {row.path}
                      </td>
                      <td>{formatNumber(row.file_count)}</td>
                      <td>{formatBytes(row.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
