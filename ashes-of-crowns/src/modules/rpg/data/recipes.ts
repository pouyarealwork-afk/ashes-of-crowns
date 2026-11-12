import type { RegionId, StationId } from '../types';

export interface Recipe {
  id: string; name: string; station: StationId;
  output: { itemId: string; qty: number };
  inputs: { itemId: string; qty: number }[];
  gold: number; shards: number;
  /** Known from the start of a new game. Others are learned via learnRecipe(), quest rewards, level milestones, or unlockFlag. */
  startsKnown?: boolean; unlockLevel?: number; unlockFlag?: string; region?: RegionId;
}
const r = (id: string, name: string, station: StationId, itemId: string, qty: number, inputs: [string, number][], gold: number, extra: Partial<Recipe> = {}): Recipe =>
  ({ id, name, station, output: { itemId, qty }, inputs: inputs.map(([i, q]) => ({ itemId: i, qty: q })), gold, shards: 0, ...extra });

export const RECIPE_LIST: Recipe[] = [
  r('rcp_iron_ingot', 'Smelt Iron Ingot', 'blacksmith', 'iron_ingot', 1, [['iron_ore', 3]], 5, { startsKnown: true }),
  r('rcp_steel_ingot', 'Forge Steel Ingot', 'blacksmith', 'steel_ingot', 1, [['iron_ingot', 3]], 25, { unlockLevel: 6 }),
  r('rcp_iron_sword', 'Iron Sword', 'blacksmith', 'iron_sword', 1, [['iron_ingot', 4], ['leather_scrap', 2]], 40, { startsKnown: true }),
  r('rcp_hunters_dagger', 'Hunter’s Dagger', 'blacksmith', 'hunters_dagger', 1, [['iron_ingot', 3], ['leather_scrap', 2], ['wolf_fang', 1]], 50, { startsKnown: true }),
  r('rcp_leather_jerkin', 'Leather Jerkin', 'blacksmith', 'leather_jerkin', 1, [['leather_scrap', 6], ['iron_ingot', 1]], 30, { startsKnown: true }),
  r('rcp_iron_cap', 'Iron Cap', 'blacksmith', 'iron_cap', 1, [['iron_ingot', 3]], 25, { startsKnown: true }),
  r('rcp_copper_ring', 'Copper Ring', 'blacksmith', 'copper_ring', 1, [['iron_ingot', 2]], 15, { startsKnown: true }),
  r('rcp_studded_leather', 'Studded Leather', 'blacksmith', 'studded_leather', 1, [['leather_scrap', 8], ['iron_ingot', 3]], 90, { unlockLevel: 5 }),
  r('rcp_steel_longsword', 'Steel Longsword', 'blacksmith', 'steel_longsword', 1, [['steel_ingot', 5], ['leather_scrap', 2]], 150),
  r('rcp_chainmail', 'Chainmail Hauberk', 'blacksmith', 'chainmail', 1, [['steel_ingot', 6], ['leather_scrap', 3]], 180),
  r('rcp_steel_helm', 'Steel Helm', 'blacksmith', 'steel_helm', 1, [['steel_ingot', 4]], 120, { unlockLevel: 9 }),
  r('rcp_ring_of_vigor', 'Ring of Vigor', 'blacksmith', 'ring_of_vigor', 1, [['iron_ingot', 3], ['healing_herb', 4], ['sun_glass', 1]], 140, { unlockLevel: 8 }),
  r('rcp_amulet_of_vitality', 'Amulet of Vitality', 'blacksmith', 'amulet_of_vitality', 1, [['healing_herb', 3], ['spirit_moss', 2], ['iron_ingot', 1]], 120, { unlockLevel: 6 }),
  r('rcp_ring_of_swiftness', 'Ring of Swiftness', 'blacksmith', 'ring_of_swiftness', 1, [['copper_ring', 1], ['spirit_moss', 3], ['wolf_fang', 2]], 100, { unlockLevel: 5 }),
  r('rcp_moonstone_pendant', 'Moonstone Pendant', 'blacksmith', 'moonstone_pendant', 1, [['spirit_moss', 4], ['frost_crystal', 3], ['steel_ingot', 1]], 350, { unlockLevel: 13 }),
  r('rcp_ring_of_precision', 'Ring of Precision', 'blacksmith', 'ring_of_precision', 1, [['sun_glass', 4], ['steel_ingot', 2], ['frost_crystal', 1]], 380, { unlockLevel: 14 }),
  r('rcp_warden_plate', 'Warden Plate', 'blacksmith', 'warden_plate', 1, [['steel_ingot', 8], ['frost_crystal', 6], ['leather_scrap', 4]], 500, { unlockFlag: 'learned_highland_smithing' }),
  r('rcp_frostbite_axe', 'Frostbite Axe', 'blacksmith', 'frostbite_axe', 1, [['steel_ingot', 6], ['frost_crystal', 8]], 700, { unlockFlag: 'learned_highland_smithing' }),
  r('rcp_ashbrand', 'Ashbrand', 'blacksmith', 'ashbrand', 1, [['steel_ingot', 8], ['hollow_essence', 6], ['royal_ember', 3]], 1200, { unlockFlag: 'learned_hollow_forging' }),
  Object.assign(r('rcp_crownbreaker', 'Crownbreaker', 'blacksmith', 'crownbreaker', 1, [['steel_ingot', 10], ['hollow_essence', 10], ['royal_ember', 6], ['crown_fragment', 1]], 3000, { unlockFlag: 'learned_crown_forging' }), { shards: 25 }),
  r('rcp_health_potion_small', 'Minor Health Potion', 'alchemist', 'health_potion_small', 2, [['healing_herb', 2]], 5, { startsKnown: true }),
  r('rcp_health_potion', 'Health Potion', 'alchemist', 'health_potion', 1, [['healing_herb', 3], ['spirit_moss', 1]], 15, { unlockLevel: 4 }),
  r('rcp_health_potion_large', 'Greater Health Potion', 'alchemist', 'health_potion_large', 1, [['healing_herb', 5], ['frost_crystal', 2], ['spirit_moss', 2]], 50, { unlockLevel: 12 }),
  r('rcp_mana_potion_small', 'Minor Mana Potion', 'alchemist', 'mana_potion_small', 2, [['spirit_moss', 2]], 8, { startsKnown: true }),
  r('rcp_mana_potion', 'Mana Potion', 'alchemist', 'mana_potion', 1, [['spirit_moss', 4], ['sun_glass', 1]], 25, { unlockLevel: 7 }),
  r('rcp_stamina_tonic', 'Stamina Tonic', 'alchemist', 'stamina_tonic', 1, [['healing_herb', 2], ['wolf_fang', 1]], 8, { startsKnown: true }),
  r('rcp_elixir_of_might', 'Elixir of Might', 'alchemist', 'elixir_of_might', 1, [['wolf_fang', 3], ['healing_herb', 2], ['iron_ingot', 1]], 40, { unlockLevel: 8 }),
  r('rcp_elixir_of_ironhide', 'Elixir of Ironhide', 'alchemist', 'elixir_of_ironhide', 1, [['iron_ingot', 2], ['healing_herb', 2], ['sun_glass', 1]], 40, { unlockLevel: 8 }),
  r('rcp_elixir_of_swiftness', 'Elixir of Swiftness', 'alchemist', 'elixir_of_swiftness', 1, [['spirit_moss', 3], ['wolf_fang', 2]], 35, { unlockLevel: 8 }),
  Object.assign(r('rcp_elixir_of_fury', 'Elixir of Fury', 'alchemist', 'elixir_of_fury', 1, [['hollow_essence', 2], ['wolf_fang', 3], ['spirit_moss', 2]], 80, { unlockLevel: 18 }), { shards: 1 }),
  r('rcp_bandage', 'Linen Bandage', 'alchemist', 'bandage', 3, [['leather_scrap', 1], ['healing_herb', 1]], 2, { startsKnown: true }),
];
export const RECIPES: Record<string, Recipe> = Object.fromEntries(RECIPE_LIST.map((x) => [x.id, x]));
