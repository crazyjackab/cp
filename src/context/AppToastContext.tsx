import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BackgroundTaskEvent, ImportResult } from "../types";
import { formatImportResultMessage } from "../utils/importMessages";
import { isMainWindowActive } from "../utils/windowState";
import { useBackgroundTask } from "../hooks/useBackgroundTask";

export type ToastKind = "success" | "error" | "info";

export interface AppToast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface AppToastContextValue {
  toasts: AppToast[];
  showToast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
  noteImportTask: (taskId: string, sourceLabel?: string) => void;
}

const AppToastContext = createContext<AppToastContextValue | null>(null);

const TOAST_DURATION_MS = 5200;

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const nextId = useRef(1);
  const importSources = useRef(new Map<string, string>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const trimmed = message.trim();
      if (!trimmed) return;

      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message: trimmed, kind }]);

      const timer = setTimeout(() => {
        dismissToast(id);
      }, TOAST_DURATION_MS);
      timers.current.set(id, timer);
    },
    [dismissToast],
  );

  const noteImportTask = useCallback((taskId: string, sourceLabel = "") => {
    importSources.current.set(taskId, sourceLabel);
  }, []);

  const resolveImportLabel = useCallback((taskId: string, eventLabel?: string | null) => {
    const fromEvent = eventLabel?.trim() ?? "";
    if (fromEvent) {
      importSources.current.delete(taskId);
      return fromEvent;
    }
    const label = importSources.current.get(taskId) ?? "";
    importSources.current.delete(taskId);
    return label;
  }, []);

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const resolveImportLabelRef = useRef(resolveImportLabel);
  resolveImportLabelRef.current = resolveImportLabel;

  const notifyImportIfInactive = useCallback(
    (handler: (payload: BackgroundTaskEvent<ImportResult>) => void) =>
      (payload: BackgroundTaskEvent<ImportResult>) => {
        void (async () => {
          const active = await isMainWindowActive();
          if (!active) return;
          handler(payload);
        })();
      },
    [],
  );

  useBackgroundTask<ImportResult>({
    kind: "import-files",
    listenContext: "订阅收纳任务通知",
    matchActiveTask: false,
    handlers: {
      onCompleted: notifyImportIfInactive((payload) => {
        if (!payload.result) return;
        const fail = payload.result.failed.length;
        const sourceLabel = resolveImportLabelRef.current(payload.task_id, payload.source_label);
        showToastRef.current(
          formatImportResultMessage(payload.result, sourceLabel),
          fail > 0 ? "error" : "success",
        );
      }),
      onFailed: notifyImportIfInactive((payload) => {
        const sourceLabel = resolveImportLabelRef.current(payload.task_id, payload.source_label);
        const prefix = sourceLabel ? `${sourceLabel}收纳失败：` : "收纳失败：";
        showToastRef.current(`${prefix}${payload.message}`, "error");
      }),
      onCancelled: notifyImportIfInactive((payload) => {
        const sourceLabel = resolveImportLabelRef.current(payload.task_id, payload.source_label);
        showToastRef.current(sourceLabel ? `${sourceLabel}收纳已取消` : "收纳已取消", "info");
      }),
    },
  });

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) {
        clearTimeout(timer);
      }
      timers.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast,
      noteImportTask,
    }),
    [dismissToast, noteImportTask, showToast, toasts],
  );

  return <AppToastContext.Provider value={value}>{children}</AppToastContext.Provider>;
}

export function useAppToast() {
  const context = useContext(AppToastContext);
  if (!context) {
    throw new Error("useAppToast must be used within AppToastProvider");
  }
  return context;
}
