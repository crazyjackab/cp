import type { ReactNode } from "react";
import {
  IconAll,
  IconApp,
  IconArchive,
  IconAudio,
  IconDoc,
  IconImage,
  IconInbox,
  IconOther,
  IconPdf,
  IconScan,
  IconSettings,
  IconSheet,
  IconSlide,
  IconTextDoc,
  IconVideo,
} from "../components/icons";
import type { LibraryCategory } from "../types";

export type DocVariant = "pdf" | "word" | "sheet" | "slide" | "text" | "generic";

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export function getDocVariant(ext: string): DocVariant {
  switch (ext) {
    case "pdf":
      return "pdf";
    case "doc":
    case "docx":
    case "odt":
    case "rtf":
    case "pages":
    case "wps":
      return "word";
    case "xls":
    case "xlsx":
    case "ods":
    case "csv":
    case "et":
      return "sheet";
    case "ppt":
    case "pptx":
    case "odp":
    case "dps":
      return "slide";
    case "txt":
    case "md":
      return "text";
    default:
      return "generic";
  }
}

export function fileTone(category: string, fileName = ""): string {
  if (category === "文档") {
    return `tone-doc-${getDocVariant(getExtension(fileName))}`;
  }
  return categoryTone(category);
}

export function fileTypeLabel(category: string, fileName = ""): string {
  if (category !== "文档") return category;
  const ext = getExtension(fileName);
  if (!ext) return "文档";
  switch (getDocVariant(ext)) {
    case "word":
      return ext === "doc" || ext === "docx" ? ext.toUpperCase() : "Word";
    case "sheet":
      return ext === "xls" || ext === "xlsx" ? ext.toUpperCase() : "表格";
    case "slide":
      return ext === "ppt" || ext === "pptx" ? ext.toUpperCase() : "演示";
    case "text":
      return ext.toUpperCase();
    case "pdf":
      return "PDF";
    default:
      return ext.toUpperCase();
  }
}

export function fileIcon(category: string, fileName = "", size = 20): ReactNode {
  const props = { size, className: "file-type-icon" };
  if (category === "文档") {
    switch (getDocVariant(getExtension(fileName))) {
      case "pdf":
        return <IconPdf {...props} />;
      case "word":
        return <IconDoc {...props} />;
      case "sheet":
        return <IconSheet {...props} />;
      case "slide":
        return <IconSlide {...props} />;
      case "text":
        return <IconTextDoc {...props} />;
      default:
        return <IconDoc {...props} />;
    }
  }
  return categoryIcon(category, size);
}

export function categoryIcon(category: string, size = 20): ReactNode {
  const props = { size, className: "file-type-icon" };
  switch (category) {
    case "图片":
      return <IconImage {...props} />;
    case "视频":
      return <IconVideo {...props} />;
    case "文档":
      return <IconDoc {...props} />;
    case "音频":
      return <IconAudio {...props} />;
    case "压缩包":
      return <IconArchive {...props} />;
    case "安装包":
      return <IconApp {...props} />;
    case "收件箱":
      return <IconInbox {...props} />;
    default:
      return <IconOther {...props} />;
  }
}

export function navIcon(id: LibraryCategory | "overview" | "settings", size = 18): ReactNode {
  const props = { size, className: "nav-icon" };
  switch (id) {
    case "all":
      return <IconAll {...props} />;
    case "图片":
      return <IconImage {...props} />;
    case "视频":
      return <IconVideo {...props} />;
    case "文档":
      return <IconDoc {...props} />;
    case "音频":
      return <IconAudio {...props} />;
    case "压缩包":
      return <IconArchive {...props} />;
    case "安装包":
      return <IconApp {...props} />;
    case "收件箱":
      return <IconInbox {...props} />;
    case "其他":
      return <IconOther {...props} />;
    case "overview":
      return <IconScan {...props} />;
    case "settings":
      return <IconSettings {...props} />;
    default:
      return <IconOther {...props} />;
  }
}

export function categoryTone(category: string): string {
  switch (category) {
    case "图片":
      return "tone-image";
    case "视频":
      return "tone-video";
    case "文档":
      return "tone-doc-generic";
    case "音频":
      return "tone-audio";
    case "压缩包":
      return "tone-archive";
    case "安装包":
      return "tone-app";
    case "收件箱":
      return "tone-inbox";
    default:
      return "tone-other";
  }
}
