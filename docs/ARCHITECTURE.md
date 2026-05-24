# 架构说明

## 技术栈（已确定）

- **前端**：React 19 + TypeScript + Vite 7
- **桌面壳**：Tauri 2
- **后端逻辑**：Rust（`src-tauri/src/`）

## 目录职责

| 路径 | 职责 |
|------|------|
| `src/` | UI、状态、调用 Tauri 命令 |
| `src-tauri/src/scan.rs` | 目录遍历、统计、扩展名聚合 |
| `src-tauri/src/lib.rs` | Tauri 命令注册与插件初始化 |
| `src-tauri/capabilities/` | 权限声明（对话框、打开链接等） |

## 资料库

- 默认路径：`D:\FileManager\资料库`
- 配置：`%APPDATA%\FileManager\config.json`
- 收纳方式：移动（跨盘符时自动 copy + 删除原文件）

## 前后端通信

前端通过 `@tauri-apps/api/core` 的 `invoke` 调用 Rust 命令：

- `init_library()` / `get_library_info()` → 资料库统计
- `list_library_files(category)` → 文件列表
- `import_files(paths)` / `import_from_desktop()` / `import_from_downloads()` → 收纳
- `scan_directory(path)` → `ScanResult`（总览）
- `get_quick_paths()` → 桌面 / 下载 / 文档快捷路径

## 扫描策略

- 使用 `walkdir` 递归遍历，不跟随符号链接
- 跳过常见系统目录名（如 `Windows`、`$Recycle.Bin`）
- 扩展名统计与「子文件夹占用 Top 15」在 Rust 侧完成，避免大量数据过 IPC

## 后续模块（规划）

- `organize.rs` — 归类规则与移动预览
- `duplicate.rs` — 大小预筛 + 并行哈希
- `config.rs` — `%APPDATA%/FileManager/config.json`
