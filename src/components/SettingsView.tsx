import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppearance } from "../context/AppearanceContext";
import { useOperationToast } from "../hooks/useOperationToast";
import { createFinishedTaskRegistry, useBackgroundTask } from "../hooks/useBackgroundTask";
import { useUpdater } from "../context/UpdaterContext";
import type { AccentColor, FontSize, ThemeMode } from "../settings/appearance";
import type {
  AppConfigInfo,
  ImportConflictStrategy,
  ImportDestination,
  ImportMode,
  ImportResult,
  LibraryInfo,
  LibraryMoveTarget,
  SetLibraryRootResult,
  SmartReminderStatus,
} from "../types";
import { LIBRARY_MOVE_TARGETS } from "../types";
import { reportError, reportToastError } from "../utils/errors";
import { formatBytes, formatNumber } from "../utils";
import { LibraryPathConfirmModal } from "./LibraryPathConfirmModal";
import { TaskProgressPanel } from "./TaskProgressPanel";
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

const IMPORT_DESTINATION_OPTIONS: { id: ImportDestination; label: string; desc: string }[] = [
  { id: "classify", label: "直接分类", desc: "按扩展名自动放入对应分类文件夹" },
  { id: "inbox", label: "先进收件箱", desc: "新文件先进入收件箱，确认后再一键整理" },
];

const CONFLICT_OPTIONS: { id: ImportConflictStrategy; label: string; desc: string }[] = [
  { id: "rename", label: "自动重命名", desc: "同名文件会保存为 xxx (1)" },
  { id: "skip", label: "跳过", desc: "资料库已有同名文件时不收纳" },
  { id: "ask", label: "每次询问", desc: "遇到同名冲突时先询问本次处理方式" },
];

function conflictLabel(strategy: string | undefined): string {
  return CONFLICT_OPTIONS.find((opt) => opt.id === strategy)?.label ?? "自动重命名";
}

export function SettingsView() {
  const { settings, setThemeMode, setAccent, setFontSize, resetAppearance } = useAppearance();
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
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryInfo, setLibraryInfo] = useState<LibraryInfo | null>(null);
  const [libraryInfoLoading, setLibraryInfoLoading] = useState(false);
  const [reminderStatus, setReminderStatus] = useState<SmartReminderStatus | null>(null);
  const [reminderThreshold, setReminderThreshold] = useState(10);
  const [deferLoadThreshold, setDeferLoadThreshold] = useState(500);
  const [importMinSizeKb, setImportMinSizeKb] = useState(0);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [ruleExtension, setRuleExtension] = useState("");
  const [ruleCategory, setRuleCategory] = useState<LibraryMoveTarget>("文档");
  const { toastSuccess, toastError, toastInfo, noteImportTask } = useOperationToast();
  const importLabelRef = useRef("");
  const finishedTaskIdsRef = useRef(createFinishedTaskRegistry());

  const checking = phase === "checking";
  const updating = phase === "downloading" || phase === "installing";

  const loadAppConfig = useCallback(async () => {
    try {
      const cfg = await invoke<AppConfigInfo>("get_app_config");
      setAppConfig(cfg);
      setDeferLoadThreshold(cfg.defer_library_load_threshold);
      setImportMinSizeKb(cfg.import_min_size_kb ?? 0);
    } catch (e) {
      reportToastError(toastError, "读取应用配置", e);
    }
  }, [toastError]);

  const loadLibraryInfo = useCallback(async () => {
    setLibraryInfoLoading(true);
    try {
      const info = await invoke<LibraryInfo>("get_library_info");
      setLibraryInfo(info);
    } catch (e) {
      reportToastError(toastError, "读取资料库信息", e);
    } finally {
      setLibraryInfoLoading(false);
    }
  }, [toastError]);

  const loadReminderStatus = useCallback(async () => {
    try {
      const status = await invoke<SmartReminderStatus>("get_smart_reminder_status");
      setReminderStatus(status);
      setReminderThreshold(status.threshold);
    } catch (e) {
      reportToastError(toastError, "读取智能提醒状态", e);
    }
  }, [toastError]);

  const loadAppConfigRef = useRef(loadAppConfig);
  loadAppConfigRef.current = loadAppConfig;
  const loadLibraryInfoRef = useRef(loadLibraryInfo);
  loadLibraryInfoRef.current = loadLibraryInfo;
  const loadReminderStatusRef = useRef(loadReminderStatus);
  loadReminderStatusRef.current = loadReminderStatus;

  const {
    progress: importTaskProgress,
    isRunning: importTaskRunning,
    assignTask: assignImportTask,
    resetProgress: resetImportProgress,
    dismissTask: dismissImportTask,
    cancelTask: cancelImportTask,
  } = useBackgroundTask<ImportResult>({
    kind: "import-files",
    listenContext: "订阅设置页收纳任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: () => {
        setLibraryBusy(false);
        void loadReminderStatusRef.current();
        void loadLibraryInfoRef.current();
      },
      onFailed: () => {
        setLibraryBusy(false);
      },
      onCancelled: () => {
        setLibraryBusy(false);
      },
    },
  });

  const {
    progress: migrationProgress,
    isRunning: migrationTaskRunning,
    assignTask: assignMigrationTask,
    resetProgress: resetMigrationProgress,
    cancelTask: cancelMigration,
  } = useBackgroundTask<SetLibraryRootResult>({
    kind: "library-migration",
    listenContext: "订阅资料库迁移任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: (payload) => {
        if (payload.result) {
          toastSuccess(payload.result.message);
        }
        setLibraryBusy(false);
        void loadAppConfigRef.current();
        void loadLibraryInfoRef.current();
      },
      onFailed: (payload) => {
        toastError(payload.message);
        setLibraryBusy(false);
      },
      onCancelled: () => {
        toastInfo("资料库迁移已取消");
        setLibraryBusy(false);
        void loadAppConfigRef.current();
        void loadLibraryInfoRef.current();
      },
    },
  });

  useEffect(() => {
    void loadAppConfig();
    void loadLibraryInfo();
    void loadReminderStatus();
  }, [loadAppConfig, loadLibraryInfo, loadReminderStatus]);

  const setImportMode = async (mode: ImportMode) => {
    if (!appConfig || appConfig.import_mode === mode) return;
    setLibraryBusy(true);
    try {
      const cfg = await invoke<AppConfigInfo>("set_import_mode", { mode });
      setAppConfig(cfg);
      await loadLibraryInfo();
      toastSuccess(mode === "move" ? "收纳方式已设为：移动" : "收纳方式已设为：复制");
    } catch (e) {
      reportToastError(toastError, "设置收纳方式", e);
    } finally {
      setLibraryBusy(false);
    }
  };

  const setImportDestination = async (destination: ImportDestination) => {
    if (!appConfig || appConfig.import_destination === destination) return;
    setLibraryBusy(true);
    try {
      const cfg = await invoke<AppConfigInfo>("set_import_destination", { destination });
      setAppConfig(cfg);
      toastSuccess(
        destination === "inbox" ? "收纳目标已设为：先进收件箱" : "收纳目标已设为：直接分类",
      );
    } catch (e) {
      reportToastError(toastError, "设置收纳目标", e);
    } finally {
      setLibraryBusy(false);
    }
  };

  const saveImportMinSizeKb = async () => {
    if (!appConfig) return;
    const next = Math.max(0, Math.min(102_400, Math.floor(importMinSizeKb) || 0));
    if (appConfig.import_min_size_kb === next) return;
    setLibraryBusy(true);
    try {
      const cfg = await invoke<AppConfigInfo>("set_import_min_size_kb", { minKb: next });
      setAppConfig(cfg);
      setImportMinSizeKb(cfg.import_min_size_kb ?? 0);
      toastSuccess(next === 0 ? "已关闭按大小跳过收纳" : `已跳过小于 ${next} KB 的文件`);
    } catch (e) {
      reportToastError(toastError, "设置收纳大小阈值", e);
    } finally {
      setLibraryBusy(false);
    }
  };

  const setConflictStrategy = async (strategy: ImportConflictStrategy) => {
    if (!appConfig || appConfig.import_conflict_strategy === strategy) return;
    setLibraryBusy(true);
    try {
      const cfg = await invoke<AppConfigInfo>("set_import_conflict_strategy", { strategy });
      setAppConfig(cfg);
      toastSuccess(`同名冲突策略已设为：${conflictLabel(strategy)}`);
    } catch (e) {
      reportToastError(toastError, "设置同名冲突策略", e);
    } finally {
      setLibraryBusy(false);
    }
  };

  const saveCustomRule = async () => {
    if (!appConfig) return;
    setLibraryBusy(true);
    try {
      const cfg = await invoke<AppConfigInfo>("set_custom_extension_rule", {
        extension: ruleExtension,
        category: ruleCategory,
      });
      setAppConfig(cfg);
      setRuleExtension("");
      toastSuccess(
        `已添加分类规则：.${ruleExtension.trim().replace(/^\./, "").toLowerCase()} → ${ruleCategory}`,
      );
    } catch (e) {
      reportToastError(toastError, "添加分类规则", e);
    } finally {
      setLibraryBusy(false);
    }
  };

  const removeCustomRule = async (extension: string) => {
    if (!appConfig) return;
    setLibraryBusy(true);
    try {
      const cfg = await invoke<AppConfigInfo>("remove_custom_extension_rule", { extension });
      setAppConfig(cfg);
      toastSuccess(`已删除分类规则：.${extension}`);
    } catch (e) {
      reportToastError(toastError, "删除分类规则", e);
    } finally {
      setLibraryBusy(false);
    }
  };

  const setSmartReminder = async (enabled: boolean, threshold = reminderThreshold) => {
    if (!appConfig) return;
    setLibraryBusy(true);
    try {
      const cfg = await invoke<AppConfigInfo>("set_smart_reminder", {
        enabled,
        threshold,
      });
      setAppConfig(cfg);
      await loadReminderStatus();
      toastSuccess(enabled ? "智能提醒已启用" : "智能提醒已关闭");
    } catch (e) {
      reportToastError(toastError, "设置智能提醒", e);
    } finally {
      setLibraryBusy(false);
    }
  };

  const saveReminderThreshold = async () => {
    await setSmartReminder(appConfig?.smart_reminder_enabled ?? true, reminderThreshold);
  };

  const setDeferLibraryLoad = async (enabled: boolean, threshold = deferLoadThreshold) => {
    if (!appConfig) return;
    setLibraryBusy(true);
    try {
      const cfg = await invoke<AppConfigInfo>("set_defer_library_load", {
        enabled,
        threshold,
      });
      setAppConfig(cfg);
      setDeferLoadThreshold(cfg.defer_library_load_threshold);
      toastSuccess(enabled ? "延迟加载已启用" : "延迟加载已关闭");
    } catch (e) {
      reportToastError(toastError, "设置延迟加载", e);
    } finally {
      setLibraryBusy(false);
    }
  };

  const saveDeferLoadThreshold = async () => {
    await setDeferLibraryLoad(appConfig?.defer_library_load_enabled ?? false, deferLoadThreshold);
  };

  const quickImport = async (source: "desktop" | "downloads", label: string) => {
    setLibraryBusy(true);
    resetImportProgress();
    importLabelRef.current = label;
    try {
      const command =
        source === "desktop"
          ? "start_import_from_desktop_task"
          : "start_import_from_downloads_task";
      const nextTaskId = await invoke<string>(command);
      if (!assignImportTask(nextTaskId)) return;
      noteImportTask(nextTaskId, label);
    } catch (e) {
      reportToastError(toastError, "启动快速收纳", e);
      setLibraryBusy(false);
      dismissImportTask();
    }
  };

  const pickLibraryRoot = async () => {
    if (!appConfig) return;
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择资料库文件夹",
      defaultPath: appConfig.library_root,
    });
    if (!selected || typeof selected !== "string") return;
    if (
      selected.replace(/\\/g, "/").toLowerCase() ===
      appConfig.library_root.replace(/\\/g, "/").toLowerCase()
    ) {
      toastInfo("资料库路径未变更");
      return;
    }
    setPendingPath(selected);
  };

  const confirmLibraryRoot = async (migrate: boolean) => {
    if (!pendingPath || !appConfig) return;
    const newPath = pendingPath;
    setPendingPath(null);
    setLibraryBusy(true);
    resetMigrationProgress();
    try {
      const nextTaskId = await invoke<string>("start_set_library_root_task", {
        newRoot: newPath,
        migrate,
      });
      if (!assignMigrationTask(nextTaskId)) return;
    } catch (e) {
      reportToastError(toastError, "迁移资料库", e);
      setLibraryBusy(false);
    }
  };

  const customRules = Object.entries(appConfig?.custom_extension_rules ?? {}).sort(([a], [b]) =>
    a.localeCompare(b, "zh-CN"),
  );

  const revealPath = async (path: string) => {
    try {
      await invoke("show_file_in_folder", { path });
    } catch (firstError) {
      reportError("在资源管理器中显示路径", firstError, { warnOnly: true });
      const sep = path.includes("\\") ? "\\" : "/";
      const parent = path.slice(0, Math.max(path.lastIndexOf(sep), path.lastIndexOf("/")));
      if (parent) {
        try {
          await invoke("open_folder", { path: parent });
          return;
        } catch (e) {
          reportToastError(toastError, "打开文件夹", e);
          return;
        }
      }
      toastError("无法打开路径");
    }
  };

  const openPath = async (command: "open_folder", path: string) => {
    try {
      await invoke(command, { path });
    } catch (e) {
      reportToastError(toastError, "打开路径", e);
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
        <div className="settings-layout">
          <section className="settings-panel settings-panel-primary">
            <div className="settings-panel-header">
              <div>
                <h2 className="settings-title">资料库</h2>
                <p className="settings-desc">
                  修改资料库位置与收纳方式。配置保存在本机，不会上传。
                </p>
              </div>
            </div>

            {importTaskRunning ? (
              <TaskProgressPanel
                message={importTaskProgress?.message || "正在收纳…"}
                processed={importTaskProgress?.processed}
                total={importTaskProgress?.total}
                progress={importTaskProgress?.progress}
                onCancel={() => void cancelImportTask()}
              />
            ) : null}
            {migrationTaskRunning ? (
              <>
                <TaskProgressPanel
                  message={migrationProgress?.message || "正在处理资料库路径…"}
                  processed={migrationProgress?.processed}
                  total={migrationProgress?.total}
                  progress={migrationProgress?.progress}
                  onCancel={() => void cancelMigration()}
                />
                <p className="form-hint">取消会在当前文件处理完成后生效。</p>
              </>
            ) : null}

            <div className="settings-row settings-row-path">
              <div className="settings-row-main">
                <h3>资料库路径</h3>
                <p>文件会按类型收纳到这个目录下。</p>
              </div>
              <div className="settings-row-control">
                <p className="path-display" title={appConfig?.library_root ?? ""}>
                  {appConfig?.library_root ?? "加载中…"}
                </p>
                <div className="settings-inline-actions">
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
                    onClick={() =>
                      appConfig && void openPath("open_folder", appConfig.library_root)
                    }
                  >
                    <IconOpen size={16} />
                    打开资料库
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-main">
                <h3>收纳方式</h3>
                <p>新收纳的文件默认按此方式处理。</p>
              </div>
              <div className="settings-row-control">
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
            </div>

            <div className="settings-row">
              <div className="settings-row-main">
                <h3>收纳目标</h3>
                <p>拖入或快捷收纳时，文件默认进入哪里。</p>
              </div>
              <div className="settings-row-control">
                <div className="segmented">
                  {IMPORT_DESTINATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={
                        (appConfig?.import_destination ?? "classify") === opt.id ? "active" : ""
                      }
                      disabled={libraryBusy || !appConfig}
                      title={opt.desc}
                      onClick={() => void setImportDestination(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="form-hint">
                  {(appConfig?.import_destination ?? "classify") === "inbox"
                    ? "新文件会先进入收件箱；在收件箱页点击「整理」即可自动分到各分类。"
                    : "新文件会按扩展名直接进入图片、文档等分类文件夹。"}
                </p>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-main">
                <h3>跳过过小文件</h3>
                <p>
                  收纳时自动跳过小于指定大小的文件（如临时缓存、空文件）。系统文件与快捷方式始终跳过。
                </p>
              </div>
              <div className="settings-row-control">
                <div className="reminder-threshold-row">
                  <input
                    className="form-input reminder-threshold-input"
                    type="number"
                    min={0}
                    max={102400}
                    step={1}
                    value={importMinSizeKb}
                    disabled={libraryBusy || !appConfig}
                    onChange={(e) => setImportMinSizeKb(Number(e.target.value))}
                  />
                  <span className="form-hint-inline">KB（0 = 不限制）</span>
                  <button
                    type="button"
                    className="btn"
                    disabled={libraryBusy || !appConfig}
                    onClick={() => void saveImportMinSizeKb()}
                  >
                    保存
                  </button>
                </div>
                <p className="form-hint">
                  {(appConfig?.import_min_size_kb ?? 0) > 0
                    ? `当前会跳过小于 ${appConfig?.import_min_size_kb} KB 的文件，并在收纳确认中列出。`
                    : "未启用大小过滤；desktop.ini、.lnk 等系统/快捷方式文件仍会跳过。"}
                </p>
              </div>
            </div>

            <div className="settings-row settings-row-stack">
              <div className="settings-row-main">
                <h3>同名冲突</h3>
                <p>当目标分类里已有同名文件时的默认处理方式。</p>
              </div>
              <div className="settings-row-control">
                <div className="option-grid conflict-grid">
                  {CONFLICT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`option-card option-card-compact ${
                        appConfig?.import_conflict_strategy === opt.id ? "selected" : ""
                      }`}
                      disabled={libraryBusy || !appConfig}
                      onClick={() => void setConflictStrategy(opt.id)}
                    >
                      <span className="option-label">{opt.label}</span>
                      <span className="option-hint">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="settings-row settings-row-stack">
              <div className="settings-row-main">
                <h3>自定义分类规则</h3>
                <p>按扩展名覆盖默认分类，例如 psd → 图片，epub → 文档。</p>
              </div>
              <div className="settings-row-control">
                <div className="rule-editor">
                  <input
                    className="form-input rule-extension-input"
                    value={ruleExtension}
                    onChange={(e) => setRuleExtension(e.target.value)}
                    placeholder="扩展名，例如 psd"
                    disabled={libraryBusy || !appConfig}
                  />
                  <select
                    className="filter-select"
                    value={ruleCategory}
                    onChange={(e) => setRuleCategory(e.target.value as LibraryMoveTarget)}
                    disabled={libraryBusy || !appConfig}
                  >
                    {LIBRARY_MOVE_TARGETS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={libraryBusy || !appConfig || ruleExtension.trim().length === 0}
                    onClick={() => void saveCustomRule()}
                  >
                    保存规则
                  </button>
                </div>

                {customRules.length > 0 ? (
                  <div className="rule-list">
                    {customRules.map(([extension, category]) => (
                      <div className="rule-item" key={extension}>
                        <span className="rule-ext">.{extension}</span>
                        <span className="rule-arrow">→</span>
                        <span className="category-pill tone-other">{category}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-danger-text"
                          disabled={libraryBusy}
                          onClick={() => void removeCustomRule(extension)}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="form-hint">还没有自定义规则，当前使用内置分类表。</p>
                )}
              </div>
            </div>

            <div className="settings-row settings-row-stack">
              <div className="settings-row-main">
                <h3>智能提醒</h3>
                <p>桌面和下载文件夹待收纳文件达到阈值时，托盘会提醒你。</p>
              </div>
              <div className="settings-row-control">
                <div className="settings-row-control-inline reminder-toggle-row">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={appConfig?.smart_reminder_enabled ?? true}
                      disabled={libraryBusy || !appConfig}
                      onChange={(e) => void setSmartReminder(e.target.checked)}
                    />
                    <span>启用托盘提醒</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={libraryBusy}
                    onClick={() => void loadReminderStatus()}
                  >
                    刷新计数
                  </button>
                </div>
                <div className="reminder-threshold-row">
                  <input
                    className="form-input reminder-threshold-input"
                    type="number"
                    min={1}
                    max={500}
                    value={reminderThreshold}
                    disabled={libraryBusy || !appConfig}
                    onChange={(e) => setReminderThreshold(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={libraryBusy || !appConfig}
                    onClick={() => void saveReminderThreshold()}
                  >
                    保存阈值
                  </button>
                </div>
                <p className="form-hint">
                  当前桌面 {reminderStatus?.desktop_count ?? "—"} 个，下载{" "}
                  {reminderStatus?.downloads_count ?? "—"} 个，合计{" "}
                  {reminderStatus?.total_count ?? "—"} 个待收纳文件。
                </p>
                <div className="reminder-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={libraryBusy || (reminderStatus?.desktop_count ?? 0) === 0}
                    onClick={() => void quickImport("desktop", "桌面")}
                  >
                    一键收纳桌面
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={libraryBusy || (reminderStatus?.downloads_count ?? 0) === 0}
                    onClick={() => void quickImport("downloads", "下载")}
                  >
                    一键收纳下载
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-row settings-row-stack">
              <div className="settings-row-main">
                <h3>延迟加载资料库</h3>
                <p>
                  资料库文件超过阈值时，进入分类不会自动加载列表，需手动点击「加载资料库」或刷新。
                </p>
              </div>
              <div className="settings-row-control">
                <div className="settings-row-control-inline reminder-toggle-row">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={appConfig?.defer_library_load_enabled ?? false}
                      disabled={libraryBusy || !appConfig}
                      onChange={(e) => void setDeferLibraryLoad(e.target.checked)}
                    />
                    <span>启用延迟加载</span>
                  </label>
                </div>
                <div className="reminder-threshold-row">
                  <span className="form-hint">文件数超过</span>
                  <input
                    className="form-input reminder-threshold-input"
                    type="number"
                    min={1}
                    max={100000}
                    value={deferLoadThreshold}
                    disabled={libraryBusy || !appConfig}
                    onChange={(e) => setDeferLoadThreshold(Number(e.target.value))}
                  />
                  <span className="form-hint">时不自动加载</span>
                  <button
                    type="button"
                    className="btn"
                    disabled={libraryBusy || !appConfig}
                    onClick={() => void saveDeferLoadThreshold()}
                  >
                    保存阈值
                  </button>
                </div>
                <p className="form-hint">
                  当前资料库共 {libraryInfo ? formatNumber(libraryInfo.total_files) : "—"} 个文件
                  {appConfig?.defer_library_load_enabled &&
                  libraryInfo &&
                  libraryInfo.total_files > (appConfig.defer_library_load_threshold ?? 0)
                    ? "，已超过阈值，进入分类时需手动加载。"
                    : "。"}
                </p>
              </div>
            </div>

            <div className="settings-row settings-row-stack">
              <div className="settings-row-main">
                <h3>配置文件</h3>
                <p>应用配置与收纳日志的位置。</p>
              </div>
              <div className="settings-row-control">
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
                  <div className="config-path-item">
                    <span className="config-path-label">文件元数据</span>
                    <span className="config-path-value" title={appConfig?.file_metadata_path}>
                      {appConfig?.file_metadata_path ?? "—"}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!appConfig?.file_metadata_path}
                      onClick={() =>
                        appConfig?.file_metadata_path &&
                        void revealPath(appConfig.file_metadata_path)
                      }
                    >
                      <IconLocate size={14} />
                      定位
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="library-overview-card">
              <div className="library-overview-header">
                <div>
                  <h3>资料库概览</h3>
                  <p>当前资料库的文件规模与运行状态。</p>
                </div>
                <span className="library-status-pill">
                  {libraryInfo ? "状态正常" : libraryInfoLoading ? "读取中" : "等待刷新"}
                </span>
              </div>

              <div className="library-overview-grid">
                <div className="library-overview-stat">
                  <span>文件</span>
                  <strong>{libraryInfo ? formatNumber(libraryInfo.total_files) : "—"}</strong>
                </div>
                <div className="library-overview-stat">
                  <span>占用空间</span>
                  <strong>{libraryInfo ? formatBytes(libraryInfo.total_bytes) : "—"}</strong>
                </div>
                <div className="library-overview-stat">
                  <span>收纳方式</span>
                  <strong>{libraryInfo?.import_mode === "copy" ? "复制" : "移动"}</strong>
                </div>
                <div className="library-overview-stat">
                  <span>同名冲突</span>
                  <strong>{conflictLabel(appConfig?.import_conflict_strategy)}</strong>
                </div>
                <div className="library-overview-stat">
                  <span>自定义规则</span>
                  <strong>{customRules.length}</strong>
                </div>
                <div className="library-overview-stat">
                  <span>提醒阈值</span>
                  <strong>{appConfig?.smart_reminder_enabled ? reminderThreshold : "关闭"}</strong>
                </div>
                <div className="library-overview-stat">
                  <span>延迟加载</span>
                  <strong>
                    {appConfig?.defer_library_load_enabled
                      ? `>${formatNumber(appConfig.defer_library_load_threshold)}`
                      : "关闭"}
                  </strong>
                </div>
              </div>

              <div className="library-overview-footer">
                <span
                  className="library-overview-root"
                  title={libraryInfo?.root ?? appConfig?.library_root ?? ""}
                >
                  {libraryInfo?.root ?? appConfig?.library_root ?? "资料库路径加载中…"}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={libraryInfoLoading}
                  onClick={() => void loadLibraryInfo()}
                >
                  {libraryInfoLoading ? "刷新中…" : "刷新状态"}
                </button>
              </div>
            </div>
          </section>

          <div className="settings-stack">
            <section className="settings-panel">
              <div className="settings-panel-header">
                <div>
                  <h2 className="settings-title">外观</h2>
                  <p className="settings-desc">自定义界面主题、强调色与字号。</p>
                </div>
              </div>

              <div className="settings-row settings-row-stack">
                <div className="settings-row-main">
                  <h3>主题模式</h3>
                </div>
                <div className="settings-row-control">
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
              </div>

              <div className="settings-row">
                <div className="settings-row-main">
                  <h3>强调色</h3>
                </div>
                <div className="settings-row-control">
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
              </div>

              <div className="settings-row">
                <div className="settings-row-main">
                  <h3>界面字号</h3>
                </div>
                <div className="settings-row-control">
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
              </div>

              <div className="settings-footer-actions">
                <button type="button" className="btn" onClick={resetAppearance}>
                  恢复默认外观
                </button>
              </div>
            </section>

            <section className="settings-panel">
              <div className="settings-panel-header">
                <div>
                  <h2 className="settings-title">更新</h2>
                  <p className="settings-desc">当前版本 v{currentVersion}。</p>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-main">
                  <h3>自动检查</h3>
                  <p>启动正式安装包时自动检查新版本。</p>
                </div>
                <div className="settings-row-control settings-row-control-inline">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={updaterSettings.autoCheckOnStartup}
                      onChange={(e) => setAutoCheckOnStartup(e.target.checked)}
                    />
                    <span>启用</span>
                  </label>
                </div>
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

              <div className="settings-footer-actions">
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
        </div>
      </div>
    </>
  );
}
