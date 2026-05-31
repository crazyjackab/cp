import { useEffect, useMemo, useRef, useState } from "react";

import { LIBRARY_MOVE_TARGETS, type LibraryCategory, type LibraryMoveTarget } from "../types";

import { folderDisplayName } from "../utils/libraryFilter";

import { navIcon } from "../utils/fileUi";

import { IconFolderNew } from "./icons";

interface Props {
  category: LibraryCategory;

  folderPath?: string | null;

  libraryRoot: string;

  onConfirm: (name: string, targetCategory: LibraryMoveTarget) => void;

  onCancel: () => void;
}

function defaultFolderCategory(category: LibraryCategory): LibraryMoveTarget {
  if (category === "all" || category === "favorites") {
    return "收件箱";
  }

  return category;
}

export function NewFolderModal({
  category,

  folderPath = null,

  libraryRoot,

  onConfirm,

  onCancel,
}: Props) {
  const [name, setName] = useState("新建文件夹");

  const [targetCategory, setTargetCategory] = useState<LibraryMoveTarget>(() =>
    defaultFolderCategory(category),
  );

  const [error, setError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  const showCategoryPicker = !folderPath && (category === "all" || category === "favorites");

  const createInsideCurrentFolder = Boolean(folderPath);

  const targetPath = useMemo(() => {
    const trimmed = name.trim() || "新建文件夹";

    if (folderPath) {
      return `${folderPath}\\${trimmed}`;
    }

    return `${libraryRoot}\\${targetCategory}\\${trimmed}`;
  }, [folderPath, libraryRoot, targetCategory, name]);

  useEffect(() => {
    inputRef.current?.focus();

    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = name.trim();

    if (!trimmed) {
      setError("请输入文件夹名称");

      return;
    }

    onConfirm(trimmed, targetCategory);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog modal-dialog-sm new-folder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-folder-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="new-folder-title">新建文件夹</h2>

          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body-form new-folder-body">
          <div className="new-folder-intro">
            <span className="new-folder-intro-icon">
              <IconFolderNew size={20} />
            </span>

            <p>
              {createInsideCurrentFolder
                ? `将在当前文件夹「${folderDisplayName(folderPath!)}」内创建子文件夹。`
                : showCategoryPicker
                  ? "在资料库分类下创建文件夹，可用于整理收纳的文件。"
                  : `将在「${category}」分类下创建文件夹。`}
            </p>
          </div>

          {showCategoryPicker ? (
            <div className="new-folder-field">
              <span className="form-label">创建位置</span>

              <div className="batch-category-grid new-folder-category-grid">
                {LIBRARY_MOVE_TARGETS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`batch-category-option ${targetCategory === cat ? "selected" : ""}`}
                    onClick={() => setTargetCategory(cat)}
                  >
                    {navIcon(cat)}

                    <span>{cat}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="new-folder-field">
            <label className="form-label" htmlFor="new-folder-input">
              文件夹名称
            </label>

            <input
              id="new-folder-input"
              ref={inputRef}
              type="text"
              className="form-input"
              value={name}
              onChange={(event) => {
                setName(event.target.value);

                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();

                if (event.key === "Escape") onCancel();
              }}
              placeholder="新建文件夹"
              autoComplete="off"
            />

            {error ? <p className="form-error">{error}</p> : null}

            <p className="form-hint" title={targetPath}>
              路径：{targetPath}
            </p>
          </div>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>

          <button type="button" className="btn btn-primary" onClick={submit}>
            创建
          </button>
        </footer>
      </div>
    </div>
  );
}
