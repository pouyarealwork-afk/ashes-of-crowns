/** Minimal event bus. Optionally mirrors every event to an external emitter (e.g. Phaser's EventEmitter). */
export type Listener = (payload: any) => void;
export interface ExternalEmitter {
  emit(event: string, ...args: any[]): unknown;
  on(event: string, fn: (...args: any[]) => void, ctx?: unknown): unknown;
  off?(event: string, fn?: (...args: any[]) => void, ctx?: unknown): unknown;
}
export class EventBus {
  private map = new Map<string, Set<Listener>>();
  constructor(private forward?: ExternalEmitter) {}
  on(event: string, fn: Listener): () => void {
    if (!this.map.has(event)) this.map.set(event, new Set());
    this.map.get(event)!.add(fn);
    return () => this.off(event, fn);
  }
  off(event: string, fn: Listener): void { this.map.get(event)?.delete(fn); }
  emit(event: string, payload?: unknown): void {
    this.map.get(event)?.forEach(fn => { try { fn(payload); } catch (e) { console.error('[world] listener error', event, e); } });
    this.map.get('*')?.forEach(fn => { try { fn({ event, payload }); } catch (e) { console.error(e); } });
    this.forward?.emit(event, payload);
  }
  setForward(f?: ExternalEmitter): void { this.forward = f; }
}
