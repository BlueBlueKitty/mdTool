# mdTool

mdTool 是一个 Markdown 格式辅助调整工具，用于手动或自动地修复markdown内容存在的格式问题。

## 功能

- 章节标题修复：调整标题层级、编号、拖拽排序与删除章节。
- 公式修复：修复AI回答可能导常见的公式问题。
- 其他修复：修复中英文之间的空格等问题。
- 欢迎提isssue和pr补充其他格式问题。

## 开始使用

```powershell
npm install
```

启动网页开发服务器：

```powershell
npm run dev
```

启动 Tauri 桌面开发版：

```powershell
npm run tauri:dev
```

## npm 命令

| 命令                  | 说明                                             |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | 启动 Vite 网页开发服务器。                       |
| `npm run tauri:dev`   | 启动 Tauri 桌面开发环境。                        |
| `npm run build`       | 执行 TypeScript 类型检查并构建前端生产产物。     |
| `npm run tauri:build` | 构建桌面端安装包/可执行产物。                    |
| `npm test`            | 运行 Vitest 单元测试。                           |
| `npm run test:watch`  | 以监听模式运行单元测试。                         |
| `npm run test:e2e`    | 启动本地 Vite 服务并运行 Playwright 端到端测试。 |

## 发布与检查更新

应用从 `https://raw.githubusercontent.com/BlueBlueKitty/mdTool/main/version.json` 获取最新版本。正式发布由 GitHub Actions 在推送 `vX.Y.Z` 标签后自动执行。发布前请更新根目录的 `version.json`，其中必须包含：

- `version`：最新语义化版本号；
- `notes`：更新说明数组；
- `releaseUrl`：对应 GitHub Release 页面；
- `downloads.windows`、`downloads.macos`、`downloads.linux`：各平台安装包的直链。

`version.json` 的版本号必须与 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 保持一致；推送的标签也必须是相同版本的 `vX.Y.Z`。GitHub Actions 会在创建 Release 前校验这些内容、运行测试和前端构建，并用 `notes` 作为 Release 说明。

发布时，在干净的 `main` 工作区运行 `npm run release`。命令会读取当前版本并交互式选择补丁、次版本、主版本或自定义版本；再自动提取上一个 `v*` 标签以来的 Git 提交标题，写入 `version.json.notes` 和 GitHub Release 正文。随后它会同步四处版本号与下载链接、运行校验/测试/构建、提交 `release: vX.Y.Z`、推送 `main` 和标签。工作流会发布 Windows x64 的 NSIS 安装包与便携 EXE、Linux x64 的 AppImage 与 deb，以及同时支持 Intel/Apple Silicon 的 macOS 通用 DMG；更新检查分别使用 Windows 安装包、Linux AppImage 和 macOS DMG 直链。

Windows 设备可能需要安装 WebView2；Linux 运行时需要发行版提供 WebKitGTK 依赖。首版 macOS DMG 未签名、未公证，首次打开可能需要按 Gatekeeper 提示手动确认。

## 技术栈

- Tauri 2
- Vue 3 + TypeScript + Vite
- CodeMirror 6
- markdown-it + MathJax
- Pinia、Vitest、Playwright
