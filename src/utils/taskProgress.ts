import type { BackgroundTaskEvent } from "../types";

/** 防止 invoke 返回前任务已结束，导致 taskId 被重新激活而进度条卡住。 */
export function createFinishedTaskRegistry() {
  const finished = new Set<string>();
  return {
    markFinished(taskId: string) {
      finished.add(taskId);
    },
    /** 若任务已在 invoke 返回前结束，返回 true 并移出集合。 */
    consumeIfAlreadyFinished(taskId: string): boolean {
      if (!finished.has(taskId)) return false;
      finished.delete(taskId);
      return true;
    },
  };
}

/** 任务已启动且仍在运行（含尚未收到首条进度事件）。 */
export function isBackgroundTaskRunning(
  taskId: string | null,
  event: BackgroundTaskEvent | null | undefined,
): boolean {
  if (!taskId) return false;
  if (event?.task_id === taskId && event.status !== "running") {
    return false;
  }
  if (!event || event.task_id !== taskId) {
    return true;
  }
  return event.status === "running";
}

/** 0–1 进度；未知总量且无有效 progress 时返回 null。 */
export function resolveProgressRatio(
  processed = 0,
  total?: number | null,
  progress?: number | null,
): number | null {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    return Math.min(1, Math.max(0, progress));
  }
  if (total != null && total > 0) {
    return Math.min(1, Math.max(0, processed / total));
  }
  return null;
}

export function resolveProgressPercent(
  processed = 0,
  total?: number | null,
  progress?: number | null,
): number | null {
  const ratio = resolveProgressRatio(processed, total, progress);
  return ratio == null ? null : Math.round(ratio * 100);
}

/** 无总量、且无有效比例时显示不确定进度。 */
export function isIndeterminateProgress(
  processed = 0,
  total?: number | null,
  progress?: number | null,
): boolean {
  return resolveProgressRatio(processed, total, progress) == null;
}
