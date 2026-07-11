# 调研发现

## 需求来源

- 主需求文档：`docs/Markdown结构化修复工具功能需求与技术方案.md`。

## 项目现状

- 工作目录目前只有需求文档和本次创建的计划文件，没有已有应用代码或构建配置。
- `Get-ChildItem` 显示存在 `.git` 目录，但受当前工具执行环境限制，Git 命令未能识别该工作树；不影响后续实现与测试。

## 技术与核心约束

- 目标技术栈：Tauri 2、Vue 3、TypeScript、Vite、Pinia、CodeMirror 6、unified/remark、MathJax 4、jsdiff、Zod、Vitest、Playwright、Rust。
- 编辑必须以局部 `TextEdit[]` 补丁完成；高风险和批量操作需要预览、冲突检测与整体撤销。
- 必须保护 Front Matter、代码、链接、HTML、转义字符及合法公式等区域。

## 功能范围映射

- 核心文档服务：换行标准化、受保护范围、标题树、编号解析、补丁冲突与事务应用。
- 结构引擎：升级/降级、编号加减与连续编号、删除、移动、合并、拆分。
- 规则引擎：标题、公式、空白/不可见字符、列表、代码围栏、引用块诊断及安全修复。
- UI：三栏结构、源代码编辑器、结构/诊断/历史切换、预览/差异切换，以及批量安全修复和撤销重做。

## 未决项

- 待读取需求文档与项目文件后补充。

## 2026-07-11 桌面文件工作流

- Rust 端已配置 `tauri-plugin-dialog` 与 `tauri-plugin-fs`，但前端尚未安装对应 Tauri 2 JavaScript 包，现有界面仍以浏览器 Blob 下载实现“导出”。
- 文档基线当前是启动示例文本；`TextHistory` 只记录结构/修复操作，CodeMirror 的输入历史未与顶部按钮统一。
- 本轮将以文件载入或完整粘贴的文本作为差异基线，并采用“保存 / 放弃 / 取消”处理未保存文档。
- 已安装前端包 `@tauri-apps/plugin-dialog` 与 `@tauri-apps/plugin-fs`。前者的文件选择会自动将用户选择的路径加入运行时范围；文件读写可使用 `readTextFile` / `writeTextFile`。
- 当前 `src-tauri/capabilities/default.json` 不存在，需创建最小能力清单，显式放行对话框与文件读写命令。
- 已创建最小 Tauri capability，放行 `dialog:default` 与 `fs:default`；生产构建成功，证明其与当前 Rust 插件版本兼容。
- 最终验证：Vitest 12/12、Vue TypeScript/Vite 构建、Playwright 1/1、Tauri 生产构建均成功；生成程序经短暂后台启动检查保持存活。

## 2026-07-11 手动与自动修复模式

- 当前诊断系统已输出带确定替换的 `MarkdownDiagnostic`，公式安全修复输出 `TextEdit[]`；二者可在统一 RepairPlan 中复用。
- 当前 CodeMirror 未向状态层提供文本选区，需新增选区事件并以候选节点范围过滤，保证选区修复不越界。
- 自动修复设置将以 localStorage 保存；计划会记录生成时的文档文本与修订号，过期后拒绝应用。
- 已实现 `RepairPlan`：诊断替换与公式规则候选共用一套 `TextEdit[]` 计划；选区按候选节点完整范围过滤，重叠候选不允许进入可应用计划。
- 自动设置保存在 `mdtool.repair-settings.v1`；自动预览在停止编辑 600ms 后刷新，且只在用户点击一键修复时调用文档事务。
- 最终验证：Vitest 15/15、Playwright 2/2、TypeScript/Vite 构建及 Tauri 生产编译均通过。

## 2026-07-11 工作台与菜单重构

- 当前预览为手写字符串替换，并未依赖 Markdown 解析器或 MathJax；需要新增本地依赖和独立渲染组件。
- CodeMirror 已具备模型同步和选区事件，但未暴露滚动与定位 API；左侧跳转、只读修复预览、滚动同步将基于该组件扩展。
- 现有 RepairPlan 可作为中间“修复预览”与左侧修复项的唯一来源，无需新增规则引擎。
- 已完成 Markdown-It 与浏览器 MathJax ES5 组件渲染、菜单式三栏工作台、命名方案、章节跳转/右键/拖拽和滚动同步；Vitest 16/16、Playwright 2/2、Vite 构建通过。
- `mathjax-full` 的 Node API 在浏览器出现 `require is not defined`；已改用动态加载的 ES5 浏览器组件入口解决。最终 Tauri 打包因平台额度限制未能执行。
