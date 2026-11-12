import { BatchOp, KVBackend, STORE_NAMES, StorageStats, StoreName } from './backend';

/**
 * In-memory backend. Used for unit tests and as a degraded fallback when IndexedDB is unavailable
 * (e.g. some private-browsing modes). Data does NOT survive a page reload.
 */
export class MemoryBackend implements KVBackend {
  readonly kind = 'memory' as const;
  private data = new Map<StoreName, Map<string, unknown>>();
  private counters: StorageStats = { reads: 0, writes: 0, deletes: 0, batches: 0 };
  /** Test hook: make the next write fail with this error. */
  failNextWrite: Error | null = null;

  constructor() {
    for (const s of STORE_NAMES) this.data.set(s, new Map());
  }
  private clone<T>(v: T): T {
    return v === undefined ? v : (structuredClone(v) as T);
  }
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    this.counters.reads++;
    return this.clone(this.data.get(store)!.get(key)) as T | undefined;
  }
  async put(store: StoreName, key: string, value: unknown): Promise<void> {
    this.throwIfFailing();
    this.counters.writes++;
    this.data.get(store)!.set(key, this.clone(value));
  }
  async delete(store: StoreName, key: string): Promise<void> {
    this.counters.deletes++;
    this.data.get(store)!.delete(key);
  }
  async keys(store: StoreName): Promise<string[]> {
    return [...this.data.get(store)!.keys()];
  }
  async batch(ops: BatchOp[]): Promise<void> {
    this.throwIfFailing(); // fail before touching anything => atomic
    this.counters.batches++;
    for (const op of ops) {
      if (op.type === 'put') this.data.get(op.store)!.set(op.key, this.clone(op.value));
      else this.data.get(op.store)!.delete(op.key);
    }
  }
  private throwIfFailing(): void {
    if (this.failNextWrite) {
      const e = this.failNextWrite;
      this.failNextWrite = null;
      throw e;
    }
  }
  stats(): StorageStats {
    return { ...this.counters };
  }
  close(): void {}
}
