import type { EnemyState, PlayerCombatView, Vec2 } from '../types';
export interface AIAction { vx: number; vy: number; attack: boolean; ranged: boolean; facing: 1 | -1; telegraph?: boolean }

/** Readable enemy combat loop: approach, hold range, telegraph, strike, recover. */
export class EnemyAIController {
  update(enemy: EnemyState, player: PlayerCombatView, dtMs: number): AIAction {
    const dt = Math.min(50, Math.max(0, dtMs));
    enemy.attackCooldownMs = Math.max(0, enemy.attackCooldownMs - dt);
    enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - dt);
    enemy.stunRemainingMs = Math.max(0, enemy.stunRemainingMs - dt);
    const dx = player.x - enemy.x, dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy), horizontal = Math.abs(dx);
    const facing: 1 | -1 = dx >= 0 ? 1 : -1;
    enemy.facing = facing;
    if (!enemy.alive || player.isDead || enemy.stunRemainingMs > 0) return { vx: 0, vy: 0, attack: false, ranged: false, facing };
    if (distance > 650 && !enemy.aggro) return this.patrol(enemy, facing);
    if (distance <= 650) enemy.aggro = true;
    if (enemy.windupRemainingMs > 0) return { vx: 0, attack: false, ranged: false, facing, telegraph: true };

    const isRanged = enemy.ai === 'ranged' || enemy.ai === 'support';
    const isFlying = enemy.ai === 'flying';
    const idealRange = isRanged ? Math.max(enemy.attackRange * 0.78, 150) : enemy.attackRange;
    const aligned = Math.abs(dy) < (isFlying ? 82 : 105);
    if (horizontal <= enemy.attackRange && aligned && enemy.attackCooldownMs <= 0) {
      enemy.attackWindupMs = Math.max(enemy.ai === 'charger' ? 520 : 360, enemy.attackWindupMs);
      enemy.windupRemainingMs = enemy.attackWindupMs;
      enemy.lastAttackAt += 1;
      return { vx: 0, vy: 0, attack: false, ranged: isRanged, facing, telegraph: true };
    }
    if (isRanged && horizontal <= enemy.attackRange && aligned) return { vx: 0, vy: 0, attack: false, ranged: true, facing };

    let direction = Math.sign(dx) || facing;
    if (isRanged && horizontal < idealRange * 0.72) direction *= -1;
    let speed = enemy.speed * enemy.slowMultiplier;
    if (enemy.ai === 'charger' && horizontal < 300) speed *= 1.28;
    if (enemy.ai === 'ambusher' && horizontal > 190) speed *= 1.2;
    if (isFlying) {
      // Flyers actively pursue the player's altitude instead of hovering on a fixed sine wave.
      const verticalDeadZone = 34;
      const vy = Math.abs(dy) <= verticalDeadZone ? 0 : Math.sign(dy) * Math.min(speed * 0.72, Math.max(34, Math.abs(dy) * 1.15));
      const vx = horizontal <= idealRange * 0.72 && !isRanged ? 0 : direction * speed * 0.86;
      return { vx, vy, attack: false, ranged: isRanged, facing };
    }
    if (Math.abs(dy) > 190) speed *= 0.58;
    return { vx: direction * speed, vy: 0, attack: false, ranged: isRanged, facing };
  }

  private patrol(enemy: EnemyState, facing: 1 | -1): AIAction {
    if (!enemy.patrol) return { vx: 0, attack: false, ranged: false, facing };
    const [left, right] = enemy.patrol;
    if (enemy.x <= left + 4) enemy.facing = 1;
    if (enemy.x >= right - 4) enemy.facing = -1;
    return { vx: enemy.facing * enemy.speed * 0.32, vy: 0, attack: false, ranged: false, facing: enemy.facing };
  }
}

export function distance(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
