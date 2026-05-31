import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { registerListen } from "./utils/listenEvent";
import {
  InternalFileDragProvider,
  useInternalFileDragging,
} from "./hooks/useInternalFileMoveSession";
import { useLibraryFileMove } from "./hooks/useLibraryFileMove";
import { DuplicateView } from "./components/DuplicateView";
import { LibraryView } from "./components/LibraryView";
import { LogsView } from "./components/LogsView";
import { OverviewView } from "./components/OverviewView";
import { SettingsView } from "./components/SettingsView";
import { GlobalToast } from "./components/GlobalToast";
import { UpdateBanner } from "./components/UpdateBanner";
import { SidebarLibraryNav } from "./components/SidebarLibraryNav";
import { ViewPane } from "./components/ViewPane";
import { IconFolder } from "./components/icons";
import type { LibraryCategory, LibraryInfo, NavId } from "./types";
import type { ImportDropTarget } from "./utils/importTarget";
import { useOperationToast } from "./hooks/useOperationToast";
import { reportError } from "./utils/errors";

const TOOL_NAV_IDS = new Set<NavId>(["overview", "duplicates", "logs", "settings"]);

function isLibraryNav(nav: NavId): nav is LibraryCategory {
  return !TOOL_NAV_IDS.has(nav);
}

interface AppContentProps {
  dropHoverTarget: ImportDropTarget | null;
  onDropHoverChange: (target: ImportDropTarget | null) => void;
  navigateRef: React.MutableRefObject<
    (category: LibraryCategory, folderPath: string | null) => void
  >;
}

function AppContent({ dropHoverTarget, onDropHoverChange, navigateRef }: AppContentProps) {
  const [nav, setNav] = useState<NavId>("all");
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [libraryNav, setLibraryNav] = useState<LibraryCategory>("all");
  const [libraryFolderPath, setLibraryFolderPath] = useState<string | null>(null);
  const [libraryRoot, setLibraryRoot] = useState("");
  const [mountedTools, setMountedTools] = useState(
    () => new Set<Exclude<NavId, LibraryCategory>>(),
  );

  const isLibrary = isLibraryNav(nav);
  const internalFileDragging = useInternalFileDragging();
  const { toastError } = useOperationToast();

  const navigateLibraryView = useCallback(
    (category: LibraryCategory, nextFolderPath: string | null) => {
      setNav(category);
      setFolderPath(nextFolderPath);
      setLibraryNav(category);
      setLibraryFolderPath(nextFolderPath);
    },
    [],
  );

  useEffect(() => {
    navigateRef.current = navigateLibraryView;
  }, [navigateLibraryView, navigateRef]);

  const loadLibraryRoot = useCallback(() => {
    void invoke<LibraryInfo>("get_library_info")
      .then((info) => setLibraryRoot(info.root))
      .catch((e) => reportError("读取资料库路径", e, { toast: toastError }));
  }, [toastError]);

  useEffect(() => {
    loadLibraryRoot();
    let unlisten: (() => void) | null = null;
    registerListen(
      "library:changed",
      () => {
        loadLibraryRoot();
      },
      "订阅资料库变更",
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [loadLibraryRoot]);

  useEffect(() => {
    if (isLibraryNav(nav)) return;
    setMountedTools((prev) => (prev.has(nav) ? prev : new Set(prev).add(nav)));
  }, [nav]);

  const navigateTool = useCallback((tool: Exclude<NavId, LibraryCategory>) => {
    setNav(tool);
    setFolderPath(null);
  }, []);

  return (
    <div className="app">
      <aside className={`sidebar${internalFileDragging ? " sidebar-internal-drag" : ""}`}>
        <div className="brand">
          <span className="brand-icon">
            <IconFolder size={22} />
          </span>
          <span className="brand-text">
            <span className="brand-title">File Manager</span>
            <span className="brand-sub">文件整理</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          <SidebarLibraryNav
            nav={nav}
            folderPath={folderPath}
            libraryRoot={libraryRoot}
            dropHoverTarget={dropHoverTarget}
            internalFileDragging={internalFileDragging}
            onNavigate={navigateLibraryView}
            onNavigateTool={navigateTool}
          />
        </nav>
      </aside>

      <div className="main">
        <GlobalToast />
        <UpdateBanner />
        <div className="view-stack">
          <ViewPane active={isLibrary}>
            <LibraryView
              category={libraryNav}
              folderPath={libraryFolderPath}
              dropHoverTarget={dropHoverTarget}
              onFolderCreated={(path, category) => navigateLibraryView(category, path)}
              onDropHoverChange={onDropHoverChange}
            />
          </ViewPane>
          {mountedTools.has("overview") ? (
            <ViewPane active={nav === "overview"}>
              <OverviewView />
            </ViewPane>
          ) : null}
          {mountedTools.has("duplicates") ? (
            <ViewPane active={nav === "duplicates"}>
              <DuplicateView />
            </ViewPane>
          ) : null}
          {mountedTools.has("logs") ? (
            <ViewPane active={nav === "logs"}>
              <LogsView />
            </ViewPane>
          ) : null}
          {mountedTools.has("settings") ? (
            <ViewPane active={nav === "settings"}>
              <SettingsView />
            </ViewPane>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AppRoot() {
  const [dropHoverTarget, setDropHoverTarget] = useState<ImportDropTarget | null>(null);
  const navigateRef = useRef<(category: LibraryCategory, folderPath: string | null) => void>(
    () => {},
  );

  const { moveFilesToTarget } = useLibraryFileMove({
    onNavigate: (category, folderPath) => navigateRef.current(category, folderPath),
  });

  return (
    <InternalFileDragProvider
      onHoverChange={setDropHoverTarget}
      onDrop={(paths, target) => {
        setDropHoverTarget(null);
        void moveFilesToTarget(paths, target);
      }}
    >
      <AppContent
        dropHoverTarget={dropHoverTarget}
        onDropHoverChange={setDropHoverTarget}
        navigateRef={navigateRef}
      />
    </InternalFileDragProvider>
  );
}

function App() {
  return <AppRoot />;
}

export default App;
