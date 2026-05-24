import { useEffect, useRef, useState } from "react";
import type { LibraryFile } from "../types";

interface Props {
  file: LibraryFile;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

export function RenameModal({ file, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(file.name);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入文件名");
      return;
    }
    if (trimmed === file.name) {
      onCancel();
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog modal-dialog-sm"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>重命名</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body-form">
          <label className="form-label" htmlFor="rename-input">
            新文件名
          </label>
          <input
            id="rename-input"
            ref={inputRef}
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
          {error && <p className="form-error">{error}</p>}
          <p className="form-hint">路径：{file.path}</p>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            确定
          </button>
        </footer>
      </div>
    </div>
  );
}
