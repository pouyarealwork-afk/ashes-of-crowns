import { h, clamp } from '../core/dom';
import { glyph, icon } from '../core/icons';
import type { UIContext } from '../core/context';
import type { HudSkill, InputAction } from '../contracts';

const DEADZONE = 0.18;

/**
 * On-screen controls: virtual joystick + action buttons.
 *  - Pointer Events with per-pointer capture → true multi-touch (move + attack + jump simultaneously).
 *  - Emits `input:axis` / `input:action`; the player module listens. Nothing is "pressed" by the UI itself.
 *  - `releaseAll()` guarantees no stuck input when a menu opens or the page loses focus.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private stick!: HTMLElement;
  private knob!: HTMLElement;
  private stickPointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private radius = 56;
  private axis = { x: 0, y: 0 };
  private held = new Map<number, InputAction>();
  private btnEls = new Map<InputAction, HTMLElement>();
  private cleanup: (() => void)[] = [];

  constructor(private ctx: UIContext) {
    this.el = h('div', { class: 'touch', hidden: true });
    this.build();
    const blur = () => this.releaseAll();
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', blur);
    this.cleanup.push(() => { window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', blur); });
  }

  build(): void {
    const { ctx } = this;
    this.releaseAll();
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    this.btnEls.clear();

    this.knob = h('div', { class: 'stick__knob' });
    this.stick = h('div', { class: 'stick', role: 'application', 'aria-label': ctx.t('touch.move') },
      h('div', { class: 'stick__ring' }), this.knob);
    this.bindStick(this.stick);

    const key = (a: InputAction, cls: string, ico: string, label: string, txt?: string) => {
      const b = h('div', { class: `abtn ${cls}`, role: 'button', 'aria-label': label, tabindex: -1 },
        icon(ico), txt ? h('span', { class: 'abtn__txt' }, txt) : null);
      this.bindButton(b, a);
      this.btnEls.set(a, b);
      return b;
    };

    this.el.append(
      h('div', { class: 'touch__left' }, this.stick),
      h('div', { class: 'touch__right' },
        h('div', { class: 'touch__skills' },
          key('skill1', 'abtn--skill', 'wand', ctx.t('touch.skill', { n: 1 }), ctx.num(1)),
          key('skill2', 'abtn--skill', 'flame', ctx.t('touch.skill', { n: 2 }), ctx.num(2)),
          key('skill3', 'abtn--skill', 'star', ctx.t('touch.skill', { n: 3 }), ctx.num(3))),
        h('div', { class: 'touch__extras' },
          key('heavy', 'abtn--heavy', 'sword', ctx.t('touch.heavy')),
          key('block', 'abtn--block', 'shield', ctx.t('touch.block'))),
        h('div', { class: 'touch__cluster' },
          key('attack', 'abtn--attack', 'sword', ctx.t('touch.attack')),
          key('jump', 'abtn--jump', 'jump', ctx.t('touch.jump')),
          key('dodge', 'abtn--dodge', 'dodge', ctx.t('touch.dodge')),
          key('interact', 'abtn--interact', 'hand', ctx.t('touch.interact')))));
  }

  show(v: boolean): void {
    this.el.hidden = !v;
    if (!v) this.releaseAll();
  }

  /** Show the real equipped skills on the three skill buttons; dims empty slots and skills lacking mana. */
  setSkills(skills: (HudSkill | null)[], mana: number): void {
    const fallback = ['wand', 'flame', 'star'];
    (['skill1', 'skill2', 'skill3'] as InputAction[]).forEach((a, i) => {
      const el = this.btnEls.get(a);
      if (!el) return;
      const s = skills[i] ?? null;
      const sig = s ? `${s.id}|${s.icon ?? ''}` : '-';
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.querySelector('.ico, .glyph-img')?.remove();
        el.prepend(glyph(s?.icon, fallback[i]));
        el.setAttribute('aria-label', s?.name ? this.ctx.resolve(s.name) : this.ctx.t('touch.skill', { n: i + 1 }));
      }
      el.classList.toggle('is-empty', !s);
      el.classList.toggle('is-nomana', !!s && (s.manaCost ?? 0) > mana);
    });
  }

  /** Release every active input. Call when pausing, opening a menu, or losing focus. */
  releaseAll(): void {
    if (this.stickPointer !== null) this.resetStick();
    for (const [, action] of this.held) {
      this.btnEls.get(action)?.classList.remove('is-down');
      this.ctx.events.emit('input:action', { action, pressed: false });
    }
    this.held.clear();
  }

  destroy(): void { this.releaseAll(); this.cleanup.forEach((f) => f()); this.el.remove(); }

  /* ----------------------------------------------------------------- stick */
  private bindStick(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      if (this.stickPointer !== null) return;
      e.preventDefault();
      this.stickPointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      // Floating origin = the stick's centre; the knob follows the finger relative to it.
      this.origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.radius = Math.max(32, r.width / 2 - 8);
      el.classList.add('is-active');
      this.moveStick(e);
      this.ctx.haptic(8);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickPointer) { e.preventDefault(); this.moveStick(e); } });
    const end = (e: PointerEvent) => { if (e.pointerId === this.stickPointer) this.resetStick(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private moveStick(e: PointerEvent): void {
    let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) { dx = (dx / len) * this.radius; dy = (dy / len) * this.radius; }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    let x = dx / this.radius, y = dy / this.radius;
    if (Math.hypot(x, y) < DEADZONE) { x = 0; y = 0; }
    x = Math.round(clamp(x, -1, 1) * 100) / 100;
    y = Math.round(clamp(y, -1, 1) * 100) / 100;
    this.emitAxis(x, y);
  }

  private resetStick(): void {
    this.stickPointer = null;
    this.stick.classList.remove('is-active');
    this.knob.style.transform = 'translate(0,0)';
    this.emitAxis(0, 0);
  }

  private emitAxis(x: number, y: number): void {
    if (x === this.axis.x && y === this.axis.y) return;
    this.axis = { x, y };
    this.ctx.events.emit('input:axis', { x, y });
  }

  /* --------------------------------------------------------------- buttons */
  private bindButton(el: HTMLElement, action: InputAction): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.held.set(e.pointerId, action);
      el.classList.add('is-down');
      this.ctx.haptic(10);
      this.ctx.events.emit('input:action', { action, pressed: true });
    });
    const up = (e: PointerEvent) => {
      if (this.held.get(e.pointerId) !== action) return;
      this.held.delete(e.pointerId);
      // another finger may still be on the same button
      if (![...this.held.values()].includes(action)) el.classList.remove('is-down');
      this.ctx.events.emit('input:action', { action, pressed: false });
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
