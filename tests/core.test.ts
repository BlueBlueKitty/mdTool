import { describe, expect, it } from "vitest";
import { applyEdits, TextHistory, validateEdits } from "../src/core/textEdits";
import { buildSectionTree, demoteSection, promoteSection, shiftSectionNumber, deleteSection, moveSection, moveSectionBefore, autoNumberSections, renumberSections } from "../src/core/sections";
import { normalizeNewlines, scanProtectedRanges } from "../src/core/scanner";
import { detectDiagnostics } from "../src/rules/diagnostics";
import { safeFormulaEdits } from "../src/rules/formula";
import { defaultRuleConfig } from "../src/types";
import { setActivePinia, createPinia } from "pinia";
import { useDocumentStore } from "../src/stores/document";
import { createRepairPlan } from "../src/repair/planner";
import { repairRules } from "../src/repair/registry";
import { formulaRuleEdits } from "../src/rules/formula";
import { spacingRuleEdits } from "../src/rules/spacing";

const repairSettings = { enabledRuleIds: repairRules.map(rule => rule.id), sectionNumberStartLevel: 1 as const };

describe("补丁事务", () => {
  it("从后向前应用 Unicode 前后的多个补丁", () => expect(applyEdits("甲😀乙", [{ from: 0, to: 1, insert: "A" }, { from: 3, to: 4, insert: "B" }])).toBe("A😀B"));
  it("拒绝重叠补丁并支持整体撤销重做", () => { expect(validateEdits("abcd", [{ from: 0, to: 2, insert: "x" }, { from: 1, to: 3, insert: "y" }])).toHaveLength(1); const history = new TextHistory(); const result = history.apply("abcd", "修复", [{ from: 0, to: 4, insert: "ok" }]); expect(history.undo(result.text).text).toBe("abcd"); expect(history.redo("abcd").text).toBe("ok"); });
});
describe("文档基线与统一历史", () => {
  it("以空白文档启动，并在载入或粘贴时重置基线和历史", () => {
    setActivePinia(createPinia()); const store = useDocumentStore();
    expect(store.text).toBe(""); expect(store.fileName).toBe("未命名.md"); expect(store.dirty).toBe(false);
    store.replace("# 草稿"); expect(store.dirty).toBe(true); expect(store.history.canUndo).toBe(true);
    store.loadDocument("# 文件", { fileName: "报告.md", filePath: "C:\\docs\\报告.md" });
    expect(store.text).toBe("# 文件"); expect(store.baseline).toBe("# 文件"); expect(store.fileName).toBe("报告.md"); expect(store.dirty).toBe(false); expect(store.history.canUndo).toBe(false);
    store.replace("# 文件\n正文"); store.loadPastedDocument("# 粘贴源码");
    expect(store.text).toBe("# 粘贴源码"); expect(store.baseline).toBe("# 粘贴源码"); expect(store.filePath).toBeNull(); expect(store.history.canUndo).toBe(false);
  });
  it("记录编辑和结构修复，保存后仍可撤销并恢复未保存状态", () => {
    setActivePinia(createPinia()); const store = useDocumentStore(); store.loadDocument("## 背景");
    store.replace("## 背景\n正文"); expect(store.dirty).toBe(true); store.markSaved("C:\\docs\\报告.md", "报告.md");
    expect(store.dirty).toBe(false); store.undo(); expect(store.text).toBe("## 背景"); expect(store.dirty).toBe(true); store.redo(); expect(store.text).toBe("## 背景\n正文"); expect(store.dirty).toBe(false);
    const section = buildSectionTree(store.text)[0]; store.run("提升章节", promoteSection(store.text, section.id)); expect(store.history.canUndo).toBe(true); store.undo(); expect(store.text).toContain("## 背景");
  });
});
describe("手动与自动修复计划", () => {
  it("按具体规则或类别生成同一规则引擎的候选", () => {
    const source = "$  x + y  $\n`$z$`\n\u200B";
    const single = createRepairPlan(source, 1, defaultRuleConfig, { scope: "document", target: { kind: "rule", id: "formula-trim" }, settings: repairSettings });
    expect(single.candidates.map(item => item.ruleId)).toEqual(["formula-trim", "formula-trim"]);
    const category = createRepairPlan(source, 1, defaultRuleConfig, { scope: "document", target: { kind: "category", id: "formula" }, settings: repairSettings });
    expect(category.candidates.map(item => item.ruleId)).toEqual(expect.arrayContaining(["formula-trim", "formula-code-wrapper"]));
  });
  it("拆分公式规则，并跳过跨越选区边界的节点", () => {
    const source = "$  x + y  $\n$$\nx\\\\frac{1}{2}\n=======\ny\n$$";
    expect(formulaRuleEdits(source, 5, ["frac"]).map(item => item.ruleId)).toEqual(expect.arrayContaining(["formula-trim", "formula-double-escape", "formula-block-separator"]));
    const partial = createRepairPlan(source, 1, defaultRuleConfig, { scope: "selection", selection: { from: 2, to: 8 }, target: { kind: "rule", id: "formula-trim" }, settings: repairSettings });
    expect(partial.candidates).toHaveLength(0); expect(partial.skipped.join(" ")).toContain("扩大选区");
  });
  it("拒绝过期计划，并将一次计划应用为可撤销事务", () => {
    setActivePinia(createPinia()); const store = useDocumentStore(); store.loadDocument("$ x $");
    const plan = store.buildRepairPlan("document", { kind: "rule", id: "formula-trim" }); store.applyRepairPlan(plan, plan.candidates.map(item => item.id), "测试修复");
    expect(store.text).toBe("$x$"); store.undo(); expect(store.text).toBe("$ x $");
    const stale = store.buildRepairPlan("document", { kind: "rule", id: "formula-trim" }); store.replace("$  x  $"); expect(() => store.applyRepairPlan(stale, stale.candidates.map(item => item.id))).toThrow("过期");
  });
});
describe("章节树与结构操作", () => {
  const source = "## 2 方法\n正文\n### 2.1 数据\n#### 2.1.2 筛选\n## 3 结果\n";
  it("正确计算完整子章节范围", () => { const tree = buildSectionTree(source); expect(tree[0].sectionTo).toBe(tree[3].headingFrom); expect(tree[1].parentId).toBe(tree[0].id); });
  it("提升和降级整个章节子树", () => { const root = buildSectionTree(source)[0]; expect(applyEdits(source, promoteSection(source, root.id))).toContain("# 2 方法\n正文\n## 2.1 数据\n### 2.1.2 筛选"); const h6 = "###### 六级\n"; expect(() => demoteSection(h6, buildSectionTree(h6)[0].id)).toThrow("六级"); });
  it("只更新编号前缀并拒绝零编号和冲突", () => { const standalone = "## 2 方法\n### 2.1 数据\n#### 2.1.2 筛选\n"; const root = buildSectionTree(standalone)[0]; expect(applyEdits(standalone, shiftSectionNumber(standalone, root.id, 1))).toContain("## 3 方法\n### 3.1 数据\n#### 3.1.2 筛选"); expect(() => shiftSectionNumber(source, buildSectionTree(source)[0].id, 1)).toThrow("冲突"); const single = "# 1 甲\n"; expect(() => shiftSectionNumber(single, buildSectionTree(single)[0].id, -1)).toThrow("不得小于"); });
  it("删除完整章节和移动同级章节", () => { const tree = buildSectionTree(source); expect(applyEdits(source, deleteSection(source, tree[0].id))).toBe("## 3 结果\n"); expect(applyEdits(source, moveSection(source, tree[3].id, "up")).startsWith("## 3 结果")).toBe(true); });
  it("拖放章节会移动完整子树并重新编号", () => { const value = "# 1 甲\n正文\n## 1.1 子项\n# 2 乙\n"; const tree = buildSectionTree(value); const moved = applyEdits(value, moveSectionBefore(value, tree[2].id, tree[0].id)); expect(moved).toContain("# 1 乙\n# 2 甲\n正文\n## 2.1 子项"); });
  it("为无编号标题生成分级编号", () => { const value = "# 绪论\n## 背景\n### 现状\n## 方法\n"; expect(applyEdits(value, autoNumberSections(value))).toBe("# 1 绪论\n## 1.1 背景\n### 1.1.1 现状\n## 1.2 方法\n"); });
  it("可从二级标题开始编号并保留一级大标题", () => { const value = "# 总报告\n## 背景\n### 数据\n"; expect(applyEdits(value, autoNumberSections(value, 2))).toBe("# 总报告\n## 1 背景\n### 1.1 数据\n"); });
  it("选中章节编号和重排只影响该章节及其子标题", () => { const value = "# 甲\n## 甲子\n# 乙\n## 乙子\n"; const second = buildSectionTree(value)[2]; expect(applyEdits(value, autoNumberSections(value, 1, second.id))).toBe("# 甲\n## 甲子\n# 1 乙\n## 1.1 乙子\n"); const numbered = "# 1 甲\n## 1.3 甲子\n# 2 乙\n## 2.5 乙子\n"; const numberedSecond = buildSectionTree(numbered)[2]; expect(applyEdits(numbered, renumberSections(numbered, numberedSecond.id))).toBe("# 1 甲\n## 1.3 甲子\n# 1 乙\n## 1.1 乙子\n"); });
});
describe("扫描与规则", () => {
  it("统一换行并识别保护区", () => { const text = "---\r\na: b\r\n---\r\n`$HOME`\r\n```\r\n$x$\r\n```"; expect(normalizeNewlines(text)).not.toContain("\r"); expect(scanProtectedRanges(normalizeNewlines(text)).map(item => item.type)).toEqual(expect.arrayContaining(["frontmatter", "inline-code", "fenced-code"])); });
  it("安全公式修复不会动金额或围栏代码，并解除纯公式代码标记", () => { const source = "$  x + y  $\n$100\n`$ x $`\n```\n$ x $\n```\n$$\nx\\\\frac{1}{2}\n========\ny\n$$"; const output = applyEdits(source, safeFormulaEdits(source, 5, ["frac"])); expect(output).toContain("$x + y$"); expect(output).toContain("$100"); expect(output).toContain("\n$ x $\n```"); expect(output).toContain("```\n$ x $\n```"); expect(output).toContain("x\\frac{1}{2}\ny"); });
  it("按选择恢复、统一公式定界符，并排除普通括号", () => { const source = "(x+y=1)\n(2024)\n[\nx^2+y^2=1\n]\n$$z$$"; const ids = ["formula-restore-missing-delimiter", "formula-delimiter-dollar", "formula-inline-double-dollar-to-single", "formula-restore-separator"]; const output = applyEdits(source, formulaRuleEdits(source, 5, [], ids).filter(item => item.ruleId === "formula-restore-missing-delimiter").map(item => item.edit)); expect(output).toContain("$x+y=1$"); expect(output).toContain("$$x^2+y^2=1$$"); expect(output).toContain("(2024)"); expect(applyEdits("$a======b$", formulaRuleEdits("$a======b$", 5, [], ["formula-restore-separator"]).map(item => item.edit))).toBe("$a=b$"); });
  it("中英文间距不触碰公式、代码和链接", () => { const source = "中文Markdown第2章20kg $x+y$ `中文Code` [中文Link](https://a.example/中文)"; const edits = spacingRuleEdits(source, ["spacing-cjk-latin", "spacing-cjk-number", "spacing-number-unit"]); const output = applyEdits(source, edits.map(item => item.edit)); expect(output).toContain("中文 Markdown 第 2 章 20 kg"); expect(output).toContain("$x+y$"); expect(output).toContain("`中文Code`"); expect(output).toContain("https://a.example/中文"); });
  it("报告标题、公式、围栏和不可见字符问题", () => { const source = "# A\n### 跳级\n$  x + y  $\n\u200B\n```js\n"; const ids = detectDiagnostics(source, defaultRuleConfig).map(item => item.ruleId); expect(ids).toEqual(expect.arrayContaining(["heading-level-jump", "formula-trim", "invisible-character", "unclosed-fence"])); });
});
