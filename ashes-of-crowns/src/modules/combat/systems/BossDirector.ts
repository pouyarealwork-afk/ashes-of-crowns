import { getBossDefinition } from '../data/enemies';
import type { BossPhase, EnemyState } from '../types';
export interface PhaseChange { changed: boolean; phase: BossPhase; pattern: string; bossId: string }
export class BossDirector {
  update(enemy: EnemyState): PhaseChange | null {
    if (enemy.tier !== 'boss' || !enemy.bossId || !enemy.alive) return null;
    const def = getBossDefinition(enemy.bossId); if (!def) return null;
    const ratio = enemy.health / enemy.maxHealth;
    const phase: BossPhase = ratio <= 0.3 ? 3 : ratio <= 0.65 ? 2 : 1;
    if (phase === enemy.bossPhase) return null;
    enemy.bossPhase = phase;
    const spec = def.phases[phase - 1];
    const base = enemy as EnemyState & { baseDamage?: number; baseSpeed?: number };
    if (base.baseDamage === undefined) base.baseDamage = enemy.damage;
    if (base.baseSpeed === undefined) base.baseSpeed = enemy.speed;
    enemy.damage = Math.round(base.baseDamage * spec.damageMultiplier);
    enemy.speed = base.baseSpeed * spec.speedMultiplier;
    enemy.attackCooldownMs = Math.min(enemy.attackCooldownMs, 500);
    return { changed: true, phase, pattern: spec.pattern, bossId: enemy.bossId };
  }
  getIntro(bossId: string): string | undefined { return getBossDefinition(bossId)?.intro; }
}
