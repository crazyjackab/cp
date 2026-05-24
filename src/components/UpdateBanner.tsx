import { useUpdater } from "../context/UpdaterContext";

export function UpdateBanner() {
  const {
    phase,
    availableUpdate,
    progress,
    message,
    downloadAndInstall,
    dismissUpdate,
  } = useUpdater();

  if (phase !== "available" && phase !== "downloading" && phase !== "installing") {
    return null;
  }

  const busy = phase === "downloading" || phase === "installing";

  return (
    <div className="update-banner">
      <div className="update-banner-text">
        <strong>{message || `发现新版本 v${availableUpdate?.version}`}</strong>
        {availableUpdate?.body ? (
          <span className="update-banner-notes">{availableUpdate.body}</span>
        ) : null}
        {busy && progress !== null ? (
          <span className="update-progress">
            <span
              className="update-progress-bar"
              style={{ width: `${progress}%` }}
            />
            <span className="update-progress-label">{progress}%</span>
          </span>
        ) : null}
      </div>
      <div className="update-banner-actions">
        {!busy ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void downloadAndInstall()}
            >
              立即更新
            </button>
            <button type="button" className="btn" onClick={dismissUpdate}>
              稍后
            </button>
          </>
        ) : (
          <span className="update-banner-busy">请稍候…</span>
        )}
      </div>
    </div>
  );
}
