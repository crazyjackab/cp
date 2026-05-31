import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { reportError } from "./errors";

/** 主窗口在前台且未最小化时视为活跃，用于选择 toast 还是系统通知。 */
export async function isMainWindowActive(): Promise<boolean> {
  if (!isTauri()) {
    return typeof document !== "undefined" && !document.hidden;
  }
  try {
    const window = getCurrentWindow();
    const [visible, focused, minimized] = await Promise.all([
      window.isVisible(),
      window.isFocused(),
      window.isMinimized(),
    ]);
    return visible && focused && !minimized;
  } catch (error) {
    reportError("读取窗口状态", error, { warnOnly: true });
    return typeof document !== "undefined" && !document.hidden;
  }
}
