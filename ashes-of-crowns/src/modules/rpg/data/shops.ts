import type { Currency, RegionId } from '../types';

export interface ShopEntry { itemId: string; currency?: Currency; price?: number; limit?: number; minLevel?: number; requiresFlag?: string; minNgCycle?: number }
export interface ShopDef { id: string; name: string; npc: string; region: RegionId; priceMult: number; sellMult: number; stock: ShopEntry[] }

export const SHOP_LIST: ShopDef[] = [
  { id: 'ashen_blacksmith', name: 'Brann’s Forge', npc: 'Brann', region: 'ashen_village', priceMult: 1.1, sellMult: 1.0, stock: [
    { itemId: 'iron_ingot', limit: 20 }, { itemId: 'iron_ore', limit: 30 }, { itemId: 'leather_scrap', limit: 20 },
    { itemId: 'iron_sword', limit: 1 }, { itemId: 'iron_cap', limit: 1 }, { itemId: 'leather_jerkin', limit: 1, minLevel: 2 }, { itemId: 'copper_ring', limit: 1 } ] },
  { id: 'ashen_apothecary', name: 'Marla’s Remedies', npc: 'Marla', region: 'ashen_village', priceMult: 1.0, sellMult: 0.9, stock: [
    { itemId: 'health_potion_small', limit: 15 }, { itemId: 'mana_potion_small', limit: 10 }, { itemId: 'stamina_tonic', limit: 10 }, { itemId: 'healing_herb', limit: 20 }, { itemId: 'bandage', limit: 20 } ] },
  { id: 'forest_herbalist', name: 'The Mossbound Herbalist', npc: 'Sylwen', region: 'whispering_forest', priceMult: 1.1, sellMult: 1.0, stock: [
    { itemId: 'health_potion', limit: 10 }, { itemId: 'mana_potion_small', limit: 10 }, { itemId: 'healing_herb', limit: 25 }, { itemId: 'spirit_moss', limit: 20 },
    { itemId: 'amulet_of_vitality', limit: 1, minLevel: 6 }, { itemId: 'scroll_of_insight', limit: 1, price: 500, minLevel: 8 } ] },
  { id: 'desert_trader', name: 'Dune Caravan', npc: 'Kesh', region: 'forgotten_desert', priceMult: 1.25, sellMult: 1.1, stock: [
    { itemId: 'health_potion', limit: 10 }, { itemId: 'mana_potion', limit: 8 }, { itemId: 'sun_glass', limit: 15 }, { itemId: 'iron_ingot', limit: 15 },
    { itemId: 'steel_longsword', limit: 1, minLevel: 9 }, { itemId: 'chainmail', limit: 1, minLevel: 9 }, { itemId: 'steel_helm', limit: 1, minLevel: 9 }, { itemId: 'ring_of_vigor', limit: 1, minLevel: 8 } ] },
  { id: 'highland_forgemaster', name: 'Frostforge', npc: 'Torvald', region: 'frozen_highlands', priceMult: 1.15, sellMult: 1.0, stock: [
    { itemId: 'steel_ingot', limit: 15 }, { itemId: 'frost_crystal', limit: 10 }, { itemId: 'health_potion_large', limit: 6 },
    { itemId: 'elixir_of_might', limit: 4 }, { itemId: 'elixir_of_ironhide', limit: 4 }, { itemId: 'warden_helm', limit: 1, minLevel: 15 }, { itemId: 'knights_blade', limit: 1, minLevel: 15 } ] },
  { id: 'hollow_black_market', name: 'The Whispering Stall', npc: 'The Broker', region: 'hollow_city', priceMult: 1.5, sellMult: 0.8, stock: [
    { itemId: 'hollow_essence', limit: 6, price: 4, currency: 'shards' }, { itemId: 'emberstone_band', limit: 1, price: 30, currency: 'shards', minLevel: 20 },
    { itemId: 'ashbrand', limit: 1, price: 45, currency: 'shards', minLevel: 22 }, { itemId: 'scroll_of_insight', limit: 2, price: 6, currency: 'shards' },
    { itemId: 'elixir_of_fury', limit: 3 }, { itemId: 'health_potion_large', limit: 6 } ] },
  { id: 'crownfall_quartermaster', name: 'Crownfall Quartermaster', npc: 'Ser Halden', region: 'crownfall', priceMult: 1.2, sellMult: 1.0, stock: [
    { itemId: 'royal_ember', limit: 4, price: 8, currency: 'shards' }, { itemId: 'health_potion_large', limit: 10 }, { itemId: 'elixir_of_might', limit: 4 }, { itemId: 'elixir_of_fury', limit: 4 },
    { itemId: 'steel_ingot', limit: 10 }, { itemId: 'crown_of_ashes', limit: 1, price: 150, currency: 'shards', minNgCycle: 1 } ] },
];
export const SHOPS: Record<string, ShopDef> = Object.fromEntries(SHOP_LIST.map((s) => [s.id, s]));
