import type { RepairCategory, RepairRuleDefinition } from "../types";

export const categoryLabels: Record<RepairCategory, string> = {
  formula: "公式修复", heading: "标题格式修复", whitespace: "空白格式修复", list: "列表格式修复", code: "代码块修复", blockquote: "引用块修复", typography: "文本排版修复",
};

export const repairRules: RepairRuleDefinition[] = [
  ["formula-trim", "formula", "清理公式首尾空白"], ["formula-double-escape", "formula", "修复 LaTeX 命令双重转义"], ["formula-block-separator", "formula", "删除公式异常分隔线"], ["formula-code-wrapper", "formula", "解除纯公式代码标记"], ["formula-block-normalize", "formula", "规范已有公式内容"],
  ["heading-space", "heading", "规范标题格式"],
  ["trailing-whitespace", "whitespace", "清理行尾空白"], ["extra-blank-line", "whitespace", "清理多余空行"],
  ["list-marker", "list", "规范无序列表标记"], ["ordered-list-number", "list", "修复有序列表编号"],
  ["markdown-wrapper-fence", "code", "解除整篇 Markdown 围栏"], ["blockquote-space", "blockquote", "规范引用块标记"], ["invisible-character", "typography", "清理不可见字符"],
].map(([id, category, label]) => ({ id, category: category as RepairCategory, label, autoEnabledByDefault: true }));

export const ruleById = (id: string) => repairRules.find(rule => rule.id === id);
export const rulesForCategory = (category: RepairCategory) => repairRules.filter(rule => rule.category === category);
