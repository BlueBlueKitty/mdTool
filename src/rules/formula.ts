import type { TextEdit } from "../types";
import { scanProtectedRanges, overlapsProtected } from "../core/scanner";

export interface FormulaRuleEdit { id: string; ruleId: string; nodeFrom: number; nodeTo: number; edit: TextEdit; }
const moneyOrPhrase = (body: string) => /^\d[\d,.]*(?:-\$?\d[\d,.]*)?$/.test(body) || /^(?:OK|Note|hello world)$/i.test(body);
const add = (result: FormulaRuleEdit[], ruleId: string, nodeFrom: number, nodeTo: number, edit: TextEdit) => result.push({ id: `${ruleId}:${edit.from}:${edit.to}:${result.length}`, ruleId, nodeFrom, nodeTo, edit });
const blocked = (from: number, to: number, ranges: ReturnType<typeof scanProtectedRanges>) => overlapsProtected(from, to, ranges, ["escaped-character"]);
const hasBalancedBraces = (body: string) => { let depth = 0; for (const char of body.replace(/\\[{}]/g, "")) { if (char === "{") depth += 1; if (char === "}" && --depth < 0) return false; } return depth === 0; };
const looksLikeMath = (body: string) => {
  const value = body.trim();
  if (!value || /^\d{1,4}$/.test(value) || /^[A-Za-z]$/.test(value) || /^(see\s+figure|测试结果|注意|参考文献)/i.test(value)) return false;
  return /\\[A-Za-z]+|[=+\-*/^_{}]|\b(?:sin|cos|tan|log|ln|exp|lim|max|min)\b|[A-Za-z]\d|\d[A-Za-z]/.test(value) && hasBalancedBraces(value);
};
function formulaEdits(result: FormulaRuleEdit[], text: string, nodeFrom: number, nodeTo: number, body: string, bodyFrom: number, kind: "inline" | "block", enabled: Set<string>, separatorMinLength: number, commands: string[]) {
  const separator = new RegExp(`^\\s*[=-]{${separatorMinLength},}\\s*$`, "gm"); let line: RegExpExecArray | null;
  if (enabled.has("formula-block-separator") && kind === "block") while ((line = separator.exec(body))) { const lineTo = bodyFrom + line.index + line[0].length + (body[body.indexOf(line[0], line.index) + line[0].length] === "\n" ? 1 : 0); add(result, "formula-block-separator", nodeFrom, nodeTo, { from: bodyFrom + line.index, to: lineTo, insert: "" }); }
  if (enabled.has("formula-restore-separator")) { const repeated = /={2,}|-{2,}/g; while ((line = repeated.exec(body))) add(result, "formula-restore-separator", nodeFrom, nodeTo, { from: bodyFrom + line.index, to: bodyFrom + line.index + line[0].length, insert: line[0][0] }); }
  if (enabled.has("formula-trim")) { const leading = /^\s+/.exec(body); const trailing = /\s+$/.exec(body); if (leading) add(result, "formula-trim", nodeFrom, nodeTo, { from: bodyFrom, to: bodyFrom + leading[0].length, insert: "" }); if (trailing) add(result, "formula-trim", nodeFrom, nodeTo, { from: bodyFrom + body.length - trailing[0].length, to: bodyFrom + body.length, insert: "" }); }
  if (enabled.has("formula-double-escape")) { const escaped = /\\\\([A-Za-z]+)/g; let command: RegExpExecArray | null; while ((command = escaped.exec(body))) if (!commands.length || commands.includes(command[1])) add(result, "formula-double-escape", nodeFrom, nodeTo, { from: bodyFrom + command.index, to: bodyFrom + command.index + command[0].length, insert: `\\${command[1]}` }); }
}

export function formulaRuleEdits(text: string, separatorMinLength = 5, commands: string[] = [], enabledRuleIds: string[] = []): FormulaRuleEdit[] {
  const enabled = new Set(enabledRuleIds.length ? enabledRuleIds : ["formula-trim", "formula-double-escape", "formula-block-separator", "formula-code-wrapper"]);
  const protectedRanges = scanProtectedRanges(text); const result: FormulaRuleEdit[] = []; let match: RegExpExecArray | null;
  const blockDollar = /^\$\$\n?([\s\S]*?)\n?\$\$(?=\n|$)/gm;
  while ((match = blockDollar.exec(text))) { const from = match.index; const to = from + match[0].length; if (blocked(from, to, protectedRanges)) continue; const body = match[1]; const bodyFrom = from + match[0].indexOf(body); formulaEdits(result, text, from, to, body, bodyFrom, "block", enabled, separatorMinLength, commands); if (enabled.has("formula-delimiter-latex")) add(result, "formula-delimiter-latex", from, to, { from, to, insert: `\\[${body}\\]` }); if (enabled.has("formula-display-dollar-to-single")) add(result, "formula-display-dollar-to-single", from, to, { from, to, insert: `$${body}$` }); }
  const blockLatex = /\\\[\n?([\s\S]*?)\n?\\\]/g;
  while ((match = blockLatex.exec(text))) { const from = match.index; const to = from + match[0].length; if (blocked(from, to, protectedRanges)) continue; const body = match[1]; const bodyFrom = from + match[0].indexOf(body); formulaEdits(result, text, from, to, body, bodyFrom, "block", enabled, separatorMinLength, commands); if (enabled.has("formula-delimiter-dollar")) add(result, "formula-delimiter-dollar", from, to, { from, to, insert: `$$${body}$$` }); }
  const inline = /(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g;
  while ((match = inline.exec(text))) { const from = match.index; const to = from + match[0].length; if (blocked(from, to, protectedRanges) || moneyOrPhrase(match[1])) continue; formulaEdits(result, text, from, to, match[1], from + 1, "inline", enabled, separatorMinLength, commands); if (enabled.has("formula-delimiter-latex")) add(result, "formula-delimiter-latex", from, to, { from, to, insert: `\\(${match[1]}\\)` }); }
  const inlineLatex = /\\\(([^\n]*?)\\\)/g;
  while ((match = inlineLatex.exec(text))) { const from = match.index; const to = from + match[0].length; if (blocked(from, to, protectedRanges)) continue; formulaEdits(result, text, from, to, match[1], from + 2, "inline", enabled, separatorMinLength, commands); if (enabled.has("formula-delimiter-dollar")) add(result, "formula-delimiter-dollar", from, to, { from, to, insert: `$${match[1]}$` }); }
  const inlineDouble = /(?<!^)\$\$([^\n$]+)\$\$(?!$)/gm;
  while ((match = inlineDouble.exec(text))) { const from = match.index; const to = from + match[0].length; if (blocked(from, to, protectedRanges)) continue; if (enabled.has("formula-inline-double-dollar-to-single")) add(result, "formula-inline-double-dollar-to-single", from, to, { from, to, insert: `$${match[1]}$` }); if (enabled.has("formula-delimiter-latex")) add(result, "formula-delimiter-latex", from, to, { from, to, insert: `\\(${match[1]}\\)` }); if (enabled.has("formula-delimiter-dollar")) add(result, "formula-delimiter-dollar", from, to, { from, to, insert: `$${match[1]}$` }); }
  if (enabled.has("formula-restore-missing-delimiter")) {
    const useDollarDelimiters = enabled.has("formula-delimiter-dollar");
    const dollarRanges: Array<[number, number]> = []; const dollar = /\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)[^$\n]+\$(?!\$)/g;
    while ((match = dollar.exec(text))) dollarRanges.push([match.index, match.index + match[0].length]);
    const insideDollar = (from: number, to: number) => dollarRanges.some(([start, end]) => from >= start && to <= end);
    const parens = /(?<!\\)\(([^()\n]+)\)/g;
    while ((match = parens.exec(text))) { const from = match.index; const to = from + match[0].length; if (!insideDollar(from, to) && !blocked(from, to, protectedRanges) && looksLikeMath(match[1])) add(result, "formula-restore-missing-delimiter", from, to, { from, to, insert: useDollarDelimiters ? `$${match[1]}$` : `\\(${match[1]}\\)` }); }
    const brackets = /^\[\n([\s\S]*?)\n\]$/gm;
    while ((match = brackets.exec(text))) { const from = match.index; const to = from + match[0].length; if (!insideDollar(from, to) && !blocked(from, to, protectedRanges) && looksLikeMath(match[1])) add(result, "formula-restore-missing-delimiter", from, to, { from, to, insert: useDollarDelimiters ? `$$\n${match[1]}\n$$` : `\\[\n${match[1]}\n\\]` }); }
  }
  if (enabled.has("formula-code-wrapper")) { const coded = /`(\$[^$\n]+\$|\\\([^\n]+\\\))`/g; while ((match = coded.exec(text))) add(result, "formula-code-wrapper", match.index, match.index + match[0].length, { from: match.index, to: match.index + match[0].length, insert: match[1] }); }
  return result;
}

export function safeFormulaEdits(text: string, separatorMinLength = 5, commands: string[] = []): TextEdit[] { return formulaRuleEdits(text, separatorMinLength, commands).map(item => item.edit); }
