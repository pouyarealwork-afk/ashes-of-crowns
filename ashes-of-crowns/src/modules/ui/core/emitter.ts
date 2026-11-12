/** Minimal typed event emitter (no dependencies). */
export class TypedEmitter<E extends object> {
  private map = new Map<keyof E, Set<(p: never) => void>>();

  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => this.off(type, fn);
  }

  once<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }

  off<K extends keyof E>(type: K, fn: (payload: E[K]) => void): void {
    this.map.get(type)?.delete(fn as (p: never) => void);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { (fn as (p: E[K]) => void)(payload); }
      catch (err) { console.error(`[ui] listener for "${String(type)}" threw`, err); }
    }
  }

  clear(): void { this.map.clear(); }
}
