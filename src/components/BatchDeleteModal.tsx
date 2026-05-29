import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";

interface Props {
  files: LibraryFile[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function BatchDeleteModal({ files, onConfirm, onCancel }: Props) {
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const sample = files.slice(0, 6);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog modal-dialog-sm"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>批量删除</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body-form">
          <p className="delete-warning">
            确定删除选中的 <strong>{files.length}</strong> 个文件吗？将移至
            <strong>系统回收站</strong>。
          </p>
          <p className="form-hint">合计 {formatBytes(totalBytes)}</p>
          <ul className="batch-file-list">
            {sample.map((f) => (
              <li key={f.path} title={f.path}>
                {f.name}
              </li>
            ))}
            {files.length > sample.length && (
              <li className="batch-file-more">…还有 {files.length - sample.length} 个</li>
            )}
          </ul>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            删除 {files.length} 项
          </button>
        </footer>
      </div>
    </div>
  );
}
