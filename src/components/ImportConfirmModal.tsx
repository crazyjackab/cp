import { useEffect, useMemo, useState } from "react";
import type { PendingImportFile, SkippedImportFile } from "../types";
import { formatBytes } from "../utils";
import { summarizeSkipReasons } from "../utils/importSkip";

interface Props {
  title: string;
  sourceLabel: string;
  files: PendingImportFile[];
  skipped?: SkippedImportFile[];
  onConfirm: (paths: string[]) => void;
  onCancel: () => void;
}

export function ImportConfirmModal({
  title,
  sourceLabel,
  files,
  skipped = [],
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
    () => files.filter((f) => selected.has(f.path)).reduce((sum, f) => sum + f.size, 0),
    [files, selected],
  );
  const conflictCount = files.filter((f) => f.target_exists).length;
  const skipSummary = useMemo(() => summarizeSkipReasons(skipped), [skipped]);

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
          以下文件来自<strong>{sourceLabel}</strong>
          ，勾选后将收纳到资料库对应分类。取消勾选的文件不会被收纳。
          {conflictCount > 0 ? (
            <>
              {" "}
              其中 <strong>{conflictCount}</strong> 个文件存在同名冲突，将按设置中的冲突策略处理。
            </>
          ) : null}
          {skipped.length > 0 ? (
            <>
              {" "}
              另有 <strong>{skipped.length}</strong> 个文件将自动跳过
              {skipSummary ? <>（{skipSummary}）</> : null}。
            </>
          ) : null}
        </p>

        {files.length === 0 && skipped.length === 0 ? (
          <div className="modal-empty">当前没有可收纳的文件。</div>
        ) : (
          <>
            {files.length > 0 ? (
              <>
                <div className="modal-toolbar">
                  <label className="check-all">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
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
                        <th>冲突</th>
                        <th>大小</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((f) => (
                        <tr key={f.path} className={selected.has(f.path) ? "" : "row-unchecked"}>
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
                          <td>
                            {f.target_exists ? (
                              <span className="category-pill category-pill-warn">同名</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{formatBytes(f.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {skipped.length > 0 ? (
              <div className="import-skipped-section">
                <h3 className="import-skipped-title">将跳过的文件（{skipped.length}）</h3>
                <div className="modal-table-wrap import-skipped-table-wrap">
                  <table className="modal-table import-skipped-table">
                    <thead>
                      <tr>
                        <th>文件名</th>
                        <th>原因</th>
                        <th>大小</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skipped.map((f) => (
                        <tr key={f.path}>
                          <td className="modal-name" title={f.path}>
                            {f.name}
                          </td>
                          <td>
                            <span className="category-pill tone-other">{f.reason}</span>
                          </td>
                          <td>{formatBytes(f.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
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
