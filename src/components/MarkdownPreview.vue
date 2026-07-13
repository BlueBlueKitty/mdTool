<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
const props = defineProps<{ modelValue: string }>(); const emit = defineEmits<{ scroll: [ratio: number]; "context-menu": [x: number, y: number] }>(); const root = ref<HTMLElement>();
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: true });
md.renderer.rules.heading_open = (tokens, index, options, _env, self) => { const token = tokens[index]; if (token.map) token.attrSet("data-source-line", String(token.map[0] + 1)); return self.renderToken(tokens, index, options); };
md.core.ruler.after("block", "source_line_anchors", state => {
  for (const token of state.tokens) {
    if (token.block && token.nesting === 1 && token.map && token.tag) token.attrSet("data-source-line", String(token.map[0] + 1));
  }
});
// markdown-it does not parse MathJax's $$ delimiters by default. Keep the
// whole fenced expression in one token so lines such as `Z(\\mathbf x)` can
// never be interpreted as normal Markdown content.
md.block.ruler.before("fence", "math_block", (state, startLine, endLine, silent) => {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.src.slice(start, max).trim() !== "$$") return false;
  let closeLine = startLine + 1;
  while (closeLine < endLine) {
    const lineStart = state.bMarks[closeLine] + state.tShift[closeLine];
    if (state.src.slice(lineStart, state.eMarks[closeLine]).trim() === "$$") break;
    closeLine += 1;
  }
  if (closeLine >= endLine) return false;
  if (silent) return true;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.map = [startLine, closeLine + 1];
  token.content = state.getLines(startLine + 1, closeLine, state.blkIndent, false);
  state.line = closeLine + 1;
  return true;
});
md.renderer.rules.math_block = (tokens, index) => `<div class="math-block" data-source-line="${tokens[index].map![0] + 1}">$$\n${md.utils.escapeHtml(tokens[index].content)}$$</div>\n`;
const inlineOpen = "@@MDTEX_INLINE_OPEN@@", inlineClose = "@@MDTEX_INLINE_CLOSE@@", blockOpen = "@@MDTEX_BLOCK_OPEN@@", blockClose = "@@MDTEX_BLOCK_CLOSE@@";
const html = computed(() => md.render(props.modelValue.replace(/\\\(/g, inlineOpen).replace(/\\\)/g, inlineClose).replace(/\\\[/g, blockOpen).replace(/\\\]/g, blockClose)).replaceAll(inlineOpen, "\\(").replaceAll(inlineClose, "\\)").replaceAll(blockOpen, "\\[").replaceAll(blockClose, "\\]"));
const hasMath = computed(() => props.modelValue.includes("$") || props.modelValue.includes("\\(") || props.modelValue.includes("\\["));
type MathJaxApi = { typesetClear?: (nodes?: HTMLElement[]) => void; typesetPromise?: (nodes?: HTMLElement[]) => Promise<void> };
function mathJax() { return (window as Window & { MathJax?: MathJaxApi }).MathJax; }
let mathJaxLoading: Promise<void> | undefined; let typesetVersion = 0; let disposed = false;
async function loadMathJax(): Promise<MathJaxApi | undefined> {
  if (mathJax()?.typesetPromise) return mathJax();
  if (!mathJaxLoading) {
    (window as Window & { MathJax?: unknown }).MathJax = { tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]] }, chtml: { matchFontHeight: false } };
    mathJaxLoading = import("mathjax-full/es5/tex-chtml.js").then(() => undefined);
  }
  await mathJaxLoading;
  return mathJax();
}
async function typeset(version: number) {
  await nextTick();
  if (disposed || version !== typesetVersion || !root.value || !hasMath.value) return;
  const api = await loadMathJax();
  if (disposed || version !== typesetVersion || !root.value) return;
  try { api?.typesetClear?.([root.value]); await api?.typesetPromise?.([root.value]); } catch { /* 保留原始 TeX，避免单个公式影响预览 */ }
}
function setScrollPosition(ratio: number, sourceLine?: number) { nextTick(() => { if (!root.value) return; const anchors = [...root.value.querySelectorAll<HTMLElement>("[data-source-line]")]; const anchor = sourceLine === undefined ? undefined : anchors.filter((item) => Number(item.dataset.sourceLine) <= sourceLine).at(-1); if (anchor) { root.value.scrollTop = Math.max(0, anchor.offsetTop - 24); return; } const max = Math.max(0, root.value.scrollHeight - root.value.clientHeight); root.value.scrollTop = Math.max(0, Math.min(1, ratio)) * max; }); }
defineExpose({ setScrollPosition }); function onScroll() { if (!root.value) return; const max = Math.max(1, root.value.scrollHeight - root.value.clientHeight); emit("scroll", root.value.scrollTop / max); }
onMounted(() => { typesetVersion += 1; void typeset(typesetVersion); });
watch(html, () => { typesetVersion += 1; void typeset(typesetVersion); });
onBeforeUnmount(() => { disposed = true; typesetVersion += 1; });
</script>
<template><article ref="root" class="preview" @scroll="onScroll" @contextmenu.prevent="emit('context-menu', $event.clientX, $event.clientY)" v-html="html" /></template>
<style scoped>
.preview { height: 100%; overflow: auto; padding: 22px 26px 32px; line-height: 1.78; color: var(--text); background: var(--panel); text-wrap: pretty; }
.preview :deep(h1),.preview :deep(h2),.preview :deep(h3),.preview :deep(h4) { color: var(--text-strong); font-family: Georgia, "STSong", "Songti SC", serif; line-height: 1.35; letter-spacing: .01em; }
.preview :deep(h1) { margin: 0 0 1rem; padding-bottom: .55rem; border-bottom: 1px solid var(--border); font-size: 1.65rem; }
.preview :deep(h2) { margin-top: 1.85rem; font-size: 1.32rem; }
.preview :deep(h3) { margin-top: 1.45rem; font-size: 1.12rem; }
.preview :deep(h4) { margin-top: 1.2rem; font-size: 1rem; }
.preview :deep(p),.preview :deep(li) { max-width: 76ch; }
.preview :deep(code) { padding: .12em .36em; border: 1px solid var(--border); border-radius: 4px; background: var(--code); color: var(--syntax-code); font: .9em "Cascadia Code", "Sarasa Mono SC", monospace; }
.preview :deep(pre) { margin: 1rem 0; padding: 13px 15px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; background: var(--code); box-shadow: inset 0 1px color-mix(in srgb, white 6%, transparent); }
.preview :deep(pre code) { padding: 0; border: 0; background: transparent; color: var(--text); }
.preview :deep(a) { color: var(--link); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.preview :deep(blockquote) { margin: 1rem 0; padding: .15rem 0 .15rem 14px; border-left: 3px solid var(--accent); color: var(--muted); }
.preview :deep(hr) { border: 0; border-top: 1px solid var(--border); margin: 1.5rem 0; }
.preview :deep(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: .93em; }
.preview :deep(th),.preview :deep(td) { padding: .48rem .65rem; border: 1px solid var(--border); text-align: left; }
.preview :deep(th) { background: var(--surface-raised); color: var(--text-strong); }
.preview :deep(mjx-container) { color: var(--math); }.preview :deep(.math-block) { overflow-x: auto; margin: 1rem 0; padding: 12px 0; text-align: center; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
</style>
