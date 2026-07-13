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

应用从 `https://raw.githubusercontent.com/BlueBlueKitty/mdTool/main/version.json` 获取最新版本。发布新版本时，请先更新根目录的 `version.json`，其中必须包含：

- `version`：最新语义化版本号；
- `notes`：更新说明数组；
- `releaseUrl`：对应 GitHub Release 页面；
- `downloads.windows`、`downloads.macos`、`downloads.linux`：各平台安装包的直链。

`version.json` 的版本号也应与 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 保持一致。将安装包上传到 GitHub Release 并推送该清单后，已安装的 mdTool 可通过“帮助 → 检查更新”读取说明，并在确认后于系统浏览器下载本机平台的安装包。

## 技术栈

- Tauri 2
- Vue 3 + TypeScript + Vite
- CodeMirror 6
- markdown-it + MathJax
- Pinia、Vitest、Playwright
