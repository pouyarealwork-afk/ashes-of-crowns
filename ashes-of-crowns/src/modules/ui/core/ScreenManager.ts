import type { Screen } from './Screen';
import type { OpenMode, ScreenId, UIContext } from './context';
import { h } from './dom';

type Factory = (ctx: UIContext) => Screen<any>;

/**
 * Deterministic full-screen navigation.
 * root: replace the entire stack; push: cover the current screen; replace: swap the top.
 * Covered screens are both hidden and removed from the accessibility tree.
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
    let screen = this.instances.get(id);
    if (!screen) {
      const factory = this.factories.get(id);
      if (!factory) throw new Error(`[ui] unknown screen "${id}"`);
      screen = factory(this.ctx);
      this.instances.set(id, screen);
    }
    return screen;
  }

  get top(): Screen<any> | undefined { return this.stack[this.stack.length - 1]; }
  get depth(): number { return this.stack.length; }
  has(id: ScreenId): boolean { return this.stack.some(screen => screen.id === id); }

  open(id: ScreenId, params?: unknown, mode: OpenMode = 'push'): void {
    const next = this.get(id);
    if (mode === 'root') this.clearStack(false);
    else if (mode === 'replace' && this.top && this.top !== next) this.detach(this.stack.pop()!);

    const existing = this.stack.indexOf(next);
    if (existing >= 0) {
      while (this.stack.length > existing + 1) this.detach(this.stack.pop()!);
    } else {
      const below = this.top;
      if (below) this.cover(below, true);
      this.stack.push(next);
      this.layer.appendChild(next.el);
    }

    this.cover(next, false);
    next.el.classList.remove('is-leaving');
    next.el.classList.add('is-entering');
    next.open(params);
    requestAnimationFrame(() => next.el.classList.remove('is-entering'));
    this.ctx.events.emit('ui:screen', { id, open: true });
    this.ctx.sfx('open');
    this.syncPause(id);
  }

  back(): boolean {
    const top = this.top;
    if (!top || !top.dismissable) return false;
    this.detach(this.stack.pop()!);
    const previous = this.top;
    if (previous) {
      this.cover(previous, false);
      void previous.refresh();
    }
    this.ctx.sfx('close');
    this.syncPause(top.id);
    return true;
  }

  handleBack(): boolean {
    const top = this.top;
    if (!top) return false;
    return top.handleBack() || this.back();
  }

  closeAll(): void { this.clearStack(true); }
  rerenderAll(): void { for (const screen of this.stack) screen.rerender(); }

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

  private cover(screen: Screen<any>, covered: boolean): void {
    screen.el.hidden = covered;
    screen.el.toggleAttribute('inert', covered);
    screen.el.setAttribute('aria-hidden', String(covered));
    if (covered) screen.el.dataset.covered = 'true';
    else delete screen.el.dataset.covered;
  }

  private detach(screen: Screen<any>): void {
    screen.onClose();
    this.ctx.events.emit('ui:screen', { id: screen.id, open: false });
    this.cover(screen, true);
    screen.el.classList.remove('is-entering', 'is-leaving');
    screen.el.remove();
  }

  private syncPause(reasonId: string): void {
    if (!this.ctx.isInGame()) { this.paused = false; return; }
    const shouldPause = this.stack.some(screen => screen.pausesGame);
    if (shouldPause && !this.paused) {
      this.paused = true;
      this.ctx.events.emit('game:pause', { reason: reasonId });
    } else if (!shouldPause && this.paused) {
      this.paused = false;
      this.ctx.events.emit('game:resume', {});
    }
  }

  resetPauseTracking(): void { this.paused = false; }
}
