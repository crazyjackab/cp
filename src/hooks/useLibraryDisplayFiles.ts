import { useMemo } from "react";
import { useMediaInfo } from "./useMediaInfo";
import {
  collectExtensions,
  filterLibraryFiles,
  hasActiveFilters,
  isDirectFileInFolder,
  sortLibraryFiles,
  type LibraryFilters,
} from "../utils/libraryFilter";
import { isMisplacedInCategory } from "../utils/fileUi";
import type { LibraryCategory, LibraryFile, LibraryInfo, MediaSortKey } from "../types";

interface Options {
  category: LibraryCategory;
  folderPath: string | null;
  files: LibraryFile[];
  info: LibraryInfo | null;
  filters: LibraryFilters;
  mediaSort: MediaSortKey;
  customRules: Record<string, string>;
}

export function useLibraryDisplayFiles({
  category,
  folderPath,
  files,
  info,
  filters,
  mediaSort,
  customRules,
}: Options) {
  const categoryScopedFiles = useMemo(() => {
    let scoped = files;
    if (category === "favorites") {
      scoped = scoped.filter((file) => file.favorite);
    } else if (category !== "all" && !folderPath) {
      scoped = scoped.filter((file) => file.category === category);
    }
    if (!folderPath) return scoped;
    return scoped.filter((file) => isDirectFileInFolder(file.path, folderPath));
  }, [category, files, folderPath]);

  const visibleSourceFiles = categoryScopedFiles;

  const folderStats = useMemo(() => {
    if (!folderPath) return null;
    const bytes = visibleSourceFiles.reduce((sum, file) => sum + file.size, 0);
    return { count: visibleSourceFiles.length, bytes };
  }, [folderPath, visibleSourceFiles]);

  const pageStats = useMemo(() => {
    if (folderStats) return folderStats;
    if (category === "all") {
      return {
        count: info?.total_files ?? files.length,
        bytes: info?.total_bytes ?? files.reduce((sum, file) => sum + file.size, 0),
      };
    }
    const bytes = visibleSourceFiles.reduce((sum, file) => sum + file.size, 0);
    return { count: visibleSourceFiles.length, bytes };
  }, [category, files, folderStats, info, visibleSourceFiles]);

  const availableExtensions = useMemo(
    () => collectExtensions(visibleSourceFiles),
    [visibleSourceFiles],
  );

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const file of visibleSourceFiles) {
      for (const tag of file.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [visibleSourceFiles]);

  const filteredFiles = useMemo(
    () => filterLibraryFiles(visibleSourceFiles, filters),
    [visibleSourceFiles, filters],
  );

  const isVideoCategory = category === "视频";
  const isAudioCategory = category === "音频";
  const isMediaCategory = isVideoCategory || isAudioCategory;

  const { mediaInfoMap, mediaInfoLoading } = useMediaInfo(visibleSourceFiles, isMediaCategory);

  const displayFiles = useMemo(
    () =>
      isMediaCategory ? sortLibraryFiles(filteredFiles, mediaSort, mediaInfoMap) : filteredFiles,
    [filteredFiles, isMediaCategory, mediaSort, mediaInfoMap],
  );

  const filtering = hasActiveFilters(filters);

  const misplacedCount = useMemo(
    () => visibleSourceFiles.filter((file) => isMisplacedInCategory(file, customRules)).length,
    [visibleSourceFiles, customRules],
  );

  const visiblePaths = useMemo(() => displayFiles.map((f) => f.path), [displayFiles]);
  const isImageGrid = category === "图片";

  return {
    visibleSourceFiles,
    pageStats,
    availableExtensions,
    availableTags,
    filteredFiles,
    displayFiles,
    filtering,
    misplacedCount,
    visiblePaths,
    isVideoCategory,
    isAudioCategory,
    isMediaCategory,
    isImageGrid,
    mediaInfoMap,
    mediaInfoLoading,
  };
}
