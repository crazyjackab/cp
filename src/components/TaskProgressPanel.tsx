import { formatNumber } from "../utils";
import { isIndeterminateProgress, resolveProgressPercent } from "../utils/taskProgress";

interface Props {
  message: string;
  processed?: number;
  total?: number | null;
  progress?: number | null;
  indeterminate?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
}

export function TaskProgressPanel({
  message,
  processed = 0,
  total = null,
  progress = null,
  indeterminate,
  onCancel,
  cancelLabel = "取消任务",
}: Props) {
  const percent = resolveProgressPercent(processed, total, progress);
  const showIndeterminate = indeterminate ?? isIndeterminateProgress(processed, total, progress);
  const showRatio = total != null && total > 0;
  const barWidth = showIndeterminate ? undefined : `${Math.max(percent ?? 0, 2)}%`;

  return (
    <div className="task-progress">
      <div className="task-progress-row">
        <span>{message}</span>
        <span>
          {showRatio
            ? percent != null
              ? `${formatNumber(processed)} / ${formatNumber(total)}（${percent}%）`
              : `${formatNumber(processed)} / ${formatNumber(total)}`
            : `已处理 ${formatNumber(processed)} 项`}
        </span>
      </div>
      <div className="update-progress update-progress-block">
        <span
          className={`update-progress-bar${showIndeterminate ? " task-progress-indeterminate" : ""}`}
          style={showIndeterminate ? undefined : { width: barWidth }}
        />
      </div>
      {onCancel && (
        <div className="task-progress-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      )}
    </div>
  );
}
