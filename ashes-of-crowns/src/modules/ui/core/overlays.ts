import { h, clear } from './dom';
import { icon } from './icons';
import type { ConfirmOptions, QuantityOptions, ToastOptions, UIContext } from './context';

interface ModalJob { build: (close: (v: unknown) => void) => HTMLElement; resolve: (v: unknown) => void; cancelValue: unknown }

/** Toasts, banners and modal dialogs. Lives above screens, below nothing. */
export class Overlays {
  readonly layer = h('div', { class: 'overlays' });
  private toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  private banners = h('div', { class: 'banners', 'aria-live': 'polite' });
  private modals = h('div', { class: 'modal-layer' });
  private queue: ModalJob[] = [];
  private current: { job: ModalJob; el: HTMLElement } | null = null;
  private bannerQueue: { title: string; sub?: string; icon?: string }[] = [];
  private bannerBusy = false;
  private timers = new Set<number>();

  constructor(private ctx: () => UIContext) {
    this.layer.append(this.banners, this.toasts, this.modals);
  }

  /* ---------------------------------------------------------------- toasts */
  toast(o: ToastOptions): void {
    const kind = o.kind ?? 'info';
    const el = h('div', { class: `toast toast--${kind}` },
      icon(o.icon ?? (kind === 'success' ? 'check' : kind === 'error' ? 'close' : kind === 'warning' ? 'quest' : 'star'), 'toast__icon'),
      h('span', { class: 'toast__text' }, o.text));
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    const life = o.ms ?? 2800;
    const t1 = window.setTimeout(() => el.classList.add('is-leaving'), life);
    const t2 = window.setTimeout(() => { el.remove(); this.timers.delete(t1); this.timers.delete(t2); }, life + 260);
    this.timers.add(t1); this.timers.add(t2);
  }

  /* --------------------------------------------------------------- banners */
  banner(title: string, sub?: string, iconName?: string): void {
    this.bannerQueue.push({ title, sub, icon: iconName });
    this.pumpBanner();
  }
  private pumpBanner(): void {
    if (this.bannerBusy) return;
    const b = this.bannerQueue.shift();
    if (!b) return;
    this.bannerBusy = true;
    const el = h('div', { class: 'banner' },
      b.icon ? icon(b.icon, 'banner__icon') : null,
      h('div', { class: 'banner__title' }, b.title),
      b.sub ? h('div', { class: 'banner__sub' }, b.sub) : null,
      h('div', { class: 'banner__rule', 'aria-hidden': 'true' }));
    this.banners.appendChild(el);
    const t1 = window.setTimeout(() => el.classList.add('is-leaving'), 2600);
    const t2 = window.setTimeout(() => { el.remove(); this.bannerBusy = false; this.pumpBanner(); }, 3100);
    this.timers.add(t1); this.timers.add(t2);
  }

  /* ---------------------------------------------------------------- modals */
  get hasModal(): boolean { return this.current !== null; }

  /** Dismiss the current modal as "cancelled". Returns true if one was open. */
  dismissModal(): boolean {
    if (!this.current) return false;
    this.finish(this.current.job.cancelValue);
    return true;
  }

  confirm(o: ConfirmOptions): Promise<boolean> {
    const ctx = this.ctx();
    return this.enqueue<boolean>(false, (close) =>
      h('div', { class: 'modal panel', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': o.title },
        o.icon ? icon(o.icon, 'modal__icon') : null,
        h('h2', { class: 'modal__title' }, o.title),
        o.body ? h('p', { class: 'modal__body' }, o.body) : null,
        h('div', { class: 'row row--center modal__actions' },
          h('button', { class: 'btn btn--ghost', 'data-focus': 'cancel', onclick: () => close(false) }, o.cancelLabel ?? ctx.t('common.cancel')),
          h('button', { class: `btn ${o.danger ? 'btn--danger' : 'btn--primary'}`, 'data-focus': 'ok', onclick: () => close(true) },
            o.confirmLabel ?? ctx.t('common.confirm')))),
      o.danger ? 'cancel' : 'ok');
  }

  askQuantity(o: QuantityOptions): Promise<number | null> {
    const ctx = this.ctx();
    const max = Math.max(1, Math.floor(o.max));
    return this.enqueue<number | null>(null, (close) => {
      let qty = Math.min(max, Math.max(1, o.initial ?? 1));
      const qtyEl = h('output', { class: 'qty__value', 'aria-live': 'polite' });
      const totalEl = h('div', { class: 'qty__total' });
      const slider = h('input', { type: 'range', min: 1, max, step: 1, value: qty, class: 'range', 'aria-label': ctx.t('inv.qty') }) as HTMLInputElement;
      const minus = h('button', { class: 'btn btn--icon btn--secondary', 'aria-label': '−' }, icon('minus')) as HTMLButtonElement;
      const plus = h('button', { class: 'btn btn--icon btn--secondary', 'aria-label': '+' }, icon('plus')) as HTMLButtonElement;
      const sync = () => {
        qtyEl.textContent = ctx.num(qty);
        slider.value = String(qty);
        minus.disabled = qty <= 1;
        plus.disabled = qty >= max;
        clear(totalEl);
        if (o.unitPrice !== undefined) totalEl.append(icon('coin', 'ico--gold'), ` ${ctx.num(qty * o.unitPrice)}`);
      };
      minus.onclick = () => { qty = Math.max(1, qty - 1); sync(); };
      plus.onclick = () => { qty = Math.min(max, qty + 1); sync(); };
      slider.oninput = () => { qty = Number(slider.value); sync(); };
      sync();
      return h('div', { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
        o.icon ? icon(o.icon, 'modal__icon') : null,
        h('h2', { class: 'modal__title' }, o.title),
        h('div', { class: 'qty' }, minus, qtyEl, plus),
        max > 1 ? slider : null,
        o.unitPrice !== undefined ? totalEl : null,
        h('div', { class: 'row row--center modal__actions' },
          max > 1 ? h('button', { class: 'btn btn--ghost', onclick: () => { qty = max; sync(); } }, ctx.t('common.max')) : null,
          h('button', { class: 'btn btn--ghost', onclick: () => close(null) }, ctx.t('common.cancel')),
          h('button', { class: 'btn btn--primary', 'data-focus': 'ok', onclick: () => close(qty) }, o.confirmLabel)));
    }, 'ok');
  }

  private enqueue<T>(cancelValue: T, build: ModalJob['build'], focus: string): Promise<T> {
    return new Promise<T>((resolve) => {
      this.queue.push({ build, resolve: resolve as (v: unknown) => void, cancelValue });
      (this.queue[this.queue.length - 1] as ModalJob & { focus?: string }).focus = focus;
      this.pump();
    });
  }

  private pump(): void {
    if (this.current) return;
    const job = this.queue.shift() as (ModalJob & { focus?: string }) | undefined;
    if (!job) { this.modals.classList.remove('is-open'); return; }
    const dialog = job.build((v) => this.finish(v));
    const wrap = h('div', { class: 'modal-wrap' },
      h('div', { class: 'modal-backdrop', onclick: () => this.dismissModal() }), dialog);
    this.modals.appendChild(wrap);
    this.modals.classList.add('is-open');
    this.current = { job, el: wrap };
    this.ctx().sfx('open');
    (wrap.querySelector<HTMLElement>(`[data-focus="${job.focus ?? 'ok'}"]`) ?? wrap.querySelector<HTMLElement>('button'))
      ?.focus({ preventScroll: true });
  }

  private finish(value: unknown): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    cur.el.classList.add('is-leaving');
    window.setTimeout(() => cur.el.remove(), 180);
    cur.job.resolve(value);
    this.pump();
  }

  destroy(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    while (this.current) this.dismissModal();
    this.queue.splice(0).forEach((j) => j.resolve(j.cancelValue));
    this.layer.remove();
  }
}
