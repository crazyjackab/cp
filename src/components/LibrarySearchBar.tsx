import { useState } from "react";
import {
  DEFAULT_LIBRARY_FILTERS,
  type DateRangeFilter,
  type LibraryFilters,
  type SizeRangeFilter,
  getActiveFilterChips,
  hasActiveFilters,
  hasAdvancedFilters,
  removeFilterChip,
} from "../utils/libraryFilter";
import { IconChevronRight, IconSearch } from "./icons";
import { BatchSelectionInline, type BatchSelectionProps } from "./BatchToolbar";

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
  availableTags: string[];
  resultCount: number;
  totalCount: number;
  selection?: BatchSelectionProps;
}

export function LibrarySearchBar({
  filters,
  onChange,
  availableExtensions,
  availableTags,
  resultCount,
  totalCount,
  selection,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const active = hasActiveFilters(filters);
  const advancedActive = hasAdvancedFilters(filters);
  const filtered = active && resultCount !== totalCount;
  const summaryChips = getActiveFilterChips(filters);

  const toggleExtension = (ext: string) => {
    const set = new Set(filters.extensions);
    if (set.has(ext)) set.delete(ext);
    else set.add(ext);
    onChange({ ...filters, extensions: [...set] });
  };

  const toggleTag = (tag: string) => {
    const set = new Set(filters.tags);
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    onChange({ ...filters, tags: [...set] });
  };

  const toggleExpanded = () => {
    setExpanded((open) => !open);
  };

  return (
    <div className="library-search">
      <div className="library-search-row">
        {selection ? <BatchSelectionInline {...selection} /> : null}
        <label className="search-field">
          <IconSearch size={16} className="search-field-icon" />
          <input
            type="search"
            className="search-input"
            placeholder="搜索文件名或标签…"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
          />
        </label>
        <button
          type="button"
          className={`btn btn-ghost btn-sm-text library-filter-toggle ${expanded ? "expanded" : ""} ${
            advancedActive ? "has-active" : ""
          }`}
          aria-expanded={expanded}
          aria-controls="library-advanced-filters"
          onClick={toggleExpanded}
        >
          <IconChevronRight
            size={14}
            className={`library-filter-chevron ${expanded ? "expanded" : ""}`}
          />
          筛选
          {advancedActive && !expanded ? (
            <span className="library-filter-badge">{summaryChips.length}</span>
          ) : null}
        </button>
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

      {summaryChips.length > 0 ? (
        <div
          className={`library-filter-summary-wrap ${!expanded ? "visible" : ""}`}
          aria-hidden={expanded}
        >
          <div className="library-filter-summary-inner">
            <div className="library-filter-summary">
              {summaryChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="filter-summary-chip"
                  title="点击移除"
                  tabIndex={expanded ? -1 : undefined}
                  onClick={() => onChange(removeFilterChip(filters, chip.id))}
                >
                  {chip.label}
                  <span className="filter-summary-chip-x" aria-hidden>
                    ×
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div
        id="library-advanced-filters"
        className={`library-advanced-filters-wrap ${expanded ? "expanded" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="library-advanced-filters-inner" inert={expanded ? undefined : true}>
          <div className="library-advanced-filters">
            <div className="library-filter-row">
              <select
                className="filter-select"
                value={filters.dateRange}
                onChange={(e) =>
                  onChange({ ...filters, dateRange: e.target.value as DateRangeFilter })
                }
                aria-label="修改时间"
                tabIndex={expanded ? undefined : -1}
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
                tabIndex={expanded ? undefined : -1}
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
                        tabIndex={expanded ? undefined : -1}
                        onClick={() => toggleExtension(ext)}
                      >
                        .{ext}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {availableTags.length > 0 ? (
              <div className="extension-filters">
                <span className="extension-filters-label">标签</span>
                <div className="extension-chips">
                  {availableTags.map((tag) => {
                    const selected = filters.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`ext-chip tag-filter-chip ${selected ? "selected" : ""}`}
                        tabIndex={expanded ? undefined : -1}
                        onClick={() => toggleTag(tag)}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
