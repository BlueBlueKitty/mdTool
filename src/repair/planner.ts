import { applyEdits, validateEdits } from "../core/textEdits";
import { detectDiagnostics } from "../rules/diagnostics";
import { formulaRuleEdits } from "../rules/formula";
import { spacingRuleEdits } from "../rules/spacing";
import { autoNumberSections, renumberSections } from "../core/sections";
import type { RepairCandidate, RepairPlan, RepairScope, RepairSettings, RepairTarget, RuleConfig, TextEdit, TextSelection } from "../types";
import { ruleById } from "./registry";

const formulaRules = new Set(["formula-trim", "formula-double-escape", "formula-block-separator", "formula-restore-separator", "formula-delimiter-latex", "formula-delimiter-dollar", "formula-display-dollar-to-single", "formula-inline-double-dollar-to-single", "formula-restore-missing-delimiter", "formula-code-wrapper"]);
const overlaps = (a: TextEdit, b: TextEdit) => a.from < b.to && a.to > b.from;
function candidate(id: string, ruleId: string, nodeFrom: number, nodeTo: number, edits: TextEdit[], text: string, confidence = 1): RepairCandidate | undefined {
  const rule = ruleById(ruleId); if (!rule || !edits.length) return undefined;
  const from = Math.min(...edits.map(edit => edit.from)); const to = Math.max(...edits.map(edit => edit.to));
  return { id, ruleId, category: rule.category, label: rule.label, confidence, from, to, nodeFrom, nodeTo, originalText: text.slice(nodeFrom, nodeTo), replacement: applyEdits(text.slice(nodeFrom, nodeTo), edits.map(edit => ({ ...edit, from: edit.from - nodeFrom, to: edit.to - nodeFrom }))), edits };
}
export interface PlanOptions { scope: RepairScope; target: RepairTarget; selection?: TextSelection; settings: RepairSettings; }
export function createRepairPlan(text: string, revision: number, config: RuleConfig, options: PlanOptions): RepairPlan {
  const raw: RepairCandidate[] = []; const skipped: string[] = []; const diagnostics = detectDiagnostics(text, config); const target = options.target;
  for (const item of diagnostics) { if (!item.autoFixable || item.replacement === undefined || formulaRules.has(item.ruleId)) continue; const itemCandidate = candidate(item.id, item.ruleId, item.from, item.to, [{ from: item.from, to: item.to, insert: item.replacement }], text, item.confidence); if (itemCandidate) raw.push(itemCandidate); }
  for (const item of formulaRuleEdits(text, config.separatorMinLength, config.latexCommands, options.settings.enabledRuleIds)) { const itemCandidate = candidate(item.id, item.ruleId, item.nodeFrom, item.nodeTo, [item.edit], text); if (itemCandidate) raw.push(itemCandidate); }
  for (const item of spacingRuleEdits(text, options.settings.enabledRuleIds)) { const itemCandidate = candidate(`${item.ruleId}:${item.edit.from}`, item.ruleId, item.nodeFrom, item.nodeTo, [item.edit], text); if (itemCandidate) raw.push(itemCandidate); }
  if (options.settings.enabledRuleIds.includes("section-auto-number")) { const edits = autoNumberSections(text, options.settings.sectionNumberStartLevel, options.settings.sectionNumberEndLevel ?? 6); if (applyEdits(text, edits) !== text) { const itemCandidate = candidate("section-auto-number:document", "section-auto-number", 0, text.length, edits, text); if (itemCandidate) raw.push(itemCandidate); } }
  if (options.settings.enabledRuleIds.includes("section-renumber")) { const edits = renumberSections(text); if (applyEdits(text, edits) !== text) { const itemCandidate = candidate("section-renumber:document", "section-renumber", 0, text.length, edits, text); if (itemCandidate) raw.push(itemCandidate); } }
  let targetRules: Set<string> | undefined;
  if (target.kind === "category") targetRules = new Set(options.settings.enabledRuleIds.filter(id => ruleById(id)?.category === target.id));
  else if (target.kind === "automatic") targetRules = new Set(options.settings.enabledRuleIds);
  const filtered = raw.filter(item => {
    if (target.kind === "rule" && item.ruleId !== target.id) return false;
    if (targetRules && !targetRules.has(item.ruleId)) return false;
    if (options.scope !== "selection" || !options.selection) return true;
    const selection = options.selection; if (item.nodeTo <= selection.from || item.nodeFrom >= selection.to) return false;
    if (item.nodeFrom < selection.from || item.nodeTo > selection.to) { skipped.push(`${item.label}：节点跨越选区边界，请扩大选区`); return false; }
    return true;
  });
  const accepted: RepairCandidate[] = []; const conflicts: string[] = []; const edits: TextEdit[] = [];
  for (const item of filtered) { const errors = validateEdits(text, item.edits); if (errors.length || item.edits.some(edit => edits.some(existing => overlaps(existing, edit)))) { conflicts.push(`${item.label}：补丁与其他候选冲突`); continue; } accepted.push(item); edits.push(...item.edits); }
  return { id: `repair-${revision}-${Date.now()}`, source: text, revision, scope: options.scope, target: options.target, candidates: accepted, skipped, conflicts, createdAt: Date.now() };
}
export function editsForPlan(plan: RepairPlan, selectedIds: string[]): TextEdit[] { return plan.candidates.filter(candidate => selectedIds.includes(candidate.id)).flatMap(candidate => candidate.edits); }
