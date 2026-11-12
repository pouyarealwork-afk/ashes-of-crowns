import { KVBackend, toPersistenceError } from '../storage/backend';
import { PersistenceEvents, SimpleEmitter } from '../events';
import {
  DEFAULT_MANUAL_SLOTS,
  AUTO_SLOT,
  EXPORT_FORMAT_VERSION,
  EventBus,
  ExportEnvelope,
  GameState,
  GameStateInput,
  GameStateProvider,
  LoadResult,
  Migration,
  PersistenceError,
  SAVE_FORMAT_ID,
  SAVE_SCHEMA_VERSION,
  SaveKind,
  SaveMeta,
  SaveRecord,
  SlotId,
  SlotSummary,
} from '../types';
import { checksumOf, hash53, stableStringify } from './checksum';
import { inspectRecord } from './inspect';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface SaveManagerOptions {
  gameVersion: string;
  bus?: EventBus;
  migrations?: Migration[];
  manualSlots?: readonly string[];
  now?: () => number;
}

export interface SaveOptions {
  label?: string;
  kind?: SaveKind;
  /** Skip the write if the state is identical to the last state saved to this slot in this session. */
  skipIfUnchanged?: boolean;
}

/**
 * Multi-slot save manager on top of a KVBackend.
 *  - every write is serialised through a queue (no interleaved writes, no lost updates)
 *  - the previous valid save of a slot is kept as a backup in the SAME atomic batch
 *  - loads validate, migrate, repair and fall back to the backup when the primary is unusable
 */
export class SaveManager {
  readonly slots: string[];
  private provider: GameStateProvider | null = null;
  private checkpointSource: (() => GameState['checkpoints']) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private lastHash = new Map<string, string>();
  private readonly bus: EventBus;
  private readonly migrations: Migration[];
  private readonly now: () => number;
  private readonly gameVersion: string;

  constructor(private readonly backend: KVBackend, opts: SaveManagerOptions) {
    this.bus = opts.bus ?? new SimpleEmitter();
    this.migrations = opts.migrations ?? [];
    this.slots = [...(opts.manualSlots ?? DEFAULT_MANUAL_SLOTS)];
    this.now = opts.now ?? Date.now;
    this.gameVersion = opts.gameVersion;
  }

  setStateProvider(fn: GameStateProvider | null): void {
    this.provider = fn;
  }
  /** Checkpoint state is owned by CheckpointManager and merged into every save. */
  setCheckpointSource(fn: (() => GameState['checkpoints']) | null): void {
    this.checkpointSource = fn;
  }

  isValidSlot(slotId: SlotId): boolean {
    return slotId === AUTO_SLOT || this.slots.includes(slotId);
  }
  private assertSlot(slotId: SlotId): void {
    if (!this.isValidSlot(slotId)) throw new PersistenceError('bad-slot', `Unknown save slot "${slotId}"`);
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ---- saving --------------------------------------------------------------------------------

  /** Collects state from the registered provider and saves it. */
  async save(slotId: SlotId, opts: SaveOptions = {}): Promise<SaveMeta | null> {
    if (!this.provider) throw new PersistenceError('no-state-provider', 'No game state provider registered');
    const input = this.provider();
    if (!input) throw new PersistenceError('nothing-to-save', 'Game state provider returned nothing');
    return this.saveState(slotId, input, opts);
  }

  /** Saves an explicit state. Returns the new meta, or null when skipped because nothing changed. */
  async saveState(slotId: SlotId, input: GameStateInput, opts: SaveOptions = {}): Promise<SaveMeta | null> {
    this.assertSlot(slotId);
    const kind: SaveKind = opts.kind ?? (slotId === AUTO_SLOT ? 'auto' : 'manual');
    // Snapshot synchronously so later mutation of live objects cannot affect what is written.
    const state = structuredClone({
      ...input,
      checkpoints: this.checkpointSource ? this.checkpointSource() : input.checkpoints ?? { lastStoneId: null, stones: {} },
    }) as GameState;

    return this.enqueue(async () => {
      try {
        const stateHash = hash53(stableStringify(state));
        if (opts.skipIfUnchanged && this.lastHash.get(slotId) === stateHash) return null;

        const existingRaw = await this.backend.get('saves', slotId);
        const existing = existingRaw === undefined ? null : inspectRecord(existingRaw, this.migrations, slotId);
        const t = this.now();
        const meta: SaveMeta = {
          schemaVersion: SAVE_SCHEMA_VERSION,
          gameVersion: this.gameVersion,
          slotId,
          kind,
          label: (opts.label ?? '').slice(0, 80),
          createdAt: existing?.ok ? existing.record.meta.createdAt : t,
          updatedAt: t,
          playtimeMs: state.progress.playtimeMs,
          level: state.player.level,
          regionId: state.currentRegion,
          checksum: checksumOf(SAVE_SCHEMA_VERSION, state),
        };
        const record: SaveRecord = { meta, state };
        const ops: Parameters<KVBackend['batch']>[0] = [];
        // Only a save that is itself readable becomes the backup, so a corrupt primary never clobbers a good backup.
        if (existing?.ok && existingRaw !== undefined) ops.push({ type: 'put', store: 'backups', key: slotId, value: existingRaw });
        ops.push({ type: 'put', store: 'saves', key: slotId, value: record });
        if (kind !== 'import') ops.push({ type: 'put', store: 'meta', key: 'lastSlot', value: slotId });
        await this.backend.batch(ops);
        this.lastHash.set(slotId, stateHash);
        this.bus.emit(PersistenceEvents.SAVED, { slotId, kind, meta });
        return meta;
      } catch (err) {
        const e = toPersistenceError(err, 'Saving failed');
        this.bus.emit(PersistenceEvents.SAVE_FAILED, { slotId, kind, code: e.code, message: e.message });
        throw e;
      }
    });
  }

  // ---- loading -------------------------------------------------------------------------------

  async load(slotId: SlotId): Promise<LoadResult> {
    if (!this.isValidSlot(slotId)) return { ok: false, code: 'bad-slot', message: `Unknown save slot "${slotId}"` };
    return this.enqueue(async () => {
      const result = await this.loadInner(slotId);
      if (!result.ok) this.bus.emit(PersistenceEvents.LOAD_FAILED, { slotId, code: result.code, message: result.message });
      return result;
    });
  }

  private async loadInner(slotId: SlotId): Promise<LoadResult> {
    let primaryRaw: unknown;
    let backupRaw: unknown;
    try {
      primaryRaw = await this.backend.get('saves', slotId);
      backupRaw = await this.backend.get('backups', slotId);
    } catch (err) {
      const e = toPersistenceError(err, 'Reading save failed');
      return { ok: false, code: e.code, message: e.message };
    }
    if (primaryRaw === undefined && backupRaw === undefined) return { ok: false, code: 'empty-slot', message: 'Slot is empty' };

    const primary = primaryRaw === undefined ? null : inspectRecord(primaryRaw, this.migrations, slotId);
    const backup = backupRaw === undefined ? null : inspectRecord(backupRaw, this.migrations, slotId);
    const warnings: string[] = [];

    // 1. healthy primary
    if (primary?.ok && primary.checksum === 'ok') {
      if (primary.repairs.length) warnings.push(...primary.repairs);
      return { ok: true, record: primary.record, status: primary.repairs.length ? 'repaired' : 'ok', warnings };
    }
    // A save from a newer build must never be "rescued" by silently rolling back to an old backup.
    if (primary && !primary.ok && primary.code === 'newer-version') return { ok: false, code: primary.code, message: primary.message };

    // 2. primary unusable or checksum-suspect -> prefer a verified backup
    if (backup?.ok && backup.checksum === 'ok') {
      warnings.push(primary ? (primary.ok ? 'Primary save failed integrity check' : `Primary save unusable: ${primary.message}`) : 'Primary save missing');
      warnings.push('Restored from backup (the most recent save before the latest was used)');
      this.healPrimary(slotId, backupRaw);
      return { ok: true, record: backup.record, status: 'restored-backup', warnings };
    }
    // 3. primary readable but unverifiable (checksum mismatch / missing): accept with a warning
    if (primary?.ok) {
      warnings.push(primary.checksum === 'mismatch' ? 'Integrity checksum mismatch; data may be damaged' : 'Save has no integrity checksum');
      warnings.push(...primary.repairs);
      return { ok: true, record: primary.record, status: primary.checksum === 'ok' ? 'repaired' : 'checksum-mismatch', warnings };
    }
    // 4. last resort: unverifiable backup
    if (backup?.ok) {
      warnings.push(primary ? `Primary save unusable: ${primary.message}` : 'Primary save missing', 'Restored from unverified backup', ...backup.repairs);
      this.healPrimary(slotId, backupRaw);
      return { ok: true, record: backup.record, status: 'restored-backup', warnings };
    }
    const why = primary && !primary.ok ? primary : backup && !backup.ok ? backup : null;
    return { ok: false, code: why?.code ?? 'invalid', message: why?.message ?? 'Save data is corrupt' };
  }

  /** Best-effort: put the backup back as the primary so the next load is clean. Runs inside the queue turn. */
  private healPrimary(slotId: SlotId, raw: unknown): void {
    this.backend.put('saves', slotId, raw).catch(() => undefined);
  }

  // ---- slots ---------------------------------------------------------------------------------

  async listSlots(): Promise<SlotSummary[]> {
    const ids = [...this.slots, AUTO_SLOT];
    const out: SlotSummary[] = [];
    for (const slotId of ids) {
      const r = await this.load(slotId);
      if (r.ok) out.push({ slotId, state: r.status === 'ok' ? 'ok' : 'recovered', meta: r.record.meta, message: r.warnings[0] });
      else if (r.code === 'empty-slot') out.push({ slotId, state: 'empty' });
      else out.push({ slotId, state: 'corrupt', message: r.message });
    }
    return out;
  }

  async getLastSlot(): Promise<SlotId | null> {
    try {
      const v = await this.backend.get<string>('meta', 'lastSlot');
      return typeof v === 'string' && this.isValidSlot(v) ? v : null;
    } catch {
      return null;
    }
  }

  async deleteSlot(slotId: SlotId): Promise<void> {
    this.assertSlot(slotId);
    await this.enqueue(async () => {
      try {
        await this.backend.batch([
          { type: 'delete', store: 'saves', key: slotId },
          { type: 'delete', store: 'backups', key: slotId },
        ]);
        this.lastHash.delete(slotId);
        this.bus.emit(PersistenceEvents.SLOT_DELETED, { slotId });
      } catch (err) {
        throw toPersistenceError(err, 'Deleting save failed');
      }
    });
  }

  // ---- export / import -----------------------------------------------------------------------

  /** Serialises a slot to a JSON string suitable for a file. Corrupt slots cannot be exported. */
  async exportSlot(slotId: SlotId): Promise<{ json: string; filename: string }> {
    const r = await this.load(slotId);
    if (!r.ok) throw new PersistenceError(r.code, r.message);
    const record: SaveRecord = {
      meta: { ...r.record.meta, checksum: checksumOf(SAVE_SCHEMA_VERSION, r.record.state) },
      state: r.record.state,
    };
    const env: ExportEnvelope = { format: SAVE_FORMAT_ID, exportVersion: EXPORT_FORMAT_VERSION, exportedAt: this.now(), save: record };
    const stamp = new Date(this.now()).toISOString().replace(/[:T]/g, '-').slice(0, 19);
    return { json: JSON.stringify(env), filename: `ashes-of-crowns-${slotId}-${stamp}.json` };
  }

  /**
   * Imports an exported save into `targetSlot`. Rejects invalid, oversized, newer-version, and (unless `force`)
   * checksum-mismatched data. Refuses to overwrite an occupied slot unless `overwrite` is set.
   */
  async importSlot(json: string, targetSlot: SlotId, opts: { overwrite?: boolean; force?: boolean } = {}): Promise<SaveMeta> {
    this.assertSlot(targetSlot);
    if (typeof json !== 'string' || json.length === 0) throw new PersistenceError('invalid', 'Import file is empty');
    if (json.length > MAX_IMPORT_BYTES) throw new PersistenceError('too-large', 'Import file is too large');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new PersistenceError('invalid', 'Import file is not valid JSON');
    }
    const env = parsed as Partial<ExportEnvelope> | null;
    if (!env || typeof env !== 'object' || env.format !== SAVE_FORMAT_ID) {
      throw new PersistenceError('invalid', 'File is not an Ashes of Crowns save export');
    }
    if (typeof env.exportVersion !== 'number' || env.exportVersion > EXPORT_FORMAT_VERSION) {
      throw new PersistenceError('newer-version', 'Export file format is newer than this game supports');
    }
    const ins = inspectRecord(env.save, this.migrations, targetSlot);
    if (!ins.ok) throw new PersistenceError(ins.code, ins.message);
    if (ins.checksum !== 'ok' && !opts.force) {
      throw new PersistenceError('checksum-mismatch', 'Save failed its integrity check (file edited or damaged). Import with force to accept it anyway.');
    }
    if (!opts.overwrite) {
      const occupied = (await this.backend.get('saves', targetSlot)) !== undefined;
      if (occupied) throw new PersistenceError('slot-occupied', `Slot "${targetSlot}" already contains a save`);
    }
    const { checkpoints, ...rest } = ins.record.state;
    // Write the imported state verbatim (checkpoints included) rather than the live checkpoint source.
    const saved = await this.withCheckpointSourceOverride(checkpoints, () =>
      this.saveState(targetSlot, { ...rest, checkpoints }, { kind: 'import', label: ins.record.meta.label }),
    );
    this.bus.emit(PersistenceEvents.IMPORTED, { slotId: targetSlot, meta: saved });
    return saved as SaveMeta;
  }

  private withCheckpointSourceOverride<T>(cp: GameState['checkpoints'], fn: () => Promise<T>): Promise<T> {
    const prev = this.checkpointSource;
    this.checkpointSource = () => cp;
    // saveState snapshots checkpoints synchronously before its first await, so restoring right after the call is safe.
    const p = fn();
    this.checkpointSource = prev;
    return p;
  }

  stats() {
    return this.backend.stats();
  }
}
