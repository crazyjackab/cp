import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ScanResult } from "../types";
import { formatBytes, formatNumber } from "../utils";

export function OverviewView() {
  const [rootPath, setRootPath] = useState("");
  const [quickPaths, setQuickPaths] = useState<[string, string][]>([]);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<[string, string][]>("get_quick_paths")
      .then(setQuickPaths)
      .catch(() => {});
  }, []);

  const runScan = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError("");
    try {
      const result = await invoke<ScanResult>("scan_directory", { path });
      setScan(result);
      setRootPath(result.root);
    } catch (e) {
      setError(String(e));
      setScan(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
      <header className="toolbar">
        <div
          className={`path-display ${rootPath ? "has-path" : ""}`}
          title={rootPath || "尚未选择目录"}
        >
          {rootPath || "扫描任意文件夹，查看占用与类型分布"}
        </div>
        <div className="quick-paths">
          {quickPaths.map(([label, path]) => (
            <button
              key={path}
              type="button"
              className="btn"
              onClick={() => runScan(path)}
              disabled={loading}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={pickFolder} disabled={loading}>
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
      </header>

      <div className="content">
        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">正在扫描，请稍候…</div>}

        {!loading && !scan && !error && (
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
