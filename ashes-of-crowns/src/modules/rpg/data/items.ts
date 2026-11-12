import type { ConsumableEffect, ItemDef, PartialPassives, Rarity, RegionId, StatKey, StatMod } from '../types';
import { STAT_KEYS } from '../types';

type Nums = Partial<Record<StatKey, number>>;
/** Build StatMod[] from flat and percentage shorthand objects. */
const S = (flat: Nums, pct: Nums = {}): StatMod[] => {
  const out: StatMod[] = [];
  for (const k of STAT_KEYS) {
    const f = flat[k]; const p = pct[k];
    if (f === undefined && p === undefined) continue;
    const m: StatMod = { stat: k };
    if (f !== undefined) m.flat = f;
    if (p !== undefined) m.pct = p;
    out.push(m);
  }
  return out;
};

interface GearIn { id: string; name: string; rarity: Rarity; lvl: number; value: number; desc: string; flat: Nums; pct?: Nums; passives?: PartialPassives; regions?: RegionId[]; kind?: 'sword' | 'axe' | 'dagger' | 'staff' }
const gear = (type: 'weapon' | 'armor' | 'helmet' | 'ring' | 'amulet', g: GearIn): ItemDef => {
  const d: ItemDef = { id: g.id, name: g.name, type, rarity: g.rarity, description: g.desc, icon: `icon_${g.id}`, value: g.value, levelReq: g.lvl, stats: S(g.flat, g.pct) };
  if (g.passives) d.passives = g.passives;
  if (g.regions) d.regions = g.regions;
  if (g.kind) d.weaponKind = g.kind;
  return d;
};
const cons = (id: string, name: string, rarity: Rarity, value: number, desc: string, effect: ConsumableEffect, stackMax = 20): ItemDef =>
  ({ id, name, type: 'consumable', rarity, description: desc, icon: `icon_${id}`, value, consumable: effect, stackMax });
const mat = (id: string, name: string, rarity: Rarity, value: number, desc: string): ItemDef =>
  ({ id, name, type: 'material', rarity, description: desc, icon: `icon_${id}`, value, stackMax: 99 });
const quest = (id: string, name: string, desc: string): ItemDef =>
  ({ id, name, type: 'quest', rarity: 'rare', description: desc, icon: `icon_${id}`, value: 0, stackMax: 9, sellable: false });

const AV: RegionId[] = ['ashen_village'], WF: RegionId[] = ['whispering_forest'], FD: RegionId[] = ['forgotten_desert'];
const FH: RegionId[] = ['frozen_highlands'], HC: RegionId[] = ['hollow_city'], CF: RegionId[] = ['crownfall'];

const WEAPONS: ItemDef[] = [
  gear('weapon', { id: 'rusted_sword', name: 'Rusted Sword', rarity: 'common', lvl: 1, value: 20, kind: 'sword', flat: { attack: 3 }, regions: AV, desc: 'Pitted and dull, but it is all that remains of Aren’s armory.' }),
  gear('weapon', { id: 'iron_sword', name: 'Iron Sword', rarity: 'common', lvl: 3, value: 60, kind: 'sword', flat: { attack: 6 }, regions: AV, desc: 'A village-forged blade. Honest steel for honest work.' }),
  gear('weapon', { id: 'hunters_dagger', name: 'Hunter’s Dagger', rarity: 'uncommon', lvl: 2, value: 90, kind: 'dagger', flat: { attack: 5, critChance: 0.04 }, regions: AV, desc: 'Light and quick, favored by poachers who avoid the royal wardens.' }),
  gear('weapon', { id: 'oak_staff', name: 'Whisperwood Staff', rarity: 'uncommon', lvl: 5, value: 140, kind: 'staff', flat: { attack: 4, mana: 25 }, regions: WF, desc: 'Cut from an oak that hums when the wind turns.' }),
  gear('weapon', { id: 'steel_longsword', name: 'Steel Longsword', rarity: 'uncommon', lvl: 9, value: 260, kind: 'sword', flat: { attack: 14 }, regions: FD, desc: 'A soldier’s sword with a clean, balanced edge.' }),
  gear('weapon', { id: 'duskfang_dagger', name: 'Duskfang', rarity: 'rare', lvl: 8, value: 420, kind: 'dagger', flat: { attack: 12, critChance: 0.06, critDamage: 0.15 }, pct: { speed: 0.03 }, regions: WF, desc: 'A curved fang of dark metal that seems to drink the light.' }),
  gear('weapon', { id: 'emberglass_staff', name: 'Emberglass Staff', rarity: 'rare', lvl: 11, value: 480, kind: 'staff', flat: { attack: 11, mana: 45 }, passives: { spellPower: 0.1 }, regions: FD, desc: 'Desert glass fused around a heart of slow fire.' }),
  gear('weapon', { id: 'knights_blade', name: 'Knight’s Blade', rarity: 'rare', lvl: 15, value: 700, kind: 'sword', flat: { attack: 26, defense: 4 }, regions: FH, desc: 'Once carried by the royal army’s finest. The crest was scratched away.' }),
  gear('weapon', { id: 'frostbite_axe', name: 'Frostbite Axe', rarity: 'epic', lvl: 17, value: 1100, kind: 'axe', flat: { attack: 36 }, pct: { attack: 0.05 }, regions: FH, desc: 'Rimed in ice that never melts, even over a forge.' }),
  gear('weapon', { id: 'voidpiercer', name: 'Voidpiercer', rarity: 'epic', lvl: 21, value: 1500, kind: 'dagger', flat: { attack: 40, critChance: 0.08, critDamage: 0.25 }, regions: HC, desc: 'It finds the gaps in armor, and in people.' }),
  gear('weapon', { id: 'ashbrand', name: 'Ashbrand', rarity: 'epic', lvl: 22, value: 1700, kind: 'sword', flat: { attack: 48 }, passives: { lifesteal: 0.03 }, regions: HC, desc: 'A blade quenched in the ashes of the fallen city. It hungers.' }),
  gear('weapon', { id: 'aurelion_staff', name: 'Aurelion, the Last Verse', rarity: 'legendary', lvl: 27, value: 3600, kind: 'staff', flat: { attack: 50, mana: 120 }, passives: { spellPower: 0.25, manaRegen: 2 }, regions: CF, desc: 'The court mage’s staff. Its song has not ended.' }),
  gear('weapon', { id: 'crownbreaker', name: 'Crownbreaker', rarity: 'legendary', lvl: 28, value: 4200, kind: 'sword', flat: { attack: 72, critDamage: 0.3 }, pct: { attack: 0.1 }, passives: { lifesteal: 0.05 }, regions: CF, desc: 'Forged to end a dynasty. It remembers every oath it broke.' }),
];

const ARMORS: ItemDef[] = [
  gear('armor', { id: 'ragged_tunic', name: 'Ragged Tunic', rarity: 'common', lvl: 1, value: 15, flat: { defense: 2, health: 10 }, regions: AV, desc: 'Patched cloth. Warm enough.' }),
  gear('armor', { id: 'leather_jerkin', name: 'Leather Jerkin', rarity: 'common', lvl: 2, value: 55, flat: { defense: 4, health: 20 }, regions: AV, desc: 'Boiled leather stitched by the village tanner.' }),
  gear('armor', { id: 'studded_leather', name: 'Studded Leather', rarity: 'uncommon', lvl: 5, value: 150, flat: { defense: 7, health: 30 }, regions: WF, desc: 'Iron studs turn aside glancing blows.' }),
  gear('armor', { id: 'chainmail', name: 'Chainmail Hauberk', rarity: 'uncommon', lvl: 9, value: 280, flat: { defense: 12, health: 45 }, regions: FD, desc: 'Thousands of small rings, thousands of small mercies.' }),
  gear('armor', { id: 'sunscale_armor', name: 'Sunscale Armor', rarity: 'rare', lvl: 12, value: 520, flat: { defense: 16, health: 60, stamina: 10 }, regions: FD, desc: 'Scales from a desert drake. Light, and cool in the heat.' }),
  gear('armor', { id: 'warden_plate', name: 'Warden Plate', rarity: 'rare', lvl: 15, value: 800, flat: { defense: 24, health: 90 }, pct: { speed: -0.03 }, regions: FH, desc: 'Heavy plate of the highland wardens.' }),
  gear('armor', { id: 'frostforged_plate', name: 'Frostforged Plate', rarity: 'epic', lvl: 18, value: 1300, flat: { defense: 34, health: 130 }, regions: FH, desc: 'Hammered in glacial meltwater until it rang like a bell.' }),
  gear('armor', { id: 'hollow_knight_armor', name: 'Hollow Knight Armor', rarity: 'epic', lvl: 22, value: 1800, flat: { defense: 44, health: 160 }, passives: { damageReduction: 0.05 }, regions: HC, desc: 'Empty armor that still stands guard.' }),
  gear('armor', { id: 'royal_guard_cuirass', name: 'Royal Guard Cuirass', rarity: 'legendary', lvl: 28, value: 4000, flat: { defense: 60, health: 220 }, passives: { damageReduction: 0.08 }, regions: CF, desc: 'The gilded cuirass of the Crown’s last sworn guardians.' }),
];

const HELMETS: ItemDef[] = [
  gear('helmet', { id: 'cloth_hood', name: 'Cloth Hood', rarity: 'common', lvl: 1, value: 12, flat: { defense: 1, mana: 8 }, regions: AV, desc: 'Keeps the ash out of your eyes.' }),
  gear('helmet', { id: 'iron_cap', name: 'Iron Cap', rarity: 'common', lvl: 2, value: 40, flat: { defense: 2, health: 8 }, regions: AV, desc: 'A dented cap. Better than nothing.' }),
  gear('helmet', { id: 'scout_hood', name: 'Scout’s Hood', rarity: 'uncommon', lvl: 5, value: 120, flat: { defense: 3 }, pct: { speed: 0.03 }, regions: WF, desc: 'Dyed forest green, silent on the move.' }),
  gear('helmet', { id: 'steel_helm', name: 'Steel Helm', rarity: 'uncommon', lvl: 9, value: 220, flat: { defense: 6, health: 20 }, regions: FD, desc: 'A plain helm with a narrow visor.' }),
  gear('helmet', { id: 'warden_helm', name: 'Warden Helm', rarity: 'rare', lvl: 15, value: 560, flat: { defense: 11, health: 40 }, regions: FH, desc: 'Horned and frost-scarred.' }),
  gear('helmet', { id: 'hollow_visage', name: 'Hollow Visage', rarity: 'epic', lvl: 22, value: 1400, flat: { defense: 16, health: 60, critChance: 0.03 }, regions: HC, desc: 'A mask with no face behind it.' }),
  gear('helmet', { id: 'crown_of_ashes', name: 'Crown of Ashes', rarity: 'legendary', lvl: 28, value: 3800, flat: { defense: 22, health: 90, mana: 60, critChance: 0.05 }, regions: CF, desc: 'A crown that burned but did not break.' }),
];

const RINGS: ItemDef[] = [
  gear('ring', { id: 'copper_ring', name: 'Copper Ring', rarity: 'common', lvl: 1, value: 25, flat: { defense: 1 }, regions: AV, desc: 'A plain band. Someone once wore it for love.' }),
  gear('ring', { id: 'ring_of_swiftness', name: 'Ring of Swiftness', rarity: 'uncommon', lvl: 5, value: 160, flat: {}, pct: { speed: 0.05 }, regions: WF, desc: 'Your steps feel lighter.' }),
  gear('ring', { id: 'ring_of_vigor', name: 'Ring of Vigor', rarity: 'uncommon', lvl: 8, value: 220, flat: { health: 30 }, passives: { healthRegen: 0.5 }, regions: FD, desc: 'Warm against the skin, steady as a pulse.' }),
  gear('ring', { id: 'ring_of_precision', name: 'Ring of Precision', rarity: 'rare', lvl: 14, value: 600, flat: { critChance: 0.05 }, regions: FH, desc: 'Sharpens the eye.' }),
  gear('ring', { id: 'emberstone_band', name: 'Emberstone Band', rarity: 'epic', lvl: 20, value: 1200, flat: { attack: 8, critDamage: 0.2 }, regions: HC, desc: 'The stone glows brighter the closer death comes.' }),
  gear('ring', { id: 'ring_of_the_betrayed', name: 'Ring of the Betrayed', rarity: 'legendary', lvl: 26, value: 3200, flat: { critChance: 0.06 }, pct: { attack: 0.08 }, passives: { lifesteal: 0.03 }, regions: CF, desc: 'It was never meant to be worn by the living.' }),
];

const AMULETS: ItemDef[] = [
  gear('amulet', { id: 'wooden_charm', name: 'Wooden Charm', rarity: 'common', lvl: 1, value: 18, flat: { health: 10 }, regions: AV, desc: 'Carved by a child who wished you well.' }),
  gear('amulet', { id: 'amulet_of_vitality', name: 'Amulet of Vitality', rarity: 'uncommon', lvl: 6, value: 200, flat: { health: 40, stamina: 10 }, regions: WF, desc: 'A green stone that pulses faintly.' }),
  gear('amulet', { id: 'moonstone_pendant', name: 'Moonstone Pendant', rarity: 'rare', lvl: 13, value: 540, flat: { mana: 40 }, passives: { manaRegen: 1 }, regions: FH, desc: 'Cold light pools in its center.' }),
  gear('amulet', { id: 'desert_sun_amulet', name: 'Sun-Eye Amulet', rarity: 'epic', lvl: 16, value: 1000, flat: { stamina: 30, defense: 6 }, pct: { speed: 0.04 }, regions: FD, desc: 'An eye of gold watching over the dunes.' }),
  gear('amulet', { id: 'frost_tear', name: 'Frozen Tear', rarity: 'epic', lvl: 19, value: 1250, flat: { mana: 80 }, passives: { spellPower: 0.12 }, regions: FH, desc: 'A tear that froze before it could fall.' }),
  gear('amulet', { id: 'soul_of_the_fallen', name: 'Soul of the Fallen', rarity: 'legendary', lvl: 27, value: 3400, flat: { health: 120, attack: 10 }, passives: { damageReduction: 0.05, manaOnKill: 6 }, regions: CF, desc: 'Every hero who fell at Crownfall left a little of themselves behind.' }),
];

const CONSUMABLES: ItemDef[] = [
  cons('health_potion_small', 'Minor Health Potion', 'common', 20, 'Restores 60 health.', { heal: 60 }),
  cons('health_potion', 'Health Potion', 'uncommon', 60, 'Restores 150 health.', { heal: 150 }),
  cons('health_potion_large', 'Greater Health Potion', 'rare', 160, 'Restores 40% of maximum health.', { healPct: 0.4, heal: 80 }),
  cons('mana_potion_small', 'Minor Mana Potion', 'common', 25, 'Restores 30 mana.', { mana: 30 }),
  cons('mana_potion', 'Mana Potion', 'uncommon', 70, 'Restores 90 mana.', { mana: 90 }),
  cons('stamina_tonic', 'Stamina Tonic', 'common', 30, 'Restores 60 stamina.', { stamina: 60 }),
  cons('elixir_of_might', 'Elixir of Might', 'uncommon', 120, '+20% attack for 60 seconds.', { buff: { id: 'elixir_might', durationMs: 60000, stats: [{ stat: 'attack', pct: 0.2 }] } }, 10),
  cons('elixir_of_ironhide', 'Elixir of Ironhide', 'uncommon', 120, '+25% defense for 60 seconds.', { buff: { id: 'elixir_ironhide', durationMs: 60000, stats: [{ stat: 'defense', pct: 0.25 }] } }, 10),
  cons('elixir_of_swiftness', 'Elixir of Swiftness', 'uncommon', 110, '+15% speed for 45 seconds.', { buff: { id: 'elixir_swiftness', durationMs: 45000, stats: [{ stat: 'speed', pct: 0.15 }] } }, 10),
  cons('elixir_of_fury', 'Elixir of Fury', 'rare', 200, '+10% crit chance and +25% crit damage for 45 seconds.', { buff: { id: 'elixir_fury', durationMs: 45000, stats: [{ stat: 'critChance', flat: 0.1 }, { stat: 'critDamage', flat: 0.25 }] } }, 10),
  cons('scroll_of_insight', 'Scroll of Insight', 'rare', 250, 'Grants 300 experience.', { xp: 300 }, 10),
  cons('bandage', 'Linen Bandage', 'common', 8, 'Restores 25 health.', { heal: 25 }),
];

const MATERIALS: ItemDef[] = [
  mat('iron_ore', 'Iron Ore', 'common', 4, 'Raw ore. Smelt it into ingots.'),
  mat('iron_ingot', 'Iron Ingot', 'common', 14, 'A bar of refined iron.'),
  mat('steel_ingot', 'Steel Ingot', 'uncommon', 45, 'Iron tempered with carbon. Strong and flexible.'),
  mat('leather_scrap', 'Leather Scrap', 'common', 5, 'Tanned hide offcuts.'),
  mat('healing_herb', 'Healing Herb', 'common', 6, 'A bitter herb with restorative properties.'),
  mat('spirit_moss', 'Spirit Moss', 'uncommon', 12, 'Glowing moss from the Whispering Forest.'),
  mat('wolf_fang', 'Wolf Fang', 'common', 8, 'A sharp fang taken from a forest predator.'),
  mat('sun_glass', 'Sun Glass', 'uncommon', 20, 'Desert sand fused by ancient lightning.'),
  mat('frost_crystal', 'Frost Crystal', 'rare', 35, 'A crystal that never warms.'),
  mat('hollow_essence', 'Hollow Essence', 'rare', 60, 'Residue of the Hollow City’s fallen.'),
  mat('royal_ember', 'Royal Ember', 'epic', 120, 'A coal from the Crown’s eternal fire.'),
];

const QUEST_ITEMS: ItemDef[] = [
  quest('darkens_signet', 'Darken’s Signet', 'The commander’s seal ring. Proof of the betrayal.'),
  quest('royal_seal_fragment', 'Royal Seal Fragment', 'A shard of the broken royal seal.'),
  quest('forest_key', 'Warden’s Key', 'An iron key slick with moss.'),
  quest('desert_map', 'Tattered Desert Map', 'A map to a city swallowed by sand.'),
  quest('frozen_relic', 'Frozen Relic', 'A relic sealed in highland ice.'),
  quest('crown_fragment', 'Crown Fragment', 'A fragment of the shattered crown. Needed to forge the Crownbreaker.'),
];

export const ITEM_LIST: ItemDef[] = [...WEAPONS, ...ARMORS, ...HELMETS, ...RINGS, ...AMULETS, ...CONSUMABLES, ...MATERIALS, ...QUEST_ITEMS];
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]));

export function getItemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`[rpg] Unknown item id "${id}"`);
  return d;
}
export function isEquipment(def: ItemDef): boolean {
  return def.type === 'weapon' || def.type === 'armor' || def.type === 'helmet' || def.type === 'ring' || def.type === 'amulet';
}
