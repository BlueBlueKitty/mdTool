import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export const supportedTextExtensions = ["md", "markdown", "mdown", "mkdn", "mdtxt", "txt", "text", "log", "csv", "tsv", "json", "yaml", "yml", "toml", "ini", "conf", "cfg", "xml", "html", "htm", "css", "js", "ts", "jsx", "tsx", "vue", "py", "java", "c", "h", "cpp", "cxx", "hpp", "rs", "go", "sh", "ps1", "bat", "sql", "tex"];
export const textFilter = { name: "文本文件", extensions: supportedTextExtensions };
export const isDesktopApp = () => typeof window !== "undefined" && isTauri();

export function fileNameFromPath(path: string): string { return path.replace(/\\/g, "/").split("/").at(-1) || "未命名.md"; }
function extensionFromPath(path: string): string | undefined { const name = fileNameFromPath(path); const dot = name.lastIndexOf("."); return dot > 0 ? name.slice(dot + 1).toLowerCase() : undefined; }
export function isSupportedTextPath(path: string): boolean { const extension = extensionFromPath(path); return extension === undefined || supportedTextExtensions.includes(extension); }
export function ensureMarkdownExtension(path: string): string { return isSupportedTextPath(path) ? path : `${path}.md`; }
function requireDesktop() { if (!isDesktopApp()) throw new Error("文件打开与保存功能仅可在桌面版 mdTool 中使用"); }

export async function chooseMarkdownFile(): Promise<string | null> { requireDesktop(); const path = await open({ title: "打开文本文件", multiple: false }); return typeof path === "string" ? path : null; }
export async function chooseSavePath(defaultPath: string): Promise<string | null> { requireDesktop(); const path = await save({ title: "保存 Markdown 文件", defaultPath, filters: [textFilter] }); return path ? ensureMarkdownExtension(path) : null; }
export async function readMarkdown(path: string): Promise<string> { requireDesktop(); return readTextFile(path); }
export async function readStartupText(path: string): Promise<string> { requireDesktop(); return invoke<string>("read_startup_file", { path }); }
export async function writeMarkdown(path: string, text: string): Promise<void> { requireDesktop(); await writeTextFile(path, text); }
