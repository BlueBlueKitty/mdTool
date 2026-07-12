import type { TextEdit } from "../types";
import { overlapsProtected, scanProtectedRanges } from "../core/scanner";

const units = "(?:%|℃|°C|kg|g|mg|km|cm|mm|ms|s|min|h|Hz|kHz|MHz|GHz|KB|MB|GB|TB|px|em|rem|元|万元|美元)";
const add = (edits: TextEdit[], from: number, to: number) => { if (!edits.some(edit => edit.from === from && edit.to === to)) edits.push({ from, to, insert: " " }); };
export function spacingRuleEdits(text: string, enabled: string[]): { ruleId: string; nodeFrom: number; nodeTo: number; edit: TextEdit }[] {
  const ranges = scanProtectedRanges(text); const result: { ruleId: string; nodeFrom: number; nodeTo: number; edit: TextEdit }[] = []; const run = (ruleId: string, pattern: RegExp) => { let match: RegExpExecArray | null; while ((match = pattern.exec(text))) { const left = match[1] ?? match[3]; const pos = match.index + left.length; if (!overlapsProtected(match.index, match.index + match[0].length, ranges)) result.push({ ruleId, nodeFrom: match.index, nodeTo: match.index + match[0].length, edit: { from: pos, to: pos, insert: " " } }); } }; const compact = (ruleId: string, pattern: RegExp) => { let match: RegExpExecArray | null; while ((match = pattern.exec(text))) { const pos = match.index + match[1].length; if (!overlapsProtected(match.index, match.index + match[0].length, ranges)) result.push({ ruleId, nodeFrom: match.index, nodeTo: match.index + match[0].length, edit: { from: pos, to: pos + match[2].length, insert: " " } }); } };
  if (enabled.includes("spacing-cjk-latin")) { run("spacing-cjk-latin", /([\u3400-\u9fff])([A-Za-z])/g); run("spacing-cjk-latin", /([A-Za-z])([\u3400-\u9fff])/g); compact("spacing-cjk-latin", /([\u3400-\u9fff])([ \t]{2,})([A-Za-z])/g); compact("spacing-cjk-latin", /([A-Za-z])([ \t]{2,})([\u3400-\u9fff])/g); }
  if (enabled.includes("spacing-cjk-number")) { run("spacing-cjk-number", /([\u3400-\u9fff])(\d)/g); run("spacing-cjk-number", /(\d)([\u3400-\u9fff])/g); compact("spacing-cjk-number", /([\u3400-\u9fff])([ \t]{2,})(\d)/g); compact("spacing-cjk-number", /(\d)([ \t]{2,})([\u3400-\u9fff])/g); }
  if (enabled.includes("spacing-number-unit")) { run("spacing-number-unit", new RegExp(`(\\d)(${units})`, "g")); compact("spacing-number-unit", new RegExp(`(\\d)([ \\t]{2,})(${units})`, "g")); }
  return result;
}
