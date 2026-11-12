import type { Screen } from './Screen';
import type { OpenMode, ScreenId, UIContext } from './context';
import { h } from './dom';

type Factory = (ctx: UIContext) => Screen<any>;

/**
 * Stack-based screen navigation.
 *  - 'root'    : clears the stack, shows exactly one screen (main menu, game over, ending)
 *  - 'push'    : overlay on top; the one below stays alive (and keeps its state)
 *  - 'replace' : swap the top screen (used by the tab bar)
 *
 * Emits game:pause / game:resume when the first/last game-pausing screen
 * opens/closes during gameplay.
 */
export class ScreenManager {
  readonly layer = h('div', { class: 'screens' });
  private factories = new Map<ScreenId, Factory>();
  private instances = new Map<ScreenId, Screen<any>>();
  private stack: Screen<any>[] = [];
  private paused = false;

  constructor(private ctx: UIContext) {}

  register(id: ScreenId, f: Factory): void { this.factories.set(id, f); }

  private get(id: ScreenId): Screen<any> {
    let s = this.instances.get(id);
    if (!s) {
      const f = this.factories.get(id);
      if (!f) throw new Error(`[ui] unknown screen "${id}"`);
      s = f(this.ctx);
      this.instances.set(id, s);
    }
    return s;
  }

  get top(): Screen<any> | undefined { return this.stack[this.stack.length - 1]; }
  get depth(): number { return this.stack.length; }
  has(id: ScreenId): boolean { return this.stack.some((s) => s.id === id); }

  open(id: ScreenId, params?: unknown, mode: OpenMode = 'push'): void {
    const next = this.get(id);

    if (mode === 'root') this.clearStack(false);
    else if (mode === 'replace' && this.top && this.top !== next) this.detach(this.stack.pop()!);

    // Re-opening a screen that is already on the stack: bring it to the top, don't duplicate.
    const existing = this.stack.indexOf(next);
    if (existing >= 0) while (this.stack.length > existing + 1) this.detach(this.stack.pop()!);
    else {
      const below = this.top;
      if (below) below.el.dataset.covered = 'true';
      // A screen reopened during its exit animation must become interactive again.
      next.el.classList.remove('is-leaving');
      this.stack.push(next);
      this.layer.appendChild(next.el);
      next.el.classList.add('is-entering');
      requestAnimationFrame(() => next.el.classList.remove('is-entering'));
    }
    delete next.el.dataset.covered;
    next.open(params);
    this.ctx.events.emit('ui:screen', { id, open: true });
    this.ctx.sfx('open');
    this.syncPause(id);
  }

  /** Close the top screen if it is dismissable. */
  back(): boolean {
    const top = this.top;
    if (!top || !top.dismissable || this.stack.length === 0) return false;
    this.detach(this.stack.pop()!);
    const now = this.top;
    if (now) { delete now.el.dataset.covered; void now.refresh(); }
    this.ctx.sfx('close');
    this.syncPause(top.id);
    return true;
  }

  /** Esc / hardware-back entry point: let the top screen consume it first. */
  handleBack(): boolean {
    const top = this.top;
    if (!top) return false;
    if (top.handleBack()) return true;
    return this.back();
  }

  closeAll(): void {
    this.clearStack(true);
  }

  rerenderAll(): void {
    for (const s of this.stack) s.rerender();
  }

  destroy(): void {
    this.clearStack(false);
    this.instances.clear();
    this.layer.remove();
  }

  private clearStack(emit: boolean): void {
    const last = this.top?.id;
    while (this.stack.length) this.detach(this.stack.pop()!);
    if (emit) this.syncPause(last ?? 'pause');
  }

  private detach(s: Screen<any>): void {
    s.onClose();
    this.ctx.events.emit('ui:screen', { id: s.id, open: false });
    s.el.classList.add('is-leaving');
    s.el.dataset.covered = 'true';
    const el = s.el;
    const remove = () => { if (!this.stack.includes(s)) { el.remove(); el.classList.remove('is-leaving'); } };
    setTimeout(remove, 220);
  }

  private syncPause(reasonId: string): void {
    if (!this.ctx.isInGame()) { this.paused = false; return; }
    const shouldPause = this.stack.some((s) => s.pausesGame);
    if (shouldPause && !this.paused) { this.paused = true; this.ctx.events.emit('game:pause', { reason: reasonId }); }
    else if (!shouldPause && this.paused) { this.paused = false; this.ctx.events.emit('game:resume', {}); }
  }

  /** Called when entering/leaving gameplay so pause state is re-evaluated. */
  resetPauseTracking(): void { this.paused = false; }
}
