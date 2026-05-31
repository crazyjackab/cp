import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfigInfo, LibraryCategory } from "../types";
import {
  confirmCategoryMismatch,
  findCategoryMismatches,
  type ImportDropTarget,
} from "../utils/importTarget";
import { useOperationToast } from "./useOperationToast";
import { reportToastError } from "../utils/errors";

interface Options {
  onNavigate: (category: LibraryCategory, folderPath: string | null) => void;
}

export function useLibraryFileMove({ onNavigate }: Options) {
  const { toastSuccess, toastError } = useOperationToast();

  const moveFilesToTarget = useCallback(
    async (filePaths: string[], target: ImportDropTarget) => {
      if (filePaths.length === 0) return;
      try {
        const cfg = await invoke<AppConfigInfo>("get_app_config");
        const mismatches = findCategoryMismatches(
          filePaths,
          target.category,
          cfg.custom_extension_rules ?? {},
        );
        if (mismatches.length > 0 && !confirmCategoryMismatch(mismatches, target.category)) {
          return;
        }
        let success = 0;
        const failed: string[] = [];
        for (const filePath of filePaths) {
          try {
            await invoke("move_library_file_to_directory", {
              path: filePath,
              targetDirectory: target.path,
            });
            success += 1;
          } catch {
            failed.push(filePath);
          }
        }
        const folderLabel = target.path.split(/[/\\]/).pop() ?? target.category;
        if (success > 0) {
          toastSuccess(
            filePaths.length === 1
              ? `已移动到「${folderLabel}」`
              : `已移动 ${success} 个文件到「${folderLabel}」`,
          );
          onNavigate(target.category as LibraryCategory, target.path);
        }
        if (failed.length > 0) {
          toastError(`${failed.length} 个文件移动失败`);
        }
      } catch (error) {
        reportToastError(toastError, "移动文件", error);
      }
    },
    [onNavigate, toastError, toastSuccess],
  );

  return { moveFilesToTarget };
}
