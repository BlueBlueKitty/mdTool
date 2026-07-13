import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { buildSectionTree } from "../core/sections";
import { TextHistory, applyEdits } from "../core/textEdits";
import { normalizeNewlines } from "../core/scanner";
import { detectDiagnostics, editsForDiagnostics } from "../rules/diagnostics";
import { safeFormulaEdits } from "../rules/formula";
import { defaultRuleConfig, type RepairPlan, type RepairScope, type RepairSettings, type RepairTarget, type TextEdit, type TextSelection } from "../types";
import { createRepairPlan, editsForPlan } from "../repair/planner";
import { loadRepairSettings, saveRepairSettings } from "../repair/settings";

export const useDocumentStore = defineStore("document", () => {
  const text = ref(""); const fileName = ref("未命名.md"); const filePath = ref<string | null>(null); const baseline = ref(""); const selectedSectionId = ref<string>(); const selection = ref<TextSelection>({ from: 0, to: 0 }); const repairSettings = ref<RepairSettings>(loadRepairSettings()); const history = new TextHistory(); const revision = ref(0);
  const sections = computed(() => { revision.value; return buildSectionTree(text.value); });
  const diagnostics = computed(() => { revision.value; return detectDiagnostics(text.value, defaultRuleConfig); });
  const selectedSection = computed(() => sections.value.find(item => item.id === selectedSectionId.value));
  const dirty = computed(() => text.value !== baseline.value);
  function replace(value: string, kind: "typing" | "delete" = "typing") { const next = normalizeNewlines(value); if (next === text.value) return; history.record(text.value, next, kind === "delete" ? "删除源码" : "编辑源码", true); text.value = next; revision.value += 1; }
  function loadDocument(value: string, details: { fileName?: string; filePath?: string | null } = {}) { const next = normalizeNewlines(value); text.value = next; baseline.value = next; fileName.value = details.fileName ?? "未命名.md"; filePath.value = details.filePath ?? null; selectedSectionId.value = undefined; selection.value = { from: 0, to: 0 }; history.clear(); revision.value += 1; }
  function loadPastedDocument(value: string) { loadDocument(value); }
  function markSaved(path?: string, name?: string) { baseline.value = text.value; if (path !== undefined) filePath.value = path; if (name !== undefined) fileName.value = name; revision.value += 1; }
  function run(label: string, edits: TextEdit[]) { if (!edits.length) return; const transaction = history.apply(text.value, label, edits); text.value = transaction.text; revision.value += 1; }
  function undo() { const result = history.undo(text.value); text.value = result.text; revision.value += 1; }
  function redo() { const result = history.redo(text.value); text.value = result.text; revision.value += 1; }
  function undoTo(at: number) { const result = history.undoTo(text.value, at); text.value = result.text; if (result.transactions.length) revision.value += 1; }
  function applySafeFixes() { const generic = editsForDiagnostics(diagnostics.value); const formula = safeFormulaEdits(text.value, defaultRuleConfig.separatorMinLength, defaultRuleConfig.latexCommands); const all = [...generic, ...formula].sort((a, b) => a.from - b.from || a.to - b.to); const unique: TextEdit[] = []; for (const edit of all) if (!unique.some(item => edit.from < item.to && edit.to > item.from)) unique.push(edit); run("应用全部安全修复", unique); }
  function preview(edits: TextEdit[]) { return applyEdits(text.value, edits); }
  function setSelection(next: TextSelection) { selection.value = { from: Math.max(0, next.from), to: Math.min(text.value.length, next.to) }; }
  function buildRepairPlan(scope: RepairScope, target: RepairTarget): RepairPlan { return createRepairPlan(text.value, revision.value, defaultRuleConfig, { scope, target, selection: selection.value, settings: repairSettings.value }); }
  function applyRepairPlan(plan: RepairPlan, selectedIds: string[], label = "应用修复计划") { if (plan.source !== text.value || plan.revision !== revision.value) throw new Error("修复计划已过期：文档已变化，请重新生成预览"); const edits = editsForPlan(plan, selectedIds); if (!edits.length) throw new Error("请至少选择一项修复"); run(label, edits); }
  function updateRepairSettings(next: RepairSettings) { const start = Math.min(6, Math.max(1, Math.trunc(next.sectionNumberStartLevel || 1))); const end = next.sectionNumberEndLevel === null ? null : Math.min(6, Math.max(start, Math.trunc(next.sectionNumberEndLevel || 6))); repairSettings.value = { enabledRuleIds: [...new Set(next.enabledRuleIds)], sectionNumberStartLevel: start, sectionNumberEndLevel: end }; saveRepairSettings(repairSettings.value); }
  return { text, fileName, filePath, baseline, sections, diagnostics, selectedSectionId, selectedSection, selection, repairSettings, revision, dirty, history, replace, loadDocument, loadPastedDocument, run, undo, undoTo, redo, applySafeFixes, preview, markSaved, setSelection, buildRepairPlan, applyRepairPlan, updateRepairSettings };
});
