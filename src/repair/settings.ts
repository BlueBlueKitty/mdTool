import type { RepairSettings } from "../types";
import { repairRules } from "./registry";

const key = "mdtool.repair-settings.v1";
const level = (value: unknown, fallback: number) => typeof value === "number" && value >= 1 && value <= 6 ? value : fallback;
export function defaultRepairSettings(): RepairSettings { return { enabledRuleIds: repairRules.filter(rule => rule.autoEnabledByDefault && !["formula-restore-missing-delimiter", "formula-delimiter-latex", "formula-display-dollar-to-single", "section-auto-number", "section-renumber"].includes(rule.id)).map(rule => rule.id), sectionNumberStartLevel: 1, sectionNumberEndLevel: null }; }
export function loadRepairSettings(): RepairSettings {
  const fallback = defaultRepairSettings();
  try { const raw = localStorage.getItem(key); if (!raw) return fallback; const value = JSON.parse(raw) as Partial<RepairSettings>; const start = level(value.sectionNumberStartLevel, 1); const end = value.sectionNumberEndLevel === null || value.sectionNumberEndLevel === undefined ? null : level(value.sectionNumberEndLevel, 6); return { enabledRuleIds: Array.isArray(value.enabledRuleIds) ? value.enabledRuleIds.filter(id => repairRules.some(rule => rule.id === id)) : fallback.enabledRuleIds, sectionNumberStartLevel: start, sectionNumberEndLevel: end && end >= start ? end : null }; } catch { return fallback; }
}
export function saveRepairSettings(settings: RepairSettings) { try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* 存储受限时使用当前内存配置 */ } }
