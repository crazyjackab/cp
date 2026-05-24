import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";

interface Props {
  file: LibraryFile;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ file, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog modal-dialog-sm"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>确认删除</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body-form">
          <p className="delete-warning">
            确定要删除以下文件吗？文件将移至<strong>系统回收站</strong>，可从回收站恢复。
          </p>
          <div className="delete-file-info">
            <div className="delete-file-name">{file.name}</div>
            <div className="delete-file-meta">
              {file.category} · {formatBytes(file.size)}
            </div>
            <div className="delete-file-path" title={file.path}>
              {file.path}
            </div>
          </div>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            确认删除
          </button>
        </footer>
      </div>
    </div>
  );
}
