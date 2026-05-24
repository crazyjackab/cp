import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppearance } from "../context/AppearanceContext";
import { useUpdater } from "../context/UpdaterContext";
import type { AccentColor, FontSize, ThemeMode } from "../settings/appearance";
import type { AppConfigInfo, ImportMode } from "../types";
import { LibraryPathConfirmModal } from "./LibraryPathConfirmModal";
import { IconLocate, IconOpen } from "./icons";

const THEME_OPTIONS: { id: ThemeMode; label: string; desc: string }[] = [
  { id: "dark", label: "深色", desc: "默认暗色界面" },
  { id: "light", label: "浅色", desc: "明亮背景" },
  { id: "system", label: "跟随系统", desc: "与 Windows 主题一致" },
];

const ACCENT_OPTIONS: { id: AccentColor; label: string; color: string }[] = [
  { id: "blue", label: "蓝色", color: "#5b8def" },
  { id: "green", label: "绿色", color: "#34d399" },
  { id: "purple", label: "紫色", color: "#a78bfa" },
  { id: "orange", label: "橙色", color: "#fb923c" },
];

const FONT_OPTIONS: { id: FontSize; label: string }[] = [
  { id: "small", label: "小" },
  { id: "medium", label: "标准" },
  { id: "large", label: "大" },
];

const IMPORT_MODE_OPTIONS: { id: ImportMode; label: string; desc: string }[] = [
  { id: "move", label: "移动", desc: "从原位置移入资料库" },
  { id: "copy", label: "复制", desc: "保留原文件，复制一份到资料库" },
];

export function SettingsView() {
  const { settings, setThemeMode, setAccent, setFontSize, resetAppearance } =
    useAppearance();
  const {
    currentVersion,
    phase,
    progress,
    message,
    availableUpdate,
    settings: updaterSettings,
    setAutoCheckOnStartup,
    checkForUpdate,
    downloadAndInstall,
  } = useUpdater();

  const [appConfig, setAppConfig] = useState<AppConfigInfo | null>(null);
  const [libraryMessage, setLibraryMessage] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const checking = phase === "checking";
  const updating = phase === "downloading" || phase === "installing";

  const loadAppConfig = useCallback(async () => {
    try {
      const cfg = await invoke<AppConfigInfo>("get_app_config");
      setAppConfig(cfg);
    } catch (e) {
      setLibraryError(String(e));
    }
  }, []);

  useEffect(() => {
    void loadAppConfig();
  }, [loadAppConfig]);

  const setImportMode = async (mode: ImportMode) => {
    if (!appConfig || appConfig.import_mode === mode) return;
    setLibraryBusy(true);
    setLibraryError("");
    setLibraryMessage("");
    try {
      const cfg = await invoke<AppConfigInfo>("set_import_mode", { mode });
      setAppConfig(cfg);
      setLibraryMessage(mode === "move" ? "收纳方式已设为：移动" : "收纳方式已设为：复制");
    } catch (e) {
      setLibraryError(String(e));
    } finally {
      setLibraryBusy(false);
    }
  };

  const pickLibraryRoot = async () => {
    if (!appConfig) return;
    setLibraryError("");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择资料库文件夹",
      defaultPath: appConfig.library_root,
    });
    if (!selected || typeof selected !== "string") return;
    if (selected.replace(/\\/g, "/").toLowerCase() === appConfig.library_root.replace(/\\/g, "/").toLowerCase()) {
      setLibraryMessage("资料库路径未变更");
      return;
    }
    setPendingPath(selected);
  };

  const confirmLibraryRoot = async (migrate: boolean) => {
    if (!pendingPath || !appConfig) return;
    const newPath = pendingPath;
    setPendingPath(null);
    setLibraryBusy(true);
    setLibraryError("");
    setLibraryMessage("");
    try {
      const result = await invoke<{ message: string; library_root: string }>("set_library_root", {
        newRoot: newPath,
        migrate,
      });
      await loadAppConfig();
      setLibraryMessage(result.message);
    } catch (e) {
      setLibraryError(String(e));
    } finally {
      setLibraryBusy(false);
    }
  };

  const revealPath = async (path: string) => {
    setLibraryError("");
    try {
      await invoke("show_file_in_folder", { path });
    } catch {
      const sep = path.includes("\\") ? "\\" : "/";
      const parent = path.slice(0, Math.max(path.lastIndexOf(sep), path.lastIndexOf("/")));
      if (parent) {
        try {
          await invoke("open_folder", { path: parent });
          return;
        } catch (e) {
          setLibraryError(String(e));
          return;
        }
      }
      setLibraryError("无法打开路径");
    }
  };

  const openPath = async (command: "open_folder", path: string) => {
    setLibraryError("");
    try {
      await invoke(command, { path });
    } catch (e) {
      setLibraryError(String(e));
    }
  };

  return (
    <>
      {pendingPath && appConfig && (
        <LibraryPathConfirmModal
          newPath={pendingPath}
          currentPath={appConfig.library_root}
          onConfirm={(migrate) => void confirmLibraryRoot(migrate)}
          onCancel={() => setPendingPath(null)}
        />
      )}

      <header className="page-header">
        <div className="page-header-main">
          <h1 className="page-title">设置</h1>
          <p className="page-subtitle">资料库、外观与更新偏好</p>
        </div>
      </header>

      <div className="content settings-content">
        <section className="settings-section">
          <h2 className="settings-title">资料库</h2>
          <p className="settings-desc">
            修改资料库位置与收纳方式。配置保存在本机，不会上传。
          </p>

          {libraryMessage ? <p className="toast">{libraryMessage}</p> : null}
          {libraryError ? <p className="alert alert-error">{libraryError}</p> : null}

          <div className="settings-group">
            <h3>资料库路径</h3>
            <p className="path-display" title={appConfig?.library_root ?? ""}>
              {appConfig?.library_root ?? "加载中…"}
            </p>
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={libraryBusy || !appConfig}
                onClick={() => void pickLibraryRoot()}
              >
                更改路径…
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={libraryBusy || !appConfig}
                onClick={() => appConfig && void openPath("open_folder", appConfig.library_root)}
              >
                <IconOpen size={16} />
                打开资料库
              </button>
            </div>
          </div>

          <div className="settings-group">
            <h3>收纳方式</h3>
            <p className="settings-desc">新收纳的文件默认按此方式处理。</p>
            <div className="segmented">
              {IMPORT_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={appConfig?.import_mode === opt.id ? "active" : ""}
                  disabled={libraryBusy || !appConfig}
                  title={opt.desc}
                  onClick={() => void setImportMode(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="form-hint">
              {appConfig?.import_mode === "copy"
                ? "复制模式：原文件保留，资料库中为副本。"
                : "移动模式：文件从原位置移入资料库。"}
            </p>
          </div>

          <div className="settings-group">
            <h3>配置文件</h3>
            <div className="config-path-list">
              <div className="config-path-item">
                <span className="config-path-label">应用配置</span>
                <span className="config-path-value" title={appConfig?.config_path}>
                  {appConfig?.config_path ?? "—"}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!appConfig}
                  onClick={() => appConfig && void revealPath(appConfig.config_path)}
                >
                  <IconLocate size={14} />
                  定位
                </button>
              </div>
              <div className="config-path-item">
                <span className="config-path-label">收纳日志</span>
                <span className="config-path-value" title={appConfig?.import_log_path}>
                  {appConfig?.import_log_path ?? "—"}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!appConfig}
                  onClick={() => appConfig && void revealPath(appConfig.import_log_path)}
                >
                  <IconLocate size={14} />
                  定位
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-title">外观</h2>
          <p className="settings-desc">自定义界面主题、强调色与字号，设置会自动保存。</p>

          <div className="settings-group">
            <h3>主题模式</h3>
            <div className="option-grid theme-grid">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`option-card ${settings.themeMode === opt.id ? "selected" : ""}`}
                  onClick={() => setThemeMode(opt.id)}
                >
                  <span className={`theme-preview theme-preview-${opt.id}`} />
                  <span className="option-label">{opt.label}</span>
                  <span className="option-hint">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group">
            <h3>强调色</h3>
            <div className="option-row accent-row">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`accent-swatch ${settings.accent === opt.id ? "selected" : ""}`}
                  title={opt.label}
                  onClick={() => setAccent(opt.id)}
                  style={{ "--swatch": opt.color } as CSSProperties}
                >
                  <span className="accent-dot" />
                  <span className="accent-name">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group">
            <h3>界面字号</h3>
            <div className="segmented">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={settings.fontSize === opt.id ? "active" : ""}
                  onClick={() => setFontSize(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-actions">
            <button type="button" className="btn" onClick={resetAppearance}>
              恢复默认外观
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-title">更新</h2>
          <p className="settings-desc">
            当前版本 v{currentVersion}。正式安装包可自动检查并安装新版本。
          </p>

          <div className="settings-group">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={updaterSettings.autoCheckOnStartup}
                onChange={(e) => setAutoCheckOnStartup(e.target.checked)}
              />
              <span>启动时自动检查更新</span>
            </label>
          </div>

          {message ? (
            <p
              className={`update-status ${
                phase === "error" ? "error" : phase === "available" ? "success" : ""
              }`}
            >
              {message}
            </p>
          ) : null}

          {availableUpdate?.body ? (
            <pre className="update-notes">{availableUpdate.body}</pre>
          ) : null}

          {updating && progress !== null ? (
            <div className="update-progress update-progress-block">
              <span className="update-progress-bar" style={{ width: `${progress}%` }} />
              <span className="update-progress-label">{progress}%</span>
            </div>
          ) : null}

          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={checking || updating}
              onClick={() => void checkForUpdate()}
            >
              {checking ? "检查中…" : "检查更新"}
            </button>
            {phase === "available" ? (
              <button
                type="button"
                className="btn"
                disabled={updating}
                onClick={() => void downloadAndInstall()}
              >
                下载并安装 v{availableUpdate?.version}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
