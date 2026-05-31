import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { registerListen } from "../utils/listenEvent";
import { cancelBackgroundTask } from "../utils/backgroundTask";
import { reportError, reportToastError } from "../utils/errors";
import { type FinishedTaskRegistry, useBackgroundTask } from "./useBackgroundTask";
import type { AppConfigInfo, ImportConflictStrategy, LibraryFile, LibraryInfo } from "../types";

interface Options {
  folderPath: string | null;
  toastError: (message: string) => void;
  toastInfo: (message: string) => void;
  finishedTaskIdsRef: React.MutableRefObject<FinishedTaskRegistry>;
}

export function useLibraryRefresh({
  folderPath,
  toastError,
  toastInfo,
  finishedTaskIdsRef,
}: Options) {
  const [info, setInfo] = useState<LibraryInfo | null>(null);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [conflictStrategy, setConflictStrategy] = useState<ImportConflictStrategy>("rename");
  const [customRules, setCustomRules] = useState<Record<string, string>>({});
  const [loadDeferred, setLoadDeferred] = useState(false);
  const [deferThreshold, setDeferThreshold] = useState(500);

  const listTaskSilentRef = useRef(false);
  const listCancelRequestedRef = useRef(false);
  const loadDeferredRef = useRef(false);

  const finishLoadingIfVisible = useCallback(() => {
    if (!listTaskSilentRef.current) {
      setLoading(false);
    }
  }, []);

  const {
    taskId: listTaskId,
    taskIdRef: listTaskRef,
    progress: listTaskProgress,
    isRunning: listTaskRunning,
    assignTask: assignListTask,
    dismissTask: dismissListTask,
    resetProgress: resetListProgress,
    cancelTask: cancelListTaskInternal,
  } = useBackgroundTask<LibraryFile[]>({
    kind: "list-library-files",
    listenContext: "订阅资料库列表任务",
    finishedTaskIdsRef,
    handlers: {
      onCompleted: (payload) => {
        if (payload.result) {
          setFiles(payload.result);
        }
        finishLoadingIfVisible();
      },
      onFailed: (payload) => {
        toastError(payload.message);
        finishLoadingIfVisible();
      },
      onCancelled: () => {
        if (listCancelRequestedRef.current) {
          toastInfo("加载已取消");
          listCancelRequestedRef.current = false;
        }
        finishLoadingIfVisible();
      },
    },
  });

  const finishLoading = useCallback(() => {
    setLoading(false);
  }, []);

  const loadLibraryInfoExtras = useCallback(() => {
    void invoke<LibraryInfo>("get_library_info")
      .then(setInfo)
      .catch((e) => reportError("读取资料库信息", e, { toast: toastError }));
    void invoke<string[]>("list_file_tags")
      .then(setTagSuggestions)
      .catch((e) => reportError("读取标签列表", e, { warnOnly: true }));
  }, [toastError]);

  const cancelActiveListTask = useCallback(async () => {
    const prevTaskId = listTaskRef.current;
    if (!prevTaskId) return;
    dismissListTask();
    await cancelBackgroundTask(prevTaskId);
  }, [dismissListTask, listTaskRef]);

  const runListLoad = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      listTaskSilentRef.current = silent;
      listCancelRequestedRef.current = false;

      await cancelActiveListTask();

      if (!silent) {
        setLoading(true);
      }
      resetListProgress();

      try {
        const cfg = await invoke<AppConfigInfo>("get_app_config");
        setConflictStrategy((cfg.import_conflict_strategy || "rename") as ImportConflictStrategy);
        setCustomRules(cfg.custom_extension_rules ?? {});
        loadLibraryInfoExtras();

        const nextTaskId = await invoke<string>("start_list_library_files_task", {
          category: "all",
          directory: folderPath,
        });
        if (!assignListTask(nextTaskId)) {
          if (!silent) {
            finishLoading();
          }
          return;
        }
      } catch (e) {
        reportToastError(toastError, "加载资料库列表", e);
        dismissListTask();
        if (!silent) {
          finishLoading();
        }
      }
    },
    [
      assignListTask,
      cancelActiveListTask,
      dismissListTask,
      finishLoading,
      folderPath,
      loadLibraryInfoExtras,
      resetListProgress,
      toastError,
    ],
  );

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      setLoadDeferred(false);
      loadDeferredRef.current = false;
      await runListLoad(options);
    },
    [runListLoad],
  );

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const runListLoadRef = useRef(runListLoad);
  runListLoadRef.current = runListLoad;

  useEffect(() => {
    loadDeferredRef.current = loadDeferred;
  }, [loadDeferred]);

  useEffect(() => {
    invoke("init_library").catch((e) => reportError("资料库初始化", e, { toast: toastError }));
    void (async () => {
      try {
        const cfg = await invoke<AppConfigInfo>("get_app_config");
        setConflictStrategy((cfg.import_conflict_strategy || "rename") as ImportConflictStrategy);
        setCustomRules(cfg.custom_extension_rules ?? {});
        setDeferThreshold(cfg.defer_library_load_threshold);

        const libInfo = await invoke<LibraryInfo>("get_library_info");
        setInfo(libInfo);
        void invoke<string[]>("list_file_tags")
          .then(setTagSuggestions)
          .catch((e) => reportError("读取标签列表", e, { warnOnly: true }));

        const shouldDefer =
          cfg.defer_library_load_enabled && libInfo.total_files > cfg.defer_library_load_threshold;

        if (shouldDefer) {
          setLoadDeferred(true);
          loadDeferredRef.current = true;
          setFiles([]);
          setLoading(false);
          await cancelActiveListTask();
          return;
        }

        setLoadDeferred(false);
        loadDeferredRef.current = false;
        await runListLoadRef.current();
      } catch (e) {
        reportToastError(toastError, "初始化资料库视图", e);
        setLoading(false);
      }
    })();
  }, [cancelActiveListTask, folderPath, toastError]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    registerListen(
      "library:changed",
      () => {
        if (loadDeferredRef.current) return;
        void runListLoadRef.current({ silent: true });
      },
      "订阅资料库变更",
    ).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      const taskId = listTaskRef.current;
      if (taskId) {
        void cancelBackgroundTask(taskId);
      }
    };
  }, [listTaskRef]);

  const cancelListTask = useCallback(async () => {
    if (!listTaskId) return;
    listCancelRequestedRef.current = true;
    await cancelListTaskInternal();
  }, [cancelListTaskInternal, listTaskId]);

  const listTaskBusy = Boolean(listTaskId) && !listTaskSilentRef.current;
  const showListTaskProgress = listTaskRunning && listTaskBusy;

  return {
    info,
    files,
    setFiles,
    loading,
    setLoading,
    tagSuggestions,
    setTagSuggestions,
    conflictStrategy,
    setConflictStrategy,
    customRules,
    setCustomRules,
    loadDeferred,
    deferThreshold,
    refresh,
    loadLibraryInfoExtras,
    listTaskId,
    listTaskProgress,
    listTaskBusy,
    showListTaskProgress,
    cancelListTask,
    refreshRef,
  };
}
