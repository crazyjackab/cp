import type { LibraryFile, LibraryFolder, MediaInfo, MediaSortKey } from "../types";
import { getExtension } from "./fileUi";

export type DateRangeFilter = "all" | "today" | "7d" | "30d" | "365d";
export type SizeRangeFilter = "all" | "lt1mb" | "1to10mb" | "gt10mb";

export interface LibraryFilters {
  query: string;
  dateRange: DateRangeFilter;
  sizeRange: SizeRangeFilter;
  extensions: string[];
  tags: string[];
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  query: "",
  dateRange: "all",
  sizeRange: "all",
  extensions: [],
  tags: [],
};

const MB = 1024 * 1024;

function startOfTodaySec(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function matchesDateRange(modified: number, range: DateRangeFilter): boolean {
  if (range === "all" || !modified) return true;
  const now = Math.floor(Date.now() / 1000);
  switch (range) {
    case "today":
      return modified >= startOfTodaySec();
    case "7d":
      return modified >= now - 7 * 86400;
    case "30d":
      return modified >= now - 30 * 86400;
    case "365d":
      return modified >= now - 365 * 86400;
    default:
      return true;
  }
}

function matchesSizeRange(size: number, range: SizeRangeFilter): boolean {
  switch (range) {
    case "lt1mb":
      return size < MB;
    case "1to10mb":
      return size >= MB && size <= 10 * MB;
    case "gt10mb":
      return size > 10 * MB;
    default:
      return true;
  }
}

export function collectExtensions(files: LibraryFile[]): string[] {
  const set = new Set<string>();
  for (const f of files) {
    const ext = getExtension(f.name);
    if (ext) set.add(ext);
  }
  return [...set].sort();
}

const DATE_RANGE_LABELS: Record<DateRangeFilter, string> = {
  all: "全部时间",
  today: "今天",
  "7d": "近 7 天",
  "30d": "近 30 天",
  "365d": "近一年",
};

const SIZE_RANGE_LABELS: Record<SizeRangeFilter, string> = {
  all: "全部大小",
  lt1mb: "< 1 MB",
  "1to10mb": "1 – 10 MB",
  gt10mb: "> 10 MB",
};

export function hasAdvancedFilters(filters: LibraryFilters): boolean {
  return (
    filters.dateRange !== "all" ||
    filters.sizeRange !== "all" ||
    filters.extensions.length > 0 ||
    filters.tags.length > 0
  );
}

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return filters.query.trim().length > 0 || hasAdvancedFilters(filters);
}

/** 切换分类/文件夹时保留搜索词，重置扩展名与标签等高级筛选。 */
export function filtersForCategoryChange(prev: LibraryFilters): LibraryFilters {
  return {
    ...DEFAULT_LIBRARY_FILTERS,
    query: prev.query,
  };
}

export interface FilterChipDescriptor {
  id: string;
  label: string;
}

export function getActiveFilterChips(filters: LibraryFilters): FilterChipDescriptor[] {
  const chips: FilterChipDescriptor[] = [];
  if (filters.dateRange !== "all") {
    chips.push({ id: `date:${filters.dateRange}`, label: DATE_RANGE_LABELS[filters.dateRange] });
  }
  if (filters.sizeRange !== "all") {
    chips.push({ id: `size:${filters.sizeRange}`, label: SIZE_RANGE_LABELS[filters.sizeRange] });
  }
  for (const ext of filters.extensions) {
    chips.push({ id: `ext:${ext}`, label: `.${ext}` });
  }
  for (const tag of filters.tags) {
    chips.push({ id: `tag:${tag}`, label: `#${tag}` });
  }
  return chips;
}

export function removeFilterChip(filters: LibraryFilters, chipId: string): LibraryFilters {
  if (chipId.startsWith("date:")) {
    return { ...filters, dateRange: "all" };
  }
  if (chipId.startsWith("size:")) {
    return { ...filters, sizeRange: "all" };
  }
  if (chipId.startsWith("ext:")) {
    const ext = chipId.slice(4);
    return { ...filters, extensions: filters.extensions.filter((e) => e !== ext) };
  }
  if (chipId.startsWith("tag:")) {
    const tag = chipId.slice(4);
    return { ...filters, tags: filters.tags.filter((t) => t !== tag) };
  }
  return filters;
}

export function sortLibraryFiles(
  files: LibraryFile[],
  sortKey: MediaSortKey,
  mediaInfo: Record<string, MediaInfo> = {},
): LibraryFile[] {
  const sorted = [...files];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "size-desc":
        return b.size - a.size || b.modified - a.modified;
      case "size-asc":
        return a.size - b.size || b.modified - a.modified;
      case "modified-asc":
        return a.modified - b.modified;
      case "duration-desc": {
        const da = mediaInfo[a.path]?.duration_secs ?? -1;
        const db = mediaInfo[b.path]?.duration_secs ?? -1;
        return db - da || b.modified - a.modified;
      }
      case "duration-asc": {
        const da = mediaInfo[a.path]?.duration_secs ?? Number.MAX_VALUE;
        const db = mediaInfo[b.path]?.duration_secs ?? Number.MAX_VALUE;
        return da - db || a.modified - b.modified;
      }
      case "modified-desc":
      default:
        return b.modified - a.modified;
    }
  });
  return sorted;
}

export function filterLibraryFiles(files: LibraryFile[], filters: LibraryFilters): LibraryFile[] {
  const q = filters.query.trim().toLowerCase();
  const extSet = new Set(filters.extensions.map((e) => e.toLowerCase()));
  const tagSet = new Set(filters.tags.map((tag) => tag.toLowerCase()));

  return files.filter((f) => {
    const tags = f.tags ?? [];
    if (
      q &&
      !f.name.toLowerCase().includes(q) &&
      !tags.some((tag) => tag.toLowerCase().includes(q))
    ) {
      return false;
    }
    if (!matchesDateRange(f.modified, filters.dateRange)) return false;
    if (!matchesSizeRange(f.size, filters.sizeRange)) return false;
    if (extSet.size > 0) {
      const ext = getExtension(f.name);
      if (!extSet.has(ext)) return false;
    }
    if (tagSet.size > 0 && !tags.some((tag) => tagSet.has(tag.toLowerCase()))) {
      return false;
    }
    return true;
  });
}

export function filterLibraryFolders(folders: LibraryFolder[], query: string): LibraryFolder[] {
  const q = query.trim().toLowerCase();
  if (!q) return folders;

  const walk = (list: LibraryFolder[]): LibraryFolder[] =>
    list.flatMap((folder) => {
      const children = walk(folder.children);
      const selfMatch = folder.name.toLowerCase().includes(q);
      if (selfMatch || children.length > 0) {
        return [
          {
            ...folder,
            children,
            subfolder_count: children.length,
          },
        ];
      }
      return [];
    });

  return walk(folders);
}

export function normalizeFsPath(path: string): string {
  return path.replace(/\//g, "\\").replace(/\\+$/, "");
}

export function isFileInFolder(filePath: string, folderPath: string): boolean {
  return isDirectFileInFolder(filePath, folderPath);
}

export function isDirectFileInFolder(filePath: string, folderPath: string): boolean {
  const folder = normalizeFsPath(folderPath).toLowerCase();
  const file = normalizeFsPath(filePath).toLowerCase();
  if (!file.startsWith(`${folder}\\`)) {
    return false;
  }
  const relative = file.slice(folder.length + 1);
  return relative.length > 0 && !relative.includes("\\");
}

export function folderDisplayName(folderPath: string): string {
  const parts = normalizeFsPath(folderPath).split("\\");
  return parts[parts.length - 1] || folderPath;
}
