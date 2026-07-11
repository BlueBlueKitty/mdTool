import type { TextEdit } from "../types";
import { scanProtectedRanges, overlapsProtected } from "../core/scanner";

export function safeFormulaEdits(text: string, separatorMinLength = 5, commands: string[] = []): TextEdit[] {
  const protectedRanges = scanProtectedRanges(text); const edits: TextEdit[] = []; const block = /\$\$\n?([\s\S]*?)\n?\$\$/g; let match: RegExpExecArray | null;
  while ((match = block.exec(text))) { if (overlapsProtected(match.index, match.index + match[0].length, protectedRanges, ["inline-code", "link-destination", "image-destination", "html", "escaped-character"])) continue; const cleaned = match[1].split("\n").filter(line => !new RegExp(`^\\s*[=-]{${separatorMinLength},}\\s*$`).test(line)).join("\n").trim().replace(/\\\\(?=[A-Za-z]+)/g, "\\"); const replacement = `$$\n${cleaned}\n$$`; if (replacement !== match[0]) edits.push({ from: match.index, to: match.index + match[0].length, insert: replacement }); }
  const inline = /\$([^$\n]+)\$/g; while ((match = inline.exec(text))) { if (overlapsProtected(match.index, match.index + match[0].length, protectedRanges)) continue; const body = match[1]; if (/^\d[\d,.]*(?:-\$?\d[\d,.]*)?$/.test(body) || /^(?:OK|Note|hello world)$/i.test(body)) continue; const doubleEscaped = body.replace(/\\\\([A-Za-z]+)/g, (all, name) => commands.length === 0 || commands.includes(name) ? `\\${name}` : all); const cleaned = doubleEscaped.trim(); if (cleaned !== body) edits.push({ from: match.index, to: match.index + match[0].length, insert: `$${cleaned}$` }); }
  const coded = /`(\$[^$\n]+\$|\\\([^\n]+\\\))`/g; while ((match = coded.exec(text))) edits.push({ from: match.index, to: match.index + match[0].length, insert: match[1] }); return edits;
}
