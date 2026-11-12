import type { Rarity, Stats } from '../types';

export const BASE_STATS: Stats = { health: 100, attack: 10, defense: 5, critChance: 0.05, critDamage: 1.5, speed: 100, mana: 50, stamina: 100 };
export const PER_LEVEL: Stats = { health: 12, attack: 2, defense: 1.2, critChance: 0.002, critDamage: 0, speed: 0, mana: 4, stamina: 3 };
export const STAT_LIMITS = { critChance: [0, 0.75], critDamage: [1.25, 5], speed: [50, 180] } as const;
export const PASSIVE_CAPS = { lifesteal: 0.3, dodgeChance: 0.4, damageReduction: 0.5, manaCostReduction: 0.6, goldFind: 1, spellPower: 2 } as const;

export const BASE_LEVEL_CAP = 30;
export const LEVELS_PER_NG_CYCLE = 10;
export const MAX_NG_CYCLE = 3;
export const INVENTORY_CAPACITY = 60;
export const HOTBAR_SIZE = 4;
export const CONSUMABLE_COOLDOWN_MS = 600;
export const SELL_RATE = 0.4;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number { return Math.round(60 * Math.pow(level, 1.35)); }
export function levelCap(cycle: number): number { return BASE_LEVEL_CAP + LEVELS_PER_NG_CYCLE * cycle; }
/** Skill points granted when reaching `level`: 1, plus a bonus point on every 5th level. */
export function skillPointsForLevel(level: number): number { return 1 + (level % 5 === 0 ? 1 : 0); }

export const RARITY_INFO: Record<Rarity, { label: string; color: string; maxUpgrade: number; index: number }> = {
  common: { label: 'Common', color: '#b8b8b8', maxUpgrade: 3, index: 0 },
  uncommon: { label: 'Uncommon', color: '#5fd35f', maxUpgrade: 5, index: 1 },
  rare: { label: 'Rare', color: '#4a90ff', maxUpgrade: 7, index: 2 },
  epic: { label: 'Epic', color: '#b05cff', maxUpgrade: 9, index: 3 },
  legendary: { label: 'Legendary', color: '#ffa530', maxUpgrade: 10, index: 4 },
};
export const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const STAT_LABELS: Record<string, string> = {
  health: 'Health', attack: 'Attack', defense: 'Defense', critChance: 'Crit Chance', critDamage: 'Crit Damage', speed: 'Speed', mana: 'Mana', stamina: 'Stamina',
  lifesteal: 'Lifesteal', healthRegen: 'Health Regen', manaRegen: 'Mana Regen', staminaRegen: 'Stamina Regen', dodgeChance: 'Dodge Chance',
  damageReduction: 'Damage Reduction', spellPower: 'Spell Power', manaCostReduction: 'Mana Cost Reduction', goldFind: 'Gold Find', manaOnKill: 'Mana on Kill',
};

/** Upgradable flat stats scale +10% per upgrade level; percentage-type stats (crit, speed) do not. */
export const UPGRADE_FLAT_SCALE = 0.1;
export const UPGRADE_SCALED_STATS = ['health', 'attack', 'defense', 'mana', 'stamina'] as const;

/** Rewards granted on reaching a level (in addition to skill points). */
export const LEVEL_MILESTONES: Record<number, { gold?: number; shards?: number; items?: { itemId: string; qty: number }[]; recipes?: string[] }> = {
  3: { gold: 40, items: [{ itemId: 'health_potion_small', qty: 2 }] },
  5: { gold: 100, items: [{ itemId: 'health_potion', qty: 2 }, { itemId: 'mana_potion_small', qty: 2 }] },
  8: { gold: 150, recipes: ['rcp_steel_longsword', 'rcp_chainmail'] },
  10: { gold: 250, shards: 2, items: [{ itemId: 'scroll_of_insight', qty: 1 }] },
  15: { gold: 500, shards: 3, items: [{ itemId: 'health_potion_large', qty: 3 }] },
  20: { gold: 900, shards: 5, items: [{ itemId: 'elixir_of_might', qty: 2 }] },
  25: { gold: 1500, shards: 8, items: [{ itemId: 'health_potion_large', qty: 5 }] },
  30: { gold: 2500, shards: 15, items: [{ itemId: 'scroll_of_insight', qty: 3 }] },
};
export const STARTING_KIT = {
  gold: 50,
  equipped: ['rusted_sword', 'ragged_tunic'],
  items: [{ itemId: 'health_potion_small', qty: 3 }],
};
