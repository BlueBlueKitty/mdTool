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
export const defaultRuleConfig: RuleConfig = {
  blankLines: 1, listMarker: "-", orderedListStyle: "incremental", separatorMinLength: 5,
  allowMultipleH1: false, ignoredRuleIds: [],
  latexCommands: ["frac", "sqrt", "alpha", "beta", "gamma", "mu", "sum", "int", "text", "begin", "end"],
};
