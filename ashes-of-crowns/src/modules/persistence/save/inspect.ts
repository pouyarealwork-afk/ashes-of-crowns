import {
  Migration,
  PersistenceErrorCode,
  SAVE_SCHEMA_VERSION,
  SaveKind,
  SaveMeta,
  SaveRecord,
} from '../types';
import { checksumOf } from './checksum';
import { MAX_MISSING_SECTIONS, sanitizeGameState } from './sanitize';

export type ChecksumState = 'ok' | 'mismatch' | 'missing';

export type InspectResult =
  | { ok: true; record: SaveRecord; repairs: string[]; checksum: ChecksumState; migrated: boolean }
  | { ok: false; code: PersistenceErrorCode; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const KINDS: SaveKind[] = ['manual', 'auto', 'import'];

/**
 * Validates an untrusted save record end to end: envelope -> checksum (on the stored form) ->
 * migrations -> sanitising. Never throws.
 */
export function inspectRecord(raw: unknown, migrations: Migration[] = [], slotIdHint?: string): InspectResult {
  if (!isObj(raw) || !isObj(raw.meta) || !isObj(raw.state)) {
    return { ok: false, code: 'invalid', message: 'Save data is missing its meta/state structure' };
  }
  let meta: Record<string, unknown> = raw.meta;
  let state: Record<string, unknown> = raw.state;
  let version = meta.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, code: 'invalid', message: 'Save has no valid schema version' };
  }
  if (version > SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'newer-version',
      message: `Save was written by a newer game version (schema ${version}, this build supports ${SAVE_SCHEMA_VERSION})`,
    };
  }

  // Integrity is computed over the form that was stored, i.e. BEFORE migration.
  const stored = typeof meta.checksum === 'string' ? meta.checksum : null;
  const checksum: ChecksumState = stored === null ? 'missing' : stored === checksumOf(version, state) ? 'ok' : 'mismatch';

  let migrated = false;
  let guard = 0;
  while ((version as number) < SAVE_SCHEMA_VERSION) {
    const m = migrations.find((x) => x.from === version);
    if (!m || guard++ > 50) {
      return { ok: false, code: 'no-migration', message: `No migration path from schema ${version as number}` };
    }
    try {
      const out = m.migrate({ meta: structuredClone(meta), state: structuredClone(state) });
      meta = out.meta;
      state = out.state;
    } catch (err) {
      return { ok: false, code: 'invalid', message: `Migration from schema ${m.from} failed: ${(err as Error).message}` };
    }
    version = m.to;
    migrated = true;
  }

  const s = sanitizeGameState(state);
  if (!s || s.missingSections > MAX_MISSING_SECTIONS) {
    return { ok: false, code: 'invalid', message: 'Save state is too incomplete to trust' };
  }

  const now = Date.now();
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const outMeta: SaveMeta = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: typeof meta.gameVersion === 'string' ? meta.gameVersion : 'unknown',
    slotId: typeof meta.slotId === 'string' && meta.slotId ? meta.slotId : slotIdHint ?? 'unknown',
    kind: KINDS.includes(meta.kind as SaveKind) ? (meta.kind as SaveKind) : 'manual',
    label: typeof meta.label === 'string' ? meta.label.slice(0, 80) : '',
    createdAt: num(meta.createdAt, now),
    updatedAt: num(meta.updatedAt, now),
    playtimeMs: s.state.progress.playtimeMs,
    level: s.state.player.level,
    regionId: s.state.currentRegion,
    checksum: typeof meta.checksum === 'string' ? meta.checksum : '',
  };
  return { ok: true, record: { meta: outMeta, state: s.state }, repairs: s.repairs, checksum, migrated };
}
