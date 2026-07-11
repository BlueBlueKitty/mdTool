<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
const props = withDefaults(defineProps<{ modelValue: string; readonly?: boolean }>(), { readonly: false });
const emit = defineEmits<{ "update:modelValue": [value: string, kind: "typing" | "delete"]; "paste-document": [value: string]; "selection-change": [from: number, to: number]; scroll: [ratio: number]; undo: []; redo: [] }>();
const root = ref<HTMLElement>(); let view: EditorView | undefined; let applying = false;
function ratio() { if (!view) return 0; const max = Math.max(1, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight); return view.scrollDOM.scrollTop / max; }
function scrollToPosition(position: number) { if (!view) return; const pos = Math.max(0, Math.min(position, view.state.doc.length)); view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) }); view.focus(); }
function setScrollRatio(next: number) { if (!view) return; const max = Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight); view.scrollDOM.scrollTop = Math.max(0, Math.min(1, next)) * max; }
defineExpose({ scrollToPosition, setScrollRatio });
onMounted(() => { view = new EditorView({ state: EditorState.create({ doc: props.modelValue, extensions: [markdown(), EditorState.readOnly.of(props.readonly), EditorView.editable.of(!props.readonly), keymap.of([{ key: "Mod-z", run: () => { emit("undo"); return true; } }, { key: "Mod-Shift-z", run: () => { emit("redo"); return true; } }, { key: "Mod-y", run: () => { emit("redo"); return true; } }, ...defaultKeymap]), EditorView.lineWrapping, EditorView.domEventHandlers({ paste(event) { if (props.readonly) return true; const pasted = event.clipboardData?.getData("text/plain"); if (pasted === undefined) return false; event.preventDefault(); emit("paste-document", pasted); return true; } }), EditorView.updateListener.of(update => { if (update.docChanged && !applying && !props.readonly) { const kind = update.transactions.some(transaction => transaction.isUserEvent("delete")) ? "delete" : "typing"; emit("update:modelValue", update.state.doc.toString(), kind); } if (update.selectionSet && !applying && !props.readonly) { const range = update.state.selection.main; emit("selection-change", range.from, range.to); } })] }), parent: root.value }); view.scrollDOM.addEventListener("scroll", () => emit("scroll", ratio())); });
watch(() => props.modelValue, value => { if (!view || value === view.state.doc.toString()) return; applying = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }); applying = false; }); onBeforeUnmount(() => view?.destroy());
</script>
<template><div ref="root" class="editor" :class="{ readonly }" aria-label="Markdown 源码编辑器" /></template>
<style scoped>.editor { height: 100%; min-height: 0; }.editor :deep(.cm-editor) { height: 100%; font: 15px/1.75 "Cascadia Code", "Sarasa Mono SC", monospace; background: #10191c; color: #d8e5e1; }.readonly :deep(.cm-editor) { background: #0c1719; }.editor :deep(.cm-scroller) { padding: 1.5rem; }.editor :deep(.cm-gutters) { background: #10191c; color: #50666a; border: 0; }</style>
