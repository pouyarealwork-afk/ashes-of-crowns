import type { ActiveBuff, Rng, RpgState, StationId } from '../types';
import type { RpgEmitter } from '../events';
import type { StatSystem } from '../systems/StatSystem';

/** Shared mutable context handed to every system. Owns the persistent state and transient (non-saved) runtime data. */
export class RpgContext {
  state: RpgState;
  readonly events: RpgEmitter;
  rng: Rng;
  buffs: ActiveBuff[] = [];
  cooldowns: Record<string, number> = {};
  station: StationId | null = null;
  stats!: StatSystem;

  constructor(state: RpgState, events: RpgEmitter, rng: Rng) {
    this.state = state; this.events = events; this.rng = rng;
  }
  /** Call after anything that can alter final stats. Recomputes and broadcasts. */
  statsChanged(): void {
    this.stats.invalidate();
    this.events.emit('rpg:stats-changed', { stats: this.stats.getStats(), passives: this.stats.getPassives(), flags: this.stats.getFlags() });
  }
  nextUid(): string { this.state.uidCounter += 1; return `it_${this.state.uidCounter}`; }
  nextSeq(): number { this.state.seqCounter += 1; return this.state.seqCounter; }
}
