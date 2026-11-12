import type { LevelUpReward } from '../events';
import type { RpgContext } from '../core/context';
import { levelCap, LEVEL_MILESTONES, skillPointsForLevel, xpToNext } from '../data/config';
import type { EconomySystem } from './EconomySystem';
import type { InventorySystem } from './InventorySystem';

export class ProgressionSystem {
  private ctx: RpgContext;
  private economy: EconomySystem;
  private inventory: InventorySystem;
  /** Wired by RpgModule so level milestones can teach recipes. */
  learnRecipe: (id: string) => void = () => {};
  constructor(ctx: RpgContext, economy: EconomySystem, inventory: InventorySystem) { this.ctx = ctx; this.economy = economy; this.inventory = inventory; }

  get level(): number { return this.ctx.state.level; }
  get xp(): number { return this.ctx.state.xp; }
  get skillPoints(): number { return this.ctx.state.skillPoints; }
  get cap(): number { return levelCap(this.ctx.state.ngPlus.cycle); }
  xpForNextLevel(): number { return this.level >= this.cap ? 0 : xpToNext(this.level); }
  /** 0..1 progress to next level (1 at cap). */
  progress(): number { return this.level >= this.cap ? 1 : this.xp / xpToNext(this.level); }

  /** Adds XP and processes every level gained. Returns the number of levels gained. */
  addXp(amount: number, source = 'misc'): number {
    const n = Math.floor(amount);
    if (n <= 0) return 0;
    const s = this.ctx.state;
    if (s.level >= this.cap) return 0;
    s.xp += n;
    this.ctx.events.emit('rpg:xp-gained', { amount: n, total: s.xp, level: s.level, source });
    let gained = 0;
    while (s.level < this.cap && s.xp >= xpToNext(s.level)) {
      s.xp -= xpToNext(s.level);
      this.levelUp();
      gained += 1;
    }
    if (s.level >= this.cap) s.xp = 0;
    return gained;
  }

  private levelUp(): void {
    const s = this.ctx.state;
    const previousLevel = s.level;
    s.level += 1;
    const points = skillPointsForLevel(s.level);
    s.skillPoints += points;
    const m = LEVEL_MILESTONES[s.level];
    const rewards: LevelUpReward = { gold: m?.gold ?? 0, shards: m?.shards ?? 0, items: m?.items ?? [], recipes: m?.recipes ?? [] };
    if (rewards.gold) this.economy.addGold(rewards.gold);
    if (rewards.shards) this.economy.addShards(rewards.shards);
    const overflow: { itemId: string; qty: number }[] = [];
    for (const it of rewards.items) { const r = this.inventory.add(it.itemId, it.qty); if (r.overflow > 0) overflow.push({ itemId: it.itemId, qty: r.overflow }); }
    if (overflow.length) this.ctx.events.emit('rpg:loot-overflow', { items: overflow });
    for (const r of rewards.recipes) this.learnRecipe(r);
    this.ctx.statsChanged();
    this.ctx.events.emit('rpg:level-up', { level: s.level, previousLevel, skillPointsGained: points, rewards, stats: this.ctx.stats.getStats(), fullRestore: true });
  }
}
