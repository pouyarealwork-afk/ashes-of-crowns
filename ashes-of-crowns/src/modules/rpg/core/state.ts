import type { EquipSlot, RpgState } from '../types';
import { HOTBAR_SIZE } from '../data/config';

export const STATE_VERSION = 1;

export function createInitialState(): RpgState {
  return {
    version: STATE_VERSION, level: 1, xp: 0, skillPoints: 0, skills: {}, hotbar: new Array<string | null>(HOTBAR_SIZE).fill(null),
    inventory: [], equipment: { weapon: null, armor: null, helmet: null, ring1: null, ring2: null, amulet: null },
    gold: 0, shards: 0, recipes: [], skinsUnlocked: ['aren_default'], skinEquipped: 'aren_default',
    achievements: [], counters: {}, flags: {}, completedQuests: [], defeatedBosses: [], shopPurchases: {},
    ngPlus: { cycle: 0 }, uidCounter: 0, seqCounter: 0, respecCount: 0,
  };
}

/** Validates and migrates a saved snapshot. Unknown/invalid fields fall back to defaults; throws only on non-objects. */
export function migrateSnapshot(raw: unknown): RpgState {
  if (typeof raw !== 'object' || raw === null) throw new Error('[rpg] Invalid snapshot');
  const base = createInitialState();
  const s = raw as Partial<RpgState>;
  const out: RpgState = { ...base, ...s, version: STATE_VERSION };
  out.equipment = { ...base.equipment, ...(s.equipment ?? {}) } as Record<EquipSlot, RpgState['equipment'][EquipSlot]>;
  out.hotbar = Array.from({ length: HOTBAR_SIZE }, (_, i) => (s.hotbar?.[i] ?? null));
  out.ngPlus = { cycle: s.ngPlus?.cycle ?? 0 };
  out.skills = { ...(s.skills ?? {}) };
  out.counters = { ...(s.counters ?? {}) };
  out.flags = { ...(s.flags ?? {}) };
  out.shopPurchases = { ...(s.shopPurchases ?? {}) };
  out.inventory = Array.isArray(s.inventory) ? s.inventory.map((i) => ({ ...i })) : [];
  for (const k of Object.keys(out.equipment) as EquipSlot[]) { const e = out.equipment[k]; out.equipment[k] = e ? { ...e } : null; }
  if (!out.skinsUnlocked.includes('aren_default')) out.skinsUnlocked.push('aren_default');
  out.level = Math.max(1, Math.floor(out.level));
  out.gold = Math.max(0, Math.floor(out.gold));
  out.shards = Math.max(0, Math.floor(out.shards));
  return out;
}
