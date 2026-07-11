declare module "diff" { export interface Change { value: string; added?: boolean; removed?: boolean; } export function diffLines(oldText: string, newText: string): Change[]; }
declare module "mathjax-full/es5/tex-chtml.js";
