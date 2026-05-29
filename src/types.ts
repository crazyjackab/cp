export interface ExtensionStat {
  extension: string;
  count: number;
  bytes: number;
}

export interface DirStat {
  path: string;
  bytes: number;
  file_count: number;
}

export interface ScanResult {
  root: string;
  file_count: number;
  dir_count: number;
  total_bytes: number;
  by_extension: ExtensionStat[];
  largest_dirs: DirStat[];
}

export interface CategoryStat {
  id: string;
  label: string;
  file_count: number;
  bytes: number;
}

export interface LibraryInfo {
  root: string;
  import_mode: string;
  categories: CategoryStat[];
  total_files: number;
  total_bytes: number;
}

export interface LibraryFile {
  name: string;
  path: string;
  category: string;
  size: number;
  modified: number;
  original_path: string | null;
  can_restore: boolean;
}

export interface ImportFailure {
  path: string;
  reason: string;
}

export interface ImportResult {
  moved_count: number;
  failed: ImportFailure[];
}

export interface PendingImportFile {
  name: string;
  path: string;
  size: number;
  target_category: string;
}

export type LibraryCategory =
  | "all"
  | "收件箱"
  | "图片"
  | "视频"
  | "文档"
  | "音频"
  | "压缩包"
  | "安装包"
  | "其他";

export type NavId = LibraryCategory | "overview" | "settings";

export type ImportMode = "move" | "copy";

export interface AppConfigInfo {
  library_root: string;
  import_mode: ImportMode | string;
  config_path: string;
  import_log_path: string;
}

export interface SetLibraryRootResult {
  library_root: string;
  migrated_files: number;
  message: string;
}

export interface ReclassifyMove {
  name: string;
  from_category: string;
  to_category: string;
}

export interface ReclassifyResult {
  moved_count: number;
  already_correct: number;
  moved: ReclassifyMove[];
  failed: ImportFailure[];
}

export interface TextPreview {
  content: string;
  truncated: boolean;
  byte_count: number;
}

export interface BatchOperationResult {
  success_count: number;
  failed: ImportFailure[];
}

/** 资料库内可移动目标分类（不含「全部」） */
export const LIBRARY_MOVE_TARGETS = [
  "收件箱",
  "图片",
  "视频",
  "文档",
  "音频",
  "压缩包",
  "安装包",
  "其他",
] as const;

export type LibraryMoveTarget = (typeof LIBRARY_MOVE_TARGETS)[number];
