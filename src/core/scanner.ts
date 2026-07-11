import type { ProtectedRange } from "../types";

export function normalizeNewlines(text: string): string { return text.replace(/\r\n?/g, "\n"); }
const add = (ranges: ProtectedRange[], type: ProtectedRange["type"], from: number, to: number) => ranges.push({ type, from, to });
export function scanProtectedRanges(text: string): ProtectedRange[] {
  const ranges: ProtectedRange[] = []; let match: RegExpExecArray | null;
  if (text.startsWith("---\n")) { const end = text.indexOf("\n---", 4); if (end >= 0) add(ranges, "frontmatter", 0, end + 4); }
  const lines = text.split("\n"); let offset = 0; let opening: { marker: string; from: number } | undefined;
  for (const line of lines) {
    const marker = /^( {0,3})(`{3,}|~{3,})/.exec(line)?.[2];
    if (!opening && marker) opening = { marker, from: offset };
    else if (opening && marker && marker[0] === opening.marker[0] && marker.length >= opening.marker.length) { add(ranges, "fenced-code", opening.from, offset + line.length); opening = undefined; }
    offset += line.length + 1;
  }
  if (opening) add(ranges, "fenced-code", opening.from, text.length);
  const inline = /`[^`\n]*`/g; while ((match = inline.exec(text))) add(ranges, "inline-code", match.index, match.index + match[0].length);
  const link = /!?\[[^\]]*\]\((?:[^()\\]|\\.)*\)/g; while ((match = link.exec(text))) { const open = match[0].lastIndexOf("("); add(ranges, match[0].startsWith("!") ? "image-destination" : "link-destination", match.index + open + 1, match.index + match[0].length - 1); }
  const html = /<\/?[A-Za-z][^>]*>/g; while ((match = html.exec(text))) add(ranges, "html", match.index, match.index + match[0].length);
  const escaped = /\\[$\\`()[\]{}]/g; while ((match = escaped.exec(text))) add(ranges, "escaped-character", match.index, match.index + match[0].length);
  return ranges.sort((a, b) => a.from - b.from || a.to - b.to);
}
export function overlapsProtected(from: number, to: number, ranges: ProtectedRange[], allowed: ProtectedRange["type"][] = []): boolean { return ranges.some(range => !allowed.includes(range.type) && from < range.to && to > range.from); }
