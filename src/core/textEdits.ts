import type { TextEdit } from "../types";

export function validateEdits(text: string, edits: TextEdit[]): string[] {
  const errors: string[] = [];
  const ordered = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
  for (let index = 0; index < ordered.length; index += 1) {
    const edit = ordered[index];
    if (!Number.isInteger(edit.from) || !Number.isInteger(edit.to) || edit.from < 0 || edit.to < edit.from || edit.to > text.length) errors.push(`补丁 ${index + 1} 越界`);
    if (index > 0 && edit.from < ordered[index - 1].to) errors.push(`补丁 ${index + 1} 与前一补丁重叠`);
  }
  return errors;
}

export function applyEdits(text: string, edits: TextEdit[]): string {
  const errors = validateEdits(text, edits);
  if (errors.length) throw new Error(`补丁冲突：${errors.join("；")}`);
  return [...edits].sort((a, b) => b.from - a.from).reduce((result, edit) => result.slice(0, edit.from) + edit.insert + result.slice(edit.to), text);
}

export interface EditTransaction { label: string; edits: TextEdit[]; before: string; after: string; at: number; }
export class TextHistory {
  private undoStack: EditTransaction[] = []; private redoStack: EditTransaction[] = [];
  apply(text: string, label: string, edits: TextEdit[]): { text: string; transaction: EditTransaction } {
    const after = applyEdits(text, edits); const transaction = { label, edits, before: text, after, at: Date.now() };
    this.undoStack.push(transaction); this.redoStack = []; return { text: after, transaction };
  }
  record(before: string, after: string, label: string, coalesce = false): EditTransaction | undefined {
    if (before === after) return undefined;
    const previous = this.undoStack.at(-1);
    if (coalesce && previous?.label === label && Date.now() - previous.at < 900) {
      previous.after = after; previous.edits = [{ from: 0, to: previous.before.length, insert: after }]; previous.at = Date.now(); this.redoStack = []; return previous;
    }
    const transaction = { label, edits: [{ from: 0, to: before.length, insert: after }], before, after, at: Date.now() };
    this.undoStack.push(transaction); this.redoStack = []; return transaction;
  }
  undo(text: string): { text: string; transaction?: EditTransaction } { const transaction = this.undoStack.pop(); if (!transaction) return { text }; this.redoStack.push(transaction); return { text: transaction.before, transaction }; }
  redo(text: string): { text: string; transaction?: EditTransaction } { const transaction = this.redoStack.pop(); if (!transaction) return { text }; this.undoStack.push(transaction); return { text: transaction.after, transaction }; }
  undoTo(text: string, at: number): { text: string; transactions: EditTransaction[] } { const transactions: EditTransaction[] = []; while (this.undoStack.length && this.undoStack.at(-1)!.at >= at) { const result = this.undo(text); text = result.text; if (result.transaction) transactions.push(result.transaction); } return { text, transactions }; }
  list(): EditTransaction[] { return [...this.undoStack].reverse(); }
  clear() { this.undoStack = []; this.redoStack = []; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}
