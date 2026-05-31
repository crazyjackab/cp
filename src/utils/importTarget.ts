import type { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { LibraryCategory } from "../types";
import { inferLibraryCategory } from "./fileUi";
import { folderDisplayName, normalizeFsPath } from "./libraryFilter";

export interface ImportDropTarget {
  path: string;
  category: string;
}

export const LIBRARY_FILE_DRAG_TYPE = "application/x-library-file-path";
export const LIBRARY_FILE_PATHS_DRAG_TYPE = "application/x-library-file-paths";
const LIBRARY_FILE_DRAG_PLAIN_PREFIX = "fm-library-files:";

export function setLibraryFileDragData(dataTransfer: DataTransfer, paths: string[]): void {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  dataTransfer.setData(LIBRARY_FILE_PATHS_DRAG_TYPE, JSON.stringify(unique));
  dataTransfer.setData(LIBRARY_FILE_DRAG_TYPE, unique[0]);
  dataTransfer.setData("text/plain", `${LIBRARY_FILE_DRAG_PLAIN_PREFIX}${JSON.stringify(unique)}`);
  dataTransfer.effectAllowed = "move";
}

export function readLibraryFileDragPaths(dataTransfer: DataTransfer): string[] {
  const raw = dataTransfer.getData(LIBRARY_FILE_PATHS_DRAG_TYPE);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
      }
    } catch {
      /* fall through */
    }
  }
  const plain = dataTransfer.getData("text/plain");
  if (plain.startsWith(LIBRARY_FILE_DRAG_PLAIN_PREFIX)) {
    try {
      const parsed = JSON.parse(plain.slice(LIBRARY_FILE_DRAG_PLAIN_PREFIX.length)) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
      }
    } catch {
      /* fall through */
    }
  }
  const single = dataTransfer.getData(LIBRARY_FILE_DRAG_TYPE);
  return single ? [single] : [];
}

export function hasLibraryFileDrag(dataTransfer: DataTransfer): boolean {
  const types = [...dataTransfer.types];
  if (
    types.includes(LIBRARY_FILE_DRAG_TYPE) ||
    types.includes(LIBRARY_FILE_PATHS_DRAG_TYPE)
  ) {
    return true;
  }
  if (types.includes("text/plain")) {
    try {
      const plain = dataTransfer.getData("text/plain");
      if (plain.startsWith(LIBRARY_FILE_DRAG_PLAIN_PREFIX)) {
        return true;
      }
    } catch {
      /* dragover 阶段部分 WebView 不允许 getData */
    }
  }
  return false;
}

export function collectLibraryDragPaths(
  filePath: string,
  selectedPaths: Set<string>,
  selectionActive: boolean,
): string[] {
  if (selectionActive && selectedPaths.has(filePath)) {
    return [...selectedPaths];
  }
  return [filePath];
}

export interface ImportDropTargetLabel {
  title: string;
  hint: string;
}

export function formatInternalMoveTargetLabel(target: ImportDropTarget | null): string {
  if (!target) return "拖到左侧文件夹以移动";
  const name = folderDisplayName(target.path);
  if (isLibraryCategoryNav(target.category) && name === target.category) {
    return `将移动到：${target.category}`;
  }
  return `将移动到：${name}`;
}

export function formatImportDropTargetLabel(
  target: ImportDropTarget | null,
  category: LibraryCategory,
  folderPath: string | null,
): ImportDropTargetLabel {
  const sidebarHint = "拖到左侧分类或文件夹可指定位置；类型不符时会提醒确认";

  if (target) {
    const name = folderDisplayName(target.path);
    const title =
      isLibraryCategoryNav(target.category) && name === target.category
        ? `将收纳到：${target.category}`
        : `将放入：${name}`;
    return { title, hint: sidebarHint };
  }

  if (folderPath) {
    return {
      title: `将放入：${folderDisplayName(folderPath)}`,
      hint: sidebarHint,
    };
  }

  if (category === "all" || category === "favorites") {
    return {
      title: "将按文件类型自动分类收纳",
      hint: sidebarHint,
    };
  }

  if (isLibraryCategoryNav(category)) {
    return { title: `将收纳到：${category}`, hint: sidebarHint };
  }

  return { title: "松开后收纳到资料库", hint: sidebarHint };
}

const CATEGORY_IDS = new Set([
  "收件箱",
  "图片",
  "视频",
  "文档",
  "音频",
  "压缩包",
  "安装包",
  "其他",
]);

export function isLibraryCategoryNav(
  id: string,
): id is Exclude<LibraryCategory, "all" | "favorites"> {
  return CATEGORY_IDS.has(id);
}

export function resolveDropTargetFromElement(element: Element | null): ImportDropTarget | null {
  let current: Element | null = element;
  while (current) {
    const path = current.getAttribute("data-drop-target-path");
    const category = current.getAttribute("data-drop-target-category");
    if (path && category) {
      return { path, category };
    }
    current = current.parentElement;
  }
  return null;
}

export function resolveDropTargetFromClientPoint(
  clientX: number,
  clientY: number,
): ImportDropTarget | null {
  return resolveDropTargetFromElement(document.elementFromPoint(clientX, clientY));
}

function decodeFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("file:")) return trimmed;
  let path = decodeURIComponent(trimmed.replace(/^file:\/\/\/?/i, ""));
  if (/^[a-zA-Z]:/.test(path)) {
    return path.replace(/\//g, "\\");
  }
  return path;
}

export function isExternalFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = [...dataTransfer.types];
  if (
    types.includes(LIBRARY_FILE_DRAG_TYPE) ||
    types.includes(LIBRARY_FILE_PATHS_DRAG_TYPE)
  ) {
    return false;
  }
  if (
    types.includes("Files") ||
    types.includes("application/x-moz-file") ||
    types.includes("text/uri-list")
  ) {
    return true;
  }
  if (types.includes("text/plain")) {
    try {
      const plain = dataTransfer.getData("text/plain");
      if (plain.startsWith(LIBRARY_FILE_DRAG_PLAIN_PREFIX)) return false;
      // WebView2 外部拖入有时仅暴露 text/plain（无 Files）
      if (/^(file:\/\/\/|[a-zA-Z]:\\|\\\\)/m.test(plain)) return true;
    } catch {
      /* dragover 阶段可能无法读取 */
    }
  }
  // dragenter 初期 types 可能为空
  return types.length === 0;
}

export function extractExternalDropPaths(dataTransfer: DataTransfer): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  const addPath = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = normalizeFsPath(trimmed).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    paths.push(trimmed);
  };

  if (dataTransfer.files?.length) {
    for (const file of dataTransfer.files) {
      const withPath = file as File & { path?: string };
      if (withPath.path) {
        addPath(withPath.path);
      }
    }
  }

  const uriList = dataTransfer.getData("text/uri-list") || dataTransfer.getData("URL");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      addPath(decodeFileUri(line));
    }
  }

  if (paths.length === 0) {
    try {
      const plain = dataTransfer.getData("text/plain");
      if (plain && !plain.startsWith(LIBRARY_FILE_DRAG_PLAIN_PREFIX)) {
        for (const line of plain.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          addPath(trimmed.startsWith("file:") ? decodeFileUri(trimmed) : trimmed);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return paths;
}

export async function resolveDropTargetFromPosition(
  position: PhysicalPosition,
): Promise<ImportDropTarget | null> {
  const window = getCurrentWindow();
  const factor = await window.scaleFactor();
  const logicalX = position.x / factor;
  const logicalY = position.y / factor;
  const element = document.elementFromPoint(logicalX, logicalY);
  return resolveDropTargetFromElement(element);
}

export function defaultImportTarget(
  category: LibraryCategory,
  folderPath: string | null,
  libraryRoot: string,
): ImportDropTarget | null {
  if (folderPath) {
    const normalizedFolder = normalizeFsPath(folderPath);
    const categoryFromPath = categoryFromFolderPath(folderPath, libraryRoot);
    const targetCategory =
      categoryFromPath ?? (isLibraryCategoryNav(category) ? category : "收件箱");
    return { path: normalizedFolder, category: targetCategory };
  }
  if (isLibraryCategoryNav(category)) {
    return {
      path: `${normalizeFsPath(libraryRoot)}\\${category}`,
      category,
    };
  }
  return null;
}

/** 解析拖入时的目标文件夹：在子文件夹视图内优先放入当前文件夹 */
export function resolveImportDropTarget(
  hitTarget: ImportDropTarget | null,
  category: LibraryCategory,
  folderPath: string | null,
  libraryRoot: string,
): ImportDropTarget | null {
  const fallback = defaultImportTarget(category, folderPath, libraryRoot);
  if (!folderPath || !fallback) {
    return hitTarget ?? fallback;
  }

  const current = normalizeFsPath(folderPath).toLowerCase();
  if (!hitTarget) {
    return fallback;
  }

  const hit = normalizeFsPath(hitTarget.path).toLowerCase();
  if (hit === current) {
    return fallback;
  }

  const categoryRoot = `${normalizeFsPath(libraryRoot)}\\${category}`.toLowerCase();
  if (isLibraryCategoryNav(category) && hit === categoryRoot) {
    return fallback;
  }

  return hitTarget;
}

export function normalizeExternalDropPaths(paths: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.replace(/\//g, "\\").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

const RECENT_EXTERNAL_DROP_MS = 2000;
let recentExternalDrop: { key: string; at: number } | null = null;

function externalDropKey(paths: string[], targetPath: string | null): string {
  const normalized = normalizeExternalDropPaths(paths)
    .map((path) => normalizeFsPath(path).toLowerCase())
    .join("\0");
  const target = targetPath ? normalizeFsPath(targetPath).toLowerCase() : "";
  return `${target}\0${normalized}`;
}

/** 忽略同一目标、同一批路径在短时间内的重复 drop（多监听器或系统重复事件） */
export function isDuplicateExternalDrop(paths: string[], targetPath: string | null): boolean {
  const key = externalDropKey(paths, targetPath);
  const now = Date.now();
  if (
    recentExternalDrop &&
    recentExternalDrop.key === key &&
    now - recentExternalDrop.at < RECENT_EXTERNAL_DROP_MS
  ) {
    return true;
  }
  recentExternalDrop = { key, at: now };
  return false;
}

export function categoryFromFolderPath(folderPath: string, libraryRoot: string): string | null {
  const folder = normalizeFsPath(folderPath).toLowerCase();
  const root = normalizeFsPath(libraryRoot).toLowerCase();
  if (!folder.startsWith(`${root}\\`)) return null;
  const rest = folder.slice(root.length + 1);
  const category = rest.split("\\")[0];
  return CATEGORY_IDS.has(category) ? category : null;
}

export function fileNameFromPath(path: string): string {
  const normalized = normalizeFsPath(path);
  const parts = normalized.split("\\");
  return parts[parts.length - 1] || path;
}

export function findCategoryMismatches(
  paths: string[],
  targetCategory: string,
  customRules: Record<string, string>,
): string[] {
  const mismatches: string[] = [];
  for (const path of paths) {
    const name = fileNameFromPath(path);
    const inferred = inferLibraryCategory(name, customRules);
    if (inferred !== targetCategory) {
      mismatches.push(`${name}（${inferred}）`);
    }
  }
  return mismatches;
}

export function confirmCategoryMismatch(mismatches: string[], targetCategory: string): boolean {
  const sample = mismatches.slice(0, 8).join("\n");
  const more = mismatches.length > 8 ? `\n…还有 ${mismatches.length - 8} 个` : "";
  return confirm(
    `以下文件的类型与目标文件夹「${targetCategory}」不一致：\n\n${sample}${more}\n\n确定仍要放入该文件夹吗？`,
  );
}
