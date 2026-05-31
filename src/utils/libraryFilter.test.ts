import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryFile, LibraryFolder, MediaInfo } from "../types";
import {
  collectExtensions,
  DEFAULT_LIBRARY_FILTERS,
  filterLibraryFiles,
  filterLibraryFolders,
  filtersForCategoryChange,
  folderDisplayName,
  getActiveFilterChips,
  hasActiveFilters,
  hasAdvancedFilters,
  isDirectFileInFolder,
  normalizeFsPath,
  removeFilterChip,
  sortLibraryFiles,
} from "./libraryFilter";

function mkFile(overrides: Partial<LibraryFile> & Pick<LibraryFile, "name">): LibraryFile {
  return {
    path: `D:\\lib\\${overrides.name}`,
    name: overrides.name,
    category: "文档",
    size: 500_000,
    modified: 1_700_000_000,
    original_path: null,
    can_restore: false,
    favorite: false,
    tags: [],
    ...overrides,
  };
}

describe("filterLibraryFiles", () => {
  const files = [
    mkFile({ name: "report.pdf", size: 2_000_000, tags: ["work"] }),
    mkFile({ name: "photo.jpg", size: 50_000, tags: ["personal"] }),
    mkFile({ name: "notes.txt", size: 500, modified: 1_800_000_000 }),
  ];

  it("filters by query on name and tags", () => {
    expect(filterLibraryFiles(files, { ...DEFAULT_LIBRARY_FILTERS, query: "report" })).toHaveLength(
      1,
    );
    expect(filterLibraryFiles(files, { ...DEFAULT_LIBRARY_FILTERS, query: "work" })).toHaveLength(
      1,
    );
  });

  it("filters by extension", () => {
    const result = filterLibraryFiles(files, {
      ...DEFAULT_LIBRARY_FILTERS,
      extensions: ["pdf"],
    });
    expect(result.map((f) => f.name)).toEqual(["report.pdf"]);
  });

  it("filters by size range", () => {
    const small = filterLibraryFiles(files, {
      ...DEFAULT_LIBRARY_FILTERS,
      sizeRange: "lt1mb",
    });
    expect(small.map((f) => f.name).sort()).toEqual(["notes.txt", "photo.jpg"]);
  });

  it("filters by tags", () => {
    const result = filterLibraryFiles(files, {
      ...DEFAULT_LIBRARY_FILTERS,
      tags: ["personal"],
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("photo.jpg");
  });
});

describe("hasActiveFilters", () => {
  it("detects non-default filters", () => {
    expect(hasActiveFilters(DEFAULT_LIBRARY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, query: "x" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, dateRange: "7d" })).toBe(true);
  });
});

describe("hasAdvancedFilters", () => {
  it("ignores query-only filters", () => {
    expect(hasAdvancedFilters({ ...DEFAULT_LIBRARY_FILTERS, query: "x" })).toBe(false);
    expect(hasAdvancedFilters({ ...DEFAULT_LIBRARY_FILTERS, extensions: ["pdf"] })).toBe(true);
  });
});

describe("filtersForCategoryChange", () => {
  it("keeps query and resets advanced filters", () => {
    const prev = {
      ...DEFAULT_LIBRARY_FILTERS,
      query: "report",
      dateRange: "7d" as const,
      extensions: ["pdf"],
      tags: ["work"],
    };
    expect(filtersForCategoryChange(prev)).toEqual({
      ...DEFAULT_LIBRARY_FILTERS,
      query: "report",
    });
  });
});

describe("filter chip helpers", () => {
  it("builds summary chips for advanced filters", () => {
    const chips = getActiveFilterChips({
      ...DEFAULT_LIBRARY_FILTERS,
      dateRange: "today",
      extensions: ["pdf"],
      tags: ["work"],
    });
    expect(chips.map((c) => c.label)).toEqual(["今天", ".pdf", "#work"]);
  });

  it("removes chips by id", () => {
    const filters = {
      ...DEFAULT_LIBRARY_FILTERS,
      extensions: ["pdf", "jpg"],
      tags: ["work"],
    };
    expect(removeFilterChip(filters, "ext:pdf").extensions).toEqual(["jpg"]);
    expect(removeFilterChip(filters, "tag:work").tags).toEqual([]);
  });
});

describe("collectExtensions", () => {
  it("returns sorted unique extensions", () => {
    expect(
      collectExtensions([
        mkFile({ name: "b.ZIP" }),
        mkFile({ name: "a.pdf" }),
        mkFile({ name: "c.pdf" }),
        mkFile({ name: "noext" }),
      ]),
    ).toEqual(["pdf", "zip"]);
  });
});

describe("sortLibraryFiles", () => {
  const files = [
    mkFile({ name: "a", size: 10, modified: 100 }),
    mkFile({ name: "b", size: 30, modified: 200 }),
    mkFile({ name: "c", size: 20, modified: 150 }),
  ];

  it("sorts by size descending", () => {
    expect(sortLibraryFiles(files, "size-desc").map((f) => f.name)).toEqual(["b", "c", "a"]);
  });

  it("sorts by modified ascending", () => {
    expect(sortLibraryFiles(files, "modified-asc").map((f) => f.name)).toEqual(["a", "c", "b"]);
  });

  it("sorts by duration using media info", () => {
    const stub = (duration_secs: number): MediaInfo => ({
      duration_secs,
      video_codec: null,
      audio_codec: null,
      width: null,
      height: null,
      artist: null,
      title: null,
      album: null,
      cover_data_url: null,
    });
    const media = {
      [files[0].path]: stub(120),
      [files[1].path]: stub(30),
      [files[2].path]: stub(60),
    };
    expect(sortLibraryFiles(files, "duration-desc", media).map((f) => f.name)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
});

describe("filterLibraryFolders", () => {
  const tree: LibraryFolder[] = [
    {
      name: "工作",
      path: "D:\\lib\\工作",
      category: "文档",
      subfolder_count: 1,
      children: [
        {
          name: "2024",
          path: "D:\\lib\\工作\\2024",
          category: "文档",
          subfolder_count: 0,
          children: [],
        },
      ],
    },
    {
      name: "个人",
      path: "D:\\lib\\个人",
      category: "图片",
      subfolder_count: 0,
      children: [],
    },
  ];

  it("returns full tree when query empty", () => {
    expect(filterLibraryFolders(tree, "")).toEqual(tree);
  });

  it("keeps ancestors when child matches", () => {
    const result = filterLibraryFolders(tree, "2024");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("工作");
    expect(result[0].children[0].name).toBe("2024");
  });
});

describe("path helpers", () => {
  it("normalizes slashes and trailing backslash", () => {
    expect(normalizeFsPath("D:/lib/folder/")).toBe("D:\\lib\\folder");
  });

  it("detects direct child files only", () => {
    expect(isDirectFileInFolder("D:\\lib\\工作\\a.pdf", "D:\\lib\\工作")).toBe(true);
    expect(isDirectFileInFolder("D:\\lib\\工作\\2024\\a.pdf", "D:\\lib\\工作")).toBe(false);
  });

  it("extracts folder display name", () => {
    expect(folderDisplayName("D:\\lib\\工作\\2024")).toBe("2024");
  });
});

describe("filterLibraryFiles date range", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T12:00:00+08:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters files modified today", () => {
    const startToday = Math.floor(new Date("2026-05-31T00:00:00+08:00").getTime() / 1000);
    const files = [
      mkFile({ name: "today.txt", modified: startToday + 60 }),
      mkFile({ name: "old.txt", modified: startToday - 86400 }),
    ];
    const result = filterLibraryFiles(files, {
      ...DEFAULT_LIBRARY_FILTERS,
      dateRange: "today",
    });
    expect(result.map((f) => f.name)).toEqual(["today.txt"]);
  });
});
