import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import { reportError, type ReportErrorOptions } from "./errors";

/** 注册 Tauri 事件监听；注册失败时记录 warn，避免未处理的 Promise rejection。 */
export function registerListen<T>(
  event: string,
  handler: EventCallback<T>,
  context: string,
  options?: ReportErrorOptions,
): Promise<UnlistenFn> {
  return listen<T>(event, handler).catch((error) => {
    reportError(context, error, options ?? { warnOnly: true });
    return () => {};
  });
}
