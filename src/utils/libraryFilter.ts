import type { LibraryFile } from "../types";
import { getExtension } from "./fileUi";

export type DateRangeFilter = "all" | "today" | "7d" | "30d" | "365d";
export type SizeRangeFilter = "all" | "lt1mb" | "1to10mb" | "gt10mb";

export interface LibraryFilters {
  query: string;
  dateRange: DateRangeFilter;
  sizeRange: SizeRangeFilter;
  extensions: string[];
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  query: "",
  dateRange: "all",
  sizeRange: "all",
  extensions: [],
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

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.dateRange !== "all" ||
    filters.sizeRange !== "all" ||
    filters.extensions.length > 0
  );
}

export function filterLibraryFiles(
  files: LibraryFile[],
  filters: LibraryFilters,
): LibraryFile[] {
  const q = filters.query.trim().toLowerCase();
  const extSet = new Set(filters.extensions.map((e) => e.toLowerCase()));

  return files.filter((f) => {
    if (q && !f.name.toLowerCase().includes(q)) return false;
    if (!matchesDateRange(f.modified, filters.dateRange)) return false;
    if (!matchesSizeRange(f.size, filters.sizeRange)) return false;
    if (extSet.size > 0) {
      const ext = getExtension(f.name);
      if (!extSet.has(ext)) return false;
    }
    return true;
  });
}
