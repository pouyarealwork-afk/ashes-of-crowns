import { PersistenceEvents, SimpleEmitter } from '../events';
import type { CheckpointState, EventBus, MemoryStoneRecord } from '../types';

export interface MemoryStoneDef {
  id: string;
  regionId: string;
  x: number;
  y: number;
}
export interface RespawnPoint {
  /** null when falling back to a region/world default spawn. */
  stoneId: string | null;
  regionId: string;
  x: number;
  y: number;
}

/**
 * Memory Stone checkpoints. The world module registers stones as it builds a region
 * (`register`), calls `activate` when the player touches one, and `getRespawnPoint` on death.
 * State lives in `CheckpointState` which SaveManager persists automatically.
 */
export class CheckpointManager {
  private defs = new Map<string, MemoryStoneDef>();
  private state: CheckpointState = { lastStoneId: null, stones: {} };
  private fallback: RespawnPoint = { stoneId: null, regionId: 'ashen_village', x: 0, y: 0 };
  private readonly bus: EventBus;
  private now: () => number;

  constructor(bus?: EventBus, now: () => number = Date.now) {
    this.bus = bus ?? new SimpleEmitter();
    this.now = now;
  }

  /** Default spawn used until the first stone is activated (e.g. Ashen Village start). */
  setDefaultSpawn(p: Omit<RespawnPoint, 'stoneId'>): void {
    this.fallback = { stoneId: null, ...p };
  }

  /** Register/refresh stone definitions (idempotent; safe on every scene create). */
  register(...defs: MemoryStoneDef[]): void {
    for (const d of defs) this.defs.set(d.id, { ...d });
  }
  unregisterRegion(regionId: string): void {
    for (const [id, d] of this.defs) if (d.regionId === regionId) this.defs.delete(id);
  }

  /** Activate a stone. Returns true if it was newly discovered. Unknown ids are rejected (returns false, no state change). */
  activate(id: string): boolean {
    const def = this.defs.get(id) ?? this.fromState(id);
    if (!def) return false;
    const first = !this.state.stones[id];
    if (first) this.state.stones[id] = { id, regionId: def.regionId, x: def.x, y: def.y, discoveredAt: this.now() };
    const changedLast = this.state.lastStoneId !== id;
    this.state.lastStoneId = id;
    if (first || changedLast) this.bus.emit(PersistenceEvents.CHECKPOINT_ACTIVATED, { stoneId: id, regionId: def.regionId, x: def.x, y: def.y, firstTime: first });
    return first;
  }
  private fromState(id: string): MemoryStoneDef | null {
    const s = this.state.stones[id];
    return s ? { id, regionId: s.regionId, x: s.x, y: s.y } : null;
  }

  isDiscovered(id: string): boolean {
    return !!this.state.stones[id];
  }
  getDiscovered(): MemoryStoneRecord[] {
    return Object.values(this.state.stones).map((s) => ({ ...s }));
  }

  /** Where to respawn: last activated stone if known, otherwise the default spawn. */
  getRespawnPoint(): RespawnPoint {
    const id = this.state.lastStoneId;
    const s = id ? this.state.stones[id] : undefined;
    return s ? { stoneId: s.id, regionId: s.regionId, x: s.x, y: s.y } : { ...this.fallback };
  }

  /** Emits `checkpoint:respawn` and returns the point. The player/world modules perform the actual teleport and penalties. */
  respawn(): RespawnPoint {
    const p = this.getRespawnPoint();
    this.bus.emit(PersistenceEvents.CHECKPOINT_RESPAWN, p);
    return p;
  }

  snapshot(): CheckpointState {
    return structuredClone(this.state);
  }
  /** Replace state (used when loading a save). */
  restore(s: CheckpointState | undefined): void {
    this.state = s ? structuredClone(s) : { lastStoneId: null, stones: {} };
  }
}
