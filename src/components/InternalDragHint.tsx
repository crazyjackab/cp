import { createPortal } from "react-dom";
import { formatInternalMoveTargetLabel, type ImportDropTarget } from "../utils/importTarget";
import { IconFolder } from "./icons";

interface Props {
  visible: boolean;
  target: ImportDropTarget | null;
}

export function InternalDragHint({ visible, target }: Props) {
  if (!visible) return null;

  const label = formatInternalMoveTargetLabel(target);

  return createPortal(
    <div className="internal-drag-hint" role="status" aria-live="polite">
      <span className="internal-drag-hint-icon" aria-hidden>
        <IconFolder size={18} />
      </span>
      <span className="internal-drag-hint-text">{label}</span>
      <span className="internal-drag-hint-sub">松开鼠标放入文件夹</span>
    </div>,
    document.body,
  );
}
