import { h, clear, append, captureScroll, restoreScroll, type Child } from './dom';
import type { ScreenId, UIContext } from './context';
import { icon } from './icons';

/**
 * Base class for every full-screen view.
 *
 * Contract:
 *  - `render()` must be a pure function of (this state + this.data + current language).
 *  - Ephemeral UI state (selected tab, selected item …) lives in instance fields,
 *    NOT in the DOM. That is what lets a language switch call `rerender()` and
 *    rebuild the whole tree without losing anything.
 *  - `load()` fetches backend data (may be async); `refresh()` = load + render.
 */
export abstract class Screen<P = void> {
  abstract readonly id: ScreenId;
  /** Whether having this screen open should pause gameplay (emits game:pause/resume). */
  readonly pausesGame: boolean = true;
  /** Root screens (main menu, game over …) cannot be dismissed with back(). */
  readonly dismissable: boolean = true;
  readonly el: HTMLElement;
  protected params!: P;
  protected loaded = false;
  protected error: unknown = null;
  private seq = 0;

  constructor(protected ctx: UIContext) {
    // NOTE: `this.id` is assigned by the subclass field initialiser AFTER this constructor runs,
    // so anything id-dependent (data-screen) is set in open().
    this.el = h('section', { class: 'screen', role: 'dialog', 'aria-modal': 'true' });
  }

  /** Called by the manager each time the screen is opened. */
  open(params: P): void {
    this.params = params;
    this.loaded = false;
    this.error = null;
    this.el.dataset.screen = this.id;
    this.onOpen();
    this.rerender();   // show skeleton / cached state immediately
    void this.refresh();
  }

  /** Reload backend data, then render. Safe to call repeatedly; stale responses are dropped. */
  async refresh(): Promise<void> {
    const my = ++this.seq;
    try {
      await this.load();
      if (my !== this.seq) return;
      this.loaded = true;
      this.error = null;
    } catch (e) {
      if (my !== this.seq) return;
      console.error(`[ui] ${this.id} failed to load`, e);
      this.error = e;
    }
    this.rerender();
  }

  /** Rebuild the DOM from current state. Keeps scroll positions. Used for language/setting changes. */
  rerender(): void {
    const scroll = captureScroll(this.el);
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && this.el.contains(active) ? active.dataset.focus : undefined;
    clear(this.el);
    this.el.setAttribute('aria-label', this.label());
    let content: Child;
    if (this.error) content = this.renderError();
    else if (!this.loaded && this.needsData) content = this.renderLoading();
    else content = this.render();
    append(this.el, [content]);
    restoreScroll(this.el, scroll);
    if (focusKey) this.el.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    this.afterRender();
  }

  /** Override when the screen has no async backing data. */
  protected needsData = true;

  protected onOpen(): void { /* reset ephemeral state here if desired */ }
  onClose(): void { /* cleanup timers etc. */ }
  protected async load(): Promise<void> { /* default: nothing to fetch */ }
  protected afterRender(): void { /* e.g. measure DOM and draw connectors */ }
  protected label(): string { return this.id; }
  protected abstract render(): Child;

  /** Handle Escape / hardware-back. Return true if consumed. */
  handleBack(): boolean { return false; }

  protected renderLoading(): Child {
    return h('div', { class: 'state-box', role: 'status' },
      h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      h('p', null, this.ctx.t('common.loading')));
  }

  protected renderError(): Child {
    return h('div', { class: 'state-box state-box--error', role: 'alert' },
      icon('skull', 'state-box__icon'),
      h('p', null, this.ctx.t('common.error')),
      h('div', { class: 'row row--center' },
        h('button', { class: 'btn btn--secondary', onclick: () => { this.error = null; this.loaded = false; this.rerender(); void this.refresh(); } },
          this.ctx.t('common.retry')),
        h('button', { class: 'btn btn--ghost', onclick: () => this.ctx.back() }, this.ctx.t('common.back'))));
  }
}

/** Standard "system not connected" panel for missing backends. */
export function unavailable(ctx: UIContext, what?: string): HTMLElement {
  return h('div', { class: 'state-box', role: 'status' },
    icon('lock', 'state-box__icon'),
    h('p', null, ctx.t('common.unavailable')),
    what ? h('p', { class: 'muted small' }, what) : null);
}
