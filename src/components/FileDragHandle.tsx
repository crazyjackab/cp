import { useInternalFileDragStart } from "../hooks/useInternalFileMoveSession";
import { IconGripVertical } from "./icons";

interface Props {
  paths: string[];
  className?: string;
  title?: string;
}

export function FileDragHandle({
  paths,
  className = "",
  title = "拖到侧栏文件夹可移动；拖出窗口可发送到微信/QQ",
}: Props) {
  const { startDrag } = useInternalFileDragStart();

  if (paths.length === 0) return null;

  return (
    <div
      className={`file-drag-handle ${className}`.trim()}
      title={title}
      aria-label="拖动移动"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        startDrag(paths, event);
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <IconGripVertical size={14} />
    </div>
  );
}
