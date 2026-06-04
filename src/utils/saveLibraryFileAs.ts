import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { BatchOperationResult, LibraryFile } from "../types";

function extensionFromName(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
}

export async function saveLibraryFileAs(
  file: Pick<LibraryFile, "path" | "name">,
): Promise<string | null> {
  const ext = extensionFromName(file.name);
  const dest = await save({
    defaultPath: file.name,
    title: "另存为",
    filters: ext
      ? [
          { name: "同类型文件", extensions: [ext] },
          { name: "所有文件", extensions: ["*"] },
        ]
      : [{ name: "所有文件", extensions: ["*"] }],
  });
  if (!dest || typeof dest !== "string") return null;
  return invoke<string>("save_library_file_as", { path: file.path, destPath: dest });
}

export async function saveLibraryFilesAsBatch(
  files: Pick<LibraryFile, "path">[],
): Promise<BatchOperationResult | null> {
  if (files.length === 0) return null;
  const destDir = await open({
    directory: true,
    multiple: false,
    title: "选择另存为的目标文件夹",
  });
  if (!destDir || typeof destDir !== "string") return null;
  return invoke<BatchOperationResult>("batch_save_library_files_as", {
    paths: files.map((f) => f.path),
    destDir,
  });
}
