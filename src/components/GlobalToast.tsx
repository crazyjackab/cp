import { useAppToast } from "../context/AppToastContext";

export function GlobalToast() {
  const { toasts, dismissToast } = useAppToast();

  if (toasts.length === 0) return null;

  return (
    <div className="global-toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`global-toast global-toast-${toast.kind}`} role="status">
          <span className="global-toast-text">{toast.message}</span>
          <button
            type="button"
            className="global-toast-close"
            aria-label="关闭"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
