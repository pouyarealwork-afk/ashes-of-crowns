import type { EnemyState, PlayerCombatView, Vec2 } from '../types';
export interface AIAction { vx: number; attack: boolean; ranged: boolean; facing: 1 | -1; telegraph?: boolean }

/** Deterministic, frame-rate-independent enemy decision layer. Physics/collisions remain Phaser-owned. */
export class EnemyAIController {
  update(enemy: EnemyState, player: PlayerCombatView, dtMs: number): AIAction {
    const dt = Math.min(50, Math.max(0, dtMs));
    enemy.attackCooldownMs = Math.max(0, enemy.attackCooldownMs - dt);
    enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - dt);
    enemy.stunRemainingMs = Math.max(0, enemy.stunRemainingMs - dt);
    enemy.windupRemainingMs = Math.max(0, enemy.windupRemainingMs - dt);
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const facing: 1 | -1 = dx >= 0 ? 1 : -1;
    enemy.facing = facing;
    if (!enemy.alive || player.isDead || enemy.stunRemainingMs > 0) return { vx: 0, attack: false, ranged: false, facing };
    if (distance > 650 && !enemy.aggro) return this.patrol(enemy, facing);
    if (distance <= 650) enemy.aggro = true;
    if (enemy.windupRemainingMs > 0) return { vx: 0, attack: false, ranged: false, facing, telegraph: true };
    const inRange = distance <= enemy.attackRange;
    if (inRange && enemy.attackCooldownMs <= 0) {
      enemy.attackWindupMs = Math.max(220, enemy.attackWindupMs);
      enemy.windupRemainingMs = enemy.attackWindupMs;
      enemy.lastAttackAt += 1;
      return { vx: 0, attack: false, ranged: enemy.ai === 'ranged' || enemy.ai === 'support', facing, telegraph: true };
    }
    if (inRange && enemy.ai !== 'ranged' && enemy.ai !== 'support') return { vx: 0, attack: false, ranged: false, facing };
    const direction = Math.sign(dx) || facing;
    let speed = enemy.speed * enemy.slowMultiplier;
    if (enemy.ai === 'charger' && distance < 260) speed *= 1.55;
    if (enemy.ai === 'flying') speed *= 0.92;
    if (enemy.ai === 'ambusher' && distance > 180) speed *= 1.35;
    return { vx: direction * speed, attack: false, ranged: enemy.ai === 'ranged', facing };
  }

  private patrol(enemy: EnemyState, facing: 1 | -1): AIAction {
    if (!enemy.patrol) return { vx: 0, attack: false, ranged: false, facing };
    const [left, right] = enemy.patrol;
    if (enemy.x <= left + 4) enemy.facing = 1;
    if (enemy.x >= right - 4) enemy.facing = -1;
    return { vx: enemy.facing * enemy.speed * 0.35, attack: false, ranged: false, facing: enemy.facing };
  }
}

export function distance(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
