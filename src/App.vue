<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { diffLines } from "diff";
import { message } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDocumentStore } from "./stores/document";
import {
  categoryLabels,
  repairRules,
  rulesForCategory,
  mutuallyExclusiveRules,
  ruleDescriptions,
  ruleById,
} from "./repair/registry";
import { editsForPlan } from "./repair/planner";
import {
  promoteSection,
  demoteSection,
  shiftSectionNumber,
  deleteSection,
  autoNumberSections,
  renumberSections,
  numberSectionBranch,
  moveSectionBefore,
} from "./core/sections";
import {
  chooseMarkdownFile,
  chooseSavePath,
  fileNameFromPath,
  readMarkdown,
  readStartupText,
  writeMarkdown,
  isDesktopApp,
  isSupportedTextPath,
} from "./services/nativeFiles";
import type { RepairCategory, RepairPlan, RepairTarget } from "./types";

const LoadingPane = defineComponent({
  name: "LoadingPane",
  setup: () => () => h("div", { class: "panel-loading", role: "status" }, "正在加载…"),
});
// CodeMirror and markdown-it are substantial dependencies. Loading them after
// the app shell paints prevents their parsing from holding the native window on
// a white screen during startup.
const MarkdownEditor = defineAsyncComponent({
  loader: () => import("./components/MarkdownEditor.vue"),
  loadingComponent: LoadingPane,
  delay: 0,
});
const MarkdownPreview = defineAsyncComponent({
  loader: () => import("./components/MarkdownPreview.vue"),
  loadingComponent: LoadingPane,
  delay: 0,
});

const store = useDocumentStore();
const sideTab = ref<"sections" | "issues">("sections");
const centerTab = ref<"source" | "repair" | "diff">("source");
const status = ref("准备就绪");
const sourceEditor = ref<{
  scrollToPosition: (p: number) => void;
  highlightRange: (from: number, to: number) => void;
  setScrollRatio: (r: number) => void;
  scrollToLine: (line: number) => void;
  copySelection: () => Promise<void>;
  cutSelection: () => Promise<void>;
  pasteClipboard: () => Promise<void>;
}>();
const repairEditor = ref<{ setScrollRatio: (r: number) => void; scrollToLine: (line: number) => void; copySelection: () => Promise<void> }>();
const preview = ref<{
  setScrollPosition: (ratio: number, sourceLine?: number) => void;
}>();
const diffRoot = ref<HTMLElement>();
const menu = ref<"file" | "formula" | "other" | "history" | null>(null);
const settingsOpen = ref(false);
const context = ref<{ id: string; x: number; y: number }>();
const issueContext = ref<{ x: number; y: number }>();
type ContextPosition = { x: number; y: number; opensLeft: boolean; opensUp: boolean };
const sourceContext = ref<ContextPosition>();
const readonlyContext = ref<(ContextPosition & { kind: "repair" | "diff" | "preview" })>();
const dragging = ref<string>();
const dragOverSectionId = ref<string>();
const lastPreview = ref<"source" | "repair">("source");
const theme = ref<"dark" | "light">(
  (localStorage.getItem("mdtool.theme") as "dark" | "light") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
);
const leftWidth = ref(Number(localStorage.getItem("mdtool.left-width")) || 260);
const rightWidth = ref(
  Number(localStorage.getItem("mdtool.right-width")) || 420,
);
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
const currentPlan = ref<RepairPlan>(
  store.buildRepairPlan("document", { kind: "automatic" }),
);
const selectedPlanIds = ref<string[]>(
  currentPlan.value.candidates.map((item) => item.id),
);
const pendingManual = ref<{ selection: RepairPlan; full: RepairPlan }>();
const pendingFullNumbering = ref(false);
const repairText = computed(() =>
  store.preview(editsForPlan(currentPlan.value, selectedPlanIds.value)),
);
const diffs = computed(() => {
  let sourceLine = 1;
  return diffLines(store.text, repairText.value).flatMap((part) =>
    (part.value.match(/[^\n]*\n|[^\n]+/g) || []).map((value) => {
      const line = sourceLine;
      if (!part.added) sourceLine += 1;
      return { added: part.added, removed: part.removed, value, sourceLine: line };
    }),
  );
});
const previewSource = computed(() =>
  lastPreview.value === "repair" ? repairText.value : store.text,
);
// Keep source editing on CodeMirror's fast path. Rendering Markdown and MathJax
// only starts after the user pauses, and never while the preview is unmounted.
const renderedPreviewText = ref(previewSource.value);
const centerScroll = ref({ ratio: 0, line: 1 });
const repairPreviewLabel = computed(() => {
  if (currentPlan.value.target.kind === "automatic") return "一键修复预览";
  if (currentPlan.value.target.kind === "category") return `${categoryLabels[currentPlan.value.target.id]}修复预览`;
  return `${ruleById(currentPlan.value.target.id)?.label ?? "修复"}修复预览`;
});
const issues = computed(() => currentPlan.value.candidates);
const categories = Object.keys(categoryLabels) as RepairCategory[];
const issueGroups = computed(() =>
  categories
    .map((category) => ({
      category,
      rules: rulesForCategory(category)
        .map((rule) => ({
          rule,
          items: issues.value.filter((item) => item.ruleId === rule.id),
        }))
        .filter((group) => group.items.length),
    }))
    .filter((group) => group.rules.length),
);
const expandedIssueCategories = ref<Record<string, boolean>>({});
const expandedIssueRules = ref<Record<string, boolean>>({});
let refreshTimer: number | undefined;
let previewTimer: number | undefined;
const workspaceStyle = computed(() => ({
  gridTemplateColumns: `${leftCollapsed.value ? 32 : leftWidth.value}px minmax(360px,1fr) ${rightCollapsed.value ? 32 : rightWidth.value}px`,
}));
const expandedCategories = ref<Record<string, boolean>>(
  Object.fromEntries(categories.map((category) => [category, true])),
);
const collapsedSections = ref(new Set<string>());
const scrollingSectionId = ref<string>();
const sectionRows = computed(() => {
  const rows: (typeof store.sections)[number][] = [];
  const visit = (node: (typeof store.sections)[number]) => {
    rows.push(node);
    if (!collapsedSections.value.has(node.id)) node.children.forEach(visit);
  };
  store.sections.filter((node) => !node.parentId).forEach(visit);
  return rows;
});
const examples: Record<string, string> = {
  "formula-trim": "$  x + y  $ → $x + y$",
  "formula-double-escape": "$\\\\alpha$ → $\\alpha$",
  "formula-block-separator": "$$\\na+b\\n-----\\n$$ → $$\\na+b\\n$$",
  "formula-restore-separator": "a======b → a=b",
  "formula-delimiter-latex": "$x+y$ → \\(x+y\\)",
  "formula-delimiter-dollar": "\\[x+y\\] → $$x+y$$",
  "formula-display-dollar-to-single": "$$\\nx+y\\n$$ → $x+y$",
  "formula-inline-double-dollar-to-single": "文本 $$x+y$$ → 文本 $x+y$",
  "formula-restore-missing-delimiter": "(x+y=1) → \\(x+y=1\\)",
  "spacing-cjk-latin": "中文Markdown → 中文 Markdown",
  "spacing-cjk-latin-remove": "中文 Markdown → 中文Markdown",
  "spacing-cjk-number": "第2章 → 第 2 章",
  "spacing-cjk-number-remove": "第 2 章 → 第2章",
  "spacing-number-unit": "20kg → 20 kg",
  "spacing-number-unit-remove": "20 kg → 20kg",
  "section-auto-number": "## 方法 → ## 1.1 方法",
  "section-renumber": "## 3.8 方法 → ## 1.2 方法",
  "formula-code-wrapper": "`$E=mc^2$` → $E=mc^2$",
};
interface Profile {
  id: string;
  name: string;
  enabledRuleIds: string[];
  sectionNumberStartLevel: number;
  sectionNumberEndLevel: number | null;
  builtIn?: boolean;
}
const profileKey = "mdtool.repair-profiles.v1";
const profiles = ref<Profile[]>(loadProfiles());
const activeProfileId = ref(profiles.value[0].id);
const profileDialogOpen = ref(false);
const profileDraftName = ref("");
const profileNameError = ref("");
function loadProfiles(): Profile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(profileKey) || "null") as
      | Profile[]
      | null;
    if (raw?.length) return raw;
  } catch {
    /* use default */
  }
  return [
    {
      id: "default",
      name: "默认安全方案",
      enabledRuleIds: [...store.repairSettings.enabledRuleIds],
      sectionNumberStartLevel: store.repairSettings.sectionNumberStartLevel,
      sectionNumberEndLevel: store.repairSettings.sectionNumberEndLevel,
      builtIn: true,
    },
  ];
}
function persistProfiles() {
  localStorage.setItem(profileKey, JSON.stringify(profiles.value));
}
function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  localStorage.setItem("mdtool.theme", theme.value);
}
function startResize(side: "left" | "right", event: PointerEvent) {
  const initial = side === "left" ? leftWidth.value : rightWidth.value;
  const start = event.clientX;
  const move = (next: PointerEvent) => {
    const delta = next.clientX - start;
    const value = Math.max(
      190,
      Math.min(620, side === "left" ? initial + delta : initial - delta),
    );
    if (side === "left") leftWidth.value = value;
    else rightWidth.value = value;
  };
  const stop = () => {
    localStorage.setItem(
      `mdtool.${side}-width`,
      String(side === "left" ? leftWidth.value : rightWidth.value),
    );
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
}
function activateProfile(id: string) {
  const profile = profiles.value.find((item) => item.id === id);
  if (!profile) return;
  activeProfileId.value = id;
  store.updateRepairSettings({
    enabledRuleIds: profile.enabledRuleIds,
    sectionNumberStartLevel: profile.sectionNumberStartLevel,
    sectionNumberEndLevel: profile.sectionNumberEndLevel,
  });
  refreshAutomatic();
}
function nextProfileName() {
  let index = 1;
  while (
    profiles.value.some((profile) => profile.name === `新规则方案${index}`)
  )
    index += 1;
  return `新规则方案${index}`;
}
function openProfileDialog() {
  profileDraftName.value = nextProfileName();
  profileNameError.value = "";
  profileDialogOpen.value = true;
}
function saveProfile() {
  const name = profileDraftName.value.trim();
  if (!name) {
    profileNameError.value = "请输入方案名称";
    return;
  }
  if (profiles.value.some((profile) => profile.name === name)) {
    profileNameError.value = "方案名称已存在，请修改后再保存";
    return;
  }
  const profile = {
    id: `profile-${Date.now()}`,
    name,
    enabledRuleIds: [...store.repairSettings.enabledRuleIds],
    sectionNumberStartLevel: store.repairSettings.sectionNumberStartLevel,
    sectionNumberEndLevel: store.repairSettings.sectionNumberEndLevel,
  };
  profiles.value.push(profile);
  activeProfileId.value = profile.id;
  persistProfiles();
  profileDialogOpen.value = false;
}
function deleteProfile() {
  const profile = profiles.value.find(
    (item) => item.id === activeProfileId.value,
  );
  if (!profile || profile.builtIn) return;
  profiles.value = profiles.value.filter((item) => item.id !== profile.id);
  activateProfile("default");
  persistProfiles();
}
function toggleRule(id: string, checked: boolean) {
  const ids = new Set(store.repairSettings.enabledRuleIds);
  checked ? ids.add(id) : ids.delete(id);
  if (checked)
    mutuallyExclusiveRules
      .filter((group) => group.includes(id as never))
      .forEach((group) =>
        group.filter((item) => item !== id).forEach((item) => ids.delete(item)),
      );
  store.updateRepairSettings({
    ...store.repairSettings,
    enabledRuleIds: [...ids],
  });
  const profile = profiles.value.find(
    (item) => item.id === activeProfileId.value,
  );
  if (profile && !profile.builtIn) {
    profile.enabledRuleIds = [...ids];
    persistProfiles();
  }
  refreshAutomatic();
}
function isExclusiveRule(id: string) {
  return mutuallyExclusiveRules.some((group) => group.includes(id as never));
}
function exclusivePeerLabel(id: string) {
  const group = mutuallyExclusiveRules.find((items) =>
    items.includes(id as never),
  );
  return group
    ? repairRules.find((rule) => rule.id === group.find((item) => item !== id))
        ?.label
    : "";
}
function setSectionNumberRange(startValue: string, endValue: string) {
  const start = startValue.trim() ? Number(startValue) : 1;
  const end = endValue.trim() ? Number(endValue) : null;
  store.updateRepairSettings({
    ...store.repairSettings,
    sectionNumberStartLevel: start,
    sectionNumberEndLevel: end,
  });
  refreshAutomatic();
}
function requestFullNumbering() {
  pendingFullNumbering.value = true;
  menu.value = null;
}
function confirmFullNumbering() {
  pendingFullNumbering.value = false;
  const plan = store.buildRepairPlan("document", {
    kind: "rule",
    id: "section-auto-number",
  });
  currentPlan.value = plan;
  selectedPlanIds.value = plan.candidates.map((item) => item.id);
  selectCenter("repair");
}
function selectSection(id: string) {
  const section = store.sections.find((item) => item.id === id);
  if (!section) return;
  store.selectedSectionId = id;
  jump(section.headingFrom, section.headingTo);
}
function toggleSection(id: string) {
  const next = new Set(collapsedSections.value);
  next.has(id) ? next.delete(id) : next.add(id);
  collapsedSections.value = next;
}
function openSectionContext(id: string, event: MouseEvent) {
  store.selectedSectionId = id;
  context.value = { id, x: event.clientX, y: event.clientY };
}
function collapseAllSections() { collapsedSections.value = new Set(store.sections.filter(section => section.children.length).map(section => section.id)); }
function expandAllSections() { collapsedSections.value = new Set(); }
function collapseAllIssues() {
  expandedIssueCategories.value = Object.fromEntries(categories.map(category => [category, false]));
  expandedIssueRules.value = Object.fromEntries(repairRules.map(rule => [rule.id, false]));
}
function expandAllIssues() {
  expandedIssueCategories.value = Object.fromEntries(categories.map(category => [category, true]));
  expandedIssueRules.value = Object.fromEntries(repairRules.map(rule => [rule.id, true]));
}
function openIssueContext(event: MouseEvent) { issueContext.value = { x: event.clientX, y: event.clientY }; }
function visibleScrollingSection(id: string): string {
  let section = store.sections.find(item => item.id === id);
  while (section?.parentId) {
    const parent = store.sections.find(item => item.id === section!.parentId);
    if (!parent) break;
    if (collapsedSections.value.has(parent.id)) return parent.id;
    section = parent;
  }
  return id;
}
function revealScrollingSection(id: string) {
  nextTick(() => document.querySelector<HTMLElement>(`[data-section-row-id="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
}
watch(scrollingSectionId, (id) => { if (id && sideTab.value === "sections") revealScrollingSection(id); });
watch(sideTab, (tab) => { if (tab === "sections" && scrollingSectionId.value) revealScrollingSection(scrollingSectionId.value); });
function toggleIssueCategory(category: RepairCategory) {
  expandedIssueCategories.value[category] =
    !expandedIssueCategories.value[category];
}
function toggleIssueRule(id: string) {
  expandedIssueRules.value[id] = !expandedIssueRules.value[id];
}
function refreshAutomatic() {
  currentPlan.value = store.buildRepairPlan("document", { kind: "automatic" });
  selectedPlanIds.value = currentPlan.value.candidates.map((item) => item.id);
}
watch(
  () => store.text,
  () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshAutomatic, 180);
    if (centerTab.value === "source") lastPreview.value = "source";
  },
);
function schedulePreviewRefresh() {
  window.clearTimeout(previewTimer);
  if (rightCollapsed.value) return;
  previewTimer = window.setTimeout(() => {
    renderedPreviewText.value = previewSource.value;
  }, 300);
}
watch(previewSource, schedulePreviewRefresh);
watch(rightCollapsed, (collapsed) => {
  window.clearTimeout(previewTimer);
  // The component is absent while collapsed. On reopening, render the latest
  // document once instead of replaying work that accumulated while hidden.
  if (!collapsed) renderedPreviewText.value = previewSource.value;
});
function scrollDiffToLine(line: number) {
  const root = diffRoot.value;
  if (!root) return;
  const rows = [...root.querySelectorAll<HTMLElement>("[data-source-line]")];
  const target = rows.find((row) => Number(row.dataset.sourceLine) >= line) ?? rows.at(-1);
  if (target) root.scrollTop = Math.max(0, target.offsetTop - root.clientHeight / 2 + target.offsetHeight / 2);
}
function restoreCenterPosition(tab: "source" | "repair" | "diff") {
  const { line } = centerScroll.value;
  nextTick(() => {
    if (tab === "source") {
      sourceEditor.value?.scrollToLine(line);
    } else if (tab === "repair") {
      repairEditor.value?.scrollToLine(line);
    }
    else scrollDiffToLine(line);
  });
}
function selectCenter(tab: "source" | "repair" | "diff") {
  centerTab.value = tab;
  if (tab !== "diff") lastPreview.value = tab;
  restoreCenterPosition(tab);
}
function syncScroll(ratio: number, sourceLine?: number) {
  if (sourceLine !== undefined) {
    centerScroll.value = { ratio, line: sourceLine };
    const offset = store.text.split("\n").slice(0, Math.max(0, sourceLine - 1)).join("\n").length;
    const sectionId = store.sections.filter(section => section.headingFrom <= offset).at(-1)?.id;
    scrollingSectionId.value = sectionId ? visibleScrollingSection(sectionId) : undefined;
  }
  preview.value?.setScrollPosition(ratio, sourceLine);
}
function onDiffScroll() {
  const el = diffRoot.value;
  if (!el) return;
  const viewportMiddle = el.scrollTop + el.clientHeight / 2;
  const first = [...el.querySelectorAll<HTMLElement>("[data-source-line]")].find(item => item.offsetTop + item.offsetHeight > viewportMiddle);
  syncScroll(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight), first ? Number(first.dataset.sourceLine) : undefined);
}
function jump(from: number, to = from + 1) {
  selectCenter("source");
  requestAnimationFrame(() => sourceEditor.value?.highlightRange(from, to));
}
function run(label: string, edits: ReturnType<typeof promoteSection>) {
  try {
    store.run(label, edits);
    status.value = `${label}已应用`;
  } catch (error) {
    status.value = error instanceof Error ? error.message : "操作失败";
  }
}
function startManual(target: RepairTarget) {
  const hasSelection = store.selection.from !== store.selection.to;
  const full = store.buildRepairPlan("document", target);
  if (!hasSelection) {
    currentPlan.value = full;
    selectedPlanIds.value = full.candidates.map((item) => item.id);
    selectCenter("repair");
    menu.value = null;
    return;
  }
  pendingManual.value = {
    selection: store.buildRepairPlan("selection", target),
    full,
  };
  menu.value = null;
}
function resolveManual(mode: "selection" | "all") {
  const plan =
    mode === "selection"
      ? pendingManual.value!.selection
      : pendingManual.value!.full;
  pendingManual.value = undefined;
  currentPlan.value = plan;
  selectedPlanIds.value = plan.candidates.map((item) => item.id);
  selectCenter("repair");
}
function applyPlan() {
  try {
    store.applyRepairPlan(
      currentPlan.value,
      selectedPlanIds.value,
      "应用修复预览",
    );
    status.value = "已应用修复，可一次撤销";
    refreshAutomatic();
    selectCenter("source");
  } catch (error) {
    status.value = error instanceof Error ? error.message : "修复失败";
  }
}
function oneClick() {
  refreshAutomatic();
  selectCenter("repair");
}
function undo() {
  store.undo();
  status.value = "已撤销";
}
function redo() {
  store.redo();
  status.value = "已重做";
}
function undoTo(at: number) {
  store.undoTo(at);
  status.value = "已撤销到指定历史";
  menu.value = null;
}
async function saveDocument(copy = false): Promise<boolean> {
  try {
    const path =
      copy || !store.filePath
        ? await chooseSavePath(store.filePath ?? store.fileName)
        : store.filePath;
    if (!path) return false;
    await writeMarkdown(path, store.text);
    if (!copy) store.markSaved(path, fileNameFromPath(path));
    status.value = copy ? "已另存为" : "已保存";
    return true;
  } catch (error) {
    status.value = error instanceof Error ? error.message : "保存失败";
    return false;
  }
}
async function resolveUnsaved(): Promise<boolean> {
  if (!store.dirty) return true;
  const result = String(
    await message("当前文档有未保存修改。", {
      title: "保存修改？",
      kind: "warning",
      buttons: { yes: "保存", no: "放弃", cancel: "取消" },
    }),
  );
  // Custom dialog buttons return their displayed label on Windows, rather than
  // the internal `yes` / `no` identifiers used by the default dialog buttons.
  if (result === "保存" || result.toLowerCase() === "yes") return saveDocument();
  return result === "放弃" || result.toLowerCase() === "no";
}
async function newDocument() {
  if (await resolveUnsaved()) store.loadDocument("");
}
async function openDocument() {
  const path = await chooseMarkdownFile();
  if (path) await openPath(path);
}
async function openPath(path: string, confirmUnsaved = true) {
  if (!isSupportedTextPath(path)) {
    const detail = `不支持的文件格式：${fileNameFromPath(path)}`;
    status.value = detail;
    if (isDesktopApp()) await message(detail, { title: "无法打开文件", kind: "error" });
    return;
  }
  if (confirmUnsaved && !(await resolveUnsaved())) return;
  try {
    store.loadDocument(await readMarkdown(path), {
      filePath: path,
      fileName: fileNameFromPath(path),
    });
    status.value = `已打开 ${fileNameFromPath(path)}`;
  } catch (error) { status.value = error instanceof Error ? `无法作为文本打开：${error.message}` : "不支持或无法打开该文件"; }
}
async function openStartupPath(path: string) {
  if (!isSupportedTextPath(path)) return openPath(path, false);
  try {
    store.loadDocument(await readStartupText(path), { filePath: path, fileName: fileNameFromPath(path) });
    status.value = `已打开 ${fileNameFromPath(path)}`;
  } catch (error) { status.value = error instanceof Error ? `无法作为文本打开：${error.message}` : "不支持或无法打开该文件"; }
}
function sectionAction(action: string) {
  const id = context.value?.id;
  if (!id) return;
  if (action === "promote") run("提升章节", promoteSection(store.text, id));
  if (action === "demote") run("降级章节", demoteSection(store.text, id));
  if (action === "plus") run("编号加一", shiftSectionNumber(store.text, id, 1));
  if (action === "minus")
    run("编号减一", shiftSectionNumber(store.text, id, -1));
  if (action === "delete") run("删除章节", deleteSection(store.text, id));
  context.value = undefined;
}
let stopSectionPointerDrag: (() => void) | undefined;
let sectionPointerDrag: { id: string; pointerId: number; x: number; y: number; active: boolean } | undefined;
function startSectionPointerDrag(id: string, event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  stopSectionPointerDrag?.();
  sectionPointerDrag = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
  const onMove = (next: PointerEvent) => {
    if (!sectionPointerDrag || next.pointerId !== sectionPointerDrag.pointerId) return;
    const distance = Math.hypot(next.clientX - sectionPointerDrag.x, next.clientY - sectionPointerDrag.y);
    if (distance < 5) return;
    sectionPointerDrag.active = true;
    dragging.value = id;
    const target = document.elementFromPoint(next.clientX, next.clientY)?.closest<HTMLElement>("[data-section-id]");
    dragOverSectionId.value = target?.dataset.sectionId;
    next.preventDefault();
  };
  const finish = (next: PointerEvent) => {
    if (!sectionPointerDrag || next.pointerId !== sectionPointerDrag.pointerId) return;
    const target = document.elementFromPoint(next.clientX, next.clientY)?.closest<HTMLElement>("[data-section-id]");
    const targetId = target?.dataset.sectionId;
    const wasDragging = sectionPointerDrag.active;
    stopSectionPointerDrag?.();
    if (wasDragging && targetId) dropSection(targetId);
  };
  stopSectionPointerDrag = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", finish); sectionPointerDrag = undefined; if (!dragging.value) dragOverSectionId.value = undefined; };
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", finish);
}
function dropSection(targetId: string) {
  if (!dragging.value || dragging.value === targetId) return;
  run(
    "拖拽调整章节并重编号",
    moveSectionBefore(store.text, dragging.value, targetId),
  );
  dragging.value = undefined;
  dragOverSectionId.value = undefined;
}
async function sourceClipboard(action: "copy" | "paste" | "cut") {
  try {
    await sourceEditor.value?.[action === "copy" ? "copySelection" : action === "paste" ? "pasteClipboard" : "cutSelection"]();
    status.value = action === "copy" ? "已复制" : action === "paste" ? "已粘贴" : "已剪切";
  } catch (error) { status.value = error instanceof Error ? `剪贴板操作失败：${error.message}` : "剪贴板操作失败"; }
  sourceContext.value = undefined;
}
function startSourceRule(id: string) { sourceContext.value = undefined; startManual({ kind: "rule", id }); }
function contextPosition(x: number, y: number): ContextPosition {
  const menuWidth = 170; const menuHeight = 178;
  return { x: Math.max(6, Math.min(x, window.innerWidth - menuWidth - 6)), y: Math.max(6, Math.min(y, window.innerHeight - menuHeight - 6)), opensLeft: x > window.innerWidth - 430, opensUp: y > window.innerHeight - 320 };
}
function openSourceContext(x: number, y: number) { sourceContext.value = contextPosition(x, y); }
function openReadonlyContext(kind: "repair" | "diff" | "preview", x: number, y: number) { readonlyContext.value = { kind, ...contextPosition(x, y) }; }
async function copyReadonly() {
  try {
    if (readonlyContext.value?.kind === "repair") await repairEditor.value?.copySelection();
    else await navigator.clipboard.writeText(window.getSelection()?.toString() ?? "");
    status.value = "已复制";
  } catch (error) { status.value = error instanceof Error ? `复制失败：${error.message}` : "复制失败"; }
  readonlyContext.value = undefined;
}
onBeforeUnmount(() => {
  window.clearTimeout(refreshTimer);
  window.clearTimeout(previewTimer);
  stopSectionPointerDrag?.();
});
let unlistenClose: (() => void) | undefined; let unlistenDrop: (() => void) | undefined;
onMounted(async () => {
  if (!isDesktopApp()) return;
  const window = getCurrentWindow();
  unlistenClose = await window.onCloseRequested(async event => {
    // Always claim the native request synchronously. On Windows, allowing it
    // through after an async dialog can leave the webview process alive.
    event.preventDefault();
    if (await resolveUnsaved()) await invoke("exit_app");
  });
  unlistenDrop = await window.onDragDropEvent(async event => { if (event.payload.type === "drop") await openPath(event.payload.paths[0]); });
  const paths = await invoke<string[]>("startup_paths");
  if (paths[0]) await openStartupPath(paths[0]);
});
onBeforeUnmount(() => { unlistenClose?.(); unlistenDrop?.(); });
</script>
<template>
  <main
    class="app"
    :data-theme="theme"
    @click="
      menu = null;
      context = undefined;
      issueContext = undefined;
      sourceContext = undefined;
      readonlyContext = undefined;
    "
  >
    <header class="menubar" @click.stop>
      <div class="menus">
        <div class="menu-anchor">
          <button
            title="新建、打开或保存 Markdown 文件"
            @click="menu = menu === 'file' ? null : 'file'"
          >
            文件
          </button>
          <div v-if="menu === 'file'" class="dropdown">
            <button title="新建空白 Markdown 文档" @click="newDocument">
              新建</button
            ><button title="打开本地 Markdown 文件" @click="openDocument">
              打开</button
            ><button title="保存当前文档" @click="saveDocument()">保存</button
            ><button title="选择新位置保存当前文档" @click="saveDocument(true)">
              另存为
            </button>
          </div>
        </div>
        <div class="menu-anchor">
          <button
            title="选择并预览公式修复规则"
            @click="menu = menu === 'formula' ? null : 'formula'"
          >
            公式修复
          </button>
          <div
            v-if="menu === 'formula'"
            class="dropdown repair-menu single-menu"
          >
            <section>
              <button
                v-for="rule in rulesForCategory('formula')"
                :key="rule.id"
                :title="ruleDescriptions[rule.id]"
                @click="startManual({ kind: 'rule', id: rule.id })"
              >
                {{ rule.label }}
              </button>
            </section>
          </div>
        </div>
        <div class="menu-anchor">
          <button
            title="选择并预览其他修复规则"
            @click="menu = menu === 'other' ? null : 'other'"
          >
            其他修复
          </button>
          <div v-if="menu === 'other'" class="dropdown repair-menu other-menu">
            <section
              v-for="category in categories.filter(
                (category) => category !== 'formula',
              )"
              :key="category"
            >
              <strong>{{ categoryLabels[category] }}</strong
              ><button
                v-for="rule in rulesForCategory(category)"
                :key="rule.id"
                :title="ruleDescriptions[rule.id]"
                @click="
                  rule.id === 'section-auto-number'
                    ? requestFullNumbering()
                    : startManual({ kind: 'rule', id: rule.id })
                "
              >
                {{ rule.label }}
              </button>
            </section>
          </div>
        </div>
        <button title="配置一键修复规则与规则方案" @click="settingsOpen = true">
          设置</button
        ><button
          class="accent"
          title="生成当前规则的全文修复预览"
          @click="oneClick"
        >
          一键修复预览
        </button>
        <div class="history-anchor undo-group">
          <button
            class="icon-button"
            title="撤销"
            aria-label="撤销"
            @click="undo"
            :disabled="!store.history.canUndo"
          >
            <svg viewBox="0 0 24 24">
              <path d="M9 7 4 12l5 5M5 12h9a5 5 0 0 1 0 10h-1" />
            </svg></button
          ><button
            class="undo-chevron"
            aria-label="操作历史"
            title="打开撤销历史"
            @click="menu = menu === 'history' ? null : 'history'"
          >
            ⌄
          </button>
          <div v-if="menu === 'history'" class="dropdown history-menu">
            <p>撤销至历史操作</p>
            <div class="history-list">
              <button
                v-for="entry in store.history.list()"
                :key="entry.at"
                @click="undoTo(entry.at)"
              >
                {{ entry.label }}</button
              ><span v-if="!store.history.list().length">暂无可撤销操作</span>
            </div>
          </div>
        </div><button
          class="icon-button"
          title="重做"
          aria-label="重做"
          @click="redo"
          :disabled="!store.history.canRedo"
        >
          <svg viewBox="0 0 24 24">
            <path d="M19 8V4l-3 3a7 7 0 1 0 2.1 8.2" />
            <path d="M16 4h3v3" />
          </svg>
        </button><span class="file-name" :class="{ dirty: store.dirty }">{{ store.fileName }}{{ store.dirty ? " •" : "" }}</span>
      </div>
      <div class="menu-status">
        <span class="status-text">{{ status }}</span>
        <button
          class="icon-button theme-toggle"
          :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
          :aria-label="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
          @click="toggleTheme"
        >
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            /></svg
          ><svg v-else viewBox="0 0 24 24">
            <path
              d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"
            />
          </svg>
        </button>
      </div>
    </header>
    <section class="workspace" :style="workspaceStyle">
      <aside class="left" :class="{ collapsed: leftCollapsed }">
        <template v-if="!leftCollapsed"
          ><nav>
            <button
              :class="{ active: sideTab === 'sections' }"
              @click="sideTab = 'sections'"
            >
              章节</button
            ><button
              :class="{ active: sideTab === 'issues' }"
              @click="sideTab = 'issues'"
            >
              修复项 <b>{{ issues.length }}</b></button
            ><button
              class="collapse-button"
              title="折叠左栏"
              @click="leftCollapsed = true"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m14 5-7 7 7 7" />
              </svg>
            </button>
          </nav>
          <div v-if="sideTab === 'sections'" class="side-list">
            <div
              v-for="section in sectionRows"
              :key="section.id"
              class="section-row"
              :data-section-row-id="section.id"
              :class="{
                active: store.selectedSectionId === section.id,
                scrolling: scrollingSectionId === section.id && store.selectedSectionId !== section.id,
                dragging: dragging === section.id,
                'drag-over':
                  dragOverSectionId === section.id && dragging !== section.id,
              }"
              :style="{ paddingLeft: `${(section.level - 1) * 16 + 4}px` }"
            >
              <button
                v-if="section.children.length"
                class="tree-toggle"
                :aria-label="
                  collapsedSections.has(section.id)
                    ? '展开子章节'
                    : '折叠子章节'
                "
                @click.stop="toggleSection(section.id)"
              >
                <svg
                  viewBox="0 0 24 24"
                  :class="{ rotated: !collapsedSections.has(section.id) }"
                >
                  <path d="m9 5 7 7-7 7" />
                </svg></button
              ><span v-else class="tree-spacer" />
              <button
                class="section-button"
                :data-section-id="section.id"
                @pointerdown.prevent="startSectionPointerDrag(section.id, $event)"
                @click="selectSection(section.id)"
                @contextmenu.prevent="openSectionContext(section.id, $event)"
              >
                {{ section.numberParts?.join(".")
                }}{{ section.numberParts ? " " : "" }}{{ section.title }}
              </button>
            </div>
          </div>
          <div v-else class="side-list issue-tree" @contextmenu.prevent="openIssueContext($event)">
            <section
              v-for="group in issueGroups"
              :key="group.category"
              class="issue-category"
            >
              <button
                class="issue-tree-toggle"
                :title="`${categoryLabels[group.category]}：${group.rules.length} 条规则`"
                @click="toggleIssueCategory(group.category)"
              >
                <svg
                  viewBox="0 0 24 24"
                  :class="{
                    rotated: expandedIssueCategories[group.category] !== false,
                  }"
                >
                  <path d="m9 5 7 7-7 7" /></svg
                ><strong>{{ categoryLabels[group.category] }}</strong
                ><small>{{ group.rules.length }}</small>
              </button>
              <div v-if="expandedIssueCategories[group.category] !== false">
                <div
                  v-for="ruleGroup in group.rules"
                  :key="ruleGroup.rule.id"
                  class="issue-rule"
                >
                  <button
                    class="issue-tree-toggle"
                    :title="ruleDescriptions[ruleGroup.rule.id]"
                    @click="toggleIssueRule(ruleGroup.rule.id)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      :class="{
                        rotated:
                          expandedIssueRules[ruleGroup.rule.id] !== false,
                      }"
                    >
                      <path d="m9 5 7 7-7 7" /></svg
                    ><span>{{ ruleGroup.rule.label }}</span
                    ><small>{{ ruleGroup.items.length }}</small>
                  </button>
                  <button
                    v-for="item in expandedIssueRules[ruleGroup.rule.id] ===
                    false
                      ? []
                      : ruleGroup.items"
                    :key="item.id"
                    class="issue-content"
                    :title="ruleDescriptions[item.ruleId]"
                    @click="jump(item.from, item.to)"
                  >
                    {{ item.originalText.replace(/\s+/g, " ").trim() }}
                  </button>
                </div>
              </div>
            </section>
            <p v-if="!issues.length">当前方案未发现可修复项</p>
          </div></template
        ><button
          v-else
          class="expand-rail"
          title="展开左栏"
          @click="leftCollapsed = false"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m10 5 7 7-7 7" />
          </svg>
        </button>
      </aside>
      <div
        v-if="!leftCollapsed"
        class="resizer left-resizer"
        :style="{ left: `${leftWidth}px` }"
        @pointerdown.prevent="startResize('left', $event)"
      />
      <section class="center">
        <nav>
          <button
            :class="{ active: centerTab === 'source' }"
            @click="selectCenter('source')"
          >
            源码</button
          ><button
            :class="{ active: centerTab === 'repair' }"
            @click="selectCenter('repair')"
          >
            修复预览</button
          ><button
            :class="{ active: centerTab === 'diff' }"
            @click="selectCenter('diff')"
          >
            差异</button
          ><button
            v-if="centerTab === 'repair'"
            class="apply"
            :disabled="!selectedPlanIds.length"
            @click="applyPlan"
          >
            {{ repairPreviewLabel }} · 应用预览（{{ selectedPlanIds.length }}）
          </button>
        </nav>
        <MarkdownEditor
          v-show="centerTab === 'source'"
          ref="sourceEditor"
          :model-value="store.text"
          @update:model-value="store.replace"
          @selection-change="(from, to) => store.setSelection({ from, to })"
          @scroll="syncScroll"
          @undo="undo"
          @redo="redo"
          @save="saveDocument()"
          @context-menu="openSourceContext"
        /><MarkdownEditor
          v-show="centerTab === 'repair'"
          ref="repairEditor"
          :model-value="repairText"
          readonly
          @scroll="syncScroll"
          @context-menu="(x, y) => openReadonlyContext('repair', x, y)"
        />
        <article v-show="centerTab === 'diff'" ref="diffRoot" class="diff" @scroll="onDiffScroll" @contextmenu.prevent="openReadonlyContext('diff', $event.clientX, $event.clientY)">
          <pre
            v-for="(part, index) in diffs"
            :key="index"
            :class="{ added: part.added, removed: part.removed }"
            :data-source-line="part.sourceLine"
            >{{ part.value }}</pre
          >
        </article>
      </section>
      <div
        v-if="!rightCollapsed"
        class="resizer right-resizer"
        :style="{ right: `${rightWidth}px` }"
        @pointerdown.prevent="startResize('right', $event)"
      />
      <aside class="right" :class="{ collapsed: rightCollapsed }">
        <template v-if="!rightCollapsed"
          ><p class="title">
            预览
            <button
              class="collapse-button"
              title="折叠预览"
              @click="rightCollapsed = true"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m10 5 7 7-7 7" />
              </svg>
            </button>
          </p>
          <MarkdownPreview ref="preview" :model-value="renderedPreviewText" @context-menu="(x, y) => openReadonlyContext('preview', x, y)" /></template
        ><button
          v-else
          class="expand-rail"
          title="展开预览"
          @click="rightCollapsed = false"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14 5-7 7 7 7" />
          </svg>
        </button>
      </aside>
    </section>
    <div
      v-if="sourceContext"
      class="context source-context"
      :class="{ 'opens-left': sourceContext.opensLeft, 'opens-up': sourceContext.opensUp }"
      :style="{ left: `${sourceContext.x}px`, top: `${sourceContext.y}px` }"
      @click.stop
    >
      <button @click="sourceClipboard('copy')">复制</button>
      <button @click="sourceClipboard('paste')">粘贴</button>
      <button @click="sourceClipboard('cut')">剪切</button>
      <div class="context-submenu">
        <button>公式修复 <span>›</span></button>
        <div class="context-submenu-panel">
          <button v-for="rule in rulesForCategory('formula')" :key="rule.id" :title="ruleDescriptions[rule.id]" @click="startSourceRule(rule.id)">{{ rule.label }}</button>
        </div>
      </div>
      <div class="context-submenu">
        <button>其他修复 <span>›</span></button>
        <div class="context-submenu-panel">
          <template v-for="category in categories.filter(category => category !== 'formula')" :key="category">
            <strong>{{ categoryLabels[category] }}</strong>
            <button v-for="rule in rulesForCategory(category)" :key="rule.id" :title="ruleDescriptions[rule.id]" @click="rule.id === 'section-auto-number' ? (sourceContext = undefined, requestFullNumbering()) : startSourceRule(rule.id)">{{ rule.label }}</button>
          </template>
        </div>
      </div>
    </div>
    <div v-if="readonlyContext" class="context readonly-context" :style="{ left: `${readonlyContext.x}px`, top: `${readonlyContext.y}px` }" @click.stop>
      <button @click="copyReadonly">复制</button>
    </div>
    <div
      v-if="context"
      class="context"
      :style="{ left: `${context.x}px`, top: `${context.y}px` }"
      @click.stop
    >
      <button @click="sectionAction('promote')">提升章节</button
      ><button @click="sectionAction('demote')">降级章节</button
      ><button @click="sectionAction('plus')">编号 +1</button
      ><button @click="sectionAction('minus')">编号 −1</button
      ><button
        @click="
          run(
            '重排选中章节所有编号', numberSectionBranch(store.text, context!.id, true),
          );
          context = undefined;
        "
      >
        重排所有编号</button
      ><button
        @click="
          run('重排选中章节已有编号', numberSectionBranch(store.text, context!.id, false));
          context = undefined;
        "
      >
        重排已有编号</button
      ><button @click="sectionAction('delete')">删除章节</button>
      ><button @click="collapseAllSections(); context = undefined">全部折叠</button
      ><button @click="expandAllSections(); context = undefined">全部展开</button>
    </div>
    <div
      v-if="issueContext"
      class="context"
      :style="{ left: `${issueContext.x}px`, top: `${issueContext.y}px` }"
      @click.stop
    >
      <button @click="collapseAllIssues(); issueContext = undefined">全部折叠</button
      ><button @click="expandAllIssues(); issueContext = undefined">全部展开</button>
    </div>
    <div v-if="pendingManual" class="modal">
      <section>
        <h3>检测到选区</h3>
        <p>是否只修复选区，还是将相同规则应用到剩余区域？</p>
        <div class="modal-actions">
          <button @click="pendingManual = undefined">取消</button
          ><button @click="resolveManual('selection')">仅修复选区</button
          ><button class="accent" @click="resolveManual('all')">
            选区和余区一起修复
          </button>
        </div>
      </section>
    </div>
    <div v-if="pendingFullNumbering" class="modal">
      <section>
        <h3>重排所有章节编号</h3>
        <p>填写标题级别范围，例如 1-、2- 或 2-4；留空的起始级别默认为 1。</p>
        <div class="numbering-choice">
          <input aria-label="编号起始级别" type="number" min="1" max="6" :value="store.repairSettings.sectionNumberStartLevel" @change="setSectionNumberRange(($event.target as HTMLInputElement).value, String(store.repairSettings.sectionNumberEndLevel ?? ''))" />
          <span>－</span>
          <input aria-label="编号结束级别" type="number" min="1" max="6" :value="store.repairSettings.sectionNumberEndLevel ?? ''" @change="setSectionNumberRange(String(store.repairSettings.sectionNumberStartLevel), ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="modal-actions">
          <button @click="pendingFullNumbering = false">取消</button
          ><button class="accent" @click="confirmFullNumbering">
            生成修复预览
          </button>
        </div>
      </section>
    </div>
    <div
      v-if="settingsOpen"
      class="modal settings-modal"
      @click.self="settingsOpen = false"
    >
      <section class="settings-shell">
        <button class="close" aria-label="关闭设置" @click="settingsOpen = false">×</button>
        <aside>
          <h3>设置</h3>
          <button class="active">一键修复规则</button>
        </aside>
        <div class="settings-content">
          <header>
            <h2>一键修复规则</h2>
            <span>在修复预览中实时为全文应用以下规则，并可一键修复。</span>
          </header>
          <section class="profile-section profile-section-top">
            <h3>规则方案</h3>
            <span>保存当前选项组合，便于在不同文档间切换。</span>
            <div class="profile-row">
              <select
                :value="activeProfileId"
                @change="
                  activateProfile(($event.target as HTMLSelectElement).value)
                "
              >
                <option
                  v-for="profile in profiles"
                  :key="profile.id"
                  :value="profile.id"
                >
                  {{ profile.name }}
                </option></select
              ><button class="accent" @click="openProfileDialog">
                保存为方案</button
              ><button
                @click="deleteProfile"
                :disabled="
                  profiles.find((profile) => profile.id === activeProfileId)
                    ?.builtIn
                "
              >
                删除
              </button>
            </div>
          </section>
          <section
            v-for="category in categories"
            :key="category"
            class="rule-category"
          >
            <button
              class="category-toggle"
              @click="
                expandedCategories[category] = !expandedCategories[category]
              "
            >
              <span>{{ expandedCategories[category] ? "⌄" : "›" }}</span
              ><strong>{{ categoryLabels[category] }}</strong
              ><small
                >{{
                  rulesForCategory(category).filter((rule) =>
                    store.repairSettings.enabledRuleIds.includes(rule.id),
                  ).length
                }}/{{ rulesForCategory(category).length }} 已启用</small
              >
            </button>
            <div v-if="expandedCategories[category]" class="rule-list">
              <template
                v-for="rule in rulesForCategory(category)"
                :key="rule.id"
                ><label
                  class="rule-setting"
                  :class="{ exclusive: isExclusiveRule(rule.id) }"
                  :title="ruleDescriptions[rule.id]"
                  ><input
                    type="checkbox"
                    :checked="
                      store.repairSettings.enabledRuleIds.includes(rule.id)
                    "
                    @change="
                      toggleRule(
                        rule.id,
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  /><span
                    ><strong>{{ rule.label }}</strong
                    ><small
                      >{{ ruleDescriptions[rule.id] }} 示例：{{
                        examples[rule.id]
                      }}</small
                    ><em v-if="isExclusiveRule(rule.id)" class="exclusive-link"
                      >互斥组 · 与「{{
                        exclusivePeerLabel(rule.id)
                      }}」二选一</em
                    ></span
                  ></label
                >
                <div
                  v-if="rule.id === 'section-auto-number'"
                  class="sub-setting"
                >
                  <span>重排标题级别范围</span><div class="range-inputs"><input aria-label="设置编号起始级别" type="number" min="1" max="6" :value="store.repairSettings.sectionNumberStartLevel" @change="setSectionNumberRange(($event.target as HTMLInputElement).value, String(store.repairSettings.sectionNumberEndLevel ?? ''))" /><span>－</span><input aria-label="设置编号结束级别" type="number" min="1" max="6" :value="store.repairSettings.sectionNumberEndLevel ?? ''" @change="setSectionNumberRange(String(store.repairSettings.sectionNumberStartLevel), ($event.target as HTMLInputElement).value)" /></div><small>示例：1- 重排全部标题；2- 从二级标题开始；2-4 仅重排二至四级标题；-4 等同于 1-4。</small>
                </div></template
              >
            </div>
          </section>
        </div>
      </section>
    </div>
    <div
      v-if="profileDialogOpen"
      class="modal"
      @click.self="profileDialogOpen = false"
    >
      <section class="profile-dialog">
        <h3>保存规则方案</h3>
        <p>为当前规则组合输入一个新的方案名。</p>
        <label
          >方案名称<input
            v-model="profileDraftName"
            aria-label="方案名称"
            @keydown.enter.prevent="saveProfile"
        /></label>
        <small v-if="profileNameError" class="form-error">{{
          profileNameError
        }}</small>
        <div class="modal-actions">
          <button @click="profileDialogOpen = false">取消</button
          ><button class="accent" @click="saveProfile">保存</button>
        </div>
      </section>
    </div>
  </main>
</template>
<style>
:root {
  font-family: "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  min-width: 860px;
}
button,
input,
select {
  font: inherit;
}
button {
  cursor: pointer;
}
.panel-loading {
  display: grid;
  height: 100%;
  min-height: 0;
  place-items: center;
  color: var(--muted);
  background: var(--panel);
}
.app {
  --bg: #071012;
  --bar: #0a1517;
  --panel: #0c1719;
  --editor: #10191c;
  --code: #142326;
  --text: #d5dfda;
  --muted: #78908c;
  --border: #294347;
  --border-strong: #466b65;
  --hover: #153032;
  --accent: #e6a845;
  --accent-ink: #17201d;
  --link: #78c7bf;
  --math: #f4e2ba;
  --cursor: #f7c96e;
  --jump-highlight: #6d55262e;
  --jump-highlight-strong: #f1b75b82;
  --jump-outline: #f1b75bb8;
  height: 100vh;
  display: grid;
  grid-template-rows: 44px 1fr;
  background: var(--bg);
  color: var(--text);
  color-scheme: dark;
  cursor: default;
  user-select: none;
}
.app[data-theme="light"] {
  --bg: #f1f4f2;
  --bar: #ffffff;
  --panel: #f8faf9;
  --editor: #ffffff;
  --code: #edf2ef;
  --text: #20302d;
  --muted: #637571;
  --border: #d5dfda;
  --border-strong: #a9bbb6;
  --hover: #e1ece7;
  --accent: #b67216;
  --accent-ink: #fff;
  --link: #087b73;
  --math: #503b19;
  --cursor: #155f59;
  --jump-highlight: #f3c36d54;
  --jump-highlight-strong: #f3c36d99;
  --jump-outline: #b67216b8;
  color-scheme: light;
}
.menubar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  background: var(--bar);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--muted);
}
.menus,
.menu-status {
  display: flex;
  align-items: center;
  gap: 4px;
}
.menu-anchor,
.history-anchor {
  position: relative;
  display: flex;
}
.menubar button,
.left button,
.right button,
.center nav button,
.context button,
.modal button {
  border: 0;
  background: transparent;
  color: inherit;
  padding: 7px 9px;
  border-radius: 5px;
}
.menubar button:hover:not(:disabled),
.left button:hover,
.right button:hover,
.center nav button:hover,
.context button:hover {
  background: var(--hover);
  color: var(--text);
}
.accent,
.apply {
  background: var(--accent) !important;
  color: var(--accent-ink) !important;
  font-weight: 700;
}
.icon-button {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  padding: 6px !important;
}
.icon-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.theme-toggle {
  margin-left: 7px;
}
.status-text {
  margin-left: 5px;
  color: var(--muted);
  white-space: nowrap;
}
.file-name {
  max-width: 180px;
  overflow: hidden;
  margin: 0 6px;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-name.dirty { color: var(--accent); font-weight: 600; }
.undo-group {
  align-items: stretch;
  height: 31px;
  border: 1px solid transparent;
  border-radius: 6px;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}
.undo-group:hover,
.undo-group:focus-within {
  border-color: var(--border-strong);
  background: var(--hover);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent);
}
.undo-group .icon-button,
.undo-chevron {
  height: 29px;
  border-radius: 4px !important;
}
.undo-chevron {
  display: grid;
  place-items: center;
  width: 22px;
  padding: 0 0 2px !important;
  font-size: 16px;
  line-height: 1;
  transform: translateY(-1px);
}
.dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: grid;
  min-width: 164px;
  padding: 6px;
  background: var(--bar);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  box-shadow: 0 14px 32px #0004;
}
.dropdown button {
  text-align: left;
}
.repair-menu {
  grid-template-columns: repeat(3, minmax(175px, 1fr));
  width: min(640px, calc(100vw - 36px));
}
.repair-menu section {
  display: grid;
  gap: 2px;
  padding: 7px;
  border-right: 1px solid var(--border);
}
.repair-menu section:last-child {
  border: 0;
}
.repair-menu strong {
  padding: 5px 8px;
  color: var(--accent);
  font-size: 12px;
}
.repair-menu.single-menu {
  grid-template-columns: minmax(235px, 1fr);
  width: min(325px, calc(100vw - 36px));
}
.repair-menu.other-menu {
  grid-template-columns: minmax(235px, 1fr);
  width: min(315px, calc(100vw - 36px));
}
.repair-menu.other-menu section {
  border-right: 0;
  border-bottom: 1px solid var(--border);
}
.repair-menu.other-menu section:last-child {
  border-bottom: 0;
}
.history-menu {
  left: auto;
  right: 0;
  width: 250px;
}
.history-menu p {
  margin: 5px 8px 7px;
  color: var(--muted);
  font-size: 12px;
}
.history-list {
  display: grid;
  overflow-y: auto;
  max-height: 238px;
}
.history-list span {
  padding: 9px;
  color: var(--muted);
  font-size: 12px;
}
.workspace {
  min-height: 0;
  display: grid;
  position: relative;
}
.left,
.right {
  min-width: 0;
  min-height: 0;
  background: var(--panel);
}
.left {
  border-right: 1px solid var(--border);
}
.right {
  border-left: 1px solid var(--border);
}
.left nav,
.center nav {
  display: flex;
  align-items: center;
  height: 43px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
}
.left nav button,
.center nav button {
  color: var(--muted);
}
.left nav .active,
.center nav .active {
  color: var(--accent);
  box-shadow: inset 0 -2px var(--accent);
  border-radius: 0;
}
.left b {
  color: var(--accent);
}
.collapse-button {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 7px !important;
  color: var(--muted);
}
.collapse-button svg,
.expand-rail svg,
.tree-toggle svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.side-list {
  overflow: auto;
  height: calc(100% - 43px);
  padding: 8px;
}
.side-list button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px;
}
.section-row {
  position: relative;
  display: flex;
  align-items: stretch;
  min-height: 34px;
  transition:
    transform 180ms ease,
    opacity 180ms ease,
    background 180ms ease;
}
.section-row.dragging {
  opacity: 0.48;
  transform: scale(0.985);
}
.section-row.drag-over::before {
  content: "";
  position: absolute;
  z-index: 2;
  top: -2px;
  left: 8px;
  right: 8px;
  height: 2px;
  background: var(--accent);
  border-radius: 999px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
  animation: drop-line 180ms ease-out;
}
@keyframes drop-line {
  from {
    transform: scaleX(0.35);
    opacity: 0.25;
  }
  to {
    transform: scaleX(1);
    opacity: 1;
  }
}
.tree-toggle,
.tree-spacer {
  flex: 0 0 20px;
  width: 20px;
  display: grid;
  place-items: center;
  padding: 0 !important;
  color: var(--muted);
}
.tree-toggle svg {
  width: 16px;
  height: 16px;
  transition: transform 180ms ease;
}
.tree-toggle svg.rotated {
  transform: rotate(90deg);
}
.section-button {
  flex: 1;
  min-width: 0;
}
.section-row.active .section-button {
  background: var(--hover);
  color: var(--accent);
  box-shadow: inset 2px 0 var(--accent);
}
.section-row.scrolling .section-button { color: var(--accent); font-weight: 700; }
.side-list small {
  display: block;
  color: var(--muted);
}
.side-list p {
  color: var(--muted);
  text-align: center;
}
.issue-tree {
  padding: 7px 6px;
}
.issue-category {
  margin: 2px 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.issue-rule + .issue-rule {
  border-top: 1px solid var(--border);
}
.issue-tree-toggle {
  display: flex !important;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  color: var(--muted);
}
.issue-tree-toggle svg {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 180ms ease;
}
.issue-tree-toggle svg.rotated {
  transform: rotate(90deg);
}
.issue-tree-toggle strong {
  color: var(--text);
}
.issue-tree-toggle small {
  margin-left: auto;
  color: var(--accent);
}
.issue-rule > .issue-tree-toggle {
  padding-left: 18px !important;
  font-size: 12px;
}
.issue-content {
  display: block !important;
  width: calc(100% - 25px) !important;
  margin-left: 25px;
  overflow: hidden;
  padding-top: 5px !important;
  padding-bottom: 5px !important;
  color: var(--muted) !important;
  font:
    11px/1.4 "Cascadia Code",
    "Sarasa Mono SC",
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.issue-content:hover {
  color: var(--text) !important;
}
.center {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 43px 1fr;
}
.center nav .apply {
  margin-left: auto;
}
.right {
  display: grid;
  grid-template-rows: 43px 1fr;
}
.title {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--accent);
  font-size: 12px;
}
.resizer {
  position: absolute;
  z-index: 10;
  width: 9px;
  height: 100%;
  cursor: col-resize;
}
.resizer::after {
  content: "";
  position: absolute;
  left: 4px;
  height: 100%;
  border-left: 1px solid transparent;
}
.resizer:hover::after {
  border-color: var(--accent);
}
.left-resizer {
  transform: translateX(-4px);
}
.right-resizer {
  transform: translateX(4px);
}
.expand-rail {
  width: 100%;
  height: 43px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bar);
  color: var(--muted);
  font-size: 20px;
  line-height: 1;
}
.expand-rail svg {
  width: 22px;
  height: 22px;
}
.expand-rail:hover {
  background: var(--hover);
  color: var(--accent);
}
.expand-rail:focus {
  outline: none;
}
.collapsed {
  overflow: hidden;
}
.editor,
.diff,
.preview {
  user-select: text;
}
.diff {
  overflow: auto;
  padding: 20px;
  background: var(--editor);
}
.diff pre {
  white-space: pre-wrap;
  margin: 0;
  padding: 4px 8px;
  font:
    13px/1.55 "Cascadia Code",
    monospace;
}
.diff .added {
  background: #1c5a4333;
}
.diff .removed {
  background: #b14a4a33;
  text-decoration: line-through;
}
.context {
  position: fixed;
  z-index: 30;
  display: grid;
  background: var(--bar);
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  box-shadow: 0 10px 28px #0005;
  padding: 5px;
}
.context button {
  text-align: left;
}
.source-context { min-width: 148px; }
.context-submenu { position: relative; }
.context-submenu > button { display: flex; justify-content: space-between; width: 100%; gap: 18px; }
.context-submenu-panel {
  position: absolute;
  z-index: 1;
  top: -5px;
  left: calc(100% + 5px);
  display: none;
  min-width: 220px;
  max-height: min(70vh, 480px);
  overflow: auto;
  padding: 5px;
  background: var(--bar);
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  box-shadow: 0 10px 28px #0005;
}
.source-context.opens-left .context-submenu-panel { left: auto; right: calc(100% + 5px); }
.source-context.opens-up .context-submenu-panel { top: auto; bottom: -5px; }
.context-submenu:hover > .context-submenu-panel,
.context-submenu:focus-within > .context-submenu-panel { display: grid; }
.context-submenu-panel strong { padding: 7px 8px 3px; color: var(--muted); font-size: 12px; }
.modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: #0008;
}
.modal > section:not(.settings-shell) {
  width: min(620px, 90vw);
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 22px;
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.numbering-choice {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 16px 0;
}
.numbering-choice input,.sub-setting input { width: 62px; padding: 6px; color: var(--text); background: var(--editor); border: 1px solid var(--border); border-radius: 5px; }
.settings-shell {
  position: relative;
  width: min(900px, 94vw);
  height: min(680px, 86vh);
  display: grid;
  grid-template-columns: 180px 1fr;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: 0 24px 70px #0007;
}
.settings-shell > aside {
  padding: 18px 10px;
  background: var(--bar);
  border-right: 1px solid var(--border);
}
.settings-shell h3 {
  margin: 0 8px 22px;
  color: var(--text);
}
.settings-shell aside button {
  display: block;
  width: 100%;
  text-align: left;
  margin: 3px 0;
}
.settings-shell aside button.active {
  background: var(--hover);
  color: var(--accent);
}
.settings-content {
  position: relative;
  overflow: auto;
  padding: 32px 38px;
}
.settings-content header {
  margin-bottom: 23px;
}
.settings-content h2 {
  margin: 3px 0 7px;
  font:
    600 24px Georgia,
    "STSong",
    serif;
}
.settings-content header span,
.eyebrow {
  color: var(--muted);
  font-size: 13px;
}
.eyebrow {
  margin: 0;
  color: var(--accent);
  letter-spacing: 0.08em;
}
.settings-shell > .close {
  position: absolute;
  right: 14px;
  top: 12px;
  z-index: 3;
  margin: 0;
  background: var(--bar) !important;
  border: 1px solid var(--border) !important;
  box-shadow: 0 3px 10px #0003;
  font-size: 22px !important;
}
.rule-category {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 10px;
}
.category-toggle {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
  padding: 11px 13px !important;
  text-align: left;
}
.category-toggle small {
  margin-left: auto;
  color: var(--muted);
}
.rule-list {
  padding: 4px 12px 10px;
}
.rule-setting {
  display: flex;
  gap: 10px;
  padding: 11px 4px;
  border-top: 1px solid var(--border);
}
.rule-setting input {
  margin-top: 3px;
  accent-color: var(--accent);
}
.rule-setting strong,
.rule-setting small {
  display: block;
}
.rule-setting.exclusive {
  border-left: 3px solid var(--accent);
  padding-left: 9px;
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}
.exclusive-link {
  display: inline-flex;
  width: fit-content;
  margin-top: 7px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: 999px;
  color: var(--accent);
  font:
    600 11px/1.3 "Microsoft YaHei UI",
    sans-serif;
  font-style: normal;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.sub-setting,
.profile-section {
  display: grid;
  gap: 8px;
  margin: 8px 4px 2px 32px;
  color: var(--muted);
  font-size: 12px;
}
.range-inputs { display: inline-flex; align-items: center; gap: 7px; width: fit-content; }
.sub-setting > small { color: var(--muted); line-height: 1.55; }
.profile-section-top {
  margin: 0 0 18px;
  padding: 0 0 18px;
  border-top: 0;
  border-bottom: 1px solid var(--border);
}
.sub-setting label {
  color: var(--text);
}
.profile-section {
  margin: 22px 0 0;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.profile-section h3 {
  margin: 0;
  color: var(--text);
}
.rule-setting small {
  color: var(--muted);
  margin-top: 5px;
  font:
    12px/1.45 "Cascadia Code",
    "Sarasa Mono SC",
    monospace;
}
.confidence {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.confidence input,
.profile-row select,
.profile-row input {
  background: var(--editor);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  padding: 7px;
}
.profile-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.profile-row select,
.profile-row input {
  flex: 1 1 180px;
}
.profile-dialog {
  display: grid;
  gap: 12px;
}
.profile-dialog h3,
.profile-dialog p {
  margin: 0;
}
.profile-dialog label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}
.profile-dialog input {
  width: 100%;
  background: var(--editor);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 9px 10px;
}
.form-error {
  color: #e97b72;
}
@media (prefers-reduced-motion: reduce) {
  .section-row,
  .tree-toggle svg,
  .undo-group,
  .undo-group *,
  .section-row.drag-over::before {
    animation: none !important;
    transition: none !important;
  }
}
</style>
