<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
const props = defineProps<{ modelValue: string }>(); const emit = defineEmits<{ "update:modelValue": [value: string, kind: "typing" | "delete"]; "paste-document": [value: string]; undo: []; redo: [] }>();
const root = ref<HTMLElement>(); let view: EditorView | undefined; let applying = false;
onMounted(() => { view = new EditorView({ state: EditorState.create({ doc: props.modelValue, extensions: [markdown(), keymap.of([{ key: "Mod-z", run: () => { emit("undo"); return true; } }, { key: "Mod-Shift-z", run: () => { emit("redo"); return true; } }, { key: "Mod-y", run: () => { emit("redo"); return true; } }, ...defaultKeymap]), EditorView.lineWrapping, EditorView.domEventHandlers({ paste(event) { const pasted = event.clipboardData?.getData("text/plain"); if (pasted === undefined) return false; event.preventDefault(); emit("paste-document", pasted); return true; } }), EditorView.updateListener.of(update => { if (update.docChanged && !applying) { const kind = update.transactions.some(transaction => transaction.isUserEvent("delete")) ? "delete" : "typing"; emit("update:modelValue", update.state.doc.toString(), kind); } })] }), parent: root.value }); });
watch(() => props.modelValue, value => { if (!view || value === view.state.doc.toString()) return; applying = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }); applying = false; }); onBeforeUnmount(() => view?.destroy());
</script>
<template><div ref="root" class="editor" aria-label="Markdown 源码编辑器" /></template>
<style scoped>.editor { height: 100%; min-height: 0; }.editor :deep(.cm-editor) { height: 100%; font: 15px/1.75 "Cascadia Code", "Sarasa Mono SC", monospace; background: #10191c; color: #d8e5e1; }.editor :deep(.cm-scroller) { padding: 1.5rem; }.editor :deep(.cm-gutters) { background: #10191c; color: #50666a; border: 0; }</style>
