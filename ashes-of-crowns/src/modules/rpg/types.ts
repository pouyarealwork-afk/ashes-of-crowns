/** Shared type definitions for the RPG module (Module 4). No runtime dependencies. */

export type StatKey = 'health' | 'attack' | 'defense' | 'critChance' | 'critDamage' | 'speed' | 'mana' | 'stamina';
export const STAT_KEYS: readonly StatKey[] = ['health', 'attack', 'defense', 'critChance', 'critDamage', 'speed', 'mana', 'stamina'];
/**
 * Final character stats.
 * health/mana/stamina are MAXIMUM values. critChance is a 0..1 fraction. critDamage is a multiplier (1.5 = +50%).
 * speed is a percentage baseline (100 = normal) that the player module multiplies its base move speed by (speed / 100).
 */
export type Stats = Record<StatKey, number>;
export interface StatMod { stat: StatKey; flat?: number; pct?: number }

export type PassiveKey = 'lifesteal' | 'healthRegen' | 'manaRegen' | 'staminaRegen' | 'dodgeChance' | 'damageReduction' | 'spellPower' | 'manaCostReduction' | 'goldFind' | 'manaOnKill';
export const PASSIVE_KEYS: readonly PassiveKey[] = ['lifesteal', 'healthRegen', 'manaRegen', 'staminaRegen', 'dodgeChance', 'damageReduction', 'spellPower', 'manaCostReduction', 'goldFind', 'manaOnKill'];
/** lifesteal/dodgeChance/damageReduction/spellPower/manaCostReduction/goldFind are fractions; *Regen are units per second; manaOnKill is flat mana. */
export type Passives = Record<PassiveKey, number>;
export type PartialPassives = Partial<Record<PassiveKey, number>>;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemType = 'weapon' | 'armor' | 'helmet' | 'ring' | 'amulet' | 'consumable' | 'material' | 'quest';
export type EquipSlot = 'weapon' | 'armor' | 'helmet' | 'ring1' | 'ring2' | 'amulet';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'helmet', 'ring1', 'ring2', 'amulet'];
export type RegionId = 'ashen_village' | 'whispering_forest' | 'forgotten_desert' | 'frozen_highlands' | 'hollow_city' | 'crownfall';
export const REGION_IDS: readonly RegionId[] = ['ashen_village', 'whispering_forest', 'forgotten_desert', 'frozen_highlands', 'hollow_city', 'crownfall'];
export type StationId = 'blacksmith' | 'alchemist';
export type Currency = 'gold' | 'shards';
export type EnemyTier = 'minion' | 'elite' | 'miniboss' | 'boss';
export type TreeId = 'warrior' | 'arcane' | 'shadow' | 'warden' | 'oracle' | 'bard';
export type EndingId = 'true_king' | 'tyrant' | 'wanderer' | 'hidden_truth' | 'fallen_hero';

export interface ConsumableEffect {
  heal?: number; healPct?: number;
  mana?: number; manaPct?: number;
  stamina?: number; staminaPct?: number;
  xp?: number;
  buff?: { id: string; durationMs: number; stats?: StatMod[]; passives?: PartialPassives };
}

export interface ItemDef {
  id: string; name: string; type: ItemType; rarity: Rarity; description: string;
  /** Phaser texture key the UI should use. The module ships no art; see README "Required assets". */
  icon: string;
  /** Base value in gold. Buy price = value * shop.priceMult, sell price = value * 0.4 (+25% per upgrade level). */
  value: number;
  levelReq?: number;
  stats?: StatMod[];
  passives?: PartialPassives;
  weaponKind?: 'sword' | 'axe' | 'dagger' | 'staff';
  consumable?: ConsumableEffect;
  stackMax?: number;
  sellable?: boolean;
  /** Regions where this gear can drop from enemies. */
  regions?: RegionId[];
}

export interface ItemInstance { uid: string; defId: string; qty: number; upgrade: number; seq: number }

export interface ActiveBuff { id: string; stats: StatMod[]; passives: PartialPassives; flags: string[]; remainingMs: number }

export interface RpgState {
  version: number;
  level: number; xp: number; skillPoints: number;
  skills: Record<string, number>;
  hotbar: (string | null)[];
  inventory: ItemInstance[];
  equipment: Record<EquipSlot, ItemInstance | null>;
  gold: number; shards: number;
  recipes: string[];
  skinsUnlocked: string[]; skinEquipped: string;
  achievements: string[]; counters: Record<string, number>;
  flags: Record<string, boolean>;
  completedQuests: string[]; defeatedBosses: string[];
  shopPurchases: Record<string, number>;
  ngPlus: { cycle: number };
  uidCounter: number; seqCounter: number; respecCount: number;
}

export type ErrorCode =
  | 'not_found' | 'not_equippable' | 'level_too_low' | 'inventory_full' | 'invalid_slot' | 'not_usable' | 'cooldown'
  | 'not_sellable' | 'insufficient_gold' | 'insufficient_shards' | 'insufficient_materials' | 'wrong_station'
  | 'unknown_recipe' | 'recipe_locked' | 'max_upgrade' | 'unknown_shop' | 'unknown_entry' | 'out_of_stock' | 'locked'
  | 'unknown_skill' | 'no_skill_points' | 'max_rank' | 'requirements_not_met' | 'not_learned' | 'insufficient_resource'
  | 'unknown_skin' | 'skin_locked' | 'new_game_plus_unavailable' | 'invalid_quantity' | 'max_cycle';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; reason: ErrorCode; message: string };

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  not_found: 'Item not found.', not_equippable: 'This item cannot be equipped.', level_too_low: 'Your level is too low.',
  inventory_full: 'Inventory is full.', invalid_slot: 'Invalid equipment slot.', not_usable: 'This item cannot be used.',
  cooldown: 'Not ready yet.', not_sellable: 'This item cannot be sold.', insufficient_gold: 'Not enough gold.',
  insufficient_shards: 'Not enough Ancient Shards.', insufficient_materials: 'Missing materials.',
  wrong_station: 'You need to be at the right workstation.', unknown_recipe: 'Unknown recipe.', recipe_locked: 'Recipe not learned yet.',
  max_upgrade: 'This item is fully upgraded.', unknown_shop: 'Unknown shop.', unknown_entry: 'The shop does not sell that.',
  out_of_stock: 'Out of stock.', locked: 'Not available yet.', unknown_skill: 'Unknown skill.', no_skill_points: 'No skill points left.',
  max_rank: 'Skill is already at max rank.', requirements_not_met: 'Requirements not met.', not_learned: 'Skill not learned.',
  insufficient_resource: 'Not enough mana or stamina.', unknown_skin: 'Unknown skin.', skin_locked: 'Skin is locked.',
  new_game_plus_unavailable: 'Finish the story to begin New Game+.', invalid_quantity: 'Invalid quantity.', max_cycle: 'Maximum New Game+ cycle reached.',
};

export function fail(reason: ErrorCode): { ok: false; reason: ErrorCode; message: string } {
  return { ok: false, reason, message: ERROR_MESSAGES[reason] };
}

export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
