<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
const props = defineProps<{ modelValue: string }>(); const emit = defineEmits<{ scroll: [ratio: number] }>(); const root = ref<HTMLElement>(); const ready = ref(false);
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: true });
md.renderer.rules.heading_open = (tokens, index, options, _env, self) => { const token = tokens[index]; if (token.map) token.attrSet("data-source-line", String(token.map[0] + 1)); return self.renderToken(tokens, index, options); };
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
md.renderer.rules.math_block = (tokens, index) => `<div class="math-block">$$\n${md.utils.escapeHtml(tokens[index].content)}$$</div>\n`;
const html = computed(() => md.render(props.modelValue));
type MathJaxApi = { typesetClear?: (nodes?: HTMLElement[]) => void; typesetPromise?: (nodes?: HTMLElement[]) => Promise<void> };
function mathJax() { return (window as Window & { MathJax?: MathJaxApi }).MathJax; }
async function typeset() { await nextTick(); if (!ready.value || !root.value) return; const api = mathJax(); try { api?.typesetClear?.([root.value]); await api?.typesetPromise?.([root.value]); } catch { /* 保留原始 TeX，避免单个公式影响预览 */ } }
function setScrollPosition(ratio: number, sourceLine?: number) { nextTick(() => { if (!root.value) return; const headings = [...root.value.querySelectorAll<HTMLElement>("[data-source-line]")]; const anchor = sourceLine === undefined ? undefined : headings.filter((heading) => Number(heading.dataset.sourceLine) <= sourceLine).at(-1); if (anchor) { root.value.scrollTop = Math.max(0, anchor.offsetTop - 24); return; } const max = Math.max(0, root.value.scrollHeight - root.value.clientHeight); root.value.scrollTop = Math.max(0, Math.min(1, ratio)) * max; }); }
defineExpose({ setScrollPosition }); function onScroll() { if (!root.value) return; const max = Math.max(1, root.value.scrollHeight - root.value.clientHeight); emit("scroll", root.value.scrollTop / max); }
onMounted(async () => { (window as Window & { MathJax?: unknown }).MathJax = { tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]] }, chtml: { matchFontHeight: false } }; await import("mathjax-full/es5/tex-chtml.js"); ready.value = true; typeset(); }); watch(html, typeset);
</script>
<template><article ref="root" class="preview" @scroll="onScroll" v-html="html" /></template>
<style scoped>
.preview { height: 100%; overflow: auto; padding: 24px; line-height: 1.75; color: var(--text); background: var(--panel); }
.preview :deep(h1),.preview :deep(h2),.preview :deep(h3) { color: var(--accent); font-family: Georgia, "STSong", serif; }
.preview :deep(code),.preview :deep(pre) { background: var(--code); color: var(--text); }.preview :deep(pre) { padding: 12px; overflow: auto; }.preview :deep(a) { color: var(--link); }.preview :deep(blockquote) { margin-left: 0; border-left: 3px solid var(--accent); padding-left: 12px; color: var(--muted); }.preview :deep(mjx-container) { color: var(--math); }.preview :deep(.math-block) { overflow-x: auto; padding: 10px 0; text-align: center; }
</style>
