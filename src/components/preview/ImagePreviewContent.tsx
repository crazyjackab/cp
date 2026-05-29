import type { LibraryFile } from "../../types";
import { useImageDataUrl } from "../../hooks/useImageDataUrl";
import { IconImage } from "../icons";

interface Props {
  file: LibraryFile;
}

export function ImagePreviewContent({ file }: Props) {
  const { url, loading, failed } = useImageDataUrl(file.path, 1280);

  if (url) {
    return <img src={url} alt={file.name} className="file-preview-img" draggable={false} />;
  }
  if (loading) {
    return <div className="file-preview-placeholder loading">加载预览…</div>;
  }
  if (failed) {
    return (
      <div className="file-preview-placeholder">
        <IconImage size={48} />
        <p>无法预览此格式</p>
        <p className="hint">可尝试用系统默认程序打开</p>
      </div>
    );
  }
  return null;
}
