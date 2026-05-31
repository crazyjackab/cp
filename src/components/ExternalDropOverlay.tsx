import { createPortal } from "react-dom";
import { IconImport } from "./icons";

interface Props {
  visible: boolean;
  title: string;
  hint: string;
}

export function ExternalDropOverlay({ visible, title, hint }: Props) {
  if (!visible) return null;

  return createPortal(
    <div className="app-drop-overlay" role="status" aria-live="polite">
      <div className="app-drop-overlay-inner">
        <span className="app-drop-overlay-icon" aria-hidden>
          <IconImport size={40} />
        </span>
        <p className="app-drop-overlay-title">{title}</p>
        <p className="app-drop-overlay-hint">{hint}</p>
      </div>
    </div>,
    document.body,
  );
}
