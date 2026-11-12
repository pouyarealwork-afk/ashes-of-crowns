import type { EnemyState, StatusEffect } from '../types';
export interface StatusTick { damage: number; expired: StatusEffect[] }
export class StatusEffectSystem {
  apply(enemy: EnemyState, effect: StatusEffect): void {
    const existing = enemy.statuses.find(s => s.kind === effect.kind && s.source === effect.source);
    if (existing) { existing.remainingMs = Math.max(existing.remainingMs, effect.remainingMs); existing.tickDamage = Math.max(existing.tickDamage ?? 0, effect.tickDamage ?? 0); }
    else enemy.statuses.push({ ...effect });
    if (effect.kind === 'slow') enemy.slowMultiplier = Math.min(enemy.slowMultiplier, Math.max(0.2, 1 - (effect.magnitude ?? 0.35)));
    if (effect.kind === 'stun') enemy.stunRemainingMs = Math.max(enemy.stunRemainingMs, effect.remainingMs);
  }
  tick(enemy: EnemyState, dtMs: number): StatusTick {
    let damage = 0; const expired: StatusEffect[] = [];
    for (const effect of [...enemy.statuses]) {
      effect.remainingMs -= dtMs;
      if (effect.tickMs && effect.tickDamage) {
        effect.tickRemainingMs = (effect.tickRemainingMs ?? effect.tickMs) - dtMs;
        while (effect.tickRemainingMs <= 0 && effect.remainingMs >= 0) { damage += effect.tickDamage; effect.tickRemainingMs += effect.tickMs; }
      }
      if (effect.remainingMs <= 0) { expired.push(effect); enemy.statuses.splice(enemy.statuses.indexOf(effect), 1); }
    }
    const slows = enemy.statuses.filter(s => s.kind === 'slow');
    enemy.slowMultiplier = slows.length ? Math.min(...slows.map(s => Math.max(0.2, 1 - (s.magnitude ?? 0.4)))) : 1;
    return { damage, expired };
  }
  clear(enemy: EnemyState): void { enemy.statuses = []; enemy.slowMultiplier = 1; enemy.stunRemainingMs = 0; }
}
