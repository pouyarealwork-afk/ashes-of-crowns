import { ListenedEvents } from '../events';
import { AUTO_SLOT, EventBus } from '../types';
import type { SaveManager } from './SaveManager';

export interface AutoSaveOptions {
  enabled: boolean;
  /** Periodic save interval. */
  intervalMs: number;
  /** Minimum gap between two writes; bursts of triggers collapse into one trailing save. */
  minGapMs: number;
  /** Bus events that request an autosave. */
  triggers: string[];
  /** Also save when the tab is hidden / page is being closed (mobile browsers may kill background tabs). */
  saveOnHidden: boolean;
}

export const DEFAULT_AUTOSAVE: AutoSaveOptions = {
  enabled: true,
  intervalMs: 60_000,
  minGapMs: 5_000,
  triggers: [
    ListenedEvents.WORLD_REGION_CHANGED,
    ListenedEvents.RPG_QUEST_COMPLETED,
    ListenedEvents.RPG_LEVEL_UP,
    ListenedEvents.COMBAT_BOSS_DEFEATED,
    'checkpoint:activated',
    ListenedEvents.REQUEST_AUTOSAVE,
  ],
  saveOnHidden: true,
};

/** Debounced, change-aware autosave into the dedicated 'auto' slot. */
export class AutoSaver {
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private lastRun = -Infinity;
  private running = false;
  private again = false;
  private listeners: Array<[string, (...a: unknown[]) => void]> = [];
  private onVisibility = (): void => {
    if (this.doc?.visibilityState === 'hidden') void this.flush('hidden');
  };
  private onPageHide = (): void => void this.flush('pagehide');
  readonly counters = { saved: 0, skippedUnchanged: 0, failed: 0 };

  constructor(
    private readonly saves: SaveManager,
    private readonly bus: EventBus,
    private readonly opts: AutoSaveOptions,
    private readonly doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
    private readonly win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    this.stop();
    if (!this.opts.enabled) return;
    for (const ev of this.opts.triggers) {
      const fn = (): void => this.request(ev);
      this.bus.on(ev, fn);
      this.listeners.push([ev, fn]);
    }
    this.timer = setInterval(() => this.request('interval'), this.opts.intervalMs);
    if (this.opts.saveOnHidden) {
      this.doc?.addEventListener('visibilitychange', this.onVisibility);
      this.win?.addEventListener('pagehide', this.onPageHide);
    }
  }

  stop(): void {
    for (const [ev, fn] of this.listeners) this.bus.off(ev, fn);
    this.listeners = [];
    if (this.timer) clearInterval(this.timer);
    if (this.pending) clearTimeout(this.pending);
    this.timer = this.pending = null;
    this.doc?.removeEventListener('visibilitychange', this.onVisibility);
    this.win?.removeEventListener('pagehide', this.onPageHide);
  }

  /** Request an autosave; coalesced with other requests inside minGapMs. */
  request(_reason: string): void {
    if (this.pending) return;
    const wait = Math.max(0, this.lastRun + this.opts.minGapMs - this.now());
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.run();
    }, wait);
  }

  /** Save immediately (still skips when unchanged). */
  async flush(_reason = 'flush'): Promise<void> {
    if (!this.opts.enabled) return;
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = null;
    }
    await this.run();
  }

  private async run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      this.lastRun = this.now();
      const meta = await this.saves.save(AUTO_SLOT, { kind: 'auto', label: 'Autosave', skipIfUnchanged: true });
      if (meta) this.counters.saved++;
      else this.counters.skippedUnchanged++;
    } catch (err) {
      const code = (err as { code?: string }).code;
      // No provider / nothing to save (e.g. title screen) is normal, not a failure.
      if (code !== 'no-state-provider' && code !== 'nothing-to-save') this.counters.failed++;
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.request('queued');
      }
    }
  }
}
