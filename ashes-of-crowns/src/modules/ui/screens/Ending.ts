import { Screen } from '../core/Screen';
import { h, cx, type Child } from '../core/dom';
import { icon } from '../core/icons';
import { btn } from '../core/components';
import type { EndingId, Text } from '../contracts';

export interface EndingParams {
  ending: EndingId;
  /** Optional recap rows shown on the final card (kills, honor …). Hidden narrative variables should NOT be passed. */
  stats?: { label: Text; value: string | number }[];
  /** Story-specific ending beats supplied by the World module. */
  slides?: string[];
  canNewGamePlus?: boolean;
}

const ENDING_ICON: Record<EndingId, string> = {
  true_king: 'crown', tyrant: 'flame', wanderer: 'map', hidden_truth: 'eye', fallen_hero: 'skull',
};
export const ENDING_IDS: EndingId[] = ['true_king', 'tyrant', 'wanderer', 'hidden_truth', 'fallen_hero'];

/**
 * Ending cinematic: three narrative beats, then a title card with a recap.
 * `page` is instance state, so a language switch keeps the player on the same beat.
 */
export class EndingScreen extends Screen<EndingParams> {
  readonly id = 'ending' as const;
  override readonly dismissable = false;
  protected override needsData = false;
  private page = 0;
  private done = false;
  private static readonly BEATS = 3;

  protected override onOpen(): void { this.page = 0; this.done = false; }
  protected override label(): string { return this.ctx.t(`end.${this.params.ending}.title` as 'end.true_king.title'); }

  override handleBack(): boolean { this.next(); return true; }

  private next(): void {
    if (this.page < EndingScreen.BEATS) { this.page++; this.ctx.sfx('click'); this.rerender(); }
  }

  private startNewGamePlus(): void {
    if (this.done) return;
    this.ctx.events.emit('game:newGamePlus', { ending: this.params.ending });
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.ctx.events.emit('ending:finished', { ending: this.params.ending });
    if (this.ctx.autoFlow) this.ctx.exitToMenu();
  }

  protected render(): Child {
    const { ctx } = this;
    const e = this.params.ending;
    const key = (s: string) => `end.${e}.${s}` as 'end.true_king.p1';
    const final = this.page >= EndingScreen.BEATS;

    return h('div', { class: cx('ending', `ending--${e}`), onclick: (ev: Event) => { if (!final && !(ev.target as HTMLElement).closest('button')) this.next(); } },
      h('div', { class: 'ending__bg', 'aria-hidden': 'true' }),
      final
        ? h('div', { class: 'ending__card panel panel--big', 'data-scroll': 'ending' },
          icon(ENDING_ICON[e], 'ending__icon'),
          h('div', { class: 'ending__label' }, ctx.t('end.label')),
          h('h1', { class: 'ending__title' }, ctx.t(key('title'))),
          h('p', { class: 'ending__tag story-text' }, ctx.t(key('tag'))),
          this.params.stats?.length ? h('dl', { class: 'facts ending__stats' },
            h('h3', { class: 'section-title' }, ctx.t('end.stats')),
            this.params.stats.map((s) => h('div', { class: 'facts__row' },
              h('dt', null, ctx.resolve(s.label)), h('dd', null, typeof s.value === 'number' ? ctx.num(s.value) : ctx.i18n.digits(String(s.value)))))) : null,
          h('div', { class: 'ending__theend' }, ctx.t('end.theEnd')),
          h('div', { class: 'row row--center ending__actions' },
            this.params.canNewGamePlus === false ? null : btn({ label: ctx.t('end.newGamePlus'), icon: 'refresh-cw', variant: 'secondary', big: true, onClick: () => this.startNewGamePlus() }),
            btn({ label: ctx.t('end.finish'), icon: 'house', variant: 'primary', big: true, focus: 'finish', onClick: () => this.finish() })))
        : h('div', { class: 'ending__beat', dataset: { page: this.page } },
          h('p', { class: 'ending__text story-text' }, this.params.slides?.[this.page] ?? ctx.t(key(`p${this.page + 1}` as 'p1'))),
          h('div', { class: 'ending__dots', 'aria-hidden': 'true' },
            Array.from({ length: EndingScreen.BEATS }, (_, i) => h('i', { class: cx(i === this.page && 'is-on', i < this.page && 'is-past') }))),
          h('div', { class: 'dlg__hint' }, icon('next', 'flip-rtl pulse'), h('span', null, ctx.t('end.next')))));
  }
}
