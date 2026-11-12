import type { CombatHit, DamageSchool, EnemyState, RpgCombatBridge } from '../types';

export interface OutgoingDamageInput { baseDamage: number; multiplier?: number; school?: DamageSchool; target: EnemyState; guaranteedCrit?: boolean; bonusCritChance?: number; behind?: boolean }
export class DamageResolver {
  constructor(private rpg?: RpgCombatBridge, private rng: () => number = Math.random) {}

  outgoing(input: OutgoingDamageInput): { damage: number; critical: boolean; lifestealHeal: number } {
    const school = input.school === 'magic' ? 'magic' : 'physical';
    if (this.rpg?.calcDamage) {
      const result = this.rpg.calcDamage({ multiplier: input.multiplier ?? 1, school, targetDefense: input.target.defense, guaranteedCrit: input.guaranteedCrit, bonusCritChance: input.bonusCritChance });
      return { damage: this.resist(result.damage, input.target, input.school), critical: result.crit, lifestealHeal: result.lifestealHeal };
    }
    const raw = input.baseDamage * (input.multiplier ?? 1) * (input.guaranteedCrit || this.rng() < (input.bonusCritChance ?? 0.05) ? 1.65 : 1);
    const reduced = raw * (100 / (100 + Math.max(0, input.target.defense)));
    return { damage: this.resist(Math.max(1, Math.round(reduced * (0.95 + this.rng() * 0.1))), input.target, input.school), critical: !!input.guaranteedCrit, lifestealHeal: 0 };
  }

  ability(effect: any, target: EnemyState, options: { behind?: boolean; targetHpPct?: number } = {}): { damage: number; critical: boolean; lifestealHeal: number } {
    if (this.rpg?.calcAbilityDamage) {
      const result = this.rpg.calcAbilityDamage(effect, { ...options, targetDefense: target.defense });
      return { damage: this.resist(result.damage, target, effect.school), critical: result.crit, lifestealHeal: result.lifestealHeal };
    }
    return this.outgoing({ baseDamage: 14, multiplier: effect.multiplier ?? 1, school: effect.school, target, guaranteedCrit: effect.guaranteedCrit, behind: options.behind });
  }

  incoming(raw: number, school: DamageSchool = 'physical', defense = 0): number {
    const mitigated = this.rpg?.mitigateIncoming ? this.rpg.mitigateIncoming(raw) : Math.max(1, Math.round(raw * 100 / (100 + Math.max(0, defense))));
    return school === 'true' ? raw : mitigated;
  }

  private resist(damage: number, target: EnemyState, school?: DamageSchool): number {
    if (!school || school === 'true') return Math.max(1, Math.round(damage));
    // Resistances are copied to the state by the world adapter when available.
    const resistance = (target as EnemyState & { resistances?: Partial<Record<DamageSchool, number>> }).resistances?.[school] ?? 0;
    return Math.max(1, Math.round(damage * (1 - Math.min(0.85, Math.max(-0.5, resistance)))));
  }
}

export function applyHitToEnemy(target: EnemyState, hit: CombatHit, resolver: DamageResolver): { damage: number; killed: boolean; statusApplied?: CombatHit['status'] extends infer S ? any : never } {
  if (!target.alive) return { damage: 0, killed: false };
  const raw = hit.amount;
  const mitigated = hit.piercing || hit.school === 'true' ? raw : raw * (100 / (100 + Math.max(0, target.defense)));
  const damage = Math.max(1, Math.round(mitigated));
  target.health = Math.max(0, target.health - damage);
  target.hitFlashMs = 110;
  if (hit.stunMs) target.stunRemainingMs = Math.max(target.stunRemainingMs, hit.stunMs * (target.tier === 'boss' ? 0.2 : 1));
  const killed = target.health <= 0;
  if (killed) target.alive = false;
  return { damage, killed, statusApplied: hit.status?.kind };
}
