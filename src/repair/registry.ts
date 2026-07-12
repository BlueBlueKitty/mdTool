import type { RepairCategory, RepairRuleDefinition } from "../types";

export const categoryLabels: Record<RepairCategory, string> = {
  formula: "公式修复", spacing: "中英文间距", section: "章节编号",
};

export const repairRules: RepairRuleDefinition[] = [
  ["formula-trim", "formula", "清理公式首尾空白"], ["formula-double-escape", "formula", "修复 LaTeX 命令双重转义"],
  ["formula-block-separator", "formula", "删除公式异常分隔线"], ["formula-restore-separator", "formula", "恢复公式异常分隔线"],
  ["formula-delimiter-latex", "formula", "统一为 \\(...\\) 与 \\[...\\]"], ["formula-delimiter-dollar", "formula", "统一为 $...$ 与 $$...$$"],
  ["formula-display-dollar-to-single", "formula", "行间公式 $$ 转 $"], ["formula-inline-double-dollar-to-single", "formula", "行内公式 $$ 转 $"],
  ["formula-restore-missing-delimiter", "formula", "恢复缺失反斜杠的公式定界符"], ["formula-code-wrapper", "formula", "解除纯公式代码标记"], ["formula-block-normalize", "formula", "规范已有公式内容"],
  ["spacing-cjk-latin", "spacing", "中文与英文之间添加空格"], ["spacing-cjk-number", "spacing", "中文与数字之间添加空格"], ["spacing-number-unit", "spacing", "数字与单位之间添加空格"],
  ["section-auto-number", "section", "为所有章节添加编号"], ["section-renumber", "section", "为所有章节重排编号"],
].map(([id, category, label]) => ({ id, category: category as RepairCategory, label, autoEnabledByDefault: true }));

export const mutuallyExclusiveRules = [["formula-block-separator", "formula-restore-separator"], ["formula-delimiter-latex", "formula-delimiter-dollar"]] as const;
export const ruleDescriptions: Record<string, string> = {
  "formula-trim": "删除公式定界符内多余的首尾空白。",
  "formula-double-escape": "将 LaTeX 命令前多余的一层反斜杠恢复为单个反斜杠。",
  "formula-block-separator": "删除公式中单独成行的连续等号或减号分隔线。",
  "formula-restore-separator": "把公式中的连续等号或减号恢复为一个等号或减号；与删除异常分隔线互斥。",
  "formula-delimiter-latex": "将所有已识别公式统一为 LaTeX 反斜杠定界符；与美元定界符互斥。",
  "formula-delimiter-dollar": "将所有已识别公式统一为 Markdown 美元定界符；与反斜杠定界符互斥。",
  "formula-display-dollar-to-single": "仅把独占一行的 $$...$$ 行间公式改为 $...$。",
  "formula-inline-double-dollar-to-single": "仅把同一行的 $$...$$ 行内公式改为 $...$，不改行间公式。",
  "formula-restore-missing-delimiter": "仅恢复具有数学特征且通过基础 TeX 安全校验的括号表达式，默认关闭。",
  "formula-code-wrapper": "解除仅包裹完整公式的行内代码标记。",
  "formula-block-normalize": "清理块级公式内容开头和结尾的多余空白。",
  "spacing-cjk-latin": "在中文和英文相邻处补一个空格；不触碰公式、代码和 URL。",
  "spacing-cjk-number": "在中文和数字相邻处补一个空格；不触碰公式、代码和 URL。",
  "spacing-number-unit": "在数字和常见单位相邻处补一个空格；不触碰公式、代码和 URL。",
  "section-auto-number": "为全文所有章节新增或重建层级编号；可选择从一级或二级标题开始。",
  "section-renumber": "仅重排全文已有编号的章节，不为未编号标题新增编号。",
};

export const ruleById = (id: string) => repairRules.find(rule => rule.id === id);
export const rulesForCategory = (category: RepairCategory) => repairRules.filter(rule => rule.category === category);
