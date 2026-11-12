import type { NgPlusScaling } from '../events';
import type { Result } from '../types';
import { fail } from '../types';
import type { RpgContext } from '../core/context';
import { levelCap, MAX_NG_CYCLE } from '../data/config';
import { getItemDef } from '../data/items';
import type { BuffSystem } from './BuffSystem';

export const NG_START_SKILL_POINTS = 3;
export const NG_GOLD_KEPT = 0.5;

/**
 * New Game+ rules.
 * Kept: level, XP, skills, equipment, inventory (minus quest items), recipes, skins, achievements, shards, 50% gold, ending flags.
 * Reset: quest/boss progress, story flags, shop limits, quest items. Gains: +10 level cap, +3 skill points, tougher enemies with better rewards.
 */
export class NgPlusSystem {
  private ctx: RpgContext;
  private buffs: BuffSystem;
  constructor(ctx: RpgContext, buffs: BuffSystem) { this.ctx = ctx; this.buffs = buffs; }

  get cycle(): number { return this.ctx.state.ngPlus.cycle; }
  getScaling(cycle = this.cycle): NgPlusScaling {
    return { cycle, enemyHealthMult: 1 + 0.6 * cycle, enemyDamageMult: 1 + 0.4 * cycle, xpMult: 1 + 0.25 * cycle, goldMult: 1 + 0.2 * cycle, shardMult: 1 + 0.5 * cycle, dropRarityBonus: 0.05 * cycle };
  }
  hasReachedEnding(): boolean { return Object.keys(this.ctx.state.flags).some((f) => f.startsWith('ending_') && this.ctx.state.flags[f]); }
  canStart(): Result {
    if (this.cycle >= MAX_NG_CYCLE) return fail('max_cycle');
    if (!this.hasReachedEnding()) return fail('new_game_plus_unavailable');
    return { ok: true };
  }
  /** Begins the next cycle. The world/quest modules must listen to 'rpg:new-game-plus' and reset their own progress. */
  start(opts: { force?: boolean } = {}): Result<{ cycle: number; scaling: NgPlusScaling; levelCap: number }> {
    if (!opts.force) { const c = this.canStart(); if (!c.ok) return c; }
    else if (this.cycle >= MAX_NG_CYCLE) return fail('max_cycle');
    const s = this.ctx.state;
    s.ngPlus.cycle += 1;
    s.inventory = s.inventory.filter((i) => getItemDef(i.defId).type !== 'quest');
    s.gold = Math.floor(s.gold * NG_GOLD_KEPT);
    s.completedQuests = []; s.defeatedBosses = []; s.shopPurchases = {};
    for (const f of Object.keys(s.flags)) if (!f.startsWith('ending_') && !f.startsWith('perm_')) delete s.flags[f];
    s.skillPoints += NG_START_SKILL_POINTS;
    this.ctx.cooldowns = {}; this.buffs.clear();
    this.ctx.events.emit('rpg:inventory-changed', { reason: 'new-game-plus' });
    this.ctx.events.emit('rpg:gold-changed', { gold: s.gold, delta: 0 });
    this.ctx.statsChanged();
    const result = { cycle: s.ngPlus.cycle, scaling: this.getScaling(), levelCap: levelCap(s.ngPlus.cycle) };
    this.ctx.events.emit('rpg:new-game-plus', result);
    return { ok: true, ...result };
  }
}
