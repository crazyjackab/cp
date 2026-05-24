import {
  DEFAULT_LIBRARY_FILTERS,
  type DateRangeFilter,
  type LibraryFilters,
  type SizeRangeFilter,
  hasActiveFilters,
} from "../utils/libraryFilter";
import { IconSearch } from "./icons";

const DATE_OPTIONS: { id: DateRangeFilter; label: string }[] = [
  { id: "all", label: "全部时间" },
  { id: "today", label: "今天" },
  { id: "7d", label: "近 7 天" },
  { id: "30d", label: "近 30 天" },
  { id: "365d", label: "近一年" },
];

const SIZE_OPTIONS: { id: SizeRangeFilter; label: string }[] = [
  { id: "all", label: "全部大小" },
  { id: "lt1mb", label: "< 1 MB" },
  { id: "1to10mb", label: "1 – 10 MB" },
  { id: "gt10mb", label: "> 10 MB" },
];

interface Props {
  filters: LibraryFilters;
  onChange: (next: LibraryFilters) => void;
  availableExtensions: string[];
  resultCount: number;
  totalCount: number;
}

export function LibrarySearchBar({
  filters,
  onChange,
  availableExtensions,
  resultCount,
  totalCount,
}: Props) {
  const active = hasActiveFilters(filters);
  const filtered = active && resultCount !== totalCount;

  const toggleExtension = (ext: string) => {
    const set = new Set(filters.extensions);
    if (set.has(ext)) set.delete(ext);
    else set.add(ext);
    onChange({ ...filters, extensions: [...set] });
  };

  return (
    <div className="library-search">
      <div className="library-search-row">
        <label className="search-field">
          <IconSearch size={16} className="search-field-icon" />
          <input
            type="search"
            className="search-input"
            placeholder="搜索文件名…"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
          />
        </label>
        {active ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm-text"
            onClick={() => onChange({ ...DEFAULT_LIBRARY_FILTERS })}
          >
            清除筛选
          </button>
        ) : null}
        {filtered ? (
          <span className="search-result-hint">
            显示 {resultCount} / {totalCount} 项
          </span>
        ) : null}
      </div>

      <div className="library-filter-row">
        <select
          className="filter-select"
          value={filters.dateRange}
          onChange={(e) =>
            onChange({ ...filters, dateRange: e.target.value as DateRangeFilter })
          }
          aria-label="修改时间"
        >
          {DATE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.sizeRange}
          onChange={(e) =>
            onChange({ ...filters, sizeRange: e.target.value as SizeRangeFilter })
          }
          aria-label="文件大小"
        >
          {SIZE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {availableExtensions.length > 0 ? (
        <div className="extension-filters">
          <span className="extension-filters-label">扩展名</span>
          <div className="extension-chips">
            {availableExtensions.map((ext) => {
              const selected = filters.extensions.includes(ext);
              return (
                <button
                  key={ext}
                  type="button"
                  className={`ext-chip ${selected ? "selected" : ""}`}
                  onClick={() => toggleExtension(ext)}
                >
                  .{ext}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
