import { isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { reportError } from "./errors";
import { isMainWindowActive } from "./windowState";

async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return false;
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  return granted;
}

/** 窗口不在前台时发送 Windows 原生通知；前台由调用方自行展示 toast/横幅。 */
export async function notifyWhenInactive(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  const active = await isMainWindowActive();
  if (active) return;
  if (!(await ensureNotificationPermission())) return;
  try {
    await sendNotification({ title, body });
  } catch (error) {
    reportError("发送系统通知", error, { silent: true });
  }
}
