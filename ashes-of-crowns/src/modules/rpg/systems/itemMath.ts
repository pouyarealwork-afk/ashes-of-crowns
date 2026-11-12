import type { EquipSlot, ItemDef, ItemInstance, PartialPassives, StatKey, StatMod } from '../types';
import { RARITY_INFO, SELL_RATE, STAT_LABELS, UPGRADE_FLAT_SCALE, UPGRADE_SCALED_STATS } from '../data/config';

const SCALED = new Set<string>(UPGRADE_SCALED_STATS);

/** Stat mods of an item at a given upgrade level (flat health/attack/defense/mana/stamina scale +10% per level). */
export function scaledMods(def: ItemDef, upgrade: number): StatMod[] {
  return (def.stats ?? []).map((m) => {
    if (m.flat !== undefined && SCALED.has(m.stat)) return { ...m, flat: Math.round(m.flat * (1 + UPGRADE_FLAT_SCALE * upgrade) * 100) / 100 };
    return { ...m };
  });
}
export function maxUpgradeFor(def: ItemDef): number { return RARITY_INFO[def.rarity].maxUpgrade; }
export function isStackable(def: ItemDef): boolean { return (stackLimit(def)) > 1; }
export function stackLimit(def: ItemDef): number {
  if (def.type === 'weapon' || def.type === 'armor' || def.type === 'helmet' || def.type === 'ring' || def.type === 'amulet') return 1;
  return def.stackMax ?? (def.type === 'material' ? 99 : 20);
}

const PCT_STATS = new Set<StatKey>(['critChance']);
export function formatMod(m: StatMod): string[] {
  const label = STAT_LABELS[m.stat] ?? m.stat;
  const lines: string[] = [];
  if (m.flat !== undefined && m.flat !== 0) {
    if (PCT_STATS.has(m.stat)) lines.push(`${m.flat > 0 ? '+' : ''}${Math.round(m.flat * 1000) / 10}% ${label}`);
    else lines.push(`${m.flat > 0 ? '+' : ''}${Math.round(m.flat * 100) / 100} ${label}`);
  }
  if (m.pct !== undefined && m.pct !== 0) lines.push(`${m.pct > 0 ? '+' : ''}${Math.round(m.pct * 1000) / 10}% ${label}`);
  return lines;
}
const FLAT_PASSIVES = new Set(['healthRegen', 'manaRegen', 'staminaRegen', 'manaOnKill']);
export function formatPassives(p: PartialPassives): string[] {
  return Object.entries(p).filter(([, v]) => v).map(([k, v]) => {
    const val = v as number;
    const label = STAT_LABELS[k] ?? k;
    if (k === 'manaOnKill') return `+${val} ${label}`;
    if (FLAT_PASSIVES.has(k)) return `+${val}/s ${label}`;
    return `+${Math.round(val * 1000) / 10}% ${label}`;
  });
}
export function instanceLabel(def: ItemDef, inst: ItemInstance): string { return inst.upgrade > 0 ? `${def.name} +${inst.upgrade}` : def.name; }

export function baseSellPrice(def: ItemDef, upgrade: number): number {
  if (def.sellable === false) return 0;
  return Math.max(1, Math.floor(def.value * SELL_RATE * (1 + 0.25 * upgrade)));
}
export function slotsFor(def: ItemDef): EquipSlot[] {
  switch (def.type) {
    case 'weapon': return ['weapon'];
    case 'armor': return ['armor'];
    case 'helmet': return ['helmet'];
    case 'ring': return ['ring1', 'ring2'];
    case 'amulet': return ['amulet'];
    default: return [];
  }
}
