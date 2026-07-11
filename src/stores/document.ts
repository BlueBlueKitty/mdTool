import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { buildSectionTree } from "../core/sections";
import { TextHistory, applyEdits } from "../core/textEdits";
import { normalizeNewlines } from "../core/scanner";
import { detectDiagnostics, editsForDiagnostics } from "../rules/diagnostics";
import { safeFormulaEdits } from "../rules/formula";
import { defaultRuleConfig, type TextEdit } from "../types";

export const useDocumentStore = defineStore("document", () => {
  const text = ref(""); const fileName = ref("未命名.md"); const filePath = ref<string | null>(null); const baseline = ref(""); const selectedSectionId = ref<string>(); const history = new TextHistory(); const revision = ref(0);
  const sections = computed(() => { revision.value; return buildSectionTree(text.value); });
  const diagnostics = computed(() => { revision.value; return detectDiagnostics(text.value, defaultRuleConfig); });
  const selectedSection = computed(() => sections.value.find(item => item.id === selectedSectionId.value));
  const dirty = computed(() => text.value !== baseline.value);
  function replace(value: string, kind: "typing" | "delete" = "typing") { const next = normalizeNewlines(value); if (next === text.value) return; history.record(text.value, next, kind === "delete" ? "删除源码" : "编辑源码", true); text.value = next; revision.value += 1; }
  function loadDocument(value: string, details: { fileName?: string; filePath?: string | null } = {}) { const next = normalizeNewlines(value); text.value = next; baseline.value = next; fileName.value = details.fileName ?? "未命名.md"; filePath.value = details.filePath ?? null; selectedSectionId.value = undefined; history.clear(); revision.value += 1; }
  function loadPastedDocument(value: string) { loadDocument(value); }
  function markSaved(path?: string, name?: string) { baseline.value = text.value; if (path !== undefined) filePath.value = path; if (name !== undefined) fileName.value = name; revision.value += 1; }
  function run(label: string, edits: TextEdit[]) { if (!edits.length) return; const transaction = history.apply(text.value, label, edits); text.value = transaction.text; revision.value += 1; }
  function undo() { const result = history.undo(text.value); text.value = result.text; revision.value += 1; }
  function redo() { const result = history.redo(text.value); text.value = result.text; revision.value += 1; }
  function applySafeFixes() { const generic = editsForDiagnostics(diagnostics.value); const formula = safeFormulaEdits(text.value, defaultRuleConfig.separatorMinLength, defaultRuleConfig.latexCommands); const all = [...generic, ...formula].sort((a, b) => a.from - b.from || a.to - b.to); const unique: TextEdit[] = []; for (const edit of all) if (!unique.some(item => edit.from < item.to && edit.to > item.from)) unique.push(edit); run("应用全部安全修复", unique); }
  function preview(edits: TextEdit[]) { return applyEdits(text.value, edits); }
  return { text, fileName, filePath, baseline, sections, diagnostics, selectedSectionId, selectedSection, dirty, history, replace, loadDocument, loadPastedDocument, run, undo, redo, applySafeFixes, preview, markSaved };
});
