import { invoke, isTauri } from "@tauri-apps/api/core";

/** 指针是否已移出当前 WebView 可视区域（用于触发系统级文件拖放） */
export function isPointerOutsideWindow(clientX: number, clientY: number): boolean {
  return (
    clientX <= 0 ||
    clientY <= 0 ||
    clientX >= window.innerWidth - 1 ||
    clientY >= window.innerHeight - 1
  );
}

export async function startNativeFileDrag(paths: string[]): Promise<void> {
  if (!isTauri() || paths.length === 0) return;
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  await invoke("start_native_file_drag", { paths: unique });
}
