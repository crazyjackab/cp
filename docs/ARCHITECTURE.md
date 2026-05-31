# 架构说明

## 技术栈（已确定）

- **前端**：React 19 + TypeScript + Vite 7
- **桌面壳**：Tauri 2
- **后端逻辑**：Rust（`src-tauri/src/`）

## 目录职责

| 路径                      | 职责                           |
| ------------------------- | ------------------------------ |
| `src/`                    | UI、状态、调用 Tauri 命令      |
| `src-tauri/src/scan.rs`   | 目录遍历、统计、扩展名聚合     |
| `src-tauri/src/lib.rs`    | Tauri 命令注册与插件初始化     |
| `src-tauri/capabilities/` | 权限声明（对话框、打开链接等） |

## 资料库

- 默认路径：`D:\FileManager\资料库`
- 配置：`%APPDATA%\FileManager\config.json`
- 收纳方式：移动（跨盘符时自动 copy + 删除原文件）

## 前后端通信

前端通过 `@tauri-apps/api/core` 的 `invoke` 调用 Rust 命令：

- `init_library()` / `get_library_info()` → 资料库统计
- `start_list_library_files_task(category)` → 资料库文件列表（后台 + `background-task`）
- `start_import_files_task` / `start_import_from_desktop_task` 等 → 收纳（后台）
- `start_scan_directory_task(path)` → `ScanResult`（总览，后台）
- `start_scan_library_duplicates_task` → 资料库查重（`duplicate.rs`）
- `list_import_records()` → 操作日志页
- `get_quick_paths()` → 桌面 / 下载 / 文档快捷路径

## 扫描策略

- 使用 `walkdir` 递归遍历，不跟随符号链接
- 跳过常见系统目录名（如 `Windows`、`$Recycle.Bin`）
- 扩展名统计与「子文件夹占用 Top 15」在 Rust 侧完成，避免大量数据过 IPC

## 主要 Rust 模块（已实现）

| 模块                          | 职责                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `library.rs`                  | 资料库 CRUD、收纳、批量操作、错放整理、列表                           |
| `duplicate.rs`                | 资料库内查重（大小预筛 + 哈希）                                       |
| `import_log.rs`               | 收纳记录（内存缓存 + 防抖写 `%APPDATA%\FileManager\import_log.json`） |
| `file_metadata.rs`            | 标签、收藏（内存缓存 + 防抖写 `file_metadata.json`）                  |
| `debounced_persist.rs`        | 合并 JSON 落盘（400ms 防抖；窗口关闭时 `flush_all`）                  |
| `config.rs`                   | 应用配置、扩展名规则、冲突策略                                        |
| `scan.rs`                     | 任意目录占用统计（总览）                                              |
| `background_task.rs`          | 长任务 ID、取消、`background-task` 事件（含收纳 `source_label`）      |
| `smart_reminder.rs`           | 托盘、定时提醒、一键收纳                                              |
| `thumbnail.rs` / `preview.rs` | 缩略图与文件预览                                                      |

## 通知策略（v0.2.x）

| 场景          | 窗口在前台                            | 窗口在后台/最小化                                                        |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| 收纳完成/失败 | 右上角全局 toast（`AppToastContext`） | Windows 原生通知（Rust `lib.rs`）                                        |
| 智能提醒阈值  | —                                     | Windows 原生通知（`smart_reminder.rs`）                                  |
| 发现可用更新  | 顶部 `UpdateBanner`                   | Windows 原生通知（`UpdaterContext` + `@tauri-apps/plugin-notification`） |

前台判定：主窗口可见、已聚焦且未最小化。托盘/设置发起的收纳通过 `background-task.source_label` 携带「桌面」「下载」等来源。
