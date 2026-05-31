import { invoke } from "@tauri-apps/api/core";
import { reportError } from "./errors";

/** 请求取消后台任务；任务可能已结束，失败时仅记 debug 日志。 */
export async function cancelBackgroundTask(taskId: string): Promise<void> {
  try {
    await invoke("cancel_background_task", { taskId });
  } catch (error) {
    reportError("取消后台任务", error, { silent: true });
  }
}
