import { useState } from "react";
import { LibraryView } from "./components/LibraryView";
import { OverviewView } from "./components/OverviewView";
import { SettingsView } from "./components/SettingsView";
import { UpdateBanner } from "./components/UpdateBanner";
import type { LibraryCategory, NavId } from "./types";

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

  const isLibrary =
    nav !== "overview" && nav !== "settings";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">File Manager</div>
        <div className="nav-section">资料库</div>
        {LIBRARY_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${nav === item.id ? "active" : ""}`}
            onClick={() => setNav(item.id)}
          >
            {item.label}
          </button>
        ))}
        <div className="nav-section">工具</div>
        <button
          type="button"
          className={`nav-item ${nav === "overview" ? "active" : ""}`}
          onClick={() => setNav("overview")}
        >
          总览扫描
        </button>
        <button
          type="button"
          className={`nav-item ${nav === "settings" ? "active" : ""}`}
          onClick={() => setNav("settings")}
        >
          设置
        </button>
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
