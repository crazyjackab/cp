import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { registerListen } from "../utils/listenEvent";
import { useOperationToast } from "../hooks/useOperationToast";
import { IconChevronRight, IconFolder } from "./icons";
import type { LibraryCategory, LibraryFolder, LibraryInfo, NavId } from "../types";
import { isLibraryCategoryNav, type ImportDropTarget } from "../utils/importTarget";
import { navIcon } from "../utils/fileUi";
import { normalizeFsPath } from "../utils/libraryFilter";
import { reportError } from "../utils/errors";

const LIBRARY_NAV: { id: LibraryCategory; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "favorites", label: "收藏" },
  { id: "图片", label: "图片" },
  { id: "视频", label: "视频" },
  { id: "文档", label: "文档" },
  { id: "音频", label: "音频" },
  { id: "压缩包", label: "压缩包" },
  { id: "安装包", label: "安装包" },
  { id: "收件箱", label: "收件箱" },
  { id: "其他", label: "其他" },
];

interface Props {
  nav: NavId;
  folderPath: string | null;
  libraryRoot: string;
  dropHoverTarget: ImportDropTarget | null;
  internalFileDragging?: boolean;
  onNavigate: (category: LibraryCategory, folderPath: string | null) => void;
  onNavigateTool: (tool: Exclude<NavId, LibraryCategory>) => void;
}

function groupFoldersByCategory(folders: LibraryFolder[]): Map<string, LibraryFolder[]> {
  const map = new Map<string, LibraryFolder[]>();
  for (const folder of folders) {
    const list = map.get(folder.category) ?? [];
    list.push(folder);
    map.set(folder.category, list);
  }
  return map;
}

function collectAncestorPaths(
  items: LibraryFolder[],
  targetPath: string,
  ancestors: string[] = [],
): string[] | null {
  for (const folder of items) {
    if (folder.path === targetPath) {
      return ancestors;
    }
    const nested = collectAncestorPaths(folder.children, targetPath, [...ancestors, folder.path]);
    if (nested) return nested;
  }
  return null;
}

function findFolderCategory(folders: LibraryFolder[], targetPath: string): string | null {
  for (const folder of folders) {
    if (folder.path === targetPath) return folder.category;
    const nested = findFolderCategory(folder.children, targetPath);
    if (nested) return nested;
  }
  return null;
}

function dropTargetClass(isHover: boolean): string {
  return isHover ? "nav-drop-target nav-drop-target-active" : "nav-drop-target";
}

interface NavDropItemProps {
  active: boolean;
  isHover: boolean;
  dropTarget: ImportDropTarget;
  className?: string;
  onNavigate: () => void;
  children: ReactNode;
}

function NavDropItem({
  active,
  isHover,
  dropTarget,
  className = "",
  onNavigate,
  children,
}: NavDropItemProps) {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNavigate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`nav-item ${dropTargetClass(isHover)} ${active ? "active" : ""} ${className}`.trim()}
      data-drop-target-path={dropTarget.path}
      data-drop-target-category={dropTarget.category}
      onClick={onNavigate}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

export function SidebarLibraryNav({
  nav,
  folderPath,
  libraryRoot,
  dropHoverTarget,
  internalFileDragging = false,
  onNavigate,
  onNavigateTool,
}: Props) {
  const { toastError } = useOperationToast();
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [libraryInfo, setLibraryInfo] = useState<LibraryInfo | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(() => new Set());

  const loadFolders = useCallback(() => {
    void invoke<LibraryFolder[]>("list_library_folders", { category: "all" })
      .then(setFolders)
      .catch((e) => {
        setFolders([]);
        reportError("加载资料库文件夹", e, { toast: toastError });
      });
  }, [toastError]);

  const loadLibraryInfo = useCallback(() => {
    void invoke<LibraryInfo>("get_library_info")
      .then(setLibraryInfo)
      .catch((e) => {
        setLibraryInfo(null);
        reportError("加载资料库统计", e);
      });
  }, []);

  useEffect(() => {
    loadFolders();
    loadLibraryInfo();
  }, [loadFolders, loadLibraryInfo]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    registerListen(
      "library:changed",
      () => {
        loadFolders();
        loadLibraryInfo();
      },
      "订阅资料库变更（侧栏）",
    ).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [loadFolders, loadLibraryInfo]);

  const foldersByCategory = useMemo(() => groupFoldersByCategory(folders), [folders]);

  const inboxPendingCount = useMemo(() => {
    return libraryInfo?.categories.find((cat) => cat.id === "收件箱")?.file_count ?? 0;
  }, [libraryInfo]);

  const renderNavBadge = (categoryId: LibraryCategory) => {
    if (categoryId !== "收件箱" || inboxPendingCount <= 0) return null;
    return (
      <span className="nav-badge" title={`${inboxPendingCount} 个文件待整理`}>
        {inboxPendingCount > 99 ? "99+" : inboxPendingCount}
      </span>
    );
  };

  useEffect(() => {
    if (!folderPath || folders.length === 0) return;
    const categoryId = findFolderCategory(folders, folderPath);
    if (categoryId) {
      setExpandedCategories((current) => new Set(current).add(categoryId));
    }
    const ancestors = collectAncestorPaths(folders, folderPath) ?? [];
    if (ancestors.length > 0) {
      setExpandedFolderPaths((current) => {
        const next = new Set(current);
        for (const path of ancestors) next.add(path);
        return next;
      });
    }
  }, [folderPath, folders]);

  const expandCategory = useCallback((categoryId: string) => {
    setExpandedCategories((current) => new Set(current).add(categoryId));
  }, []);

  useEffect(() => {
    if (!internalFileDragging || !dropHoverTarget) return;
    if (isLibraryCategoryNav(dropHoverTarget.category)) {
      expandCategory(dropHoverTarget.category);
    }
    const ancestors = collectAncestorPaths(folders, dropHoverTarget.path);
    if (ancestors) {
      setExpandedFolderPaths((current) => {
        const next = new Set(current);
        for (const path of ancestors) next.add(path);
        return next;
      });
    }
  }, [dropHoverTarget, expandCategory, folders, internalFileDragging]);

  const toggleCategoryExpand = (categoryId: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const toggleFolderExpand = (path: string) => {
    setExpandedFolderPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderFolderItems = (items: LibraryFolder[], depth: number) =>
    items.map((folder) => {
      const hasChildren = folder.subfolder_count > 0;
      const expanded = expandedFolderPaths.has(folder.path);
      const active = folderPath === folder.path;
      const dropTarget: ImportDropTarget = { path: folder.path, category: folder.category };
      const isHover = dropHoverTarget?.path === folder.path;

      return (
        <div key={folder.path} className="nav-folder-group">
          <div className="nav-item-row" style={{ paddingLeft: `${0.35 + depth * 0.85}rem` }}>
            <button
              type="button"
              className={`nav-expand ${hasChildren ? "" : "nav-expand-spacer"}`}
              aria-label={hasChildren ? (expanded ? "收起" : "展开") : undefined}
              aria-expanded={hasChildren ? expanded : undefined}
              disabled={!hasChildren}
              onClick={() => toggleFolderExpand(folder.path)}
            >
              {hasChildren ? (
                <IconChevronRight size={14} className={expanded ? "nav-chevron-expanded" : ""} />
              ) : null}
            </button>
            <NavDropItem
              active={active}
              isHover={isHover}
              dropTarget={dropTarget}
              className="nav-subitem"
              onNavigate={() => onNavigate(folder.category as LibraryCategory, folder.path)}
            >
              <span className="nav-icon">
                <IconFolder size={16} />
              </span>
              <span className="nav-label">{folder.name}</span>
            </NavDropItem>
          </div>
          {hasChildren && expanded ? renderFolderItems(folder.children, depth + 1) : null}
        </div>
      );
    });

  return (
    <>
      <div className="nav-section">资料库</div>
      {LIBRARY_NAV.map((item) => {
        const categoryFolders = foldersByCategory.get(item.id) ?? [];
        const hasSubfolders = categoryFolders.length > 0;
        const categoryExpanded = expandedCategories.has(item.id);
        const categoryActive = nav === item.id && !folderPath;
        const categoryDropTarget =
          libraryRoot && isLibraryCategoryNav(item.id)
            ? {
                path: `${normalizeFsPath(libraryRoot)}\\${item.id}`,
                category: item.id,
              }
            : null;
        const isCategoryHover = categoryDropTarget
          ? dropHoverTarget?.path === categoryDropTarget.path
          : false;

        return (
          <div key={item.id} className="nav-category-group">
            <div className="nav-item-row">
              <button
                type="button"
                className={`nav-expand ${hasSubfolders ? "" : "nav-expand-spacer"}`}
                aria-label={
                  hasSubfolders ? (categoryExpanded ? "收起文件夹" : "展开文件夹") : undefined
                }
                aria-expanded={hasSubfolders ? categoryExpanded : undefined}
                disabled={!hasSubfolders}
                onClick={() => toggleCategoryExpand(item.id)}
              >
                {hasSubfolders ? (
                  <IconChevronRight
                    size={14}
                    className={categoryExpanded ? "nav-chevron-expanded" : ""}
                  />
                ) : null}
              </button>
              {categoryDropTarget ? (
                <NavDropItem
                  active={categoryActive}
                  isHover={isCategoryHover}
                  dropTarget={categoryDropTarget}
                  onNavigate={() => onNavigate(item.id, null)}
                >
                  {navIcon(item.id)}
                  <span className="nav-label">{item.label}</span>
                  {renderNavBadge(item.id)}
                </NavDropItem>
              ) : (
                <button
                  type="button"
                  className={`nav-item ${categoryActive ? "active" : ""}`}
                  onClick={() => onNavigate(item.id, null)}
                >
                  {navIcon(item.id)}
                  <span className="nav-label">{item.label}</span>
                  {renderNavBadge(item.id)}
                </button>
              )}
            </div>
            {hasSubfolders && categoryExpanded ? (
              <div className="nav-sublist">{renderFolderItems(categoryFolders, 0)}</div>
            ) : null}
          </div>
        );
      })}

      <div className="nav-section">工具</div>
      <button
        type="button"
        className={`nav-item ${nav === "overview" ? "active" : ""}`}
        onClick={() => onNavigateTool("overview")}
      >
        {navIcon("overview")}
        <span>总览扫描</span>
      </button>
      <button
        type="button"
        className={`nav-item ${nav === "duplicates" ? "active" : ""}`}
        onClick={() => onNavigateTool("duplicates")}
      >
        {navIcon("duplicates")}
        <span>重复文件</span>
      </button>
      <button
        type="button"
        className={`nav-item ${nav === "logs" ? "active" : ""}`}
        onClick={() => onNavigateTool("logs")}
      >
        {navIcon("logs")}
        <span>操作日志</span>
      </button>
      <button
        type="button"
        className={`nav-item ${nav === "settings" ? "active" : ""}`}
        onClick={() => onNavigateTool("settings")}
      >
        {navIcon("settings")}
        <span>设置</span>
      </button>
    </>
  );
}

export { LIBRARY_NAV };
