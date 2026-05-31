import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundTaskEvent } from "../types";
import { cancelBackgroundTask } from "../utils/backgroundTask";
import { registerListen } from "../utils/listenEvent";
import { createFinishedTaskRegistry, isBackgroundTaskRunning } from "../utils/taskProgress";

export type FinishedTaskRegistry = ReturnType<typeof createFinishedTaskRegistry>;

export type BackgroundTaskHandlers<T = unknown> = {
  onRunning?: (event: BackgroundTaskEvent<T>) => void;
  onCompleted?: (event: BackgroundTaskEvent<T>) => void;
  onFailed?: (event: BackgroundTaskEvent<T>) => void;
  onCancelled?: (event: BackgroundTaskEvent<T>) => void;
};

export interface UseBackgroundTaskOptions<T = unknown> {
  kind: string | readonly string[];
  listenContext: string;
  finishedTaskIdsRef?: React.MutableRefObject<FinishedTaskRegistry>;
  handlers?: BackgroundTaskHandlers<T>;
  /** 为 false 时不校验 taskIdRef（全局被动监听，如收纳通知） */
  matchActiveTask?: boolean;
}

function normalizeKinds(kind: string | readonly string[]): readonly string[] {
  return typeof kind === "string" ? [kind] : kind;
}

/**
 * 封装单个后台任务的状态机：taskId / progress / 事件监听 / 取消。
 * 各视图按 kind 声明 handlers，避免重复 registerListen 样板代码。
 */
export function useBackgroundTask<T = unknown>({
  kind,
  listenContext,
  finishedTaskIdsRef,
  handlers,
  matchActiveTask = true,
}: UseBackgroundTaskOptions<T>) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BackgroundTaskEvent<T> | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const kinds = normalizeKinds(kind);
  const kindsKey = kinds.join("\0");

  const dismissTask = useCallback(() => {
    taskIdRef.current = null;
    setTaskId(null);
    setProgress(null);
  }, []);

  const resetProgress = useCallback(() => {
    setProgress(null);
  }, []);

  const assignTask = useCallback(
    (nextTaskId: string): boolean => {
      if (finishedTaskIdsRef?.current.consumeIfAlreadyFinished(nextTaskId)) {
        return false;
      }
      taskIdRef.current = nextTaskId;
      setTaskId(nextTaskId);
      return true;
    },
    [finishedTaskIdsRef],
  );

  const cancelTask = useCallback(async () => {
    const activeId = taskIdRef.current ?? taskId;
    if (!activeId) return;
    await cancelBackgroundTask(activeId);
  }, [taskId]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    registerListen<BackgroundTaskEvent<T>>(
      "background-task",
      (event) => {
        const payload = event.payload;
        if (!kinds.includes(payload.kind)) return;
        if (matchActiveTask && taskIdRef.current && payload.task_id !== taskIdRef.current) {
          return;
        }

        setProgress(payload);

        const h = handlersRef.current;
        if (payload.status === "running") {
          h?.onRunning?.(payload);
          return;
        }

        finishedTaskIdsRef?.current.markFinished(payload.task_id);

        if (payload.status === "completed") {
          h?.onCompleted?.(payload);
          if (matchActiveTask) dismissTask();
        } else if (payload.status === "failed") {
          h?.onFailed?.(payload);
          if (matchActiveTask) dismissTask();
        } else if (payload.status === "cancelled") {
          h?.onCancelled?.(payload);
          if (matchActiveTask) dismissTask();
        }
      },
      listenContext,
    ).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [dismissTask, finishedTaskIdsRef, kindsKey, listenContext, matchActiveTask]);

  const isRunning = isBackgroundTaskRunning(taskId, progress);

  return useMemo(
    () => ({
      taskId,
      taskIdRef,
      progress,
      isRunning,
      assignTask,
      dismissTask,
      resetProgress,
      cancelTask,
    }),
    [assignTask, cancelTask, dismissTask, isRunning, progress, resetProgress, taskId],
  );
}

export { createFinishedTaskRegistry, isBackgroundTaskRunning };
