export type Severity = "error" | "warning" | "info";
export type ProtectedRangeType = "frontmatter" | "fenced-code" | "inline-code" | "link-destination" | "image-destination" | "html" | "escaped-character" | "valid-math" | "user-ignore";
export interface TextEdit { from: number; to: number; insert: string; }
export interface ProtectedRange { type: ProtectedRangeType; from: number; to: number; }
export interface SectionNode {
  id: string; level: number; title: string; numberParts: number[] | null;
  headingFrom: number; headingTo: number; sectionFrom: number; sectionTo: number;
  parentId: string | null; children: SectionNode[];
}
export interface MarkdownDiagnostic {
  id: string; ruleId: string; severity: Severity; message: string; from: number; to: number;
  originalText: string; replacement?: string; confidence: number; autoFixable: boolean;
  sectionId?: string; metadata?: Record<string, unknown>;
}
export interface RuleConfig {
  blankLines: number; listMarker: "-" | "*" | "+"; orderedListStyle: "incremental" | "one";
  separatorMinLength: number; allowMultipleH1: boolean; ignoredRuleIds: string[];
  latexCommands: string[];
}
export type RepairScope = "document" | "selection";
export type RepairCategory = "formula" | "spacing" | "section";
export interface TextSelection { from: number; to: number; }
export interface RepairRuleDefinition { id: string; category: RepairCategory; label: string; autoEnabledByDefault: boolean; }
export interface RepairCandidate {
  id: string; ruleId: string; category: RepairCategory; label: string; confidence: number;
  from: number; to: number; nodeFrom: number; nodeTo: number; originalText: string; replacement: string; edits: TextEdit[];
}
export type RepairTarget = { kind: "rule"; id: string } | { kind: "category"; id: RepairCategory } | { kind: "automatic" };
export interface RepairPlan {
  id: string; source: string; revision: number; scope: RepairScope; target: RepairTarget;
  candidates: RepairCandidate[]; skipped: string[]; conflicts: string[]; createdAt: number;
}
export interface RepairSettings { enabledRuleIds: string[]; sectionNumberStartLevel: number; sectionNumberEndLevel: number | null; }
export const defaultRuleConfig: RuleConfig = {
  blankLines: 1, listMarker: "-", orderedListStyle: "incremental", separatorMinLength: 5,
  allowMultipleH1: false, ignoredRuleIds: [],
  latexCommands: ["frac", "sqrt", "alpha", "beta", "gamma", "mu", "sum", "int", "text", "begin", "end"],
};
