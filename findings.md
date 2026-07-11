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
