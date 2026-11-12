import type { EnemyTier, Rarity, RegionId } from '../types';

export const TIER_CONFIG: Record<EnemyTier, {
  xp: number; gold: number; gearChance: number; matRolls: number; matChanceMult: number; potionChance: number;
  shardChance: number; shardMin: number; shardMax: number; rarityWeights: Record<Rarity, number>;
}> = {
  minion: { xp: 8, gold: 4, gearChance: 0.03, matRolls: 1, matChanceMult: 1, potionChance: 0.08, shardChance: 0, shardMin: 0, shardMax: 0, rarityWeights: { common: 70, uncommon: 27, rare: 3, epic: 0, legendary: 0 } },
  elite: { xp: 30, gold: 15, gearChance: 0.12, matRolls: 2, matChanceMult: 1.5, potionChance: 0.2, shardChance: 0.08, shardMin: 1, shardMax: 1, rarityWeights: { common: 35, uncommon: 45, rare: 18, epic: 2, legendary: 0 } },
  miniboss: { xp: 120, gold: 60, gearChance: 0.4, matRolls: 3, matChanceMult: 2, potionChance: 0.5, shardChance: 1, shardMin: 1, shardMax: 2, rarityWeights: { common: 20, uncommon: 40, rare: 32, epic: 8, legendary: 0 } },
  boss: { xp: 400, gold: 250, gearChance: 1, matRolls: 5, matChanceMult: 3, potionChance: 1, shardChance: 1, shardMin: 3, shardMax: 6, rarityWeights: { common: 0, uncommon: 10, rare: 50, epic: 35, legendary: 5 } },
};

export interface RegionLoot { levels: [number, number]; materials: { itemId: string; chance: number; min: number; max: number }[]; potion: string }
export const REGION_LOOT: Record<RegionId, RegionLoot> = {
  ashen_village: { levels: [1, 5], potion: 'health_potion_small', materials: [{ itemId: 'iron_ore', chance: 0.35, min: 1, max: 3 }, { itemId: 'leather_scrap', chance: 0.3, min: 1, max: 2 }, { itemId: 'healing_herb', chance: 0.2, min: 1, max: 2 }] },
  whispering_forest: { levels: [5, 10], potion: 'health_potion_small', materials: [{ itemId: 'leather_scrap', chance: 0.3, min: 1, max: 3 }, { itemId: 'healing_herb', chance: 0.35, min: 1, max: 3 }, { itemId: 'spirit_moss', chance: 0.3, min: 1, max: 2 }, { itemId: 'wolf_fang', chance: 0.15, min: 1, max: 2 }, { itemId: 'iron_ore', chance: 0.1, min: 1, max: 2 }] },
  forgotten_desert: { levels: [10, 15], potion: 'health_potion', materials: [{ itemId: 'iron_ore', chance: 0.3, min: 1, max: 3 }, { itemId: 'sun_glass', chance: 0.25, min: 1, max: 2 }, { itemId: 'iron_ingot', chance: 0.1, min: 1, max: 1 }, { itemId: 'spirit_moss', chance: 0.1, min: 1, max: 2 }] },
  frozen_highlands: { levels: [15, 20], potion: 'health_potion', materials: [{ itemId: 'frost_crystal', chance: 0.3, min: 1, max: 2 }, { itemId: 'iron_ingot', chance: 0.2, min: 1, max: 2 }, { itemId: 'steel_ingot', chance: 0.06, min: 1, max: 1 }, { itemId: 'leather_scrap', chance: 0.15, min: 1, max: 2 }, { itemId: 'healing_herb', chance: 0.1, min: 1, max: 2 }] },
  hollow_city: { levels: [20, 26], potion: 'health_potion_large', materials: [{ itemId: 'hollow_essence', chance: 0.3, min: 1, max: 2 }, { itemId: 'steel_ingot', chance: 0.15, min: 1, max: 2 }, { itemId: 'spirit_moss', chance: 0.2, min: 1, max: 2 }, { itemId: 'frost_crystal', chance: 0.1, min: 1, max: 1 }] },
  crownfall: { levels: [26, 30], potion: 'health_potion_large', materials: [{ itemId: 'hollow_essence', chance: 0.25, min: 1, max: 2 }, { itemId: 'royal_ember', chance: 0.25, min: 1, max: 1 }, { itemId: 'steel_ingot', chance: 0.2, min: 1, max: 2 }, { itemId: 'sun_glass', chance: 0.1, min: 1, max: 1 }] },
};
