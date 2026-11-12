/**
 * Shared types for the persistence module (save system, settings, checkpoints, audio).
 * Everything here is plain JSON-serialisable data so it can live in IndexedDB and be exported.
 */

export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_FORMAT_ID = 'ashes-of-crowns-save';
export const EXPORT_FORMAT_VERSION = 1;
export const AUTO_SLOT = 'auto';
export const DEFAULT_MANUAL_SLOTS = ['slot1', 'slot2', 'slot3'] as const;

/** Region ids recommended by the project spec. The world module owns the real ids; any non-empty string is accepted. */
export const REGION_IDS = [
  'ashen_village',
  'whispering_forest',
  'forgotten_desert',
  'frozen_highlands',
  'hollow_city',
  'crownfall',
] as const;

export const ENDING_IDS = ['true_king', 'tyrant', 'wanderer', 'hidden_truth', 'fallen_hero'] as const;

export type SlotId = string;
export type SaveKind = 'manual' | 'auto' | 'import';
export type Primitive = string | number | boolean;

export interface InventoryItem {
  id: string;
  qty: number;
  durability?: number;
  /** Free-form JSON-safe data owned by the RPG module (affixes, upgrades...). */
  meta?: Record<string, unknown>;
}

export interface QuestRecord {
  id: string;
  status: 'inactive' | 'active' | 'completed' | 'failed';
  stage: number;
  objectives: Record<string, number>;
}

export interface MemoryStoneRecord {
  id: string;
  regionId: string;
  x: number;
  y: number;
  /** Epoch ms of first activation. */
  discoveredAt: number;
}

export interface CheckpointState {
  /** Id of the Memory Stone the player will respawn at, or null if none activated yet. */
  lastStoneId: string | null;
  stones: Record<string, MemoryStoneRecord>;
}

export interface NarrativeVariables {
  honor: number;
  trust: number;
  ambition: number;
  mercy: number;
}

export interface GameState {
  player: {
    stats: Record<string, number>;
    level: number;
    xp: number;
    position?: { x: number; y: number };
  };
  inventory: { gold: number; items: InventoryItem[]; capacity?: number };
  /** slot name -> item id (or null if empty). */
  equipment: Record<string, string | null>;
  skills: { unlocked: string[]; equipped: string[]; points: number; levels: Record<string, number> };
  quests: QuestRecord[];
  /** Story decisions, keyed by decision id. */
  decisions: Record<string, Primitive>;
  /** Hidden narrative variables. */
  narrative: NarrativeVariables;
  /** NPC id -> relationship value. */
  relationships: Record<string, number>;
  difficulty: string;
  currentRegion: string;
  checkpoints: CheckpointState;
  unlockedSkins: string[];
  progress: {
    playtimeMs: number;
    regionsUnlocked: string[];
    regionsCompleted: string[];
    bossesDefeated: string[];
    flags: Record<string, Primitive>;
    endingsSeen: string[];
  };
}

/** What other modules provide when asked for state. Checkpoints are owned by this module and merged in automatically. */
export type GameStateInput = Omit<GameState, 'checkpoints'> & { checkpoints?: CheckpointState };
export type GameStateProvider = () => GameStateInput | null | undefined;

export interface SaveMeta {
  schemaVersion: number;
  gameVersion: string;
  slotId: SlotId;
  kind: SaveKind;
  label: string;
  createdAt: number;
  updatedAt: number;
  playtimeMs: number;
  level: number;
  regionId: string;
  /** Integrity checksum (accidental-corruption detection only; NOT tamper-proof). */
  checksum: string;
}

export interface SaveRecord {
  meta: SaveMeta;
  state: GameState;
}

export interface ExportEnvelope {
  format: typeof SAVE_FORMAT_ID;
  exportVersion: number;
  exportedAt: number;
  save: SaveRecord;
}

export type LoadStatus = 'ok' | 'repaired' | 'restored-backup' | 'checksum-mismatch';

export type PersistenceErrorCode =
  | 'empty-slot'
  | 'invalid'
  | 'newer-version'
  | 'no-migration'
  | 'checksum-mismatch'
  | 'too-large'
  | 'bad-slot'
  | 'slot-occupied'
  | 'quota'
  | 'storage-unavailable'
  | 'storage-failed'
  | 'no-state-provider'
  | 'nothing-to-save';

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly originalError?: unknown;
  constructor(code: PersistenceErrorCode, message: string, originalError?: unknown) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    this.originalError = originalError;
  }
}

export type LoadResult =
  | { ok: true; record: SaveRecord; status: LoadStatus; warnings: string[] }
  | { ok: false; code: PersistenceErrorCode; message: string };

export interface SlotSummary {
  slotId: SlotId;
  state: 'empty' | 'ok' | 'recovered' | 'corrupt';
  meta?: SaveMeta;
  message?: string;
}

export interface Migration {
  from: number;
  to: number;
  migrate: (record: { meta: Record<string, unknown>; state: Record<string, unknown> }) => {
    meta: Record<string, unknown>;
    state: Record<string, unknown>;
  };
}

// ---- Settings ---------------------------------------------------------------------------------

export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  version: number;
  audio: { music: number; sfx: number; muted: boolean };
  language: string;
  graphics: {
    quality: GraphicsQuality;
    targetFps: 30 | 60;
    particles: boolean;
    screenShake: boolean;
    showFps: boolean;
  };
  controls: {
    touchLayout: 'default' | 'left-handed';
    /** 0.2 - 1 */
    touchOpacity: number;
    /** 0.7 - 1.5 */
    buttonScale: number;
    joystickMode: 'fixed' | 'floating';
    /** 0 - 0.5 */
    deadzone: number;
    haptics: boolean;
    autoAttackAssist: boolean;
  };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// ---- Audio ------------------------------------------------------------------------------------

export type AudioCategory = 'music' | 'ui' | 'sfx' | 'env';

export interface AudioAsset {
  url: string;
  category: AudioCategory;
  loop?: boolean;
  /** Per-asset gain 0..1 (default 1). */
  volume?: number;
  /** SFX only: concurrent voices of this id (default 4). */
  maxVoices?: number;
  /** SFX only: minimum ms between plays of this id (default 0). */
  cooldownMs?: number;
}

export type AudioManifest = Record<string, AudioAsset>;

// ---- Event bus --------------------------------------------------------------------------------

/** Minimal shape that Phaser.Events.EventEmitter already satisfies. */
export interface EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, fn: (...args: any[]) => void, context?: unknown): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, fn?: (...args: any[]) => void, context?: unknown): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, ...args: any[]): unknown;
}
