import type { MarkdownDiagnostic, RuleConfig, TextEdit } from "../types";
import { buildSectionTree } from "../core/sections";
import { scanProtectedRanges, overlapsProtected } from "../core/scanner";

const diagnostic = (ruleId: string, severity: MarkdownDiagnostic["severity"], message: string, from: number, to: number, originalText: string, replacement?: string, confidence = 1): MarkdownDiagnostic => ({ id: `${ruleId}:${from}:${to}`, ruleId, severity, message, from, to, originalText, replacement, confidence, autoFixable: replacement !== undefined });
const isFormula = (body: string) => /\\[A-Za-z]+|[=+*/^_{}<>]|\d\s*[A-Za-z]|[A-Za-z]\s*\d/.test(body) && !/^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(body);
export function detectDiagnostics(text: string, config: RuleConfig): MarkdownDiagnostic[] {
  const result: MarkdownDiagnostic[] = []; const ranges = scanProtectedRanges(text); const push = (item: MarkdownDiagnostic) => { if (!config.ignoredRuleIds.includes(item.ruleId)) result.push(item); };
  const sections = buildSectionTree(text); let lastLevel = 0; let h1 = 0; const seen = new Set<string>();
  for (const section of sections) {
    const line = text.slice(section.headingFrom, section.headingTo); if (section.level > lastLevel + 1) push(diagnostic("heading-level-jump", "warning", "标题等级跳跃", section.headingFrom, section.headingTo, line)); lastLevel = section.level;
    if (section.level === 1) h1 += 1; if (!section.title) push(diagnostic("empty-heading", "error", "空标题", section.headingFrom, section.headingTo, line));
    const key = `${section.level}:${section.title}`; if (seen.has(key)) push(diagnostic("duplicate-heading", "warning", "重复标题", section.headingFrom, section.headingTo, line)); seen.add(key);
    if (section.numberParts && section.numberParts.length !== section.level) push(diagnostic("heading-number-level", "info", "标题编号层级与标题等级不一致", section.headingFrom, section.headingTo, line));
    if (!/^#{1,6} /.test(line)) push(diagnostic("heading-space", "warning", "标题标记后应有一个空格", section.headingFrom, section.headingTo, line, `${"#".repeat(section.level)} ${section.title}`));
  }
  if (!config.allowMultipleH1 && h1 > 1) { const first = sections.find(section => section.level === 1)!; push(diagnostic("multiple-h1", "warning", "文档存在多个一级标题", first.headingFrom, first.headingTo, text.slice(first.headingFrom, first.headingTo))); }
  let match: RegExpExecArray | null; const math = /\$([^$\n]+)\$/g;
  while ((match = math.exec(text))) { if (overlapsProtected(match.index, match.index + match[0].length, ranges)) continue; const body = match[1]; if (/^\d[\d,.]*(?:-\$?\d[\d,.]*)?$/.test(body) || /^(?:OK|Note|hello world)$/i.test(body)) continue; if (!isFormula(body)) { push(diagnostic("possible-non-math", "info", "疑似将普通文本标记为公式", match.index, match.index + match[0].length, match[0])); continue; } if (body !== body.trim()) push(diagnostic("formula-trim", "info", "公式首尾存在空白", match.index, match.index + match[0].length, match[0], `$${body.trim()}$`)); if (/\\\\[A-Za-z]+/.test(body)) push(diagnostic("formula-double-escape", "warning", "公式存在双重转义命令", match.index, match.index + match[0].length, match[0], match[0].replace(/\\\\(?=[A-Za-z]+)/g, "\\")));
  }
  const inlineMathCode = /`((?:\$[^$\n]+\$|\\\([^\n]+\\\)))`/g; while ((match = inlineMathCode.exec(text))) push(diagnostic("formula-code-wrapper", "warning", "完整公式不应使用行内代码包裹", match.index, match.index + match[0].length, match[0], match[1]));
  const fenced = /^ {0,3}(`{3,}|~{3,})[^\n]*$/gm; const markers = [...text.matchAll(fenced)]; if (markers.length % 2) { const item = markers.at(-1)!; push(diagnostic("unclosed-fence", "error", "代码围栏没有结束标记", item.index!, item.index! + item[0].length, item[0])); }
  if (/^```(?:markdown|md)?\s*\n[\s\S]*\n```\s*$/i.test(text.trim())) push(diagnostic("markdown-wrapper-fence", "warning", "整篇文档被 Markdown 围栏包裹", 0, text.length, text, text.trim().replace(/^```(?:markdown|md)?\s*\n/i, "").replace(/\n```$/, "")));
  const lines = text.split("\n"); let offset = 0; let inFence = false; let blankRun = 0;
  for (let i = 0; i < lines.length; i += 1) { const line = lines[i]; if (/^ {0,3}(```|~~~)/.test(line)) inFence = !inFence; if (!inFence) { if (/\s+$/.test(line) && !/ {2}$/.test(line)) push(diagnostic("trailing-whitespace", "info", "可疑的单个行尾空格", offset, offset + line.length, line, line.replace(/[ \t]+$/, ""))); if (/[\u200B\u00A0\u3000]/.test(line)) push(diagnostic("invisible-character", "warning", "检测到不可见或全角空白字符", offset, offset + line.length, line, line.replace(/[\u200B\u00A0\u3000]/g, " "))); if (/^\s*$/.test(line)) blankRun += 1; else blankRun = 0; if (blankRun > config.blankLines) push(diagnostic("extra-blank-line", "info", "存在多余空行", offset, offset + line.length + 1, `${line}\n`, ""));
    const list = /^(\s*)([*+-]|\d+[.)])\s+/.exec(line); if (list && /^[*+-]$/.test(list[2]) && list[2] !== config.listMarker) push(diagnostic("list-marker", "info", "列表标记不符合配置", offset + list[1].length, offset + list[1].length + 1, list[2], config.listMarker));
    if (/^>[^ >]/.test(line)) push(diagnostic("blockquote-space", "info", "引用标记后应有空格", offset, offset + 1, ">", "> "));
  } offset += line.length + 1; }
  return result;
}
export function editsForDiagnostics(diagnostics: MarkdownDiagnostic[]): TextEdit[] { return diagnostics.filter(item => item.autoFixable && item.replacement !== undefined).map(item => ({ from: item.from, to: item.to, insert: item.replacement! })); }
