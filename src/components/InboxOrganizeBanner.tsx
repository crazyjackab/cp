import { IconScan } from "./icons";

interface Props {
  count: number;
  disabled?: boolean;
  onOrganize: () => void;
}

export function InboxOrganizeBanner({ count, disabled, onOrganize }: Props) {
  if (count <= 0) return null;

  return (
    <div className="inbox-organize-banner" role="region" aria-label="收件箱整理">
      <div className="inbox-organize-banner-main">
        <span className="inbox-organize-banner-icon" aria-hidden>
          <IconScan size={20} />
        </span>
        <div className="inbox-organize-banner-copy">
          <p className="inbox-organize-banner-title">
            <strong>{count}</strong> 个文件待整理
          </p>
          <p className="inbox-organize-banner-hint">按扩展名与自定义规则自动分到对应分类</p>
        </div>
      </div>
      <button type="button" className="btn btn-primary" disabled={disabled} onClick={onOrganize}>
        整理 {count} 个文件
      </button>
    </div>
  );
}
