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

export const SKILL_TREES: Record<TreeId, { id: TreeId; name: string; description: string; nodes: SkillNode[] }> = {
  warrior: { id: 'warrior', name: 'Warrior', description: 'Endure, strike hard, and outlast every enemy.', nodes: WARRIOR },
  arcane: { id: 'arcane', name: 'Arcane', description: 'Command raw magic from afar.', nodes: ARCANE },
  shadow: { id: 'shadow', name: 'Shadow', description: 'Strike from darkness with speed and precision.', nodes: SHADOW },
};
export const SKILLS: Record<string, SkillNode> = Object.fromEntries(Object.values(SKILL_TREES).flatMap((t) => t.nodes).map((n) => [n.id, n]));
export function getSkill(id: string): SkillNode | undefined { return SKILLS[id]; }
