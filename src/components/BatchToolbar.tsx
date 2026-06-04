import { IconCheckSquare, IconFolder, IconRestore, IconSaveAs, IconStar, IconTrash } from "./icons";

export interface BatchSelectionProps {
  totalCount: number;
  selectedCount: number;
  selectionMode: boolean;
  disabled?: boolean;
  onEnterSelectionMode: () => void;
  onExitSelectionMode: () => void;
  onSelectAll: () => void;
  onInvert: () => void;
  onClear: () => void;
}

interface ActionBarProps extends BatchSelectionProps {
  onMove: () => void;
  onFavorite: () => void;
  onUnfavorite: () => void;
  onRestore: () => void;
  onSaveAs: () => void;
  onDelete: () => void;
}

export function BatchSelectionInline({
  totalCount,
  selectedCount,
  selectionMode,
  disabled,
  onEnterSelectionMode,
  onExitSelectionMode,
  onSelectAll,
  onInvert,
}: BatchSelectionProps) {
  if (totalCount === 0) return null;

  const hasSelection = selectedCount > 0;
  if (hasSelection) return null;

  const handleFinish = () => {
    onExitSelectionMode();
  };

  if (!selectionMode) {
    return (
      <button
        type="button"
        className="selection-mode-toggle"
        disabled={disabled}
        onClick={onEnterSelectionMode}
        title="进入多选模式"
        aria-pressed={false}
      >
        <span className="selection-mode-icon" aria-hidden>
          <IconCheckSquare size={16} />
        </span>
        <span className="selection-mode-label">多选</span>
      </button>
    );
  }

  return (
    <div className="selection-mode-cluster active">
      <button
        type="button"
        className="selection-mode-toggle active"
        disabled={disabled}
        onClick={handleFinish}
        title="退出多选"
        aria-pressed
      >
        <span className="selection-mode-icon" aria-hidden>
          <IconCheckSquare size={16} />
        </span>
        <span className="selection-mode-label">多选中</span>
      </button>
      <div className="selection-mode-actions" role="group" aria-label="多选操作">
        <button type="button" className="selection-mode-action" disabled={disabled} onClick={onSelectAll}>
          全选
        </button>
        <button type="button" className="selection-mode-action" disabled={disabled} onClick={onInvert}>
          反选
        </button>
        <button
          type="button"
          className="selection-mode-action selection-mode-action-done"
          disabled={disabled}
          onClick={handleFinish}
        >
          完成
        </button>
      </div>
    </div>
  );
}

export function BatchActionBar({
  totalCount,
  selectedCount,
  disabled,
  onExitSelectionMode,
  onSelectAll,
  onInvert,
  onClear,
  onMove,
  onFavorite,
  onUnfavorite,
  onRestore,
  onSaveAs,
  onDelete,
}: ActionBarProps) {
  if (totalCount === 0 || selectedCount === 0) return null;

  const allSelected = selectedCount === totalCount;
  const partiallySelected = !allSelected;

  const handleClear = () => {
    onClear();
    onExitSelectionMode();
  };

  const toggleSelection = allSelected ? handleClear : onSelectAll;

  return (
    <div className="batch-action-bar" role="toolbar" aria-label="批量操作">
      <div className="batch-action-bar-leading">
        <button
          type="button"
          className={`batch-select-toggle compact ${allSelected || partiallySelected ? "active" : ""} ${
            partiallySelected ? "partial" : ""
          }`}
          disabled={disabled}
          onClick={toggleSelection}
          aria-pressed
          title={allSelected ? "取消全选" : "全选"}
        >
          <span className="batch-select-box" aria-hidden>
            {allSelected ? "✓" : partiallySelected ? "−" : ""}
          </span>
        </button>
        <p className="batch-action-summary">
          <span className="batch-action-summary-strong">已选 {selectedCount}</span>
          <span className="batch-action-summary-muted">/ {totalCount} 项</span>
        </p>
        <div className="batch-action-quick" role="group" aria-label="选择操作">
          <button type="button" className="selection-mode-action" disabled={disabled} onClick={onInvert}>
            反选
          </button>
          <button type="button" className="selection-mode-action" disabled={disabled} onClick={handleClear}>
            清空
          </button>
          <button
            type="button"
            className="selection-mode-action selection-mode-action-done"
            disabled={disabled}
            onClick={handleClear}
          >
            完成
          </button>
        </div>
      </div>
      <div className="batch-action-bar-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onMove}>
          <IconFolder size={15} />
          移动
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onFavorite}>
          <IconStar size={15} />
          收藏
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onUnfavorite}>
          取消收藏
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onRestore}>
          <IconRestore size={15} />
          还原
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onSaveAs}>
          <IconSaveAs size={15} />
          另存为
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-danger-text"
          disabled={disabled}
          onClick={onDelete}
        >
          <IconTrash size={15} />
          删除
        </button>
      </div>
    </div>
  );
}
