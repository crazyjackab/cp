import {
  IconFolder,
  IconRestore,
  IconTrash,
} from "./icons";

interface Props {
  totalCount: number;
  selectedCount: number;
  disabled?: boolean;
  onSelectAll: () => void;
  onInvert: () => void;
  onClear: () => void;
  onMove: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

export function BatchToolbar({
  totalCount,
  selectedCount,
  disabled,
  onSelectAll,
  onInvert,
  onClear,
  onMove,
  onRestore,
  onDelete,
}: Props) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="batch-toolbar">
      <div className="batch-toolbar-left">
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onSelectAll}>
          全选
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onInvert}>
          反选
        </button>
        {hasSelection && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onClear}>
            取消选择
          </button>
        )}
        <span className="batch-toolbar-count">
          {hasSelection ? `已选 ${selectedCount} / ${totalCount}` : `共 ${totalCount} 项`}
        </span>
      </div>

      {hasSelection && (
        <div className="batch-toolbar-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onMove}>
            <IconFolder size={14} />
            移动到…
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onRestore}>
            <IconRestore size={14} />
            还原
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-danger-text" disabled={disabled} onClick={onDelete}>
            <IconTrash size={14} />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
