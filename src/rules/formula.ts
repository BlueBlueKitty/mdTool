import type { TextEdit } from "../types";
import { scanProtectedRanges, overlapsProtected } from "../core/scanner";

export interface FormulaRuleEdit { id: string; ruleId: "formula-trim" | "formula-double-escape" | "formula-block-separator" | "formula-code-wrapper" | "formula-block-normalize"; nodeFrom: number; nodeTo: number; edit: TextEdit; }
const moneyOrPhrase = (body: string) => /^\d[\d,.]*(?:-\$?\d[\d,.]*)?$/.test(body) || /^(?:OK|Note|hello world)$/i.test(body);
const add = (result: FormulaRuleEdit[], ruleId: FormulaRuleEdit["ruleId"], nodeFrom: number, nodeTo: number, edit: TextEdit) => result.push({ id: `${ruleId}:${edit.from}:${edit.to}:${result.length}`, ruleId, nodeFrom, nodeTo, edit });

export function formulaRuleEdits(text: string, separatorMinLength = 5, commands: string[] = []): FormulaRuleEdit[] {
  const protectedRanges = scanProtectedRanges(text); const result: FormulaRuleEdit[] = []; let match: RegExpExecArray | null;
  const block = /\$\$\n?([\s\S]*?)\n?\$\$/g;
  while ((match = block.exec(text))) {
    const nodeFrom = match.index; const nodeTo = match.index + match[0].length;
    if (overlapsProtected(nodeFrom, nodeTo, protectedRanges, ["inline-code", "link-destination", "image-destination", "html", "escaped-character"])) continue;
    const body = match[1]; const bodyFrom = nodeFrom + match[0].indexOf(body); const separator = new RegExp(`^\\s*[=-]{${separatorMinLength},}\\s*$`, "gm"); let line: RegExpExecArray | null; let hasSeparator = false;
    while ((line = separator.exec(body))) { hasSeparator = true; const lineTo = bodyFrom + line.index + line[0].length + (body[line.index + line[0].length] === "\n" ? 1 : 0); add(result, "formula-block-separator", nodeFrom, nodeTo, { from: bodyFrom + line.index, to: lineTo, insert: "" }); }
    const escaped = /\\\\([A-Za-z]+)/g; let command: RegExpExecArray | null;
    while ((command = escaped.exec(body))) if (commands.length === 0 || commands.includes(command[1])) add(result, "formula-double-escape", nodeFrom, nodeTo, { from: bodyFrom + command.index, to: bodyFrom + command.index + command[0].length, insert: `\\${command[1]}` });
    if (!hasSeparator) { const leading = /^\s+/.exec(body); const trailing = /\s+$/.exec(body); if (leading) add(result, "formula-block-normalize", nodeFrom, nodeTo, { from: bodyFrom, to: bodyFrom + leading[0].length, insert: "" }); if (trailing) add(result, "formula-block-normalize", nodeFrom, nodeTo, { from: bodyFrom + body.length - trailing[0].length, to: bodyFrom + body.length, insert: "" }); }
  }
  const inline = /\$([^$\n]+)\$/g;
  while ((match = inline.exec(text))) {
    const nodeFrom = match.index; const nodeTo = match.index + match[0].length; if (overlapsProtected(nodeFrom, nodeTo, protectedRanges)) continue;
    const body = match[1]; if (moneyOrPhrase(body)) continue; const bodyFrom = nodeFrom + 1; const leading = /^\s+/.exec(body); const trailing = /\s+$/.exec(body);
    if (leading) add(result, "formula-trim", nodeFrom, nodeTo, { from: bodyFrom, to: bodyFrom + leading[0].length, insert: "" }); if (trailing) add(result, "formula-trim", nodeFrom, nodeTo, { from: bodyFrom + body.length - trailing[0].length, to: bodyFrom + body.length, insert: "" });
    const escaped = /\\\\([A-Za-z]+)/g; let command: RegExpExecArray | null; while ((command = escaped.exec(body))) if (commands.length === 0 || commands.includes(command[1])) add(result, "formula-double-escape", nodeFrom, nodeTo, { from: bodyFrom + command.index, to: bodyFrom + command.index + command[0].length, insert: `\\${command[1]}` });
  }
  const coded = /`(\$[^$\n]+\$|\\\([^\n]+\\\))`/g;
  while ((match = coded.exec(text))) add(result, "formula-code-wrapper", match.index, match.index + match[0].length, { from: match.index, to: match.index + match[0].length, insert: match[1] });
  return result;
}

export function safeFormulaEdits(text: string, separatorMinLength = 5, commands: string[] = []): TextEdit[] { return formulaRuleEdits(text, separatorMinLength, commands).map(item => item.edit); }
