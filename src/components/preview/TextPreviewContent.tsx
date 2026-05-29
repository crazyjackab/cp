import type { LibraryFile } from "../../types";
import { useTextPreview } from "../../hooks/useTextPreview";
import { IconTextDoc } from "../icons";

interface Props {
  file: LibraryFile;
}

export function TextPreviewContent({ file }: Props) {
  const { data, loading, failed, error } = useTextPreview(file.path);

  if (loading) {
    return <div className="file-preview-placeholder loading">加载文本…</div>;
  }
  if (failed) {
    return (
      <div className="file-preview-placeholder">
        <IconTextDoc size={48} />
        <p>无法预览</p>
        <p className="hint">{error || "请用系统默认程序打开"}</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="file-preview-text-wrap">
      {data.truncated && (
        <p className="file-preview-text-note">仅显示前 {data.byte_count.toLocaleString()} 字节</p>
      )}
      <pre className="file-preview-text">{data.content}</pre>
    </div>
  );
}
