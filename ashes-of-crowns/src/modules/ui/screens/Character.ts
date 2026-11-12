import { Screen, unavailable } from '../core/Screen';
import { h, type Child } from '../core/dom';
import { bar, frame, sectionTitle, STAT_ORDER } from '../core/components';
import { icon } from '../core/icons';
import type { PlayerSnapshot, StatId } from '../contracts';

const STAT_ICON: Record<StatId, string> = {
  attack: 'sword', defense: 'shield', magic: 'wand', speed: 'speed', crit: 'crit',
  maxHealth: 'heart', maxMana: 'mana', maxStamina: 'stamina',
};

export class CharacterScreen extends Screen {
  readonly id = 'character' as const;
  private p: PlayerSnapshot | null = null;

  protected override async load(): Promise<void> {
    const pl = this.ctx.backend.player;
    this.p = pl ? await pl.getPlayer() : null;
  }

  protected override label(): string { return this.ctx.t('tab.character'); }

  protected render(): Child {
    const { ctx } = this;
    const p = this.p;
    if (!p) return frame(ctx, { title: ctx.t('tab.character'), tab: 'character' }, unavailable(ctx));

    const stats = STAT_ORDER.filter((k) => p.stats[k] !== undefined);
    return frame(ctx, { title: ctx.t('tab.character'), tab: 'character', gold: p.gold },
      h('div', { class: 'char', 'data-scroll': 'char' },
        h('section', { class: 'char__id panel panel--inset' },
          h('div', { class: 'char__portrait' }, icon('hero')),
          h('div', { class: 'char__who' },
            h('h2', { class: 'char__name' }, ctx.resolve(p.name)),
            h('div', { class: 'char__level' }, icon('star'), ctx.t('common.level', { n: p.level })),
            h('div', { class: 'char__xp' },
              h('div', { class: 'small muted' }, ctx.t('char.xp')),
              bar(ctx, 'xp', p.xp, p.xpToNext, { label: ctx.t('char.xp') }).el))),

        h('section', { class: 'char__vitals panel panel--inset' },
          sectionTitle(ctx.t('char.vitals'), 'heart'),
          vital(ctx, 'health', p.health, p.maxHealth),
          vital(ctx, 'mana', p.mana, p.maxMana),
          vital(ctx, 'stamina', p.stamina, p.maxStamina)),

        stats.length ? h('section', { class: 'char__stats panel panel--inset' },
          sectionTitle(ctx.t('char.attributes'), 'sword'),
          h('ul', { class: 'attr-list' }, stats.map((k) => h('li', { class: 'attr' },
            icon(STAT_ICON[k]), h('span', { class: 'attr__name' }, ctx.t(`stat.${k}` as 'stat.attack')),
            h('span', { class: 'attr__val', dir: 'ltr' }, ctx.num(p.stats[k]!)))))) : null,

        p.playTimeSec !== undefined || p.extra?.length ? h('section', { class: 'char__more panel panel--inset' },
          sectionTitle(ctx.t('char.more'), 'book'),
          h('dl', { class: 'facts' },
            p.playTimeSec !== undefined ? h('div', { class: 'facts__row' }, h('dt', null, ctx.t('char.playTime')), h('dd', null, ctx.i18n.duration(p.playTimeSec))) : null,
            (p.extra ?? []).map((e) => h('div', { class: 'facts__row' },
              h('dt', null, ctx.resolve(e.label)), h('dd', null, typeof e.value === 'number' ? ctx.num(e.value) : ctx.i18n.digits(String(e.value))))))) : null));
  }
}

function vital(ctx: import('../core/context').UIContext, kind: 'health' | 'mana' | 'stamina', v: number, m: number): Child {
  const key = `vital.${kind}` as const;
  return h('div', { class: 'vital' },
    h('div', { class: 'vital__label' }, icon(kind === 'health' ? 'heart' : kind === 'mana' ? 'mana' : 'stamina'), ctx.t(key)),
    bar(ctx, kind, v, m, { label: ctx.t(key) }).el);
}
