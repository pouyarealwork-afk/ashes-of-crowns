import type { Result, TreeId } from '../types';
import { fail } from '../types';
import type { RpgContext } from '../core/context';
import { HOTBAR_SIZE } from '../data/config';
import type { AbilityEffect, AbilityDef, SkillNode } from '../data/skills';
import { SKILL_TREES, SKILLS } from '../data/skills';
import type { BuffSystem } from './BuffSystem';
import type { EconomySystem } from './EconomySystem';

export interface SkillNodeView {
  node: SkillNode; rank: number; canRank: boolean; blockedReason: string | null; isAbility: boolean; cooldownRemainingMs: number;
}
export interface AbilityUseResult { abilityId: string; rank: number; manaCost: number; staminaCost: number; cooldownMs: number; effect: AbilityEffect }

export class SkillSystem {
  private ctx: RpgContext;
  private buffs: BuffSystem;
  private economy: EconomySystem;
  constructor(ctx: RpgContext, buffs: BuffSystem, economy: EconomySystem) { this.ctx = ctx; this.buffs = buffs; this.economy = economy; }

  getRank(skillId: string): number { return this.ctx.state.skills[skillId] ?? 0; }
  pointsSpent(tree: TreeId): number {
    return SKILL_TREES[tree].nodes.reduce((n, s) => n + this.getRank(s.id) * s.costPerRank, 0);
  }
  totalPointsSpent(): number { return (Object.keys(SKILL_TREES) as TreeId[]).reduce((n, t) => n + this.pointsSpent(t), 0); }

  /** Why a skill cannot be ranked up right now (null when it can). */
  blockedReason(skillId: string): string | null {
    const n = SKILLS[skillId];
    if (!n) return 'Unknown skill.';
    const rank = this.getRank(skillId);
    if (rank >= n.maxRank) return 'Skill is already at max rank.';
    if (this.ctx.state.level < n.levelReq) return `Requires level ${n.levelReq}.`;
    if (this.ctx.state.skillPoints < n.costPerRank) return `Requires ${n.costPerRank} skill point${n.costPerRank > 1 ? 's' : ''}.`;
    const spent = this.pointsSpent(n.tree) - rank * n.costPerRank;
    if (spent < n.treePointsReq) return `Spend ${n.treePointsReq} points in the ${SKILL_TREES[n.tree].name} tree first.`;
    for (const r of n.requires ?? []) if (this.getRank(r.skillId) < r.rank) return `Requires ${SKILLS[r.skillId]?.name ?? r.skillId} rank ${r.rank}.`;
    return null;
  }

  /** Grants a class-signature node without spending a level-up point. Used only when creating a new character. */
  grantStartingSkill(skillId: string): Result<{ rank: number }> {
    const n = SKILLS[skillId];
    if (!n) return fail('unknown_skill');
    const current = this.getRank(skillId);
    if (current > 0) return { ok: true, rank: current };
    this.ctx.state.skills[skillId] = 1;
    if (n.ability) this.autoAssignHotbar(n.ability.id);
    this.ctx.statsChanged();
    this.ctx.events.emit('rpg:skill-ranked', { skillId, rank: 1, tree: n.tree, skillPoints: this.ctx.state.skillPoints });
    return { ok: true, rank: 1 };
  }

  /** Grants one active signature ability without spending a level-up point. */
  grantStartingAbility(skillId: string): Result<{ rank: number }> {
    const n = SKILLS[skillId];
    if (!n) return fail('unknown_skill');
    if (!n.ability) return fail('not_usable');
    return this.grantStartingSkill(skillId);
  }

  rankUp(skillId: string): Result<{ rank: number }> {
    const n = SKILLS[skillId];
    if (!n) return fail('unknown_skill');
    if (this.getRank(skillId) >= n.maxRank) return fail('max_rank');
    if (this.ctx.state.skillPoints < n.costPerRank) return fail('no_skill_points');
    if (this.blockedReason(skillId)) return fail('requirements_not_met');
    this.ctx.state.skillPoints -= n.costPerRank;
    const rank = this.getRank(skillId) + 1;
    this.ctx.state.skills[skillId] = rank;
    if (n.ability && rank === 1) this.autoAssignHotbar(n.ability.id);
    this.ctx.statsChanged();
    this.ctx.events.emit('rpg:skill-ranked', { skillId, rank, tree: n.tree, skillPoints: this.ctx.state.skillPoints });
    return { ok: true, rank };
  }

  getTree(tree: TreeId): { id: TreeId; name: string; description: string; pointsSpent: number; nodes: SkillNodeView[] } {
    const t = SKILL_TREES[tree];
    return {
      id: t.id, name: t.name, description: t.description, pointsSpent: this.pointsSpent(tree),
      nodes: t.nodes.map((node) => { const reason = this.blockedReason(node.id); return { node, rank: this.getRank(node.id), canRank: reason === null, blockedReason: reason, isAbility: !!node.ability, cooldownRemainingMs: this.cooldownRemaining(node.id) }; }),
    };
  }

  respecCost(): number { return 25 * this.ctx.state.level; }
  /** Refunds every skill point for a gold fee (25 * level). */
  respec(): Result<{ refunded: number; cost: number }> {
    const cost = this.respecCost();
    const spent = this.totalPointsSpent();
    if (spent === 0) return fail('not_learned');
    const paid = this.economy.spend({ gold: cost });
    if (!paid.ok) return paid;
    this.ctx.state.skills = {}; this.ctx.state.skillPoints += spent; this.ctx.state.respecCount += 1;
    this.ctx.state.hotbar = this.ctx.state.hotbar.map(() => null);
    for (const k of Object.keys(this.ctx.cooldowns)) if (k.startsWith('ability:')) delete this.ctx.cooldowns[k];
    this.buffs.clear();
    this.ctx.statsChanged();
    this.ctx.events.emit('rpg:skills-respec', { refunded: spent, cost });
    this.ctx.events.emit('rpg:hotbar-changed', { hotbar: [...this.ctx.state.hotbar] });
    return { ok: true, refunded: spent, cost };
  }

  // ---- abilities ----
  getUnlockedAbilities(): AbilityDef[] {
    return Object.keys(this.ctx.state.skills).map((id) => SKILLS[id]?.ability).filter((a): a is AbilityDef => !!a && this.getRank(a.id) > 0);
  }
  getHotbar(): (string | null)[] { return [...this.ctx.state.hotbar]; }
  setHotbar(slot: number, abilityId: string | null): Result {
    if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SIZE) return fail('invalid_slot');
    if (abilityId !== null && this.getRank(abilityId) <= 0) return fail('not_learned');
    if (abilityId !== null && !SKILLS[abilityId]?.ability) return fail('not_usable');
    if (abilityId !== null) this.ctx.state.hotbar = this.ctx.state.hotbar.map((a) => (a === abilityId ? null : a));
    this.ctx.state.hotbar[slot] = abilityId;
    this.ctx.events.emit('rpg:hotbar-changed', { hotbar: [...this.ctx.state.hotbar] });
    return { ok: true };
  }
  private autoAssignHotbar(abilityId: string): void {
    const i = this.ctx.state.hotbar.indexOf(null);
    if (i >= 0 && !this.ctx.state.hotbar.includes(abilityId)) { this.ctx.state.hotbar[i] = abilityId; this.ctx.events.emit('rpg:hotbar-changed', { hotbar: [...this.ctx.state.hotbar] }); }
  }

  cooldownRemaining(abilityId: string): number { return Math.max(0, this.ctx.cooldowns[`ability:${abilityId}`] ?? 0); }
  /** Resource costs after Mana Siphon / Arcane Ascension reductions. */
  getAbilityCost(abilityId: string): { manaCost: number; staminaCost: number } | null {
    const a = SKILLS[abilityId]?.ability; if (!a) return null;
    const red = this.ctx.stats.getPassives().manaCostReduction;
    return { manaCost: Math.ceil(a.manaCost * (1 - red)), staminaCost: a.staminaCost };
  }
  buildEffect(abilityId: string): AbilityEffect | null {
    const a = SKILLS[abilityId]?.ability; const rank = this.getRank(abilityId);
    if (!a || rank <= 0) return null;
    const scale = 1 + a.rankScale * (rank - 1);
    const e: AbilityEffect = { abilityId, kind: a.kind, school: a.school, multiplier: Math.round((a.baseMultiplier + a.perRankMultiplier * (rank - 1)) * 1000) / 1000 };
    if (a.radius !== undefined) e.radius = a.radius;
    if (a.durationMs !== undefined) e.durationMs = a.durationMs;
    if (a.slowPct !== undefined) e.slowPct = Math.min(0.9, a.slowPct * scale);
    if (a.dotMultiplierPerSec !== undefined) e.dotMultiplierPerSec = a.dotMultiplierPerSec * scale;
    if (a.dashDistance !== undefined) e.dashDistance = Math.round(a.dashDistance * scale);
    if (a.invulnMs !== undefined) e.invulnMs = a.invulnMs;
    if (a.healPct !== undefined) e.healPct = a.healPct;
    if (a.executeThreshold !== undefined) e.executeThreshold = a.executeThreshold;
    if (a.executeMultiplier !== undefined) e.executeMultiplier = a.executeMultiplier;
    if (a.behindBonus !== undefined) e.behindBonus = a.behindBonus;
    if (a.guaranteedCrit) e.guaranteedCrit = true;
    return e;
  }

  /**
   * Validates cost/cooldown against the CURRENT resources supplied by the player module, starts the cooldown, applies any
   * self-buff, and returns the effect for combat to execute. The player module must deduct the returned costs.
   */
  tryUseAbility(abilityId: string, resources: { mana: number; stamina: number }): Result<{ use: AbilityUseResult }> {
    const node = SKILLS[abilityId];
    if (!node?.ability) return fail('unknown_skill');
    const rank = this.getRank(abilityId);
    if (rank <= 0) return fail('not_learned');
    if (this.cooldownRemaining(abilityId) > 0) return fail('cooldown');
    const cost = this.getAbilityCost(abilityId)!;
    if (resources.mana < cost.manaCost || resources.stamina < cost.staminaCost) return fail('insufficient_resource');
    const a = node.ability;
    const effect = this.buildEffect(abilityId)!;
    this.ctx.cooldowns[`ability:${abilityId}`] = a.cooldownMs;
    if (a.buff && a.durationMs) {
      const scale = 1 + a.rankScale * (rank - 1);
      const stats = a.buff.stats?.map((m) => ({ ...m, ...(m.pct !== undefined ? { pct: m.pct * scale } : {}), ...(m.flat !== undefined ? { flat: m.flat * scale } : {}) }));
      const buffDef: { stats?: typeof stats; passives?: typeof a.buff.passives; flags?: string[] } = {};
      if (stats) buffDef.stats = stats;
      if (a.buff.passives) buffDef.passives = a.buff.passives;
      const flags = [...(a.buff.flags ?? [])];
      if (flags.length) buffDef.flags = flags;
      this.buffs.add(`ability_${abilityId}`, a.durationMs, buffDef);
    }
    if (a.invulnMs) this.buffs.add(`invuln_${abilityId}`, a.invulnMs, { flags: ['invulnerable'] });
    const use: AbilityUseResult = { abilityId, rank, manaCost: cost.manaCost, staminaCost: cost.staminaCost, cooldownMs: a.cooldownMs, effect };
    this.ctx.events.emit('rpg:ability-used', use);
    return { ok: true, use };
  }

  tick(dtMs: number): void {
    for (const k of Object.keys(this.ctx.cooldowns)) {
      const v = (this.ctx.cooldowns[k] ?? 0) - dtMs;
      if (v <= 0) delete this.ctx.cooldowns[k]; else this.ctx.cooldowns[k] = v;
    }
  }
}
