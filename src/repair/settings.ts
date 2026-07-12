import type { RepairSettings } from "../types";
import { repairRules } from "./registry";

const key = "mdtool.repair-settings.v1";
export function defaultRepairSettings(): RepairSettings { return { enabledRuleIds: repairRules.filter(rule => rule.autoEnabledByDefault && !["formula-restore-missing-delimiter", "formula-restore-separator", "formula-delimiter-latex", "formula-delimiter-dollar", "formula-display-dollar-to-single", "formula-inline-double-dollar-to-single", "section-auto-number", "section-renumber"].includes(rule.id)).map(rule => rule.id), sectionNumberStartLevel: 1 }; }
export function loadRepairSettings(): RepairSettings {
  const fallback = defaultRepairSettings();
  try { const raw = localStorage.getItem(key); if (!raw) return fallback; const value = JSON.parse(raw) as Partial<RepairSettings>; return { enabledRuleIds: Array.isArray(value.enabledRuleIds) ? value.enabledRuleIds.filter(id => repairRules.some(rule => rule.id === id)) : fallback.enabledRuleIds, sectionNumberStartLevel: value.sectionNumberStartLevel === 2 ? 2 : 1 }; } catch { return fallback; }
}
export function saveRepairSettings(settings: RepairSettings) { try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* 存储受限时使用当前内存配置 */ } }
