import { useState } from "react";
import { LIBRARY_MOVE_TARGETS, type LibraryFile, type LibraryMoveTarget } from "../types";
import { navIcon } from "../utils/fileUi";

interface Props {
  files: LibraryFile[];
  onConfirm: (target: LibraryMoveTarget) => void;
  onCancel: () => void;
}

export function BatchMoveModal({ files, onConfirm, onCancel }: Props) {
  const [target, setTarget] = useState<LibraryMoveTarget>("收件箱");

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog modal-dialog-sm"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>移动到分类</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body-form">
          <p className="settings-desc">
            将选中的 {files.length} 个文件移动到目标分类文件夹。
          </p>
          <div className="batch-category-grid">
            {LIBRARY_MOVE_TARGETS.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`batch-category-option ${target === cat ? "selected" : ""}`}
                onClick={() => setTarget(cat)}
              >
                <span className="batch-category-icon">{navIcon(cat, 18)}</span>
                {cat}
              </button>
            ))}
          </div>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(target)}>
            移动到「{target}」
          </button>
        </footer>
      </div>
    </div>
  );
}
