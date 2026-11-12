import { AudioManager } from './audio/AudioManager';
import { CheckpointManager } from './checkpoint/CheckpointManager';
import { ListenedEvents, PersistenceEvents, SimpleEmitter } from './events';
import { AutoSaver, AutoSaveOptions, DEFAULT_AUTOSAVE } from './save/AutoSaver';
import { SaveManager } from './save/SaveManager';
import { SettingsManager } from './settings/SettingsManager';
import { IndexedDbBackend } from './storage/IndexedDbBackend';
import { MemoryBackend } from './storage/MemoryBackend';
import type { KVBackend } from './storage/backend';
import {
  AUTO_SLOT,
  AudioManifest,
  EventBus,
  GameStateProvider,
  LoadResult,
  Migration,
  PersistenceError,
  SaveMeta,
  SlotId,
} from './types';

export interface PersistenceOptions {
  /** Your game's version string, stored in every save. */
  gameVersion: string;
  /** Shared event bus (e.g. `game.events` or a scene's events). A private emitter is created if omitted. */
  bus?: EventBus;
  /** Override storage (tests). Default: IndexedDB, falling back to memory with a `persistence:degraded` event. */
  backend?: KVBackend;
  dbName?: string;
  migrations?: Migration[];
  manualSlots?: string[];
  audio?: {
    manifest: AudioManifest;
    regionMusic?: Record<string, string>;
    combatMusicId?: string;
    combatExitDelayMs?: number;
  };
  autosave?: Partial<AutoSaveOptions>;
  languages?: string[];
  /** Remap the event names this module listens to if other modules use different ones. */
  eventMap?: Partial<Record<'playSfx' | 'setRegion' | 'combat' | 'boss', string>>;
}

/** Facade that wires saves, settings, checkpoints, autosave and audio together. */
export class PersistenceModule {
  readonly bus: EventBus;
  readonly saves!: SaveManager;
  readonly settings!: SettingsManager;
  readonly checkpoints: CheckpointManager;
  readonly audio: AudioManager;
  private backend!: KVBackend;
  private autosaver!: AutoSaver;
  private unsub: Array<() => void> = [];
  private ready = false;
  degraded = false;

  constructor(private readonly options: PersistenceOptions) {
    this.bus = options.bus ?? new SimpleEmitter();
    this.checkpoints = new CheckpointManager(this.bus);
    this.audio = new AudioManager({
      manifest: options.audio?.manifest ?? {},
      bus: this.bus,
      regionMusic: options.audio?.regionMusic,
      combatMusicId: options.audio?.combatMusicId,
      combatExitDelayMs: options.audio?.combatExitDelayMs,
    });
  }

  /**
   * Opens storage, loads settings, applies them to audio and starts autosave.
   * Never rejects because of storage problems: it degrades to memory storage and emits `persistence:degraded`.
   */
  async init(): Promise<void> {
    if (this.ready) return;
    let backend = this.options.backend;
    if (!backend) {
      const idb = new IndexedDbBackend(this.options.dbName);
      try {
        await idb.open();
        backend = idb;
      } catch (err) {
        backend = new MemoryBackend();
        this.degraded = true;
        this.bus.emit(PersistenceEvents.DEGRADED, { reason: (err as Error).message });
      }
    }
    this.backend = backend;
    const self = this as { -readonly [K in 'saves' | 'settings']: PersistenceModule[K] };
    self.saves = new SaveManager(backend, {
      gameVersion: this.options.gameVersion,
      bus: this.bus,
      migrations: this.options.migrations,
      manualSlots: this.options.manualSlots,
    });
    self.settings = new SettingsManager(backend, { bus: this.bus, languages: this.options.languages });
    this.saves.setCheckpointSource(() => this.checkpoints.snapshot());

    const s = await this.settings.load();
    this.audio.setVolumes(s.audio);
    const onSettings = (p: { settings: { audio: { music: number; sfx: number; muted: boolean } } }): void => this.audio.setVolumes(p.settings.audio);
    this.bus.on(PersistenceEvents.SETTINGS_CHANGED, onSettings);
    this.unsub.push(() => this.bus.off(PersistenceEvents.SETTINGS_CHANGED, onSettings));

    const map = { playSfx: ListenedEvents.AUDIO_PLAY_SFX, setRegion: ListenedEvents.AUDIO_SET_REGION, combat: ListenedEvents.AUDIO_COMBAT, boss: ListenedEvents.AUDIO_BOSS, ...this.options.eventMap };
    this.unsub.push(this.audio.bindBus(map));
    // World region changes also switch region music.
    const onRegion = (p: { regionId?: string } | string): void => this.audio.setRegion(typeof p === 'string' ? p : p?.regionId ?? null);
    this.bus.on(ListenedEvents.WORLD_REGION_CHANGED, onRegion);
    this.unsub.push(() => this.bus.off(ListenedEvents.WORLD_REGION_CHANGED, onRegion));

    const onSave = (p?: { slotId?: SlotId; label?: string }): void => void this.saves.save(p?.slotId ?? AUTO_SLOT, { label: p?.label }).catch(() => undefined);
    const onAct = (p: { id?: string; stoneId?: string } | string): void => void this.checkpoints.activate(typeof p === 'string' ? p : p?.id ?? p?.stoneId ?? '');
    const onResp = (): void => void this.checkpoints.respawn();
    this.bus.on(ListenedEvents.REQUEST_SAVE, onSave);
    this.bus.on(ListenedEvents.CHECKPOINT_REQUEST_ACTIVATE, onAct);
    this.bus.on(ListenedEvents.CHECKPOINT_REQUEST_RESPAWN, onResp);
    this.unsub.push(() => {
      this.bus.off(ListenedEvents.REQUEST_SAVE, onSave);
      this.bus.off(ListenedEvents.CHECKPOINT_REQUEST_ACTIVATE, onAct);
      this.bus.off(ListenedEvents.CHECKPOINT_REQUEST_RESPAWN, onResp);
    });

    this.autosaver = new AutoSaver(this.saves, this.bus, { ...DEFAULT_AUTOSAVE, ...this.options.autosave });
    this.autosaver.start();
    this.ready = true;
    this.bus.emit(PersistenceEvents.READY, { backend: backend.kind, degraded: this.degraded });
  }

  /** The game registers how to read its current state. Return null while no game is in progress (title screen). */
  registerStateProvider(fn: GameStateProvider | null): void {
    this.requireReady();
    this.saves.setStateProvider(fn);
  }

  /** Manual save into a slot. */
  saveToSlot(slotId: SlotId, label?: string): Promise<SaveMeta | null> {
    this.requireReady();
    return this.saves.save(slotId, { kind: 'manual', label });
  }

  /**
   * Loads a slot, restores checkpoints, and emits `persistence:state-loaded` with the state.
   * The owning modules (player/rpg/world) apply their slices from that event or from the returned result.
   */
  async loadSlot(slotId: SlotId): Promise<LoadResult> {
    this.requireReady();
    const r = await this.saves.load(slotId);
    if (r.ok) {
      this.checkpoints.restore(r.record.state.checkpoints);
      this.bus.emit(PersistenceEvents.STATE_LOADED, { slotId, state: r.record.state, meta: r.record.meta, status: r.status, warnings: r.warnings });
    }
    return r;
  }

  /** Load the most recently written slot (for a "Continue" button). */
  async continueLast(): Promise<LoadResult> {
    this.requireReady();
    const last = await this.saves.getLastSlot();
    if (!last) return { ok: false, code: 'empty-slot', message: 'No saves yet' };
    return this.loadSlot(last);
  }

  async flush(): Promise<void> {
    await this.autosaver?.flush('flush');
    await this.settings?.flush();
  }

  getDiagnostics() {
    return {
      backend: this.backend?.kind,
      degraded: this.degraded,
      storage: this.backend?.stats(),
      autosave: this.autosaver?.counters,
      audio: {
        counters: this.audio.counters,
        loadedBuffers: this.audio.loadedBufferCount(),
        activeVoices: this.audio.activeVoiceCount(),
        cachedMusicTracks: this.audio.cachedTrackCount(),
        unlocked: this.audio.isUnlocked(),
      },
    };
  }

  dispose(): void {
    this.autosaver?.stop();
    for (const u of this.unsub.splice(0)) u();
    this.settings?.dispose();
    this.audio.dispose();
    this.backend?.close();
    this.ready = false;
  }

  private requireReady(): void {
    if (!this.ready) throw new PersistenceError('storage-unavailable', 'PersistenceModule.init() has not completed');
  }
}
