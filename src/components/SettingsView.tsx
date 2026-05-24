import type { CSSProperties } from "react";
import { useAppearance } from "../context/AppearanceContext";
import { useUpdater } from "../context/UpdaterContext";
import type { AccentColor, FontSize, ThemeMode } from "../settings/appearance";

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

  const checking = phase === "checking";
  const updating = phase === "downloading" || phase === "installing";

  return (
    <>
      <header className="toolbar">
        <div className="path-display has-path">设置</div>
      </header>

      <div className="content settings-content">
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
