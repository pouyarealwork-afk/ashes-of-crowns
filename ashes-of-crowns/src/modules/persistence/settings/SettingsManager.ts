import { KVBackend } from '../storage/backend';
import { PersistenceEvents, SimpleEmitter } from '../events';
import type { DeepPartial, EventBus, GraphicsQuality, Settings } from '../types';

export const SETTINGS_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    audio: { music: 0.7, sfx: 0.8, muted: false },
    language: 'en',
    graphics: { quality: 'auto', targetFps: 60, particles: true, screenShake: true, showFps: false },
    controls: {
      touchLayout: 'default',
      touchOpacity: 0.6,
      buttonScale: 1,
      joystickMode: 'fixed',
      deadzone: 0.15,
      haptics: true,
      autoAttackAssist: false,
    },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Validates untrusted settings, filling anything missing/invalid from `base` (defaults or current settings). */
export function sanitizeSettings(raw: unknown, base: Settings = defaultSettings(), languages?: readonly string[]): Settings {
  const r = isObj(raw) ? raw : {};
  const a = isObj(r.audio) ? r.audio : {};
  const g = isObj(r.graphics) ? r.graphics : {};
  const c = isObj(r.controls) ? r.controls : {};
  const lang = typeof r.language === 'string' && LANG_RE.test(r.language) && (!languages || languages.includes(r.language)) ? r.language : base.language;
  return {
    version: SETTINGS_VERSION,
    audio: { music: clamp(a.music, 0, 1, base.audio.music), sfx: clamp(a.sfx, 0, 1, base.audio.sfx), muted: bool(a.muted, base.audio.muted) },
    language: lang,
    graphics: {
      quality: oneOf<GraphicsQuality>(g.quality, ['auto', 'low', 'medium', 'high'], base.graphics.quality),
      targetFps: g.targetFps === 30 || g.targetFps === 60 ? g.targetFps : base.graphics.targetFps,
      particles: bool(g.particles, base.graphics.particles),
      screenShake: bool(g.screenShake, base.graphics.screenShake),
      showFps: bool(g.showFps, base.graphics.showFps),
    },
    controls: {
      touchLayout: oneOf(c.touchLayout, ['default', 'left-handed'] as const, base.controls.touchLayout),
      touchOpacity: clamp(c.touchOpacity, 0.2, 1, base.controls.touchOpacity),
      buttonScale: clamp(c.buttonScale, 0.7, 1.5, base.controls.buttonScale),
      joystickMode: oneOf(c.joystickMode, ['fixed', 'floating'] as const, base.controls.joystickMode),
      deadzone: clamp(c.deadzone, 0, 0.5, base.controls.deadzone),
      haptics: bool(c.haptics, base.controls.haptics),
      autoAttackAssist: bool(c.autoAttackAssist, base.controls.autoAttackAssist),
    },
  };
}

/** Picks a concrete quality tier for 'auto' from device hints. */
export function detectPerformanceTier(nav: { hardwareConcurrency?: number; deviceMemory?: number } | undefined = typeof navigator !== 'undefined' ? (navigator as never) : undefined): Exclude<GraphicsQuality, 'auto'> {
  const cores = nav?.hardwareConcurrency ?? 4;
  const mem = nav?.deviceMemory ?? 4;
  if (mem <= 2 || cores <= 4) return 'low';
  if (mem <= 4 || cores <= 6) return 'medium';
  return 'high';
}

export class SettingsManager {
  private current: Settings = defaultSettings();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private persistFailed = false;
  private readonly bus: EventBus;

  constructor(
    private readonly backend: KVBackend,
    opts: { bus?: EventBus; languages?: readonly string[]; debounceMs?: number } = {},
  ) {
    this.bus = opts.bus ?? new SimpleEmitter();
    this.languages = opts.languages;
    this.debounceMs = opts.debounceMs ?? 300;
  }
  private languages?: readonly string[];
  private debounceMs: number;

  /** Loads persisted settings (falling back to defaults on any problem). Safe to call once at startup. */
  async load(): Promise<Settings> {
    try {
      const raw = await this.backend.get('settings', 'settings');
      if (raw !== undefined) this.current = sanitizeSettings(raw, defaultSettings(), this.languages);
    } catch {
      this.current = defaultSettings();
    }
    return this.get();
  }

  get(): Settings {
    return structuredClone(this.current);
  }

  /** Quality with 'auto' resolved to a concrete tier. */
  resolvedQuality(): Exclude<GraphicsQuality, 'auto'> {
    return this.current.graphics.quality === 'auto' ? detectPerformanceTier() : this.current.graphics.quality;
  }

  /** Applies a partial update (validated + clamped), emits `settings:changed` only if something changed, persists debounced. */
  update(patch: DeepPartial<Settings>): Settings {
    const next = sanitizeSettings(mergeDeep(this.current, patch), this.current, this.languages);
    const changed = diffKeys(this.current, next);
    if (changed.length === 0) return this.get();
    this.current = next;
    this.dirty = true;
    this.schedulePersist();
    this.bus.emit(PersistenceEvents.SETTINGS_CHANGED, { settings: this.get(), changed });
    return this.get();
  }

  reset(): Settings {
    return this.update(defaultSettings() as DeepPartial<Settings>);
  }

  private schedulePersist(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Writes pending changes now. Resolves false if the write failed (settings stay applied in memory). */
  async flush(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return !this.persistFailed;
    this.dirty = false;
    try {
      await this.backend.put('settings', 'settings', this.current);
      this.persistFailed = false;
      return true;
    } catch {
      this.persistFailed = true;
      this.dirty = true;
      return false;
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function mergeDeep(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = mergeDeep(base[k], patch[k]);
  }
  return out;
}
function diffKeys(a: unknown, b: unknown, prefix = ''): string[] {
  if (isObj(a) && isObj(b)) return Object.keys(b).flatMap((k) => diffKeys(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  return a === b ? [] : [prefix];
}
