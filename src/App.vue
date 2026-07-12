<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { diffLines } from "diff";
import { message } from "@tauri-apps/plugin-dialog";
import MarkdownEditor from "./components/MarkdownEditor.vue";
import MarkdownPreview from "./components/MarkdownPreview.vue";
import { useDocumentStore } from "./stores/document";
import {
  categoryLabels,
  repairRules,
  rulesForCategory,
  mutuallyExclusiveRules,
  ruleDescriptions,
} from "./repair/registry";
import { editsForPlan } from "./repair/planner";
import {
  promoteSection,
  demoteSection,
  shiftSectionNumber,
  deleteSection,
  autoNumberSections,
  renumberSections,
  moveSectionBefore,
} from "./core/sections";
import {
  chooseMarkdownFile,
  chooseSavePath,
  fileNameFromPath,
  readMarkdown,
  writeMarkdown,
} from "./services/nativeFiles";
import type { RepairCategory, RepairPlan, RepairTarget } from "./types";

const store = useDocumentStore();
const sideTab = ref<"sections" | "issues">("sections");
const centerTab = ref<"source" | "repair" | "diff">("source");
const status = ref("准备就绪");
const sourceEditor = ref<{
  scrollToPosition: (p: number) => void;
  highlightRange: (from: number, to: number) => void;
  setScrollRatio: (r: number) => void;
}>();
const repairEditor = ref<{ setScrollRatio: (r: number) => void }>();
const preview = ref<{ setScrollRatio: (r: number) => void }>();
const diffRoot = ref<HTMLElement>();
const menu = ref<"file" | "formula" | "other" | "history" | null>(null);
const settingsOpen = ref(false);
const context = ref<{ id: string; x: number; y: number }>();
const dragging = ref<string>();
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
const diffs = computed(() => diffLines(store.text, repairText.value));
const previewText = computed(() =>
  lastPreview.value === "repair" ? repairText.value : store.text,
);
const issues = computed(() => currentPlan.value.candidates);
const categories = Object.keys(categoryLabels) as RepairCategory[];
const issueGroups = computed(() => categories.map((category) => ({ category, rules: rulesForCategory(category).map((rule) => ({ rule, items: issues.value.filter((item) => item.ruleId === rule.id) })).filter((group) => group.items.length) })).filter((group) => group.rules.length));
const expandedIssueCategories = ref<Record<string, boolean>>({});
const expandedIssueRules = ref<Record<string, boolean>>({});
const workspaceStyle = computed(() => ({
  gridTemplateColumns: `${leftCollapsed.value ? 32 : leftWidth.value}px minmax(360px,1fr) ${rightCollapsed.value ? 32 : rightWidth.value}px`,
}));
const expandedCategories = ref<Record<string, boolean>>(
  Object.fromEntries(categories.map((category) => [category, true])),
);
const collapsedSections = ref(new Set<string>());
const sectionRows = computed(() => {
  const rows: (typeof store.sections[number])[] = [];
  const visit = (node: typeof store.sections[number]) => { rows.push(node); if (!collapsedSections.value.has(node.id)) node.children.forEach(visit); };
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
  "spacing-cjk-number": "第2章 → 第 2 章",
  "spacing-number-unit": "20kg → 20 kg",
  "section-auto-number": "## 方法 → ## 1.1 方法",
  "formula-code-wrapper": "`$E=mc^2$` → $E=mc^2$",
  "formula-block-normalize": "$$\\n  x^2 + y^2  \\n$$ → $$\\nx^2 + y^2\\n$$",
};
interface Profile {
  id: string;
  name: string;
  enabledRuleIds: string[];
  sectionNumberStartLevel: 1 | 2;
  builtIn?: boolean;
}
const profileKey = "mdtool.repair-profiles.v1";
const profiles = ref<Profile[]>(loadProfiles());
const activeProfileId = ref(profiles.value[0].id);
const profileName = ref("新规则方案");
function loadProfiles(): Profile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(profileKey) || "null") as
      Profile[] | null;
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
  });
  refreshAutomatic();
}
function saveProfile() {
  const name = profileName.value.trim();
  if (!name) return;
  const current = profiles.value.find(
    (item) => item.id === activeProfileId.value,
  );
  if (current && !current.builtIn) {
    current.name = name;
    current.enabledRuleIds = [...store.repairSettings.enabledRuleIds];
    current.sectionNumberStartLevel = store.repairSettings.sectionNumberStartLevel;
  } else {
    const profile = {
      id: `profile-${Date.now()}`,
      name,
      enabledRuleIds: [...store.repairSettings.enabledRuleIds],
      sectionNumberStartLevel: store.repairSettings.sectionNumberStartLevel,
    };
    profiles.value.push(profile);
    activeProfileId.value = profile.id;
  }
  persistProfiles();
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
  if (checked) mutuallyExclusiveRules.filter((group) => group.includes(id as never)).forEach((group) => group.filter((item) => item !== id).forEach((item) => ids.delete(item)));
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
function isExclusiveRule(id: string) { return mutuallyExclusiveRules.some((group) => group.includes(id as never)); }
function setSectionNumberStartLevel(level: 1 | 2) { store.updateRepairSettings({ ...store.repairSettings, sectionNumberStartLevel: level }); refreshAutomatic(); }
function requestFullNumbering() { pendingFullNumbering.value = true; menu.value = null; }
function confirmFullNumbering() { pendingFullNumbering.value = false; const plan = store.buildRepairPlan("document", { kind: "rule", id: "section-auto-number" }); currentPlan.value = plan; selectedPlanIds.value = plan.candidates.map((item) => item.id); selectCenter("repair"); }
function selectSection(id: string) { const section = store.sections.find((item) => item.id === id); if (!section) return; store.selectedSectionId = id; jump(section.headingFrom, section.headingTo); }
function toggleSection(id: string) { const next = new Set(collapsedSections.value); next.has(id) ? next.delete(id) : next.add(id); collapsedSections.value = next; }
function openSectionContext(id: string, event: MouseEvent) { store.selectedSectionId = id; context.value = { id, x: event.clientX, y: event.clientY }; }
function toggleIssueCategory(category: RepairCategory) { expandedIssueCategories.value[category] = !expandedIssueCategories.value[category]; }
function toggleIssueRule(id: string) { expandedIssueRules.value[id] = !expandedIssueRules.value[id]; }
function refreshAutomatic() {
  currentPlan.value = store.buildRepairPlan("document", { kind: "automatic" });
  selectedPlanIds.value = currentPlan.value.candidates.map((item) => item.id);
}
watch(
  () => store.text,
  () => {
    refreshAutomatic();
    if (centerTab.value === "source") lastPreview.value = "source";
  },
);
function selectCenter(tab: "source" | "repair" | "diff") {
  centerTab.value = tab;
  if (tab !== "diff") lastPreview.value = tab;
}
function syncScroll(ratio: number) {
  preview.value?.setScrollRatio(ratio);
}
function onDiffScroll() {
  const el = diffRoot.value;
  if (el)
    syncScroll(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight));
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
  ).toLowerCase();
  return result === "yes" ? saveDocument() : result === "no";
}
async function newDocument() {
  if (await resolveUnsaved()) store.loadDocument("");
}
async function openDocument() {
  if (!(await resolveUnsaved())) return;
  const path = await chooseMarkdownFile();
  if (path)
    store.loadDocument(await readMarkdown(path), {
      filePath: path,
      fileName: fileNameFromPath(path),
    });
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
function dropSection(targetId: string) {
  if (!dragging.value || dragging.value === targetId) return;
  run(
    "拖拽调整章节并重编号",
    moveSectionBefore(store.text, dragging.value, targetId),
  );
  dragging.value = undefined;
}
onBeforeUnmount(() => {
  /* pointer listeners remove themselves on pointerup */
});
</script>
<template>
  <main
    class="app"
    :data-theme="theme"
    @click="
      menu = null;
      context = undefined;
    "
  >
    <header class="menubar" @click.stop>
      <div class="menus">
        <div class="menu-anchor">
          <button @click="menu = menu === 'file' ? null : 'file'">文件</button>
          <div v-if="menu === 'file'" class="dropdown">
            <button @click="newDocument">新建</button
            ><button @click="openDocument">打开</button
            ><button @click="saveDocument()">保存</button
            ><button @click="saveDocument(true)">另存为</button>
          </div>
        </div>
        <div class="menu-anchor"><button @click="menu = menu === 'formula' ? null : 'formula'">公式修复</button><div v-if="menu === 'formula'" class="dropdown repair-menu single-menu"><section><button v-for="rule in rulesForCategory('formula')" :key="rule.id" :title="ruleDescriptions[rule.id]" @click="startManual({ kind: 'rule', id: rule.id })">{{ rule.label }}</button></section></div></div>
        <div class="menu-anchor"><button @click="menu = menu === 'other' ? null : 'other'">其他修复</button><div v-if="menu === 'other'" class="dropdown repair-menu other-menu"><section v-for="category in categories.filter(category => category !== 'formula')" :key="category"><strong>{{ categoryLabels[category] }}</strong><button v-for="rule in rulesForCategory(category)" :key="rule.id" :title="ruleDescriptions[rule.id]" @click="rule.id === 'section-auto-number' ? requestFullNumbering() : startManual({ kind: 'rule', id: rule.id })">{{ rule.label }}</button></section></div></div>
        <button
          @click="
            settingsOpen = true;
          "
        >
          设置</button
        ><button class="accent" @click="oneClick">一键修复</button>
        <div class="history-anchor">
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
            class="chevron"
            aria-label="操作历史"
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
        </div>
        <button
          class="icon-button"
          title="重做"
          aria-label="重做"
          @click="redo"
          :disabled="!store.history.canRedo"
        >
          <svg viewBox="0 0 24 24">
            <path d="m15 7 5 5-5 5M19 12h-9a5 5 0 0 0 0 10h1" />
          </svg>
        </button>
      </div>
      <div class="menu-status">
        <span>{{ status }}</span
        ><button
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
              ‹
            </button>
          </nav>
          <div v-if="sideTab === 'sections'" class="side-list">
            <div
              v-for="section in sectionRows"
              :key="section.id"
              class="section-row"
              :class="{ active: store.selectedSectionId === section.id }"
              :style="{ paddingLeft: `${(section.level - 1) * 16 + 4}px` }"
            >
              <button v-if="section.children.length" class="tree-toggle" @click.stop="toggleSection(section.id)">{{ collapsedSections.has(section.id) ? "›" : "⌄" }}</button><span v-else class="tree-spacer" />
              <button class="section-button" draggable="true" @dragstart="dragging = section.id" @dragover.prevent @drop.prevent="dropSection(section.id)" @click="selectSection(section.id)" @contextmenu.prevent="openSectionContext(section.id, $event)">
                {{ section.numberParts?.join(".") }}{{ section.numberParts ? " " : "" }}{{ section.title }}
              </button>
            </div>
          </div>
          <div v-else class="side-list issue-tree">
            <section v-for="group in issueGroups" :key="group.category" class="issue-category">
              <button class="issue-tree-toggle" :title="`${categoryLabels[group.category]}：${group.rules.length} 条规则`" @click="toggleIssueCategory(group.category)">{{ expandedIssueCategories[group.category] === false ? '›' : '⌄' }} <strong>{{ categoryLabels[group.category] }}</strong><small>{{ group.rules.length }}</small></button>
              <div v-if="expandedIssueCategories[group.category] !== false">
                <div v-for="ruleGroup in group.rules" :key="ruleGroup.rule.id" class="issue-rule">
                  <button class="issue-tree-toggle" :title="ruleDescriptions[ruleGroup.rule.id]" @click="toggleIssueRule(ruleGroup.rule.id)">{{ expandedIssueRules[ruleGroup.rule.id] === false ? '›' : '⌄' }} {{ ruleGroup.rule.label }}<small>{{ ruleGroup.items.length }}</small></button>
                  <button v-for="item in expandedIssueRules[ruleGroup.rule.id] === false ? [] : ruleGroup.items" :key="item.id" class="issue-content" :title="ruleDescriptions[item.ruleId]" @click="jump(item.from, item.to)">{{ item.originalText.replace(/\s+/g, ' ').trim() }}</button>
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
          ›
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
            应用预览（{{ selectedPlanIds.length }}）
          </button>
        </nav>
        <MarkdownEditor
          v-if="centerTab === 'source'"
          ref="sourceEditor"
          :model-value="store.text"
          @update:model-value="store.replace"
          @paste-document="store.loadPastedDocument"
          @selection-change="(from, to) => store.setSelection({ from, to })"
          @scroll="syncScroll"
          @undo="undo"
          @redo="redo"
        /><MarkdownEditor
          v-else-if="centerTab === 'repair'"
          ref="repairEditor"
          :model-value="repairText"
          readonly
          @scroll="syncScroll"
        />
        <article v-else ref="diffRoot" class="diff" @scroll="onDiffScroll">
          <pre
            v-for="(part, index) in diffs"
            :key="index"
            :class="{ added: part.added, removed: part.removed }"
            >{{ part.value }}</pre>
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
              ›
            </button>
          </p>
          <MarkdownPreview ref="preview" :model-value="previewText" /></template
        ><button
          v-else
          class="expand-rail"
          title="展开预览"
          @click="rightCollapsed = false"
        >
          ‹
        </button>
      </aside>
    </section>
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
          run('为选中章节添加编号', autoNumberSections(store.text, store.repairSettings.sectionNumberStartLevel, context?.id));
          context = undefined;
        "
      >
        添加编号</button
      ><button
        @click="
          run('为选中章节重排编号', renumberSections(store.text, context?.id));
          context = undefined;
        "
      >
        重排编号</button
      ><button @click="sectionAction('delete')">删除章节</button>
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
        <h3>为所有章节添加编号</h3>
        <p>添加编号时是否排除一级标题？</p>
        <div class="numbering-choice">
          <label><input type="radio" :checked="store.repairSettings.sectionNumberStartLevel === 1" @change="setSectionNumberStartLevel(1)"> 不排除，一级标题也编号</label>
          <label><input type="radio" :checked="store.repairSettings.sectionNumberStartLevel === 2" @change="setSectionNumberStartLevel(2)"> 排除，一级标题不编号</label>
        </div>
        <div class="modal-actions"><button @click="pendingFullNumbering = false">取消</button><button class="accent" @click="confirmFullNumbering">生成修复预览</button></div>
      </section>
    </div>
    <div
      v-if="settingsOpen"
      class="modal settings-modal"
      @click.self="settingsOpen = false"
    >
      <section class="settings-shell">
        <aside><h3>设置</h3><button class="active">一键修复规则</button></aside>
        <div class="settings-content">
          <button
            class="close"
            aria-label="关闭设置"
            @click="settingsOpen = false"
          >
            ×</button
          ><header>
              <p class="eyebrow">规则</p>
              <h2>一键修复规则</h2>
              <span>按类别选择安全修复规则，并保存为方案。</span>
            </header>
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
                <label
                  v-for="rule in rulesForCategory(category)"
                  :key="rule.id"
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
                    ><small>{{ ruleDescriptions[rule.id] }}{{ isExclusiveRule(rule.id) ? "（同组只能选一个）" : "" }} 示例：{{ examples[rule.id] }}</small></span
                  ></label
                >
                <div v-if="category === 'section' && store.repairSettings.enabledRuleIds.includes('section-auto-number')" class="sub-setting"><span>为所有章节添加编号时</span><label><input type="radio" :checked="store.repairSettings.sectionNumberStartLevel === 1" @change="setSectionNumberStartLevel(1)"> 包含一级标题</label><label><input type="radio" :checked="store.repairSettings.sectionNumberStartLevel === 2" @change="setSectionNumberStartLevel(2)"> 排除一级标题</label></div>
              </div>
            </section>
            <section class="profile-section"><h3>规则方案</h3><span>保存当前选项组合，便于在不同文档间切换。</span>
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
              ><input v-model="profileName" placeholder="方案名称" /><button
                class="accent"
                @click="saveProfile"
              >
                保存为方案</button
              ><button @click="deleteProfile">删除</button>
            </div></section>
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
.chevron {
  padding-left: 2px !important;
  padding-right: 6px !important;
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
  grid-template-columns: minmax(250px, 1fr);
  width: min(390px, calc(100vw - 36px));
}
.repair-menu.other-menu {
  grid-template-columns: minmax(260px, 1fr);
  width: min(420px, calc(100vw - 36px));
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
  padding: 4px !important;
  color: var(--muted);
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
  display: flex;
  align-items: stretch;
  min-height: 34px;
}
.tree-toggle,
.tree-spacer {
  flex: 0 0 25px;
  width: 25px;
  display: grid;
  place-items: center;
  padding: 0 !important;
  color: var(--muted);
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
  gap: 6px;
  min-height: 30px;
  color: var(--muted);
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
  font: 11px/1.4 "Cascadia Code", "Sarasa Mono SC", monospace;
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
  display: grid;
  gap: 9px;
  margin: 16px 0;
}
.numbering-choice label {
  display: flex;
  gap: 8px;
  align-items: center;
}
.settings-shell {
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
.close {
  position: absolute;
  right: 12px;
  top: 11px;
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
.sub-setting,
.profile-section {
  display: grid;
  gap: 8px;
  margin: 8px 4px 2px 32px;
  color: var(--muted);
  font-size: 12px;
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
</style>
