import type { LibraryCategory } from "../types";
import {
  IconDesktop,
  IconDownload,
  IconFolderNew,
  IconImport,
  IconRefresh,
  IconScan,
} from "./icons";

interface Props {
  categoryLabel: string;
  pageSubtitle: string;
  canReclassify: boolean;
  reclassifyLabel: string;
  misplacedCount: number;
  disabled: boolean;
  onPickAndImport: () => void;
  onNewFolder: () => void;
  onImportDesktop: () => void;
  onImportDownloads: () => void;
  onReclassify: () => void;
  onRefresh: () => void;
}

export function LibraryToolbar({
  categoryLabel,
  pageSubtitle,
  canReclassify,
  reclassifyLabel,
  misplacedCount,
  disabled,
  onPickAndImport,
  onNewFolder,
  onImportDesktop,
  onImportDownloads,
  onReclassify,
  onRefresh,
}: Props) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        <h1 className="page-title">{categoryLabel}</h1>
        <p className="page-subtitle" title={pageSubtitle}>
          {pageSubtitle}
        </p>
      </div>
      <div className="page-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onPickAndImport}
          disabled={disabled}
        >
          <IconImport size={16} />
          收纳文件
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onNewFolder}
          disabled={disabled}
          title="在当前文件夹或分类下新建文件夹"
        >
          <IconFolderNew size={16} />
          新建文件夹
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onImportDesktop}
          disabled={disabled}
        >
          <IconDesktop size={16} />
          桌面
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onImportDownloads}
          disabled={disabled}
        >
          <IconDownload size={16} />
          下载
        </button>
        {canReclassify && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onReclassify}
            disabled={disabled}
            title={
              misplacedCount > 0
                ? `发现 ${misplacedCount} 个可能放错分类的文件`
                : "扫描并移动放错分类的文件"
            }
          >
            <IconScan size={16} />
            {reclassifyLabel}
            {misplacedCount > 0 ? ` (${misplacedCount})` : ""}
          </button>
        )}
        <button
          type="button"
          className="btn btn-icon"
          onClick={onRefresh}
          disabled={disabled}
          title="刷新"
          aria-label="刷新"
        >
          <IconRefresh size={16} />
        </button>
      </div>
    </header>
  );
}

export function libraryCategoryLabel(
  category: LibraryCategory,
  folderPath: string | null,
  folderDisplayName: (path: string) => string,
): string {
  if (folderPath) return folderDisplayName(folderPath);
  if (category === "all") return "全部文件";
  if (category === "favorites") return "收藏";
  return category;
}
