interface Props {
  newPath: string;
  currentPath: string;
  onConfirm: (migrate: boolean) => void;
  onCancel: () => void;
}

export function LibraryPathConfirmModal({ newPath, currentPath, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog modal-dialog-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-path-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="library-path-title">更改资料库路径</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body-form">
          <p className="settings-desc">新路径：</p>
          <p className="path-display path-display-block">{newPath}</p>
          <p className="form-hint">当前：{currentPath}</p>

          <p className="settings-desc library-path-hint">
            是否将现有资料库中的文件迁移到新位置？若选择「仅切换」，原位置文件会保留，新位置将创建空资料库。
          </p>
        </div>

        <footer className="modal-footer library-path-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onConfirm(false)}>
            仅切换路径
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(true)}>
            迁移文件
          </button>
        </footer>
      </div>
    </div>
  );
}
