# File Manager — 桌面文件整理工具

一款运行在 Windows 桌面的**私人文件资料库**：把桌面、下载里散落的文件**收纳到统一目录**，按**图片、视频、文档**等分类浏览，让桌面不再堆满、找文件有固定去处。

> 产品目标与界面规划详见 **[docs/产品设计.md](docs/产品设计.md)**。

---

## 技术方案（已采用）

**方案 A：Tauri 2 + React + TypeScript + Rust**

| 层级 | 技术 |
|------|------|
| UI | React 19、TypeScript、Vite 7 |
| 桌面 | Tauri 2、`tauri-plugin-dialog`、`tauri-plugin-opener` |
| 重逻辑 | Rust：`walkdir` 扫描、`serde` 序列化 |

界面在 React，文件扫描与统计在 Rust，避免大目录扫描时界面卡顿。详细结构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 当前进度

| 功能 | 状态 |
|------|------|
| **资料库**（`D:\FileManager\资料库`） | ✅ |
| **按分类浏览**（图片/视频/文档等） | ✅ |
| **收纳文件 / 从桌面·下载收纳**（默认移动） | ✅ |
| 总览：扫描任意目录、扩展名统计 | ✅ |
| 图片缩略图网格、搜索 | 🔜 |
| 重复检测、设置页改资料库路径 | 🔜 |

---

## 环境要求

- **系统**：Windows 10/11（64 位）
- **Node.js** 20+
- **Rust** stable（[rustup](https://rustup.rs/)）
- **Windows 构建工具**：Visual Studio Build Tools（含「使用 C++ 的桌面开发」工作负载）

**完整安装步骤（含 Node、Rust、Visual Studio 构建工具）见：[docs/安装指南.md](docs/安装指南.md)**

---

## 快速开始

```bash
cd "d:\File maneger"

# 安装前端依赖（若 npm 缓存权限报错，可指定项目内缓存目录）
set NPM_CONFIG_CACHE=%CD%\.npm-cache
npm install

# 开发模式（会编译 Rust 并打开桌面窗口）
npm run tauri dev

# 打包安装程序
npm run tauri build
```

打包产物位于：`src-tauri/target/release/bundle/`。

---

## 为什么需要它

| 痛点 | 本工具的做法 |
|------|----------------|
| 桌面文件太多、不好找 | **收纳进资料库**，桌面只留快捷方式或空 |
| 照片、视频、文档散落各处 | 统一进 `资料库\图片` 等，**在软件里按类查看** |
| 想要一个「固定放文件的地方」 | 默认 `用户\FileManager\资料库`，可改路径 |
| 不知道下载夹有多乱 | **总览**扫描（当前已有）辅助判断 |

---

## 核心功能路线图

详见 [docs/产品设计.md](docs/产品设计.md)。简要如下：

- **Phase 1**：创建资料库目录，列出库内文件  
- **Phase 2**：从桌面/下载/自选文件「收纳」并自动分类  
- **Phase 3**：图片网格、视频/文档列表、搜索  
- **Phase 0（已完成）**：扫描任意文件夹的统计与扩展名分布  

---

## 项目结构

```
File-maneger/
├── README.md
├── docs/
│   └── ARCHITECTURE.md
├── src/                    # React 前端
├── src-tauri/              # Tauri + Rust
│   ├── src/
│   │   ├── lib.rs
│   │   ├── scan.rs
│   │   └── main.rs
│   ├── capabilities/
│   └── tauri.conf.json
├── package.json
└── .gitignore
```

---

## 安全与隐私

- 所有扫描在**本机**完成，不上传文件列表。
- 扫描时跳过常见系统目录（如 `Windows`、`Program Files`）。
- 删除类功能（后续）默认走系统回收站。

---

## 许可

MIT — 见 [LICENSE](LICENSE)。
