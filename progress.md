# 执行记录

## 2026-07-11

- 开始主题、块公式、历史菜单、设置和可调三栏的体验改造；已确认关键根因位于 `App.vue` 的硬编码样式/定位与 `MarkdownPreview.vue` 缺失块数学语法规则。
- 已完成主题切换、图标撤销/重做、相对定位且可滚动的历史菜单、可折叠和可拖拽调整的三栏、设置侧栏及类别折叠规则清单；块级 `$$` 现由 Markdown-It 自定义 token 保持完整后交给 MathJax。
- 验证中发现旧端到端测试依赖 CodeMirror 对公式分隔符的可见文本序列；改为断言公式内容，并补充块公式不生成标题的回归用例。构建与核心单测通过，待最终端到端复验。
- 最终验证完成：Vitest 16/16 通过，`npm run build` 通过，Playwright 3/3 通过（含多行块公式不生成标题的回归）。
- 已完成源码编辑器主题变量、深色插入光标、章节/修复项跳转高亮和发布版 Windows GUI subsystem 配置。`npm run build`、Vitest 16/16、Playwright 3/3 均通过。Tauri 重建在链接后无法替换正在使用的 `target/release/mdtool.exe`，未强制关闭用户进程。

- 开始桌面文件工作流改造：已确认 Tauri Rust 插件已存在，前端需要接入文件对话框、文件读写及统一历史。
- 已安装 Tauri 2 的 dialog/fs 前端绑定，并确认其 API 可支持 Markdown 文件过滤、读取和覆盖写入。
- 已完成空白初始文档、文件基线/路径状态、统一输入历史、桌面文件服务和系统保存流程；Vitest 12/12 与 Playwright 端到端流程 1/1 均已通过。
- 完成最终复验：`npm test` 12/12 通过，`npm run build` 通过，`npm run test:e2e` 1/1 通过；`npm run tauri:build` 已生成更新后的 `src-tauri/target/release/mdtool.exe`，并确认该可执行文件可成功启动。
- 开始手动与自动修复模式：已确认复用点与缺口，下一步建立规则注册、RepairPlan 和选区状态。
- 已完成 RepairPlan、公式具名候选、规则注册/设置、编辑器选区、手动与自动修复面板；最终通过 Vitest 15/15、Playwright 2/2、Vite 构建与 Tauri 生产编译。
- 开始工作台与菜单重构：确认需要替换手写预览，并将 RepairPlan 接入菜单驱动的预览工作流。
- 已完成工作台与菜单重构并验证：Vitest 16/16、Playwright 2/2、Vite 构建通过。最终 `npm run tauri:build` 被平台使用额度限制拒绝，待额度恢复后重试。

- 初始化文件化实施计划。
- 确认工作目录不含 Git 元数据；后续以构建和测试结果作为验证依据。
- 已完整读取主需求文档并确认当前项目尚未初始化，下一步将建立可测试的应用骨架与核心领域模块。
- 已完成需求拆解：以 TypeScript 核心领域服务覆盖功能，再由 Vue + CodeMirror 界面调用；测试以 Vitest 核心规则和补丁事务为主。
- 已创建 Vue 3 + Vite + TypeScript 项目，接入 Pinia、CodeMirror 6、jsdiff、Zod 和 Tauri 2 项目配置。
- 已实现核心的局部文本补丁/冲突检测/事务历史、标题树及结构操作、保护区扫描、公式安全修复、诊断规则和三栏工作台。
- 已加入 Vitest 单元测试与 Playwright 端到端测试，等待安装依赖后运行。
- `npm install` 首次因受限环境无法写入用户缓存而失败；经授权在常规系统环境中重试后已成功安装 127 个包。首次 Vitest 执行发现两个测试断言与产品规则不一致，正在修正后复验。
- 第二次测试确认生产构建成功；另发现块公式修复被过宽的保护区重叠判断阻止，已将围栏扫描改为逐行状态机，并限制块公式只因真正受保护区域跳过。
- Vitest 现为 10/10 通过；`vue-tsc --noEmit && vite build` 已通过。Vite 仅报告主包约 587 KB 的性能建议，不影响构建正确性。
- Playwright 初次执行因浏览器二进制未安装而失败；已经授权下载 Chromium。随后执行真实交互测试，发现测试错误地选择了一级标题进行“提升”（该操作按需求应被禁止）；已改为选择二级标题，准备复测。
- Playwright 复测长时间未启动用例。已定位为 `webServer` 命令将 `--host 127.0.0.1` 错误传给 npm/Vite，实际仅监听 localhost，导致其等待 127.0.0.1 超时；已改为 `--host=127.0.0.1`。
- 该环境下 Playwright 的内置 `webServer` 子进程未能正常回收，导致测试命令挂起。已改为由测试前显式启动的 Vite 实例提供服务，避免将服务器生命周期与测试进程绑定。
- 最终验证完成：Vitest 10/10 通过；TypeScript 检查与 Vite 生产构建通过；Playwright 端到端流程 1/1 通过。Playwright 测试服务器由临时 PowerShell Job 启动并已停止。
- 已将 PowerShell Job 生命周期封装至 `scripts/run-e2e.ps1`，因此 `npm run test:e2e` 可独立运行并在结束时清理 Vite 服务器。
- 最终复验：`npm run test:e2e` 已独立通过（1/1）。
