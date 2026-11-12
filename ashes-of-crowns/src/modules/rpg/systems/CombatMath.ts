import type { AbilityEffect } from '../data/skills';
import type { RpgContext } from '../core/context';

export interface DamageInput {
  /** Damage multiplier of the attack (1 for a basic attack, ability multiplier otherwise). */
  multiplier?: number; school?: 'physical' | 'magic'; targetDefense?: number;
  guaranteedCrit?: boolean; /** extra flat crit chance for this hit, 0..1 */ bonusCritChance?: number;
}
export interface DamageResult { damage: number; crit: boolean; lifestealHeal: number }

/** Damage and mitigation formulas so combat does not need to know about stats/passives. */
export class CombatMath {
  private ctx: RpgContext;
  constructor(ctx: RpgContext) { this.ctx = ctx; }

  /** Outgoing damage from the player: attack * multiplier (* spell power for magic) * crit, reduced by target defense, +-5% variance. */
  calcDamage(i: DamageInput = {}): DamageResult {
    const stats = this.ctx.stats.getStats(); const p = this.ctx.stats.getPassives();
    let raw = stats.attack * (i.multiplier ?? 1);
    if (i.school === 'magic') raw *= 1 + p.spellPower;
    const crit = !!i.guaranteedCrit || this.ctx.rng() < Math.min(1, stats.critChance + (i.bonusCritChance ?? 0));
    if (crit) raw *= stats.critDamage;
    raw *= 0.95 + this.ctx.rng() * 0.1;
    const reduced = raw * (100 / (100 + Math.max(0, i.targetDefense ?? 0)));
    const damage = Math.max(1, Math.round(reduced));
    return { damage, crit, lifestealHeal: Math.round(damage * p.lifesteal) };
  }

  /** Damage dealt by a used ability, including behind-bonus and execute rules. */
  calcAbilityDamage(effect: AbilityEffect, o: { behind?: boolean; targetHpPct?: number; targetDefense?: number } = {}): DamageResult {
    let mult = effect.multiplier;
    if (effect.behindBonus && o.behind) mult += effect.behindBonus;
    if (effect.executeThreshold !== undefined && effect.executeMultiplier !== undefined && (o.targetHpPct ?? 1) < effect.executeThreshold) mult = effect.executeMultiplier;
    const guaranteed = !!effect.guaranteedCrit && (effect.behindBonus === undefined || !!o.behind);
    return this.calcDamage({ multiplier: mult, school: effect.school, targetDefense: o.targetDefense ?? 0, guaranteedCrit: guaranteed });
  }

  /** Per-second damage of a DoT ability effect (poison/burn). */
  calcDotPerSecond(effect: AbilityEffect, targetDefense = 0): number {
    if (!effect.dotMultiplierPerSec) return 0;
    const p = this.ctx.stats.getPassives(); const atk = this.ctx.stats.getStats().attack;
    const raw = atk * effect.dotMultiplierPerSec * (effect.school === 'magic' ? 1 + p.spellPower : 1);
    return Math.max(1, Math.round(raw * (100 / (100 + targetDefense))));
  }

  /** Incoming damage after player defense and damage-reduction. Returns 0 if the player is invulnerable. */
  mitigateIncoming(rawDamage: number): number {
    if (this.ctx.stats.hasFlag('invulnerable')) return 0;
    const s = this.ctx.stats.getStats(); const p = this.ctx.stats.getPassives();
    return Math.max(1, Math.round(rawDamage * (100 / (100 + s.defense)) * (1 - p.damageReduction)));
  }
  rollDodge(): boolean { return this.ctx.rng() < this.ctx.stats.getPassives().dodgeChance; }
  isInvulnerable(): boolean { return this.ctx.stats.hasFlag('invulnerable'); }
}
