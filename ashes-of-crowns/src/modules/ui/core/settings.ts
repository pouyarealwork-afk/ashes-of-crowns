import type { UISettings } from '../contracts';
import { clamp } from './dom';

export const SETTINGS_KEY = 'aoc.ui.settings.v1';

export const DEFAULT_SETTINGS: UISettings = {
  lang: 'en',
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  touchControls: true,
  controlScale: 1,
  controlOpacity: 0.85,
  leftHanded: false,
  hudScale: 'medium',
  textScale: 'medium',
  reduceMotion: true,
  vibration: true,
  persianDigits: true,
};

const SCALES = ['small', 'medium', 'large'];
const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const pick = <T extends string>(v: unknown, allowed: readonly string[], d: T): T =>
  typeof v === 'string' && allowed.includes(v) ? (v as T) : d;

/** Validate + repair untrusted data (corrupted storage, older versions). Never throws. */
export function sanitizeSettings(raw: unknown, fallback: UISettings = DEFAULT_SETTINGS): UISettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const f = fallback;
  return {
    lang: pick(r.lang, ['en', 'fa'], f.lang),
    masterVolume: num(r.masterVolume, f.masterVolume, 0, 1),
    musicVolume: num(r.musicVolume, f.musicVolume, 0, 1),
    sfxVolume: num(r.sfxVolume, f.sfxVolume, 0, 1),
    touchControls: bool(r.touchControls, f.touchControls),
    controlScale: num(r.controlScale, f.controlScale, 0.8, 1.4),
    controlOpacity: num(r.controlOpacity, f.controlOpacity, 0.3, 1),
    leftHanded: bool(r.leftHanded, f.leftHanded),
    hudScale: pick(r.hudScale, SCALES, f.hudScale),
    textScale: pick(r.textScale, SCALES, f.textScale),
    reduceMotion: bool(r.reduceMotion, f.reduceMotion),
    vibration: bool(r.vibration, f.vibration),
    persianDigits: bool(r.persianDigits, f.persianDigits),
  };
}

/** Detect first-run language: Persian browsers get Persian, everyone else English. */
export function detectLang(): 'en' | 'fa' {
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en';
  return l.toLowerCase().startsWith('fa') ? 'fa' : 'en';
}

/** Minimal Storage-like interface so tests / private mode can inject a fallback. */
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function memoryStorage(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

export function safeStorage(preferred?: KV): KV {
  if (preferred) return preferred;
  try {
    const s = window.localStorage;
    const probe = '__aoc_probe__';
    s.setItem(probe, '1'); s.removeItem(probe);
    return s;
  } catch {
    return memoryStorage(); // private mode / blocked storage: settings last for the session only
  }
}

export function loadSettings(store: KV): UISettings {
  const base: UISettings = { ...DEFAULT_SETTINGS, lang: detectLang() };
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return base;
    return sanitizeSettings(JSON.parse(raw), base);
  } catch {
    return base;
  }
}

export function saveSettings(store: KV, s: UISettings): void {
  try { store.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* quota / blocked: ignore */ }
}
