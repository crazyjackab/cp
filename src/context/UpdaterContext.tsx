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
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  DEFAULT_UPDATER_SETTINGS,
  loadUpdaterSettings,
  saveUpdaterSettings,
  type UpdaterSettings,
} from "../settings/updater";

export type UpdaterPhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "error";

interface UpdaterContextValue {
  settings: UpdaterSettings;
  phase: UpdaterPhase;
  currentVersion: string;
  availableUpdate: Update | null;
  progress: number | null;
  message: string;
  setAutoCheckOnStartup: (enabled: boolean) => void;
  checkForUpdate: (options?: { silent?: boolean }) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  dismissUpdate: () => void;
}

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

function formatUpdaterError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("404") || text.includes("Not Found")) {
    return "未找到更新信息，请确认发布端点已配置并上传 latest.json。";
  }
  if (text.includes("network") || text.includes("fetch")) {
    return "网络连接失败，请检查网络后重试。";
  }
  return text || "检查更新失败";
}

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UpdaterSettings>(() =>
    loadUpdaterSettings()
  );
  const [phase, setPhase] = useState<UpdaterPhase>("idle");
  const [currentVersion, setCurrentVersion] = useState("0.1.0");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const startupChecked = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;
    getVersion()
      .then(setCurrentVersion)
      .catch(() => undefined);
  }, []);

  const setAutoCheckOnStartup = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, autoCheckOnStartup: enabled };
      saveUpdaterSettings(next);
      return next;
    });
  }, []);

  const checkForUpdate = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!isTauri()) {
        setPhase("error");
        setMessage("自动更新仅在桌面应用中可用。");
        return;
      }

      if (import.meta.env.DEV) {
        setPhase("error");
        setMessage("开发模式下不支持检查更新，请使用正式安装包测试。");
        return;
      }

      setPhase("checking");
      setProgress(null);
      if (!options?.silent) {
        setMessage("正在检查更新…");
      }

      try {
        const update = await check({ timeout: 30000 });
        if (!update) {
          setAvailableUpdate(null);
          setPhase("idle");
          setMessage(options?.silent ? "" : "当前已是最新版本。");
          return;
        }

        setAvailableUpdate(update);
        setPhase("available");
        setMessage(`发现新版本 v${update.version}`);
      } catch (error) {
        setAvailableUpdate(null);
        setPhase("error");
        setMessage(formatUpdaterError(error));
      }
    },
    []
  );

  const downloadAndInstall = useCallback(async () => {
    if (!availableUpdate) return;

    setPhase("downloading");
    setProgress(0);
    setMessage("正在下载更新…");

    let downloaded = 0;
    let total = 0;

    try {
      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          setPhase("downloading");
          setMessage("正在下载更新…");
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
          }
        } else if (event.event === "Finished") {
          setPhase("installing");
          setProgress(100);
          setMessage("正在安装更新…");
        }
      });

      await relaunch();
    } catch (error) {
      setPhase("error");
      setProgress(null);
      setMessage(formatUpdaterError(error));
    }
  }, [availableUpdate]);

  const dismissUpdate = useCallback(() => {
    setAvailableUpdate(null);
    setPhase("idle");
    setProgress(null);
    setMessage("");
  }, []);

  useEffect(() => {
    if (startupChecked.current) return;
    if (!isTauri() || import.meta.env.DEV) return;
    if (!settings.autoCheckOnStartup) return;

    startupChecked.current = true;
    void checkForUpdate({ silent: true });
  }, [settings.autoCheckOnStartup, checkForUpdate]);

  const value = useMemo<UpdaterContextValue>(
    () => ({
      settings,
      phase,
      currentVersion,
      availableUpdate,
      progress,
      message,
      setAutoCheckOnStartup,
      checkForUpdate,
      downloadAndInstall,
      dismissUpdate,
    }),
    [
      settings,
      phase,
      currentVersion,
      availableUpdate,
      progress,
      message,
      setAutoCheckOnStartup,
      checkForUpdate,
      downloadAndInstall,
      dismissUpdate,
    ]
  );

  return (
    <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>
  );
}

export function useUpdater(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error("useUpdater must be used within UpdaterProvider");
  }
  return ctx;
}

export { DEFAULT_UPDATER_SETTINGS };
