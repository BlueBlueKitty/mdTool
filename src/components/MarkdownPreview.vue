<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
const props = defineProps<{ modelValue: string }>(); const emit = defineEmits<{ scroll: [ratio: number] }>(); const root = ref<HTMLElement>(); const ready = ref(false);
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: true }); const html = computed(() => md.render(props.modelValue));
type MathJaxApi = { typesetClear?: (nodes?: HTMLElement[]) => void; typesetPromise?: (nodes?: HTMLElement[]) => Promise<void> };
function mathJax() { return (window as Window & { MathJax?: MathJaxApi }).MathJax; }
async function typeset() { await nextTick(); if (!ready.value || !root.value) return; const api = mathJax(); try { api?.typesetClear?.([root.value]); await api?.typesetPromise?.([root.value]); } catch { /* 保留原始 TeX，避免单个公式影响预览 */ } }
function setScrollRatio(value: number) { nextTick(() => { if (!root.value) return; const max = Math.max(0, root.value.scrollHeight - root.value.clientHeight); root.value.scrollTop = Math.max(0, Math.min(1, value)) * max; }); }
defineExpose({ setScrollRatio }); function onScroll() { if (!root.value) return; const max = Math.max(1, root.value.scrollHeight - root.value.clientHeight); emit("scroll", root.value.scrollTop / max); }
onMounted(async () => { (window as Window & { MathJax?: unknown }).MathJax = { tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]] }, chtml: { matchFontHeight: false } }; await import("mathjax-full/es5/tex-chtml.js"); ready.value = true; typeset(); }); watch(html, typeset);
</script>
<template><article ref="root" class="preview" @scroll="onScroll" v-html="html" /></template>
<style scoped>.preview { height: 100%; overflow: auto; padding: 24px; line-height: 1.75; color: #d5dfda; background: #0c1719; }.preview :deep(h1),.preview :deep(h2),.preview :deep(h3) { color: #f3c36d; font-family: Georgia, "STSong", serif; }.preview :deep(code),.preview :deep(pre) { background: #142326; color: #d8e5e1; }.preview :deep(pre) { padding: 12px; overflow: auto; }.preview :deep(a) { color: #78c7bf; }.preview :deep(blockquote) { margin-left: 0; border-left: 3px solid #e6a845; padding-left: 12px; color: #a9bbb6; }.preview :deep(mjx-container) { color: #f4e2ba; }</style>
