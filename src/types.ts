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

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "cancelled";

export interface BackgroundTaskEvent<T = unknown> {
  task_id: string;
  kind: string;
  status: BackgroundTaskStatus;
  message: string;
  processed: number;
  total: number | null;
  progress: number | null;
  result: T | null;
  source_label?: string | null;
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
  favorite: boolean;
  tags: string[];
}

export interface LibraryFolder {
  name: string;
  path: string;
  category: string;
  modified: number;
  subfolder_count: number;
  children: LibraryFolder[];
}

export interface MediaInfo {
  duration_secs: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  width: number | null;
  height: number | null;
  artist: string | null;
  title: string | null;
  album: string | null;
  cover_data_url: string | null;
}

export interface MediaInfoEntry {
  path: string;
  info: MediaInfo;
}

export type MediaSortKey =
  | "modified-desc"
  | "modified-asc"
  | "size-desc"
  | "size-asc"
  | "duration-desc"
  | "duration-asc";

export interface FileMetadata {
  favorite: boolean;
  tags: string[];
  updated_at: number;
}

export interface TagStat {
  name: string;
  count: number;
}

export interface ImportFailure {
  path: string;
  reason: string;
}

export interface ImportResult {
  moved_count: number;
  skipped_count: number;
  skipped_items?: SkippedImportItem[];
  failed: ImportFailure[];
}

export interface SkippedImportItem {
  path: string;
  name: string;
  reason: string;
}

export interface SkippedImportFile {
  name: string;
  path: string;
  size: number;
  reason: string;
}

export interface ImportCandidatesResult {
  files: PendingImportFile[];
  skipped: SkippedImportFile[];
}

export interface PendingImportFile {
  name: string;
  path: string;
  size: number;
  target_category: string;
  target_exists: boolean;
}

export type LibraryCategory =
  | "all"
  | "favorites"
  | "收件箱"
  | "图片"
  | "视频"
  | "文档"
  | "音频"
  | "压缩包"
  | "安装包"
  | "其他";

export type NavId = LibraryCategory | "overview" | "duplicates" | "logs" | "settings";

export type ImportMode = "move" | "copy";
export type ImportConflictStrategy = "rename" | "skip" | "ask";
export type ImportDestination = "classify" | "inbox";

export interface AppConfigInfo {
  library_root: string;
  import_mode: ImportMode | string;
  import_conflict_strategy: ImportConflictStrategy | string;
  import_destination: ImportDestination | string;
  custom_extension_rules: Record<string, string>;
  smart_reminder_enabled: boolean;
  smart_reminder_threshold: number;
  defer_library_load_enabled: boolean;
  defer_library_load_threshold: number;
  import_min_size_kb: number;
  config_path: string;
  import_log_path: string;
  file_metadata_path?: string;
}

export interface SmartReminderStatus {
  desktop_count: number;
  downloads_count: number;
  total_count: number;
  threshold: number;
  enabled: boolean;
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

export interface ImportRecord {
  name: string;
  category: string;
  library_path: string;
  original_path: string;
  imported_at: number;
  size: number;
  library_exists: boolean;
  original_exists: boolean;
}

export interface DuplicateFile {
  name: string;
  path: string;
  category: string;
  size: number;
  modified: number;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: DuplicateFile[];
}

export interface DuplicateFailure {
  path: string;
  reason: string;
}

export interface DuplicateScanResult {
  scanned_file_count: number;
  hashed_file_count: number;
  duplicate_group_count: number;
  duplicate_file_count: number;
  reclaimable_bytes: number;
  groups: DuplicateGroup[];
  failed: DuplicateFailure[];
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
