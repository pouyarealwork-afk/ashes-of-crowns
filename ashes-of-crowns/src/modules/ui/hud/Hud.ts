import { h, clear, cx } from '../core/dom';
import { bar, type BarHandle } from '../core/components';
import { glyph, icon } from '../core/icons';
import type { UIContext } from '../core/context';
import { HUD_SKILL_SLOTS, type HudObjective, type HudState } from '../contracts';

export const EMPTY_HUD: HudState = {
  health: 100, maxHealth: 100, mana: 0, maxMana: 0, stamina: 0, maxStamina: 0,
  xp: 0, xpToNext: 1, level: 1, gold: 0, skills: [], objectives: [], boss: null, playerName: '',
};

/**
 * In-game HUD. `update()` is cheap: bars/numbers touch the DOM only when a value changed,
 * structural parts (skills, objectives, boss) re-render only when their data changed.
 * Intended to be called every frame from the game scene.
 */
export class Hud {
  readonly el: HTMLElement;
  private state: HudState = { ...EMPTY_HUD };
  private hp!: BarHandle; private mp!: BarHandle; private sp!: BarHandle; private xp!: BarHandle;
  private boss: BarHandle | null = null;
  private levelEl!: HTMLElement; private goldEl!: HTMLElement; private nameEl!: HTMLElement;
  private skillsEl!: HTMLElement; private objEl!: HTMLElement; private bossEl!: HTMLElement;
  private sigSkills = ''; private sigObj = ''; private sigBoss = '';
  private lastLevel = 0; private lastGold = NaN;

  constructor(private ctx: UIContext, private onPause: () => void) {
    this.el = h('div', { class: 'hud', hidden: true });
    this.build();
  }

  /** Rebuild all localized static parts (called on language change). Values are preserved. */
  build(): void {
    const { ctx } = this;
    clear(this.el);
    const s = this.state;
    this.hp = bar(ctx, 'health', s.health, s.maxHealth, { label: ctx.t('vital.health') });
    this.mp = bar(ctx, 'mana', s.mana, s.maxMana, { label: ctx.t('vital.mana') });
    this.sp = bar(ctx, 'stamina', s.stamina, s.maxStamina, { label: ctx.t('vital.stamina'), text: false });
    this.xp = bar(ctx, 'xp', s.xp, s.xpToNext, { label: ctx.t('char.xp'), text: false });
    this.levelEl = h('div', { class: 'hud__level' });
    this.goldEl = h('div', { class: 'hud__gold chip chip--gold' });
    this.nameEl = h('div', { class: 'hud__name' });
    this.skillsEl = h('div', { class: 'hud__skills' });
    this.objEl = h('div', { class: 'hud__objectives' });
    this.bossEl = h('div', { class: 'hud__boss' });
    this.boss = null;
    this.sigSkills = this.sigObj = this.sigBoss = '';
    this.lastGold = NaN;

    this.el.append(
      h('div', { class: 'hud__top' },
        h('div', { class: 'hud__vitals panel' },
          h('div', { class: 'hud__id' }, this.levelEl, this.nameEl),
          h('div', { class: 'hud__bars' },
            h('div', { class: 'hud__bar-row' }, icon('heart', 'hud__ico hud__ico--hp'), this.hp.el),
            h('div', { class: 'hud__bar-row' }, icon('mana', 'hud__ico hud__ico--mp'), this.mp.el),
            h('div', { class: 'hud__bar-row hud__bar-row--thin' }, icon('stamina', 'hud__ico hud__ico--sp'), this.sp.el)),
          h('div', { class: 'hud__xp', title: ctx.t('char.xp') }, this.xp.el)),
        h('div', { class: 'hud__corner' },
          this.goldEl,
          h('button', { type: 'button', class: 'btn btn--icon btn--secondary hud__pause', 'aria-label': ctx.t('hud.pause'), onclick: () => this.onPause() }, icon('pause')))),
      this.bossEl,
      this.objEl,
      this.skillsEl);
    this.paint(true);
  }

  show(v: boolean): void { this.el.hidden = !v; }

  update(patch: Partial<HudState>): void {
    Object.assign(this.state, patch);
    this.paint(false);
  }

  get snapshot(): Readonly<HudState> { return this.state; }

  private paint(force: boolean): void {
    const { ctx } = this;
    const s = this.state;
    this.hp.set(s.health, s.maxHealth);
    this.mp.set(s.mana, s.maxMana);
    this.sp.set(s.stamina, s.maxStamina);
    this.xp.set(s.xp, s.xpToNext);

    if (force || s.level !== this.lastLevel) {
      this.levelEl.textContent = ctx.t('common.level', { n: s.level });
      this.lastLevel = s.level;
    }
    if (force) this.nameEl.textContent = ctx.resolve(s.playerName);
    if (force || s.gold !== this.lastGold) {
      clear(this.goldEl);
      this.goldEl.append(icon('coin'), h('span', { dir: 'ltr' }, ctx.num(s.gold)));
      this.goldEl.setAttribute('aria-label', `${ctx.t('common.gold')}: ${ctx.num(s.gold)}`);
      this.lastGold = s.gold;
    }

    // Active skills (fixed slots so the layout never jumps)
    const slots = Array.from({ length: HUD_SKILL_SLOTS }, (_, i) => s.skills[i] ?? null);
    const sigS = JSON.stringify(slots.map((k) => k && [k.id, k.icon, k.manaCost])) + (s.mana >= 0 ? slots.map((k) => (k?.manaCost ?? 0) <= s.mana ? 1 : 0).join('') : '');
    if (force || sigS !== this.sigSkills) {
      this.sigSkills = sigS;
      clear(this.skillsEl);
      slots.forEach((k, i) => this.skillsEl.append(h('div', {
        class: cx('hud-skill', !k && 'is-empty', k && (k.manaCost ?? 0) > s.mana && 'is-nomana'),
        title: k ? ctx.resolve(k.name) : undefined,
      }, k ? glyph(k.icon, 'wand') : null, h('span', { class: 'hud-skill__key' }, ctx.num(i + 1)))));
    }

    // Objectives
    const objs = s.objectives.slice(0, 3);
    const sigO = JSON.stringify(objs) + ctx.i18n.lang;
    if (force || sigO !== this.sigObj) {
      this.sigObj = sigO;
      clear(this.objEl);
      this.objEl.hidden = objs.length === 0;
      if (objs.length) {
        this.objEl.append(h('div', { class: 'hud__obj-head' }, icon('scroll'), ctx.t('hud.objectives')),
          ...objs.map((o) => this.objective(o)));
      }
    }

    // Boss
    const b = s.boss;
    const sigB = b ? `${ctx.resolve(b.name)}|${b.phase ?? ''}|${ctx.i18n.lang}` : '';
    if (force || sigB !== this.sigBoss) {
      this.sigBoss = sigB;
      clear(this.bossEl);
      this.boss = null;
      this.bossEl.hidden = !b;
      if (b) {
        this.boss = bar(ctx, 'boss', b.health, b.maxHealth, { text: false, label: ctx.resolve(b.name) });
        this.bossEl.append(h('div', { class: 'hud__boss-name' }, icon('skull'), ctx.resolve(b.name),
          b.phase ? h('span', { class: 'hud__boss-phase' }, ctx.num(b.phase)) : null), this.boss.el);
      }
    }
    if (b && this.boss) this.boss.set(b.health, b.maxHealth);
  }

  private objective(o: HudObjective): HTMLElement {
    const { ctx } = this;
    const count = o.target !== undefined && o.target > 1 ? ` ${ctx.num(o.current ?? 0)}/${ctx.num(o.target)}` : '';
    return h('div', { class: 'hud__obj' },
      h('div', { class: 'hud__obj-title' }, ctx.resolve(o.title)),
      o.text || count ? h('div', { class: 'hud__obj-text' }, ctx.resolve(o.text), count) : null);
  }
}
