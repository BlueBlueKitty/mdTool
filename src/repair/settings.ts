import type { RepairSettings } from "../types";
import { repairRules } from "./registry";

const key = "mdtool.repair-settings.v1";
export function defaultRepairSettings(): RepairSettings { return { enabledRuleIds: repairRules.filter(rule => rule.autoEnabledByDefault).map(rule => rule.id), minimumConfidence: 0.9 }; }
export function loadRepairSettings(): RepairSettings {
  const fallback = defaultRepairSettings();
  try { const raw = localStorage.getItem(key); if (!raw) return fallback; const value = JSON.parse(raw) as Partial<RepairSettings>; return { enabledRuleIds: Array.isArray(value.enabledRuleIds) ? value.enabledRuleIds.filter(id => repairRules.some(rule => rule.id === id)) : fallback.enabledRuleIds, minimumConfidence: typeof value.minimumConfidence === "number" && value.minimumConfidence >= 0 && value.minimumConfidence <= 1 ? value.minimumConfidence : fallback.minimumConfidence }; } catch { return fallback; }
}
export function saveRepairSettings(settings: RepairSettings) { try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* 存储受限时使用当前内存配置 */ } }
