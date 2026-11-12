import type { ActiveBuff, PartialPassives, StatMod } from '../types';
import type { RpgContext } from '../core/context';

/** Timed buffs (elixirs, Battle Cry, Arcane Ascension...). Transient: not included in save snapshots. */
export class BuffSystem {
  private ctx: RpgContext;
  constructor(ctx: RpgContext) { this.ctx = ctx; }

  add(id: string, durationMs: number, def: { stats?: StatMod[]; passives?: PartialPassives; flags?: string[] }): ActiveBuff {
    const buff: ActiveBuff = { id, stats: def.stats ?? [], passives: def.passives ?? {}, flags: def.flags ?? [], remainingMs: durationMs };
    this.ctx.buffs = this.ctx.buffs.filter((b) => b.id !== id);
    this.ctx.buffs.push(buff);
    this.ctx.events.emit('rpg:buff-added', { buff: { ...buff } });
    this.ctx.statsChanged();
    return buff;
  }
  has(id: string): boolean { return this.ctx.buffs.some((b) => b.id === id); }
  list(): ActiveBuff[] { return this.ctx.buffs.map((b) => ({ ...b })); }
  remove(id: string): void {
    if (!this.has(id)) return;
    this.ctx.buffs = this.ctx.buffs.filter((b) => b.id !== id);
    this.ctx.events.emit('rpg:buff-expired', { buffId: id });
    this.ctx.statsChanged();
  }
  clear(): void { for (const b of [...this.ctx.buffs]) this.remove(b.id); }
  tick(dtMs: number): void {
    if (this.ctx.buffs.length === 0) return;
    const expired: string[] = [];
    for (const b of this.ctx.buffs) { b.remainingMs -= dtMs; if (b.remainingMs <= 0) expired.push(b.id); }
    for (const id of expired) this.remove(id);
  }
}
