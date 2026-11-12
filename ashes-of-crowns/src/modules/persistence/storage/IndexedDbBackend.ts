import { PersistenceError } from '../types';
import { BatchOp, KVBackend, STORE_NAMES, StorageStats, StoreName, toPersistenceError } from './backend';

const DB_VERSION = 1;

/** IndexedDB key/value backend. One object store per StoreName, out-of-line keys. */
export class IndexedDbBackend implements KVBackend {
  readonly kind = 'indexeddb' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private counters: StorageStats = { reads: 0, writes: 0, deletes: 0, batches: 0 };

  constructor(
    private readonly dbName = 'ashes-of-crowns',
    private readonly factory: IDBFactory | undefined = typeof indexedDB !== 'undefined' ? indexedDB : undefined,
  ) {}

  /** Opens the database. Rejects with 'storage-unavailable' if IndexedDB cannot be used. */
  open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    const factory = this.factory;
    if (!factory) return Promise.reject(new PersistenceError('storage-unavailable', 'IndexedDB is not available'));
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(this.dbName, DB_VERSION);
      } catch (err) {
        reject(new PersistenceError('storage-unavailable', 'IndexedDB open threw', err));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORE_NAMES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab upgrading the DB, or the browser closing the connection: drop our handle, reopen lazily.
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        db.onclose = () => {
          this.dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(new PersistenceError('storage-unavailable', 'IndexedDB open failed', req.error));
      req.onblocked = () => reject(new PersistenceError('storage-unavailable', 'IndexedDB open blocked by another tab'));
    });
    this.dbPromise = p;
    p.catch(() => {
      if (this.dbPromise === p) this.dbPromise = null; // allow a later retry
    });
    return p;
  }

  private async run<T>(
    stores: StoreName[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => IDBRequest | void,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(stores, mode);
      } catch (err) {
        this.dbPromise = null; // connection may have been closed by the browser
        reject(toPersistenceError(err));
        return;
      }
      let result: T;
      let req: IDBRequest | void;
      try {
        req = work(tx);
      } catch (err) {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        reject(toPersistenceError(err));
        return;
      }
      if (req) req.onsuccess = () => (result = req!.result as T);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(toPersistenceError(tx.error ?? (req as IDBRequest | undefined)?.error));
      tx.onabort = () => reject(toPersistenceError(tx.error));
    });
  }

  get<T = unknown>(store: StoreName, key: string): Promise<T | undefined> {
    this.counters.reads++;
    return this.run<T | undefined>([store], 'readonly', (tx) => tx.objectStore(store).get(key));
  }
  put(store: StoreName, key: string, value: unknown): Promise<void> {
    this.counters.writes++;
    return this.run<void>([store], 'readwrite', (tx) => tx.objectStore(store).put(value, key));
  }
  delete(store: StoreName, key: string): Promise<void> {
    this.counters.deletes++;
    return this.run<void>([store], 'readwrite', (tx) => tx.objectStore(store).delete(key));
  }
  async keys(store: StoreName): Promise<string[]> {
    const k = await this.run<IDBValidKey[]>([store], 'readonly', (tx) => tx.objectStore(store).getAllKeys());
    return k.map(String);
  }
  batch(ops: BatchOp[]): Promise<void> {
    if (ops.length === 0) return Promise.resolve();
    this.counters.batches++;
    const stores = [...new Set(ops.map((o) => o.store))];
    return this.run<void>(stores, 'readwrite', (tx) => {
      for (const op of ops) {
        const os = tx.objectStore(op.store);
        if (op.type === 'put') os.put(op.value, op.key);
        else os.delete(op.key);
      }
    });
  }
  stats(): StorageStats {
    return { ...this.counters };
  }
  close(): void {
    this.dbPromise?.then((db) => db.close()).catch(() => undefined);
    this.dbPromise = null;
  }
}
