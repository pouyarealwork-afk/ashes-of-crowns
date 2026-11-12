import { PersistenceError } from '../types';

export type StoreName = 'saves' | 'backups' | 'settings' | 'meta';
export const STORE_NAMES: StoreName[] = ['saves', 'backups', 'settings', 'meta'];

export type BatchOp =
  | { type: 'put'; store: StoreName; key: string; value: unknown }
  | { type: 'delete'; store: StoreName; key: string };

export interface StorageStats {
  reads: number;
  writes: number;
  deletes: number;
  batches: number;
}

/** Async key/value storage abstraction. IndexedDB is the production implementation. */
export interface KVBackend {
  readonly kind: 'indexeddb' | 'memory';
  get<T = unknown>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
  /** Apply several operations atomically (all or nothing). */
  batch(ops: BatchOp[]): Promise<void>;
  stats(): StorageStats;
  close(): void;
}

export function toPersistenceError(err: unknown, fallback = 'Storage operation failed'): PersistenceError {
  if (err instanceof PersistenceError) return err;
  const name = (err as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') return new PersistenceError('quota', 'Device storage is full', err);
  return new PersistenceError('storage-failed', `${fallback}: ${(err as Error)?.message ?? String(err)}`, err);
}
