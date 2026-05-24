import { useState } from "react";
import { LibraryView } from "./components/LibraryView";
import { OverviewView } from "./components/OverviewView";
import { SettingsView } from "./components/SettingsView";
import { UpdateBanner } from "./components/UpdateBanner";
import { IconFolder } from "./components/icons";
import type { LibraryCategory, NavId } from "./types";
import { navIcon } from "./utils/fileUi";

const LIBRARY_NAV: { id: LibraryCategory; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "图片", label: "图片" },
  { id: "视频", label: "视频" },
  { id: "文档", label: "文档" },
  { id: "音频", label: "音频" },
  { id: "压缩包", label: "压缩包" },
  { id: "安装包", label: "安装包" },
  { id: "收件箱", label: "收件箱" },
  { id: "其他", label: "其他" },
];

function App() {
  const [nav, setNav] = useState<NavId>("all");

  const isLibrary = nav !== "overview" && nav !== "settings";

  return (
    <div className="app">
      <aside className="sidebar">
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
          <div className="nav-section">资料库</div>
          {LIBRARY_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${nav === item.id ? "active" : ""}`}
              onClick={() => setNav(item.id)}
            >
              {navIcon(item.id)}
              <span>{item.label}</span>
            </button>
          ))}

          <div className="nav-section">工具</div>
          <button
            type="button"
            className={`nav-item ${nav === "overview" ? "active" : ""}`}
            onClick={() => setNav("overview")}
          >
            {navIcon("overview")}
            <span>总览扫描</span>
          </button>
          <button
            type="button"
            className={`nav-item ${nav === "settings" ? "active" : ""}`}
            onClick={() => setNav("settings")}
          >
            {navIcon("settings")}
            <span>设置</span>
          </button>
        </nav>
      </aside>

      <div className="main">
        <UpdateBanner />
        {isLibrary && <LibraryView category={nav as LibraryCategory} />}
        {nav === "overview" && <OverviewView />}
        {nav === "settings" && <SettingsView />}
      </div>
    </div>
  );
}

export default App;
