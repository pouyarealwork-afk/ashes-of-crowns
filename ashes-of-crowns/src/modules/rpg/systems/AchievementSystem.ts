import type { RewardBundle } from '../events';
import type { RpgContext } from '../core/context';
import { ACHIEVEMENT_LIST, ACHIEVEMENTS, MAX_COUNTERS } from '../data/achievements';

export class AchievementSystem {
  private ctx: RpgContext;
  /** Wired by RpgModule to LootSystem.grant so rewards reach the inventory/economy. */
  grant: (reward: Partial<RewardBundle>, source: string) => void = () => {};
  constructor(ctx: RpgContext) { this.ctx = ctx; }

  getCounter(key: string): number { return this.ctx.state.counters[key] ?? 0; }
  bump(key: string, amount = 1): void { this.ctx.state.counters[key] = this.getCounter(key) + amount; this.check(key); }
  setMax(key: string, value: number): void {
    if (!MAX_COUNTERS.has(key)) throw new Error(`[rpg] counter "${key}" is not a max-counter`);
    if (value > this.getCounter(key)) { this.ctx.state.counters[key] = value; this.check(key); }
  }
  isUnlocked(id: string): boolean { return this.ctx.state.achievements.includes(id); }
  list(): { id: string; name: string; description: string; progress: number; target: number; unlocked: boolean }[] {
    return ACHIEVEMENT_LIST.map((a) => ({ id: a.id, name: a.name, description: a.description, progress: Math.min(a.target, this.getCounter(a.counter)), target: a.target, unlocked: this.isUnlocked(a.id) }));
  }
  private check(counter: string): void {
    for (const a of ACHIEVEMENT_LIST) {
      if (a.counter !== counter || this.isUnlocked(a.id) || this.getCounter(counter) < a.target) continue;
      this.ctx.state.achievements.push(a.id);
      if (a.reward) this.grant(a.reward, `achievement:${a.id}`);
      this.ctx.events.emit('rpg:achievement-unlocked', { achievementId: a.id, name: ACHIEVEMENTS[a.id]!.name });
    }
  }
}
