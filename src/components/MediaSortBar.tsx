import type { MediaSortKey } from "../types";

const SORT_OPTIONS: { id: MediaSortKey; label: string }[] = [
  { id: "modified-desc", label: "修改时间 ↓" },
  { id: "modified-asc", label: "修改时间 ↑" },
  { id: "size-desc", label: "大小 ↓" },
  { id: "size-asc", label: "大小 ↑" },
  { id: "duration-desc", label: "时长 ↓" },
  { id: "duration-asc", label: "时长 ↑" },
];

interface Props {
  sortKey: MediaSortKey;
  onChange: (key: MediaSortKey) => void;
  loading?: boolean;
}

export function MediaSortBar({ sortKey, onChange, loading }: Props) {
  return (
    <div className="media-sort-bar">
      <label className="media-sort-label">
        排序
        <select
          className="media-sort-select"
          value={sortKey}
          onChange={(e) => onChange(e.target.value as MediaSortKey)}
          disabled={loading}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {loading ? <span className="media-sort-hint">正在读取媒体信息…</span> : null}
    </div>
  );
}
