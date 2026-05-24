import { useEffect, useMemo, useState } from "react";
import type { PendingImportFile } from "../types";
import { formatBytes } from "../utils";

interface Props {
  title: string;
  sourceLabel: string;
  files: PendingImportFile[];
  onConfirm: (paths: string[]) => void;
  onCancel: () => void;
}

export function ImportConfirmModal({
  title,
  sourceLabel,
  files,
  onConfirm,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelected(new Set(files.map((f) => f.path)));
  }, [files]);

  const allSelected = selected.size === files.length && files.length > 0;
  const selectedCount = selected.size;
  const selectedBytes = useMemo(
    () =>
      files
        .filter((f) => selected.has(f.path))
        .reduce((sum, f) => sum + f.size, 0),
    [files, selected],
  );

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.path)));
    }
  };

  const handleConfirm = () => {
    onConfirm(files.filter((f) => selected.has(f.path)).map((f) => f.path));
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="import-modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <p className="modal-desc">
          以下文件来自<strong>{sourceLabel}</strong>，勾选后将<strong>移动</strong>到资料库对应分类。取消勾选的文件不会被收纳。
        </p>

        {files.length === 0 ? (
          <div className="modal-empty">当前没有可收纳的文件。</div>
        ) : (
          <>
            <div className="modal-toolbar">
              <label className="check-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
                全选（{files.length} 个）
              </label>
              <span className="modal-summary">
                已选 {selectedCount} 个 · {formatBytes(selectedBytes)}
              </span>
            </div>

            <div className="modal-table-wrap">
              <table className="modal-table">
                <thead>
                  <tr>
                    <th className="col-check" />
                    <th>文件名</th>
                    <th>将归入</th>
                    <th>大小</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr
                      key={f.path}
                      className={selected.has(f.path) ? "" : "row-unchecked"}
                    >
                      <td className="col-check">
                        <input
                          type="checkbox"
                          checked={selected.has(f.path)}
                          onChange={() => toggle(f.path)}
                        />
                      </td>
                      <td className="modal-name" title={f.path}>
                        {f.name}
                      </td>
                      <td>{f.target_category}</td>
                      <td>{formatBytes(f.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selectedCount === 0}
            onClick={handleConfirm}
          >
            收纳所选（{selectedCount}）
          </button>
        </footer>
      </div>
    </div>
  );
}
