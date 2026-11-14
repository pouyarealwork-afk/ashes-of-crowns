import type { PartialPassives, StatMod, TreeId } from '../types';

export type AbilityKind = 'melee' | 'aoe' | 'projectile' | 'buff' | 'dash' | 'dot' | 'execute' | 'ultimate';

/** Static ability definition. Combat executes the returned AbilityEffect; RPG handles costs, cooldowns, buffs and damage math. */
export interface AbilityDef {
  id: string; kind: AbilityKind; school: 'physical' | 'magic';
  baseMultiplier: number; perRankMultiplier: number;
  manaCost: number; staminaCost: number; cooldownMs: number;
  /** Non-damage effect values scale by (1 + rankScale * (rank - 1)). */
  rankScale: number;
  radius?: number; durationMs?: number; slowPct?: number; dotMultiplierPerSec?: number; dashDistance?: number; invulnMs?: number; healPct?: number;
  executeThreshold?: number; executeMultiplier?: number; behindBonus?: number; guaranteedCrit?: boolean;
  buff?: { stats?: StatMod[]; passives?: PartialPassives; flags?: string[] };
}

/** What the combat module must apply in the world after `tryUseAbility` succeeds. Values are already rank-scaled. */
export interface AbilityEffect {
  abilityId: string; kind: AbilityKind; school: 'physical' | 'magic'; multiplier: number;
  radius?: number; durationMs?: number; slowPct?: number; dotMultiplierPerSec?: number; dashDistance?: number; invulnMs?: number; healPct?: number;
  executeThreshold?: number; executeMultiplier?: number; behindBonus?: number; guaranteedCrit?: boolean;
}

export interface SkillNode {
  id: string; tree: TreeId; name: string; description: string;
  /** UI layout: row = tier (1..5), col = 0..2. */
  tier: number; col: number;
  maxRank: number; costPerRank: number; levelReq: number;
  /** Skill points that must already be spent in this tree (excluding this node). */
  treePointsReq: number;
  requires?: { skillId: string; rank: number }[];
  /** Applied PER RANK to character stats / passives. */
  statMods?: StatMod[]; passives?: PartialPassives;
  ability?: AbilityDef;
  icon: string;
}

const node = (n: Omit<SkillNode, 'icon' | 'treePointsReq' | 'costPerRank' | 'levelReq'> & Partial<Pick<SkillNode, 'treePointsReq' | 'costPerRank' | 'levelReq'>>): SkillNode =>
  ({ treePointsReq: 0, costPerRank: 1, levelReq: 1, ...n, icon: `skill_${n.id}` });
const ab = (a: Omit<AbilityDef, 'rankScale' | 'manaCost' | 'staminaCost'> & Partial<Pick<AbilityDef, 'rankScale' | 'manaCost' | 'staminaCost'>>): AbilityDef =>
  ({ rankScale: 0.2, manaCost: 0, staminaCost: 0, ...a });

const WARRIOR: SkillNode[] = [
  node({ id: 'w_toughness', tree: 'warrior', name: 'Toughness', description: '+5% maximum health per rank.', tier: 1, col: 0, maxRank: 5, statMods: [{ stat: 'health', pct: 0.05 }] }),
  node({ id: 'w_power_strike', tree: 'warrior', name: 'Power Strike', description: 'A heavy blow dealing 180% weapon damage (+25% per rank).', tier: 1, col: 1, maxRank: 3,
    ability: ab({ id: 'w_power_strike', kind: 'melee', school: 'physical', baseMultiplier: 1.8, perRankMultiplier: 0.25, staminaCost: 20, cooldownMs: 4000 }) }),
  node({ id: 'w_iron_skin', tree: 'warrior', name: 'Iron Skin', description: '+4 defense per rank.', tier: 2, col: 0, maxRank: 4, levelReq: 3, requires: [{ skillId: 'w_toughness', rank: 2 }], statMods: [{ stat: 'defense', flat: 4 }] }),
  node({ id: 'w_battle_cry', tree: 'warrior', name: 'Battle Cry', description: '+25% attack for 8s (strength +20% per rank).', tier: 2, col: 1, maxRank: 3, levelReq: 5, requires: [{ skillId: 'w_power_strike', rank: 1 }],
    ability: ab({ id: 'w_battle_cry', kind: 'buff', school: 'physical', baseMultiplier: 0, perRankMultiplier: 0, staminaCost: 25, cooldownMs: 20000, durationMs: 8000, buff: { stats: [{ stat: 'attack', pct: 0.25 }] } }) }),
  node({ id: 'w_second_wind', tree: 'warrior', name: 'Second Wind', description: 'Regenerate 1 health per second per rank.', tier: 2, col: 2, maxRank: 3, levelReq: 4, requires: [{ skillId: 'w_iron_skin', rank: 1 }], passives: { healthRegen: 1 } }),
  node({ id: 'w_whirlwind', tree: 'warrior', name: 'Whirlwind', description: 'Spin, hitting all nearby enemies for 130% damage (+20% per rank).', tier: 3, col: 1, maxRank: 3, levelReq: 8, treePointsReq: 4, requires: [{ skillId: 'w_battle_cry', rank: 1 }],
    ability: ab({ id: 'w_whirlwind', kind: 'aoe', school: 'physical', baseMultiplier: 1.3, perRankMultiplier: 0.2, staminaCost: 35, cooldownMs: 8000, radius: 150 }) }),
  node({ id: 'w_bloodthirst', tree: 'warrior', name: 'Bloodthirst', description: 'Heal for 3% of damage dealt per rank.', tier: 4, col: 2, maxRank: 3, levelReq: 12, treePointsReq: 8,
    requires: [{ skillId: 'w_whirlwind', rank: 1 }, { skillId: 'w_second_wind', rank: 1 }], passives: { lifesteal: 0.03 } }),
  node({ id: 'w_unbreakable', tree: 'warrior', name: 'Unbreakable', description: 'Become invulnerable for 3.5s, heal 30% max health and gain +50% defense for 8s.', tier: 5, col: 1, maxRank: 1, costPerRank: 3, levelReq: 20, treePointsReq: 15,
    requires: [{ skillId: 'w_bloodthirst', rank: 1 }, { skillId: 'w_whirlwind', rank: 2 }],
    ability: ab({ id: 'w_unbreakable', kind: 'ultimate', school: 'physical', baseMultiplier: 0, perRankMultiplier: 0, staminaCost: 50, cooldownMs: 60000, durationMs: 8000, invulnMs: 3500, healPct: 0.3, buff: { stats: [{ stat: 'defense', pct: 0.5 }] } }) }),
];

const ARCANE: SkillNode[] = [
  node({ id: 'a_mana_well', tree: 'arcane', name: 'Mana Well', description: '+15 maximum mana per rank.', tier: 1, col: 0, maxRank: 5, statMods: [{ stat: 'mana', flat: 15 }] }),
  node({ id: 'a_arc_bolt', tree: 'arcane', name: 'Arc Bolt', description: 'Launch a bolt dealing 160% magic damage (+20% per rank).', tier: 1, col: 1, maxRank: 3,
    ability: ab({ id: 'a_arc_bolt', kind: 'projectile', school: 'magic', baseMultiplier: 1.6, perRankMultiplier: 0.2, manaCost: 12, cooldownMs: 1500 }) }),
  node({ id: 'a_focus', tree: 'arcane', name: 'Focus', description: '+3% critical chance per rank.', tier: 2, col: 0, maxRank: 3, levelReq: 3, requires: [{ skillId: 'a_mana_well', rank: 2 }], statMods: [{ stat: 'critChance', flat: 0.03 }] }),
  node({ id: 'a_frost_nova', tree: 'arcane', name: 'Frost Nova', description: 'Blast of cold: 120% damage in a radius, slows enemies 40% for 3s.', tier: 2, col: 1, maxRank: 3, levelReq: 5, requires: [{ skillId: 'a_arc_bolt', rank: 1 }],
    ability: ab({ id: 'a_frost_nova', kind: 'aoe', school: 'magic', baseMultiplier: 1.2, perRankMultiplier: 0.15, manaCost: 25, cooldownMs: 10000, radius: 170, slowPct: 0.4, durationMs: 3000 }) }),
  node({ id: 'a_mana_flow', tree: 'arcane', name: 'Mana Flow', description: 'Regenerate 1 mana per second per rank.', tier: 2, col: 2, maxRank: 3, levelReq: 4, requires: [{ skillId: 'a_mana_well', rank: 3 }], passives: { manaRegen: 1 } }),
  node({ id: 'a_arcane_mastery', tree: 'arcane', name: 'Arcane Mastery', description: '+8% spell power per rank.', tier: 3, col: 0, maxRank: 4, levelReq: 8, treePointsReq: 5, requires: [{ skillId: 'a_focus', rank: 2 }], passives: { spellPower: 0.08 } }),
  node({ id: 'a_meteor', tree: 'arcane', name: 'Meteor', description: 'Call a meteor: 260% damage in a wide radius plus burning for 4s.', tier: 3, col: 1, maxRank: 3, levelReq: 10, treePointsReq: 6, requires: [{ skillId: 'a_frost_nova', rank: 1 }],
    ability: ab({ id: 'a_meteor', kind: 'aoe', school: 'magic', baseMultiplier: 2.6, perRankMultiplier: 0.35, manaCost: 45, cooldownMs: 14000, radius: 200, dotMultiplierPerSec: 0.3, durationMs: 4000 }) }),
  node({ id: 'a_siphon', tree: 'arcane', name: 'Mana Siphon', description: 'Recover 8 mana per kill and reduce mana costs by 5% per rank.', tier: 4, col: 2, maxRank: 3, levelReq: 13, treePointsReq: 9,
    requires: [{ skillId: 'a_mana_flow', rank: 2 }, { skillId: 'a_arcane_mastery', rank: 1 }], passives: { manaOnKill: 8, manaCostReduction: 0.05 } }),
  node({ id: 'a_ascension', tree: 'arcane', name: 'Arcane Ascension', description: 'For 10s gain +50% spell power and halve mana costs.', tier: 5, col: 1, maxRank: 1, costPerRank: 3, levelReq: 20, treePointsReq: 15,
    requires: [{ skillId: 'a_meteor', rank: 1 }, { skillId: 'a_siphon', rank: 1 }],
    ability: ab({ id: 'a_ascension', kind: 'ultimate', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 60, cooldownMs: 60000, durationMs: 10000, buff: { passives: { spellPower: 0.5, manaCostReduction: 0.5 } } }) }),
];

const SHADOW: SkillNode[] = [
  node({ id: 's_fleet_foot', tree: 'shadow', name: 'Fleet Foot', description: '+4% movement speed per rank.', tier: 1, col: 0, maxRank: 5, statMods: [{ stat: 'speed', pct: 0.04 }] }),
  node({ id: 's_backstab', tree: 'shadow', name: 'Backstab', description: '160% damage; from behind +80% and a guaranteed critical hit.', tier: 1, col: 1, maxRank: 3,
    ability: ab({ id: 's_backstab', kind: 'melee', school: 'physical', baseMultiplier: 1.6, perRankMultiplier: 0.25, staminaCost: 18, cooldownMs: 5000, behindBonus: 0.8, guaranteedCrit: true }) }),
  node({ id: 's_keen_edge', tree: 'shadow', name: 'Keen Edge', description: '+3% critical chance per rank.', tier: 2, col: 0, maxRank: 5, levelReq: 3, requires: [{ skillId: 's_fleet_foot', rank: 1 }], statMods: [{ stat: 'critChance', flat: 0.03 }] }),
  node({ id: 's_shadow_step', tree: 'shadow', name: 'Shadow Step', description: 'Dash 180 units, invulnerable for 0.3s.', tier: 2, col: 1, maxRank: 3, levelReq: 5, requires: [{ skillId: 's_backstab', rank: 1 }],
    ability: ab({ id: 's_shadow_step', kind: 'dash', school: 'physical', baseMultiplier: 0, perRankMultiplier: 0, staminaCost: 25, cooldownMs: 6000, dashDistance: 180, invulnMs: 300, rankScale: 0.15 }) }),
  node({ id: 's_evasion', tree: 'shadow', name: 'Evasion', description: '+3% chance to dodge attacks per rank.', tier: 2, col: 2, maxRank: 4, levelReq: 4, requires: [{ skillId: 's_fleet_foot', rank: 2 }], passives: { dodgeChance: 0.03 } }),
  node({ id: 's_deadly_precision', tree: 'shadow', name: 'Deadly Precision', description: '+15% critical damage per rank.', tier: 3, col: 0, maxRank: 3, levelReq: 8, treePointsReq: 5, requires: [{ skillId: 's_keen_edge', rank: 2 }], statMods: [{ stat: 'critDamage', flat: 0.15 }] }),
  node({ id: 's_poison_blade', tree: 'shadow', name: 'Poison Blade', description: '60% damage plus poison dealing 25% attack per second for 5s.', tier: 3, col: 1, maxRank: 3, levelReq: 10, treePointsReq: 6, requires: [{ skillId: 's_shadow_step', rank: 1 }],
    ability: ab({ id: 's_poison_blade', kind: 'dot', school: 'physical', baseMultiplier: 0.6, perRankMultiplier: 0.1, staminaCost: 20, cooldownMs: 9000, dotMultiplierPerSec: 0.25, durationMs: 5000 }) }),
  node({ id: 's_predator', tree: 'shadow', name: 'Predator', description: '+3 stamina regen per second and +5% gold find per rank.', tier: 4, col: 2, maxRank: 3, levelReq: 13, treePointsReq: 9,
    requires: [{ skillId: 's_evasion', rank: 2 }, { skillId: 's_deadly_precision', rank: 1 }], passives: { staminaRegen: 3, goldFind: 0.05 } }),
  node({ id: 's_umbral_execution', tree: 'shadow', name: 'Umbral Execution', description: '250% damage; 350% against enemies below 30% health. Always critical.', tier: 5, col: 1, maxRank: 1, costPerRank: 3, levelReq: 20, treePointsReq: 15,
    requires: [{ skillId: 's_poison_blade', rank: 1 }, { skillId: 's_predator', rank: 1 }],
    ability: ab({ id: 's_umbral_execution', kind: 'execute', school: 'physical', baseMultiplier: 2.5, perRankMultiplier: 0, staminaCost: 40, cooldownMs: 30000, executeThreshold: 0.3, executeMultiplier: 3.5, guaranteedCrit: true }) }),
];

const WARDEN: SkillNode[] = [
  node({ id: 'd_living_bark', tree: 'warden', name: 'Living Bark', description: '+5% maximum health and +1 defense per rank.', tier: 1, col: 0, maxRank: 4, statMods: [{ stat: 'health', pct: 0.05 }, { stat: 'defense', flat: 1 }] }),
  node({ id: 'd_bloom_guard', tree: 'warden', name: 'Bloom Guard', description: 'Raise a calm nature ward: +18% defense and +2 health regeneration for 8 seconds.', tier: 1, col: 1, maxRank: 3,
    ability: ab({ id: 'd_bloom_guard', kind: 'buff', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 18, cooldownMs: 12000, durationMs: 8000, buff: { stats: [{ stat: 'defense', pct: 0.18 }], passives: { healthRegen: 2 } } }) }),
  node({ id: 'd_soft_rain', tree: 'warden', name: 'Soft Rain', description: '+1.5 health regeneration per second per rank.', tier: 2, col: 0, maxRank: 3, levelReq: 3, requires: [{ skillId: 'd_living_bark', rank: 2 }], passives: { healthRegen: 1.5 } }),
  node({ id: 'd_moss_stride', tree: 'warden', name: 'Moss Stride', description: 'A short nature-guided step that briefly protects you from interruption.', tier: 2, col: 1, maxRank: 3, levelReq: 5, requires: [{ skillId: 'd_bloom_guard', rank: 1 }],
    ability: ab({ id: 'd_moss_stride', kind: 'dash', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 16, cooldownMs: 7000, dashDistance: 150, invulnMs: 220, rankScale: 0.18 }) }),
  node({ id: 'd_deep_roots', tree: 'warden', name: 'Deep Roots', description: '+4% damage reduction per rank.', tier: 2, col: 2, maxRank: 4, levelReq: 4, requires: [{ skillId: 'd_living_bark', rank: 2 }], passives: { damageReduction: 0.04 } }),
  node({ id: 'd_sanctuary', tree: 'warden', name: 'Sanctuary', description: 'Create a protective field: +25% defense and +15% damage reduction for 10 seconds.', tier: 3, col: 1, maxRank: 2, levelReq: 9, treePointsReq: 5, requires: [{ skillId: 'd_moss_stride', rank: 1 }, { skillId: 'd_soft_rain', rank: 1 }],
    ability: ab({ id: 'd_sanctuary', kind: 'buff', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 32, cooldownMs: 22000, durationMs: 10000, buff: { stats: [{ stat: 'defense', pct: 0.25 }], passives: { damageReduction: 0.15 } } }) }),
  node({ id: 'd_green_memory', tree: 'warden', name: 'Green Memory', description: '+8% maximum mana and +2 mana regeneration per rank.', tier: 4, col: 2, maxRank: 3, levelReq: 13, treePointsReq: 9, requires: [{ skillId: 'd_deep_roots', rank: 2 }], statMods: [{ stat: 'mana', pct: 0.08 }], passives: { manaRegen: 2 } }),
  node({ id: 'd_evergreen_heart', tree: 'warden', name: 'Evergreen Heart', description: 'For 12 seconds gain +35% damage reduction and strong health regeneration.', tier: 5, col: 1, maxRank: 1, costPerRank: 3, levelReq: 20, treePointsReq: 15, requires: [{ skillId: 'd_sanctuary', rank: 1 }, { skillId: 'd_green_memory', rank: 1 }],
    ability: ab({ id: 'd_evergreen_heart', kind: 'ultimate', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 55, cooldownMs: 65000, durationMs: 12000, buff: { passives: { damageReduction: 0.35, healthRegen: 5, manaRegen: 2 } } }) }),
];

const ORACLE: SkillNode[] = [
  node({ id: 'o_clear_mind', tree: 'oracle', name: 'Clear Mind', description: '+12 maximum mana per rank.', tier: 1, col: 0, maxRank: 5, statMods: [{ stat: 'mana', flat: 12 }] }),
  node({ id: 'o_second_sight', tree: 'oracle', name: 'Second Sight', description: 'Sharpen awareness: +12% movement speed and +10% dodge chance for 7 seconds.', tier: 1, col: 1, maxRank: 3,
    ability: ab({ id: 'o_second_sight', kind: 'buff', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 18, cooldownMs: 14000, durationMs: 7000, buff: { stats: [{ stat: 'speed', pct: 0.12 }], passives: { dodgeChance: 0.1 } } }) }),
  node({ id: 'o_lucid_focus', tree: 'oracle', name: 'Lucid Focus', description: '+1.5 mana regeneration per second per rank.', tier: 2, col: 0, maxRank: 3, levelReq: 3, requires: [{ skillId: 'o_clear_mind', rank: 2 }], passives: { manaRegen: 1.5 } }),
  node({ id: 'o_phase_step', tree: 'oracle', name: 'Phase Step', description: 'Slip a short distance through a fold in space.', tier: 2, col: 1, maxRank: 3, levelReq: 5, requires: [{ skillId: 'o_second_sight', rank: 1 }],
    ability: ab({ id: 'o_phase_step', kind: 'dash', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 22, cooldownMs: 8000, dashDistance: 190, invulnMs: 250, rankScale: 0.2 }) }),
  node({ id: 'o_fate_thread', tree: 'oracle', name: 'Fate Thread', description: '+3% dodge chance and +2% critical chance per rank.', tier: 2, col: 2, maxRank: 4, levelReq: 4, requires: [{ skillId: 'o_clear_mind', rank: 2 }], passives: { dodgeChance: 0.03 }, statMods: [{ stat: 'critChance', flat: 0.02 }] }),
  node({ id: 'o_fateweave', tree: 'oracle', name: 'Fateweave', description: 'For 9 seconds gain +20% movement speed and +20% mana cost reduction.', tier: 3, col: 1, maxRank: 2, levelReq: 9, treePointsReq: 5, requires: [{ skillId: 'o_phase_step', rank: 1 }, { skillId: 'o_lucid_focus', rank: 1 }],
    ability: ab({ id: 'o_fateweave', kind: 'buff', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 30, cooldownMs: 24000, durationMs: 9000, buff: { stats: [{ stat: 'speed', pct: 0.2 }], passives: { manaCostReduction: 0.2 } } }) }),
  node({ id: 'o_still_water', tree: 'oracle', name: 'Still Water', description: '+5% damage reduction per rank.', tier: 4, col: 2, maxRank: 3, levelReq: 13, treePointsReq: 9, requires: [{ skillId: 'o_fate_thread', rank: 2 }], passives: { damageReduction: 0.05 } }),
  node({ id: 'o_timeless_veil', tree: 'oracle', name: 'Timeless Veil', description: 'For 10 seconds gain +30% dodge chance, +25% speed and +25% damage reduction.', tier: 5, col: 1, maxRank: 1, costPerRank: 3, levelReq: 20, treePointsReq: 15, requires: [{ skillId: 'o_fateweave', rank: 1 }, { skillId: 'o_still_water', rank: 1 }],
    ability: ab({ id: 'o_timeless_veil', kind: 'ultimate', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 58, cooldownMs: 65000, durationMs: 10000, buff: { stats: [{ stat: 'speed', pct: 0.25 }], passives: { dodgeChance: 0.3, damageReduction: 0.25 } } }) }),
];

const BARD: SkillNode[] = [
  node({ id: 'b_warm_resonance', tree: 'bard', name: 'Warm Resonance', description: '+5% maximum health and +5% maximum mana per rank.', tier: 1, col: 0, maxRank: 4, statMods: [{ stat: 'health', pct: 0.05 }, { stat: 'mana', pct: 0.05 }] }),
  node({ id: 'b_steady_beat', tree: 'bard', name: 'Steady Beat', description: 'A measured rhythm restores stamina and health over 8 seconds.', tier: 1, col: 1, maxRank: 3,
    ability: ab({ id: 'b_steady_beat', kind: 'buff', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 18, cooldownMs: 14000, durationMs: 8000, buff: { passives: { staminaRegen: 7, healthRegen: 1.5 } } }) }),
  node({ id: 'b_travel_song', tree: 'bard', name: 'Travel Song', description: '+4% movement speed per rank.', tier: 2, col: 0, maxRank: 4, levelReq: 3, requires: [{ skillId: 'b_warm_resonance', rank: 2 }], statMods: [{ stat: 'speed', pct: 0.04 }] }),
  node({ id: 'b_resonant_step', tree: 'bard', name: 'Resonant Step', description: 'A brief rhythm carries you forward and reduces interruption.', tier: 2, col: 1, maxRank: 3, levelReq: 5, requires: [{ skillId: 'b_steady_beat', rank: 1 }],
    ability: ab({ id: 'b_resonant_step', kind: 'dash', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 16, cooldownMs: 7500, dashDistance: 155, invulnMs: 220, rankScale: 0.16 }) }),
  node({ id: 'b_shared_breath', tree: 'bard', name: 'Shared Breath', description: '+2 mana regeneration per second per rank.', tier: 2, col: 2, maxRank: 3, levelReq: 4, requires: [{ skillId: 'b_warm_resonance', rank: 2 }], passives: { manaRegen: 2 } }),
  node({ id: 'b_chorus', tree: 'bard', name: 'Chorus of Shelter', description: 'A steady chorus grants +20% defense and +12% damage reduction for 9 seconds.', tier: 3, col: 1, maxRank: 2, levelReq: 9, treePointsReq: 5, requires: [{ skillId: 'b_resonant_step', rank: 1 }, { skillId: 'b_shared_breath', rank: 1 }],
    ability: ab({ id: 'b_chorus', kind: 'buff', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 28, cooldownMs: 22000, durationMs: 9000, buff: { stats: [{ stat: 'defense', pct: 0.2 }], passives: { damageReduction: 0.12 } } }) }),
  node({ id: 'b_kindred_tune', tree: 'bard', name: 'Kindred Tune', description: '+2 health regeneration and +2 stamina regeneration per rank.', tier: 4, col: 2, maxRank: 3, levelReq: 13, treePointsReq: 9, requires: [{ skillId: 'b_travel_song', rank: 2 }], passives: { healthRegen: 2, staminaRegen: 2 } }),
  node({ id: 'b_harmony', tree: 'bard', name: 'Grand Harmony', description: 'For 12 seconds gain strong health, mana and stamina regeneration with +20% damage reduction.', tier: 5, col: 1, maxRank: 1, costPerRank: 3, levelReq: 20, treePointsReq: 15, requires: [{ skillId: 'b_chorus', rank: 1 }, { skillId: 'b_kindred_tune', rank: 1 }],
    ability: ab({ id: 'b_harmony', kind: 'ultimate', school: 'magic', baseMultiplier: 0, perRankMultiplier: 0, manaCost: 55, cooldownMs: 65000, durationMs: 12000, buff: { passives: { healthRegen: 4, manaRegen: 4, staminaRegen: 8, damageReduction: 0.2 } } }) }),
];

export const SKILL_TREES: Record<TreeId, { id: TreeId; name: string; description: string; nodes: SkillNode[] }> = {
  warrior: { id: 'warrior', name: 'Warrior', description: 'Endure, strike hard, and outlast every enemy.', nodes: WARRIOR },
  arcane: { id: 'arcane', name: 'Arcane', description: 'Command raw magic from afar.', nodes: ARCANE },
  shadow: { id: 'shadow', name: 'Shadow', description: 'Strike from darkness with speed and precision.', nodes: SHADOW },
  warden: { id: 'warden', name: 'Warden', description: 'A guardian of living roots, protective fields and restorative nature magic.', nodes: WARDEN },
  oracle: { id: 'oracle', name: 'Oracle', description: 'Read the flow of time, foresee danger and bend space to move safely.', nodes: ORACLE },
  bard: { id: 'bard', name: 'Bard', description: 'Support allies and sustain yourself through restorative resonance.', nodes: BARD },
};
export const SKILLS: Record<string, SkillNode> = Object.fromEntries(Object.values(SKILL_TREES).flatMap((t) => t.nodes).map((n) => [n.id, n]));
export function getSkill(id: string): SkillNode | undefined { return SKILLS[id]; }
