import type { Currency, Result } from '../types';
import { fail } from '../types';
import type { RpgContext } from '../core/context';

/** Gold and Ancient Shards. Everything that costs currency goes through here. */
export class EconomySystem {
  private ctx: RpgContext;
  constructor(ctx: RpgContext) { this.ctx = ctx; }

  get gold(): number { return this.ctx.state.gold; }
  get shards(): number { return this.ctx.state.shards; }

  addGold(amount: number): void {
    const n = Math.floor(amount);
    if (n <= 0) return;
    this.ctx.state.gold += n;
    this.ctx.events.emit('rpg:gold-changed', { gold: this.ctx.state.gold, delta: n });
  }
  addShards(amount: number): void {
    const n = Math.floor(amount);
    if (n <= 0) return;
    this.ctx.state.shards += n;
    this.ctx.events.emit('rpg:shards-changed', { shards: this.ctx.state.shards, delta: n });
  }
  canAfford(cost: { gold?: number; shards?: number }): boolean { return this.gold >= (cost.gold ?? 0) && this.shards >= (cost.shards ?? 0); }
  spend(cost: { gold?: number; shards?: number }): Result {
    const g = Math.floor(cost.gold ?? 0); const s = Math.floor(cost.shards ?? 0);
    if (g < 0 || s < 0) return fail('invalid_quantity');
    if (this.gold < g) return fail('insufficient_gold');
    if (this.shards < s) return fail('insufficient_shards');
    if (g > 0) { this.ctx.state.gold -= g; this.ctx.events.emit('rpg:gold-changed', { gold: this.ctx.state.gold, delta: -g }); }
    if (s > 0) { this.ctx.state.shards -= s; this.ctx.events.emit('rpg:shards-changed', { shards: this.ctx.state.shards, delta: -s }); }
    return { ok: true };
  }
  spendCurrency(currency: Currency, amount: number): Result { return this.spend(currency === 'gold' ? { gold: amount } : { shards: amount }); }
}
