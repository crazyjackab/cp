import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { reportToastError } from "../utils/errors";
import type {
  AppConfigInfo,
  BatchOperationResult,
  ImportCandidatesResult,
  ImportConflictStrategy,
  ImportResult,
  LibraryCategory,
  LibraryInfo,
  ReclassifyResult,
} from "../types";
import { type FinishedTaskRegistry, useBackgroundTask } from "./useBackgroundTask";
import {
  confirmCategoryMismatch,
  defaultImportTarget,
  findCategoryMismatches,
  type ImportDropTarget,
} from "../utils/importTarget";

interface Options {
  category: LibraryCategory;
  folderPath: string | null;
  info: LibraryInfo | null;
  conflictStrategy: ImportConflictStrategy;
  setConflictStrategy: (strategy: ImportConflictStrategy) => void;
  setCustomRules: (rules: Record<string, string>) => void;
  setLoading: (loading: boolean) => void;
  refreshRef: React.MutableRefObject<(options?: { silent?: boolean }) => Promise<void>>;
  selectionClear: () => void;
  finishedTaskIdsRef: React.MutableRefObject<FinishedTaskRegistry>;
  toastSuccess: (message: string) => void;
  toastError: (message: string) => void;
  toastInfo: (message: string) => void;
  noteImportTask: (taskId: string, sourceLabel: string) => void;
}

const BATCH_KINDS = ["batch-delete", "batch-restore", "batch-move"] as const;

export function useLibraryBackgroundTasks({
  category,
  folderPath,
  info,
  conflictStrategy,
  setConflictStrategy,
  setCustomRules,
  setLoading,
  refreshRef,
  selectionClear,
  finishedTaskIdsRef,
  toastSuccess,
  toastError,
  toastInfo,
  noteImportTask,
}: Options) {
  const [batchTaskLabel, setBatchTaskLabel] = useState("");
  const batchLabelRef = useRef("");
  const reclassifyInboxFlowRef = useRef(false);

  const {
    taskId: batchTaskId,
    progress: batchTaskProgress,
    isRunning: batchTaskRunning,
    assignTask: assignBatchTask,
    resetProgress: resetBatchProgress,
    cancelTask: cancelBatchTask,
  } = useBackgroundTask<BatchOperationResult>({
    kind: BATCH_KINDS,
    listenContext: "订阅资料库批量任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: (payload) => {
        const label = batchLabelRef.current || "已处理";
        if (payload.result) {
          const fail = payload.result.failed.length;
          toastSuccess(
            fail > 0
              ? `${label} ${payload.result.success_count} 个，${fail} 个失败`
              : `${label} ${payload.result.success_count} 个`,
          );
        }
        selectionClear();
        batchLabelRef.current = "";
        setBatchTaskLabel("");
        setLoading(false);
        void refreshRef.current({ silent: true });
      },
      onFailed: (payload) => {
        toastError(payload.message);
        batchLabelRef.current = "";
        setBatchTaskLabel("");
        setLoading(false);
      },
      onCancelled: () => {
        toastInfo("批量任务已取消");
        batchLabelRef.current = "";
        setBatchTaskLabel("");
        setLoading(false);
        void refreshRef.current({ silent: true });
      },
    },
  });

  const {
    taskId: importTaskId,
    progress: importTaskProgress,
    isRunning: importTaskRunning,
    assignTask: assignImportTask,
    resetProgress: resetImportProgress,
    dismissTask: dismissImportTask,
    cancelTask: cancelImportTask,
  } = useBackgroundTask<ImportResult>({
    kind: "import-files",
    listenContext: "订阅资料库收纳任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: () => {
        setLoading(false);
        void refreshRef.current({ silent: true });
      },
      onFailed: () => {
        setLoading(false);
      },
      onCancelled: () => {
        setLoading(false);
      },
    },
  });

  const {
    taskId: reclassifyTaskId,
    progress: reclassifyTaskProgress,
    isRunning: reclassifyTaskRunning,
    assignTask: assignReclassifyTask,
    resetProgress: resetReclassifyProgress,
    dismissTask: dismissReclassifyTask,
    cancelTask: cancelReclassifyTask,
  } = useBackgroundTask<ReclassifyResult>({
    kind: "reclassify-files",
    listenContext: "订阅错放整理任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: (payload) => {
        if (payload.result) {
          const fail = payload.result.failed.length;
          const moved = payload.result.moved_count;
          const inboxFlow = reclassifyInboxFlowRef.current;
          reclassifyInboxFlowRef.current = false;
          toastSuccess(
            fail > 0
              ? `已整理 ${moved} 个文件，${fail} 个失败`
              : inboxFlow
                ? `已整理 ${moved} 个文件`
                : `已整理 ${moved} 个文件到正确分类`,
          );
        } else {
          reclassifyInboxFlowRef.current = false;
        }
        setLoading(false);
        void refreshRef.current({ silent: true });
      },
      onFailed: (payload) => {
        reclassifyInboxFlowRef.current = false;
        toastError(payload.message);
        setLoading(false);
      },
      onCancelled: () => {
        reclassifyInboxFlowRef.current = false;
        toastInfo("整理已取消");
        setLoading(false);
      },
    },
  });

  const startBatchOp = useCallback(
    async (label: string, command: string, args: Record<string, unknown>) => {
      setLoading(true);
      resetBatchProgress();
      batchLabelRef.current = label;
      setBatchTaskLabel(label);
      try {
        const nextTaskId = await invoke<string>(command, args);
        if (!assignBatchTask(nextTaskId)) return;
      } catch (e) {
        reportToastError(toastError, "启动批量任务", e);
        batchLabelRef.current = "";
        setBatchTaskLabel("");
        setLoading(false);
      }
    },
    [assignBatchTask, resetBatchProgress, setLoading, toastError],
  );

  const importPaths = useCallback(
    async (paths: string[], sourceLabel = "", explicitTarget?: ImportDropTarget | null) => {
      resetImportProgress();
      try {
        const cfg = await invoke<AppConfigInfo>("get_app_config");
        let strategy = (cfg.import_conflict_strategy || conflictStrategy) as ImportConflictStrategy;
        setConflictStrategy(strategy);
        const rules = cfg.custom_extension_rules ?? {};
        setCustomRules(rules);

        const libraryRoot = info?.root ?? cfg.library_root;
        const target = explicitTarget ?? defaultImportTarget(category, folderPath, libraryRoot);

        if (target) {
          const mismatches = findCategoryMismatches(paths, target.category, rules);
          if (mismatches.length > 0 && !confirmCategoryMismatch(mismatches, target.category)) {
            return;
          }
        }

        if (strategy === "ask") {
          const preview = await invoke<ImportCandidatesResult>("preview_import_candidates", {
            paths,
          });
          const candidates = preview.files;
          const conflicts = candidates.filter((file) => file.target_exists);
          if (conflicts.length > 0) {
            const sample = conflicts
              .slice(0, 6)
              .map((file) => file.name)
              .join("\n");
            const more = conflicts.length > 6 ? `\n…还有 ${conflicts.length - 6} 个` : "";
            strategy = confirm(
              `发现 ${conflicts.length} 个同名文件已存在于资料库。\n\n选择“确定”自动重命名，选择“取消”跳过这些冲突文件。\n\n${sample}${more}`,
            )
              ? "rename"
              : "skip";
          } else {
            strategy = "rename";
          }
        }

        setLoading(true);
        const nextTaskId = await invoke<string>("start_import_files_task", {
          paths,
          conflictStrategy: strategy,
          targetDirectory: target?.path ?? null,
        });
        if (!assignImportTask(nextTaskId)) return;
        noteImportTask(nextTaskId, sourceLabel);
      } catch (e) {
        reportToastError(toastError, "启动收纳任务", e);
        dismissImportTask();
        setLoading(false);
      }
    },
    [
      assignImportTask,
      category,
      conflictStrategy,
      dismissImportTask,
      folderPath,
      info?.root,
      noteImportTask,
      resetImportProgress,
      setConflictStrategy,
      setCustomRules,
      setLoading,
      toastError,
    ],
  );

  const runReclassify = useCallback(
    async (scopeCategory: string, inboxFlow = false) => {
      if (category === "favorites") return;
      setLoading(true);
      try {
        const preview = await invoke<ReclassifyResult>("reclassify_misplaced_files", {
          category: scopeCategory,
          dryRun: true,
        });
        if (preview.moved_count === 0) {
          toastSuccess(
            inboxFlow
              ? "收件箱中没有待整理的文件"
              : scopeCategory === "all"
                ? "全库文件分类均正确，无需整理"
                : `「${scopeCategory}」中没有放错位置的文件`,
          );
          setLoading(false);
          return;
        }
        const sample = preview.moved
          .slice(0, 8)
          .map((m) => `${m.name} → ${m.to_category}`)
          .join("\n");
        const more = preview.moved_count > 8 ? `\n…等共 ${preview.moved_count} 个文件` : "";
        const confirmMessage = inboxFlow
          ? `将 ${preview.moved_count} 个文件从收件箱整理到对应分类，是否继续？\n\n${sample}${more}`
          : `在${scopeCategory === "all" ? "全库" : `「${scopeCategory}」`}中发现 ${preview.moved_count} 个文件放错了分类，是否移动到正确文件夹？\n\n${sample}${more}`;
        if (!confirm(confirmMessage)) {
          setLoading(false);
          return;
        }
        reclassifyInboxFlowRef.current = inboxFlow;
        resetReclassifyProgress();
        const nextTaskId = await invoke<string>("start_reclassify_misplaced_task", {
          category: scopeCategory,
        });
        if (!assignReclassifyTask(nextTaskId)) {
          reclassifyInboxFlowRef.current = false;
          setLoading(false);
          return;
        }
      } catch (e) {
        reclassifyInboxFlowRef.current = false;
        reportToastError(toastError, inboxFlow ? "整理收件箱" : "整理错放文件", e);
        dismissReclassifyTask();
        setLoading(false);
      }
    },
    [
      assignReclassifyTask,
      category,
      dismissReclassifyTask,
      resetReclassifyProgress,
      setLoading,
      toastError,
      toastSuccess,
    ],
  );

  const reclassifyMisplaced = useCallback(async () => {
    await runReclassify(category === "all" ? "all" : category);
  }, [category, runReclassify]);

  const organizeInbox = useCallback(async () => {
    await runReclassify("收件箱", true);
  }, [runReclassify]);

  const backgroundTaskBusy = Boolean(batchTaskId || importTaskId || reclassifyTaskId);

  const showOperationTaskProgress = batchTaskRunning || importTaskRunning || reclassifyTaskRunning;

  return {
    batchTaskId,
    batchTaskLabel,
    batchTaskProgress,
    importTaskId,
    importTaskProgress,
    reclassifyTaskId,
    reclassifyTaskProgress,
    backgroundTaskBusy,
    showOperationTaskProgress,
    startBatchOp,
    importPaths,
    reclassifyMisplaced,
    organizeInbox,
    cancelBatchTask,
    cancelImportTask,
    cancelReclassifyTask,
  };
}
