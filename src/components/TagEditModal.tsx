import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryFile } from "../types";
import { formatBytes } from "../utils";
import { fileIcon, fileTone, fileTypeLabel } from "../utils/fileUi";
import { IconTag } from "./icons";

interface Props {
  file: LibraryFile;
  suggestions: string[];
  onConfirm: (tags: string[]) => void;
  onCancel: () => void;
}

const MAX_TAGS = 12;

function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(/[,，\s]+/)) {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

export function TagEditModal({ file, suggestions, onConfirm, onCancel }: Props) {
  const [input, setInput] = useState((file.tags ?? []).join(", "));
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = useMemo(() => parseTags(input), [input]);

  const availableSuggestions = useMemo(() => {
    const current = new Set(tags.map((tag) => tag.toLowerCase()));
    return suggestions.filter((tag) => !current.has(tag.toLowerCase()));
  }, [suggestions, tags]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => onConfirm(tags);

  const removeTag = (tag: string) => {
    setInput(tags.filter((item) => item !== tag).join(", "));
  };

  const addSuggestion = (tag: string) => {
    if (tags.length >= MAX_TAGS) return;
    setInput(parseTags(`${input} ${tag}`).join(", "));
  };

  const tone = fileTone(file.category, file.name);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog modal-dialog-sm tag-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="tag-modal-title">编辑标签</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body-form tag-modal-body">
          <div className="tag-modal-file">
            <div className={`tag-modal-file-icon ${tone}`}>
              {fileIcon(file.category, file.name)}
            </div>
            <div className="tag-modal-file-info">
              <p className="tag-modal-file-name" title={file.path}>
                {file.name}
              </p>
              <p className="tag-modal-file-meta">
                {fileTypeLabel(file.category, file.name)} · {formatBytes(file.size)}
              </p>
            </div>
          </div>

          <div className="tag-modal-field">
            <label className="form-label tag-modal-label" htmlFor="tag-input">
              <span>标签</span>
              <span
                className={`tag-modal-count ${tags.length >= MAX_TAGS ? "tag-modal-count-full" : ""}`}
              >
                {tags.length} / {MAX_TAGS}
              </span>
            </label>
            <input
              id="tag-input"
              ref={inputRef}
              className="form-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
                if (event.key === "Escape") onCancel();
              }}
              placeholder="例如：重要 项目A 待处理"
              autoComplete="off"
            />
            <p className="form-hint">用空格或逗号分隔多个标签</p>
          </div>

          {tags.length > 0 ? (
            <div className="tag-modal-preview">
              <span className="tag-modal-section-label">将保存的标签</span>
              <div className="tag-preview-list">
                {tags.map((tag) => (
                  <span className="tag-chip tag-chip-editable" key={tag}>
                    #{tag}
                    <button
                      type="button"
                      className="tag-chip-remove"
                      aria-label={`移除标签 ${tag}`}
                      onClick={() => removeTag(tag)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="tag-empty-hint">留空并保存将清除此文件的所有标签</p>
          )}

          {availableSuggestions.length > 0 ? (
            <div className="tag-suggestion-block">
              <span className="tag-modal-section-label">
                <IconTag size={14} />
                快速添加
              </span>
              <div className="tag-suggestion-list">
                {availableSuggestions.slice(0, 20).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="tag-chip tag-chip-action"
                    disabled={tags.length >= MAX_TAGS}
                    onClick={() => addSuggestion(tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            保存标签
          </button>
        </footer>
      </div>
    </div>
  );
}
