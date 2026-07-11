import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export const markdownFilter = { name: "Markdown 文件", extensions: ["md", "markdown", "mdown"] };
export const isDesktopApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function fileNameFromPath(path: string): string { return path.replace(/\\/g, "/").split("/").at(-1) || "未命名.md"; }
export function ensureMarkdownExtension(path: string): string { return /\.(md|markdown|mdown)$/i.test(path) ? path : `${path}.md`; }
function requireDesktop() { if (!isDesktopApp()) throw new Error("文件打开与保存功能仅可在桌面版 mdTool 中使用"); }

export async function chooseMarkdownFile(): Promise<string | null> { requireDesktop(); const path = await open({ title: "打开 Markdown 文件", multiple: false, filters: [markdownFilter] }); return typeof path === "string" ? path : null; }
export async function chooseSavePath(defaultPath: string): Promise<string | null> { requireDesktop(); const path = await save({ title: "保存 Markdown 文件", defaultPath, filters: [markdownFilter] }); return path ? ensureMarkdownExtension(path) : null; }
export async function readMarkdown(path: string): Promise<string> { requireDesktop(); return readTextFile(path); }
export async function writeMarkdown(path: string, text: string): Promise<void> { requireDesktop(); await writeTextFile(path, text); }
