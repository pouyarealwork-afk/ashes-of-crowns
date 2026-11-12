import { PersistenceEvents, SimpleEmitter } from '../events';
import type { AudioAsset, AudioManifest, EventBus } from '../types';

export interface AudioManagerOptions {
  manifest: AudioManifest;
  bus?: EventBus;
  /** regionId -> music asset id. */
  regionMusic?: Record<string, string>;
  /** Asset id of the generic combat track. */
  combatMusicId?: string;
  /** ms to keep combat music after combat ends (prevents flapping). */
  combatExitDelayMs?: number;
  maxVoices?: number;
  maxCachedMusicTracks?: number;
  /** Injection points (tests / non-browser). */
  createContext?: () => AudioContext;
  createMediaElement?: () => HTMLAudioElement;
  fetchFn?: typeof fetch;
  doc?: Document;
}

interface MusicTrack {
  id: string;
  el: HTMLAudioElement;
  src: MediaElementAudioSourceNode;
  gain: GainNode;
  stopTimer: ReturnType<typeof setTimeout> | null;
  lastUsed: number;
}
interface Voice {
  id: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
}
interface Ambience {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Web Audio based manager.
 *  - Music streams through <audio> elements (low memory) into a music bus; crossfades between tracks.
 *  - SFX/UI/env are decoded once to AudioBuffers, cached, de-duplicated while loading, voice-limited.
 *  - Mobile autoplay policy: nothing plays until `unlock()` succeeds from a user gesture. Music requested
 *    earlier is remembered and starts at unlock. Call `attachUnlockListeners()` once at startup.
 */
export class AudioManager {
  private readonly bus: EventBus;
  private readonly manifest: AudioManifest;
  private readonly opts: Required<Pick<AudioManagerOptions, 'combatExitDelayMs' | 'maxVoices' | 'maxCachedMusicTracks'>>;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private unlocked = false;
  private disposed = false;
  private vol = { music: 0.7, sfx: 0.8, muted: false };

  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private failedAt = new Map<string, number>();
  private voices = new Set<Voice>();
  private lastPlayed = new Map<string, number>();
  private ambience = new Map<string, Ambience>();
  private ambienceToken = 0;
  private wantedAmbience: string[] = [];

  private tracks = new Map<string, MusicTrack>();
  private currentMusicId: string | null = null;
  private region: string | null = null;
  private combat = false;
  private combatTimer: ReturnType<typeof setTimeout> | null = null;
  private bossMusicId: string | null = null;
  private pausedForHidden = false;
  private unlockCleanup: (() => void) | null = null;
  private visCleanup: (() => void) | null = null;
  private ambientOscillators: OscillatorNode[] = [];
  private ambientGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;

  readonly counters = { fetches: 0, decodes: 0, cacheHits: 0, sfxPlayed: 0, sfxDroppedNotLoaded: 0, sfxDroppedLimit: 0, errors: 0 };

  constructor(private readonly o: AudioManagerOptions) {
    this.bus = o.bus ?? new SimpleEmitter();
    this.manifest = o.manifest;
    this.opts = { combatExitDelayMs: o.combatExitDelayMs ?? 3000, maxVoices: o.maxVoices ?? 24, maxCachedMusicTracks: o.maxCachedMusicTracks ?? 4 };
  }

  // ---- context / unlock ----------------------------------------------------------------------

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = this.o.createContext ? this.o.createContext() : Ctor ? new Ctor() : null;
      if (!ctx) throw new Error('Web Audio API not supported');
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(ctx.destination);
      this.applyVolumes(true);
      return ctx;
    } catch (err) {
      this.fail('context', err);
      return null;
    }
  }

  /** Install one-shot gesture listeners that unlock audio. Call once after the game canvas exists. */
  attachUnlockListeners(target: Document | HTMLElement | undefined = this.o.doc ?? (typeof document !== 'undefined' ? document : undefined)): void {
    if (!target || this.unlockCleanup || this.unlocked) return;
    // touchend/click/keydown count as user activation on iOS & Android; touchstart does not on iOS.
    const events = ['pointerup', 'touchend', 'click', 'keydown'];
    const handler = (): void => void this.unlock();
    for (const e of events) target.addEventListener(e, handler, { passive: true });
    this.unlockCleanup = () => {
      for (const e of events) target.removeEventListener(e, handler);
      this.unlockCleanup = null;
    };
  }

  /** Must run inside a user gesture. Resolves true if the context is running afterwards. */
  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.unlocked) return true;
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      if (ctx.state !== 'running') await ctx.resume();
      // iOS Safari: play a silent buffer inside the gesture.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch (err) {
      this.fail('unlock', err);
    }
    if (ctx.state !== 'running') return false; // keep listeners; try again on the next gesture
    this.unlocked = true;
    this.unlockCleanup?.();
    this.bus.emit(PersistenceEvents.AUDIO_UNLOCKED);
    this.attachVisibility();
    this.refreshMusic(); // start music that was requested before unlock
    if (!Object.keys(this.o.regionMusic ?? {}).length && !this.o.combatMusicId) this.startProceduralAmbient();
    if (this.wantedAmbience.length) void this.setAmbience(this.wantedAmbience);
    return true;
  }
  isUnlocked(): boolean {
    return this.unlocked;
  }

  private attachVisibility(): void {
    const doc = this.o.doc ?? (typeof document !== 'undefined' ? document : undefined);
    if (!doc || this.visCleanup) return;
    const onVis = (): void => {
      if (!this.ctx) return;
      if (doc.visibilityState === 'hidden') {
        this.pausedForHidden = true;
        for (const t of this.tracks.values()) t.el.pause();
        void this.ctx.suspend().catch(() => undefined);
      } else if (this.pausedForHidden) {
        this.pausedForHidden = false;
        void this.ctx.resume().then(() => {
          const cur = this.currentMusicId ? this.tracks.get(this.currentMusicId) : null;
          cur?.el.play().catch(() => this.bus.emit(PersistenceEvents.AUDIO_BLOCKED));
        }).catch(() => undefined);
      }
    };
    doc.addEventListener('visibilitychange', onVis);
    this.visCleanup = () => {
      doc.removeEventListener('visibilitychange', onVis);
      this.visCleanup = null;
    };
  }

  // ---- volumes -------------------------------------------------------------------------------

  /** Apply settings. Called automatically by PersistenceModule on `settings:changed`. */
  setVolumes(v: { music?: number; sfx?: number; muted?: boolean }): void {
    const c = (n: number): number => Math.min(1, Math.max(0, n));
    if (v.music !== undefined) this.vol.music = c(v.music);
    if (v.sfx !== undefined) this.vol.sfx = c(v.sfx);
    if (v.muted !== undefined) this.vol.muted = v.muted;
    this.applyVolumes(false);
  }
  getVolumes(): { music: number; sfx: number; muted: boolean } {
    return { ...this.vol };
  }
  private applyVolumes(immediate: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number): void => {
      g.gain.cancelScheduledValues(t);
      if (immediate) g.gain.setValueAtTime(v, t);
      else g.gain.setTargetAtTime(v, t, 0.02); // ~20ms smoothing, avoids clicks
    };
    set(this.master, this.vol.muted ? 0 : 1);
    set(this.musicBus, this.vol.music);
    set(this.sfxBus, this.vol.sfx);
  }

  // ---- loading -------------------------------------------------------------------------------

  /** Decode and cache the given SFX/UI/env assets (music is streamed, not decoded). Safe to call repeatedly. */
  async preload(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.loadBuffer(id)));
  }

  private loadBuffer(id: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(id);
    if (hit) {
      this.counters.cacheHits++;
      return Promise.resolve(hit);
    }
    const inflight = this.loading.get(id);
    if (inflight) return inflight; // de-duplicate concurrent loads
    const asset = this.manifest[id];
    if (!asset || asset.category === 'music') {
      this.fail(id, new Error(asset ? 'music is streamed, not buffered' : 'unknown audio id'));
      return Promise.resolve(null);
    }
    const failed = this.failedAt.get(id);
    if (failed !== undefined && Date.now() - failed < 10_000) return Promise.resolve(null); // don't hammer a broken URL
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve(null);
    const p = (async (): Promise<AudioBuffer | null> => {
      try {
        this.counters.fetches++;
        const res = await (this.o.fetchFn ?? fetch)(asset.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        this.counters.decodes++;
        const buf = await decode(ctx, data);
        if (this.disposed) return null;
        this.buffers.set(id, buf);
        return buf;
      } catch (err) {
        this.failedAt.set(id, Date.now());
        this.fail(id, err);
        return null;
      } finally {
        this.loading.delete(id);
      }
    })();
    this.loading.set(id, p);
    return p;
  }

  /** Free decoded buffers (e.g. when leaving a region). Playing voices keep their own reference until they end. */
  unload(ids: string[]): void {
    for (const id of ids) {
      this.buffers.delete(id);
      this.failedAt.delete(id);
    }
  }
  loadedBufferCount(): number {
    return this.buffers.size;
  }

  // ---- SFX / UI ------------------------------------------------------------------------------

  /**
   * Fire-and-forget one-shot. Returns true if a voice started. If the asset is not decoded yet this returns
   * false and starts loading it, so preload() what you need (the sound is not queued: late combat SFX are worse than none).
   */
  playSfx(id: string, opts: { volume?: number; rate?: number; pan?: number } = {}): boolean {
    const asset = this.manifest[id];
    if (!asset) {
      // Only synthesize recognized gameplay SFX; unknown IDs must remain observable errors.
      if (/^(hit|damage|impact|attack|sword|slash|combat|confirm|level|success|save|ui[_-](click|confirm|back)|footstep|step|dash|jump|heal|block|parry|magic|spell|fire|ice|enemy|boss|coin|loot|death)([_-].*)?$/i.test(id)) {
        return this.playProceduralSfx(id, opts);
      }
      this.fail(id, new Error('unknown or non-SFX audio id'));
      return false;
    }
    if (asset.category === 'music') {
      this.fail(id, new Error('music asset cannot be played as SFX'));
      return false;
    }
    if (!this.unlocked || !this.ctx) return false;
    const buf = this.buffers.get(id);
    if (!buf) {
      this.counters.sfxDroppedNotLoaded++;
      void this.loadBuffer(id);
      return false;
    }
    const now = performance.now();
    if (asset.cooldownMs && now - (this.lastPlayed.get(id) ?? -Infinity) < asset.cooldownMs) return false;
    const sameId = [...this.voices].filter((v) => v.id === id);
    if (this.voices.size >= this.opts.maxVoices || sameId.length >= (asset.maxVoices ?? 4)) {
      this.counters.sfxDroppedLimit++;
      return false;
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!asset.loop;
    if (opts.rate) src.playbackRate.value = Math.min(4, Math.max(0.25, opts.rate));
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, (opts.volume ?? 1) * (asset.volume ?? 1)));
    src.connect(gain);
    let tail: AudioNode = gain;
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.min(1, Math.max(-1, opts.pan));
      gain.connect(p);
      tail = p;
    }
    tail.connect(this.sfxBus);
    const voice: Voice = { id, src, gain };
    this.voices.add(voice);
    src.onended = () => {
      this.voices.delete(voice);
      src.disconnect();
      gain.disconnect();
      if (tail !== gain) tail.disconnect();
    };
    src.start();
    this.lastPlayed.set(id, now);
    this.counters.sfxPlayed++;
    return true;
  }
  activeVoiceCount(): number {
    return this.voices.size;
  }
  stopSfx(id?: string): void {
    for (const v of [...this.voices]) if (!id || v.id === id) {
      try {
        v.src.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  // ---- environment loops ---------------------------------------------------------------------

  /** Set the full list of ambient loops that should be playing; others fade out. Safe to call repeatedly. */
  async setAmbience(ids: string[], fadeMs = 1000): Promise<void> {
    this.wantedAmbience = [...ids];
    if (!this.unlocked || !this.ctx) return;
    const token = ++this.ambienceToken;
    const ctx = this.ctx;
    for (const [id, a] of [...this.ambience]) {
      if (!ids.includes(id)) {
        this.ambience.delete(id);
        this.fadeAndStop(a.gain, a.src, fadeMs);
      }
    }
    await Promise.all(
      ids.filter((id) => !this.ambience.has(id)).map(async (id) => {
        const buf = await this.loadBuffer(id);
        if (!buf || token !== this.ambienceToken || this.disposed || this.ambience.has(id)) return; // superseded
        const asset = this.manifest[id]!;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(asset.volume ?? 1, ctx.currentTime + fadeMs / 1000);
        src.connect(gain).connect(this.sfxBus);
        src.start();
        this.ambience.set(id, { src, gain });
      }),
    );
  }
  private fadeAndStop(gain: GainNode, src: AudioBufferSourceNode, fadeMs: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* ok */
      }
      src.disconnect();
      gain.disconnect();
    }, fadeMs + 50);
  }

  // ---- music ---------------------------------------------------------------------------------

  /** Region music mapping can be extended at runtime (e.g. by the world module). */
  setRegionMusic(map: Record<string, string>): void {
    this.o.regionMusic = { ...(this.o.regionMusic ?? {}), ...map };
  }
  setRegion(regionId: string | null): void {
    this.region = regionId;
    this.refreshMusic();
  }
  setCombatActive(active: boolean): void {
    if (this.combatTimer) {
      clearTimeout(this.combatTimer);
      this.combatTimer = null;
    }
    if (active) {
      this.combat = true;
      this.refreshMusic();
    } else if (this.combat) {
      this.combatTimer = setTimeout(() => {
        this.combatTimer = null;
        this.combat = false;
        this.refreshMusic();
      }, this.opts.combatExitDelayMs);
    }
  }
  /** Start boss music (asset id of a music track). Pass null to end it. Boss > combat > region. */
  setBossMusic(id: string | null): void {
    this.bossMusicId = id;
    this.refreshMusic();
  }
  getCurrentMusicId(): string | null {
    return this.currentMusicId;
  }

  private resolveMusic(): string | null {
    if (this.bossMusicId) return this.bossMusicId;
    if (this.combat && this.o.combatMusicId) return this.o.combatMusicId;
    return this.region ? this.o.regionMusic?.[this.region] ?? null : null;
  }
  private refreshMusic(): void {
    const want = this.resolveMusic();
    if (!this.unlocked) {
      this.currentMusicId = want; // remembered; started in unlock()
      return;
    }
    const cur = want ? this.tracks.get(want) : undefined;
    if (want === this.currentMusicId && (want === null || (cur && !cur.el.paused))) return;
    this.transitionMusic(want, 1000);
  }
  /** Explicitly play a music asset now (bypasses region/combat/boss resolution until the next state change). */
  playMusic(id: string, fadeMs = 800): void {
    if (!this.unlocked) {
      this.currentMusicId = id;
      return;
    }
    this.transitionMusic(id, fadeMs);
  }
  stopMusic(fadeMs = 800): void {
    this.transitionMusic(null, fadeMs);
  }

  private transitionMusic(id: string | null, fadeMs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const prevId = this.currentMusicId;
    const prev = prevId && prevId !== id ? this.tracks.get(prevId) : undefined;
    if (prev) this.fadeOutTrack(prev, fadeMs);
    this.currentMusicId = id;
    if (!id) {
      this.bus.emit(PersistenceEvents.AUDIO_MUSIC_CHANGED, { id: null });
      return;
    }
    const asset = this.manifest[id];
    if (!asset || asset.category !== 'music') {
      this.fail(id, new Error('unknown or non-music audio id'));
      return;
    }
    const track = this.getTrack(id, asset);
    if (!track) return;
    if (track.stopTimer) {
      clearTimeout(track.stopTimer);
      track.stopTimer = null;
    }
    const t = ctx.currentTime;
    track.gain.gain.cancelScheduledValues(t);
    track.gain.gain.setValueAtTime(track.el.paused ? 0 : track.gain.gain.value, t);
    track.gain.gain.linearRampToValueAtTime(asset.volume ?? 1, t + fadeMs / 1000);
    if (track.el.paused) {
      track.el.currentTime = 0;
      const p = track.el.play();
      p?.catch((err: unknown) => {
        // Autoplay blocked or load failure: stay "wanted" so the next unlock/gesture retries.
        if ((err as Error)?.name === 'NotAllowedError') {
          this.unlocked = false;
          this.bus.emit(PersistenceEvents.AUDIO_BLOCKED, { id });
          this.attachUnlockListeners();
        } else this.fail(id, err);
      });
    }
    this.bus.emit(PersistenceEvents.AUDIO_MUSIC_CHANGED, { id });
  }

  private getTrack(id: string, asset: AudioAsset): MusicTrack | null {
    const have = this.tracks.get(id);
    if (have) {
      have.lastUsed = performance.now();
      return have;
    }
    const ctx = this.ctx!;
    try {
      const el = this.o.createMediaElement ? this.o.createMediaElement() : new Audio();
      el.loop = asset.loop !== false;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.addEventListener('error', () => this.fail(id, new Error(`music element error for ${asset.url}`)));
      el.src = asset.url;
      const src = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.musicBus);
      const track: MusicTrack = { id, el, src, gain, stopTimer: null, lastUsed: performance.now() };
      this.tracks.set(id, track);
      this.evictTracks(id);
      return track;
    } catch (err) {
      this.fail(id, err);
      return null;
    }
  }
  private fadeOutTrack(t: MusicTrack, fadeMs: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    t.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    if (t.stopTimer) clearTimeout(t.stopTimer);
    t.stopTimer = setTimeout(() => {
      t.stopTimer = null;
      t.el.pause();
    }, fadeMs + 50);
  }
  /** Keep only the N most recently used track elements; dispose the rest fully (prevents leaks). */
  private evictTracks(keep: string): void {
    while (this.tracks.size > this.opts.maxCachedMusicTracks) {
      let oldest: MusicTrack | null = null;
      for (const t of this.tracks.values()) if (t.id !== keep && t.id !== this.currentMusicId && (!oldest || t.lastUsed < oldest.lastUsed)) oldest = t;
      if (!oldest) return;
      this.disposeTrack(oldest);
    }
  }
  private disposeTrack(t: MusicTrack): void {
    if (t.stopTimer) clearTimeout(t.stopTimer);
    t.el.pause();
    t.el.removeAttribute('src');
    t.el.load();
    t.src.disconnect();
    t.gain.disconnect();
    this.tracks.delete(t.id);
  }
  cachedTrackCount(): number {
    return this.tracks.size;
  }

  // ---- lifecycle -----------------------------------------------------------------------------

  /** Wire the audio manager to bus events (see README for payloads). Returns an unsubscribe function. */
  bindBus(names: { playSfx: string; setRegion: string; combat: string; boss: string }): () => void {
    const h = {
      sfx: (p: { id: string; volume?: number; rate?: number; pan?: number }) => p && this.playSfx(p.id, p),
      region: (p: { regionId: string } | string) => this.setRegion(typeof p === 'string' ? p : p?.regionId ?? null),
      combat: (p: { active: boolean } | boolean) => this.setCombatActive(typeof p === 'boolean' ? p : !!p?.active),
      boss: (p: { id: string | null } | string | null) => this.setBossMusic(typeof p === 'object' && p ? p.id : (p as string | null)),
    };
    this.bus.on(names.playSfx, h.sfx);
    this.bus.on(names.setRegion, h.region);
    this.bus.on(names.combat, h.combat);
    this.bus.on(names.boss, h.boss);
    return () => {
      this.bus.off(names.playSfx, h.sfx);
      this.bus.off(names.setRegion, h.region);
      this.bus.off(names.combat, h.combat);
      this.bus.off(names.boss, h.boss);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.unlockCleanup?.();
    this.visCleanup?.();
    if (this.combatTimer) clearTimeout(this.combatTimer);
    this.stopSfx();
    for (const a of this.ambience.values()) {
      try {
        a.src.stop();
      } catch {
        /* ok */
      }
      a.src.disconnect();
      a.gain.disconnect();
    }
    this.ambience.clear();
    for (const osc of this.ambientOscillators) { try { osc.stop(); } catch { /* already stopped */ } osc.disconnect(); }
    this.ambientOscillators = [];
    this.ambientGain?.disconnect(); this.ambientGain = null;
    this.ambientFilter?.disconnect(); this.ambientFilter = null;
    for (const t of [...this.tracks.values()]) this.disposeTrack(t);
    this.buffers.clear();
    this.loading.clear();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  /** Subtle synthesized ambience keeps the world from being silent when no music files are bundled. */
  /** Gentle original fantasy ambience: warm consonant chords, no harsh low-frequency beating drone. */
  private startProceduralAmbient(): void {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || this.ambientOscillators.length) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.018, now + 6);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1250; filter.Q.value = 0.35;
    master.connect(filter); filter.connect(this.musicBus);
    this.ambientGain = master; this.ambientFilter = filter;

    // A calm D-major / B-minor colour, voiced in a comfortable register rather than sub-bass.
    const voices = [146.83, 220, 293.66, 369.99];
    voices.forEach((frequency, index) => {
      const osc = ctx.createOscillator(); const voice = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency;
      voice.gain.value = [0.22, 0.12, 0.075, 0.035][index];
      osc.connect(voice); voice.connect(master); osc.start(); this.ambientOscillators.push(osc);
    });

    // Slow chord colour changes create musical movement without a repeating test-tone pulse.
    const progression = [
      [146.83, 220, 293.66, 369.99],
      [123.47, 185, 246.94, 311.13],
      [110, 164.81, 220, 277.18],
      [130.81, 196, 261.63, 329.63],
    ];
    const starts = [0, 12, 24, 36];
    for (let i = 0; i < 4; i++) {
      const osc = this.ambientOscillators[i];
      for (let chord = 1; chord < progression.length; chord++) {
        osc.frequency.setValueAtTime(progression[chord - 1][i], now + starts[chord - 1]);
        osc.frequency.linearRampToValueAtTime(progression[chord][i], now + starts[chord] + 2.5);
      }
      osc.frequency.setValueAtTime(progression[3][i], now + 36);
    }
    const shimmer = ctx.createOscillator(); const shimmerGain = ctx.createGain();
    shimmer.type = 'sine'; shimmer.frequency.value = 587.33; shimmerGain.gain.value = 0.008;
    shimmer.connect(shimmerGain); shimmerGain.connect(master); shimmer.start(); this.ambientOscillators.push(shimmer);
  }

  /** Small WebAudio one-shots are a safe fallback for missing bundled SFX. */
  private playProceduralSfx(id: string, opts: { volume?: number; rate?: number; pan?: number }): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || this.vol.muted) return false;
    const name = id.toLowerCase();
    const now = ctx.currentTime;
    const rate = Math.min(2.5, Math.max(0.45, opts.rate ?? 1));
    const volume = Math.min(1, Math.max(0.05, opts.volume ?? 0.75));
    const kind = /magic|spell|fire|ice/.test(name) ? 'magic'
      : /footstep|step/.test(name) ? 'step'
      : /dash|jump|dodge/.test(name) ? 'movement'
      : /block|parry/.test(name) ? 'guard'
      : /heal|level|success|save|coin|loot|confirm/.test(name) ? 'reward'
      : /death|enemy|boss/.test(name) ? 'heavy'
      : /hit|damage|impact|attack|sword|slash|combat/.test(name) ? 'hit' : 'ui';
    const presets: Record<string, { wave: OscillatorType; from: number; to: number; duration: number; gain: number }> = {
      magic: { wave: 'sine', from: 760, to: 180, duration: 0.34, gain: 0.16 },
      step: { wave: 'triangle', from: 95, to: 48, duration: 0.075, gain: 0.11 },
      movement: { wave: 'sine', from: 440, to: 220, duration: 0.2, gain: 0.075 },
      guard: { wave: 'triangle', from: 410, to: 190, duration: 0.16, gain: 0.18 },
      reward: { wave: 'sine', from: 520, to: 1040, duration: 0.28, gain: 0.12 },
      heavy: { wave: 'sine', from: 110, to: 55, duration: 0.32, gain: 0.13 },
      hit: { wave: 'triangle', from: 220, to: 82, duration: 0.17, gain: 0.12 },
      ui: { wave: 'sine', from: 460, to: 330, duration: 0.09, gain: 0.075 },
    };
    const p = presets[kind];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = p.wave;
    osc.frequency.setValueAtTime(p.from * rate, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, p.to * rate), now + p.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(p.gain * volume, now + Math.min(0.018, p.duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + p.duration);
    let tail: AudioNode = gain;
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(pan); tail = pan;
    }
    osc.connect(gain); tail.connect(this.sfxBus); osc.start(now); osc.stop(now + p.duration + 0.015);

    // A quiet, short noise layer adds texture to blade impacts, movement and spell bursts.
    if (kind === 'hit' || kind === 'heavy' || kind === 'movement' || kind === 'magic') {
      const length = Math.max(1, Math.floor(ctx.sampleRate * (kind === 'magic' ? 0.22 : 0.09)));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const noise = ctx.createBufferSource(); noise.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = kind === 'magic' ? 'bandpass' : 'lowpass';
      filter.frequency.value = kind === 'magic' ? 1500 : 850;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(p.gain * volume * 0.16, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'magic' ? 0.22 : 0.09));
      noise.connect(filter); filter.connect(ng); ng.connect(this.sfxBus);
      noise.start(now); noise.stop(now + (kind === 'magic' ? 0.22 : 0.09));
    }
    // Distinctive secondary layers: metallic blade ring, low impact body, airy spell shimmer and coin chime.
    if (kind === 'hit' && /sword|slash|attack/.test(name)) {
      const clang = ctx.createOscillator();
      const cg = ctx.createGain();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1250;
      clang.type = 'triangle'; clang.frequency.setValueAtTime(1450 * rate, now);
      clang.frequency.exponentialRampToValueAtTime(620 * rate, now + 0.13);
      cg.gain.setValueAtTime(0.0001, now); cg.gain.linearRampToValueAtTime(0.055 * volume, now + 0.008);
      cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      clang.connect(hp); hp.connect(cg); cg.connect(this.sfxBus); clang.start(now); clang.stop(now + 0.2);
    } else if (kind === 'heavy' || (kind === 'hit' && /impact|damage/.test(name))) {
      const thump = ctx.createOscillator();
      const tg = ctx.createGain();
      thump.type = 'sine'; thump.frequency.setValueAtTime(92 * rate, now);
      thump.frequency.exponentialRampToValueAtTime(34, now + 0.24);
      tg.gain.setValueAtTime(0.0001, now); tg.gain.linearRampToValueAtTime(0.12 * volume, now + 0.012);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);
      thump.connect(tg); tg.connect(this.sfxBus); thump.start(now); thump.stop(now + 0.29);
    } else if (kind === 'reward') {
      [1, 1.5, 2].forEach((ratio, index) => {
        const bell = ctx.createOscillator();
        const bg = ctx.createGain();
        bell.type = 'sine'; bell.frequency.setValueAtTime((880 * ratio) * rate, now + index * 0.035);
        bg.gain.setValueAtTime(0.0001, now + index * 0.035);
        bg.gain.linearRampToValueAtTime((0.035 / (index + 1)) * volume, now + index * 0.035 + 0.008);
        bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.42 + index * 0.035);
        bell.connect(bg); bg.connect(this.sfxBus); bell.start(now + index * 0.035); bell.stop(now + 0.45 + index * 0.035);
      });
    } else if (kind === 'magic') {
      const shimmer = ctx.createOscillator();
      const sg = ctx.createGain();
      const shimmerFilter = ctx.createBiquadFilter();
      shimmer.type = 'sine'; shimmer.frequency.setValueAtTime(1320 * rate, now);
      shimmer.frequency.exponentialRampToValueAtTime(460 * rate, now + 0.36);
      shimmerFilter.type = 'bandpass'; shimmerFilter.frequency.value = 1750; shimmerFilter.Q.value = 0.7;
      sg.gain.setValueAtTime(0.0001, now); sg.gain.linearRampToValueAtTime(0.035 * volume, now + 0.025);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      shimmer.connect(shimmerFilter); shimmerFilter.connect(sg); sg.connect(this.sfxBus);
      shimmer.start(now); shimmer.stop(now + 0.4);
    }

    this.counters.sfxPlayed++;
    return true;
  }

  private fail(id: string, err: unknown): void {
    this.counters.errors++;
    // Missing/broken audio must never crash the game: report and carry on.
    this.bus.emit(PersistenceEvents.AUDIO_ERROR, { id, message: (err as Error)?.message ?? String(err) });
  }
}

function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Older Safari only supports the callback form.
  return new Promise((resolve, reject) => {
    const r = ctx.decodeAudioData(data, resolve, reject);
    if (r && typeof (r as Promise<AudioBuffer>).then === 'function') (r as Promise<AudioBuffer>).then(resolve, reject);
  });
}
