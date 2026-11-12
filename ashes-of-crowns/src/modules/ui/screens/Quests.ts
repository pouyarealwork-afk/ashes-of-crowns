import { Screen, unavailable } from '../core/Screen';
import { h, cx, clamp, type Child } from '../core/dom';
import { btn, emptyState, frame, itemSlot, sectionTitle } from '../core/components';
import { icon } from '../core/icons';
import { regionName, run } from '../core/util';
import type { QuestSnapshot } from '../contracts';

type Tab = 'active' | 'completed' | 'failed';
const TABS: Tab[] = ['active', 'completed', 'failed'];

export class QuestsScreen extends Screen {
  readonly id = 'quests' as const;
  private quests: QuestSnapshot[] = [];
  private tab: Tab = 'active';
  private selectedId: string | null = null;

  protected override onOpen(): void { this.selectedId = null; }

  protected override async load(): Promise<void> {
    const q = this.ctx.backend.quests;
    this.quests = q ? await q.getQuests() : [];
  }

  protected override label(): string { return this.ctx.t('tab.quests'); }

  protected render(): Child {
    const { ctx } = this;
    if (!ctx.backend.quests) return frame(ctx, { title: ctx.t('tab.quests'), tab: 'quests' }, unavailable(ctx));
    const list = this.quests.filter((q) => q.status === this.tab)
      .sort((a, b) => (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1));
    const sel = this.quests.find((q) => q.id === this.selectedId && q.status === this.tab) ?? null;

    return frame(ctx, { title: ctx.t('tab.quests'), tab: 'quests' },
      h('div', { class: 'split' },
        h('section', { class: 'split__list' },
          h('div', { class: 'filters', role: 'tablist' },
            TABS.map((t) => h('button', {
              type: 'button', role: 'tab', class: cx('filter', t === this.tab && 'is-on'), 'aria-selected': String(t === this.tab),
              onclick: () => { this.tab = t; this.selectedId = null; this.rerender(); },
            }, h('span', { class: 'filter__label filter__label--always' }, ctx.t(`quest.${t}` as 'quest.active'),
              ` (${ctx.num(this.quests.filter((q) => q.status === t).length)})`)))),
          h('div', { class: 'split__scroll', 'data-scroll': 'qlist' },
            list.length === 0 ? emptyState(ctx.t('quest.none'), 'scroll')
              : h('ul', { class: 'quest-list' }, list.map((q) => this.row(q))))),
        h('aside', { class: 'split__detail panel panel--inset', 'data-scroll': 'detail' },
          sel ? this.detail(sel) : emptyState(ctx.t('quest.select'), 'book'))));
  }

  private row(q: QuestSnapshot): Child {
    const { ctx } = this;
    const done = q.objectives.filter((o) => o.done).length;
    return h('li', null, h('button', {
      type: 'button', class: cx('quest-row', q.id === this.selectedId && 'is-selected', `quest-row--${q.kind}`), 'data-focus': `q-${q.id}`,
      onclick: () => { this.selectedId = q.id; ctx.sfx('click'); this.rerender(); },
    },
      icon(q.kind === 'main' ? 'crown' : q.kind === 'bounty' ? 'skull' : 'scroll', 'quest-row__icon'),
      h('span', { class: 'quest-row__text' },
        h('span', { class: 'quest-row__title' }, ctx.resolve(q.title)),
        h('span', { class: 'quest-row__meta muted small' }, ctx.t(`quest.${q.kind}` as 'quest.main'),
          q.region ? ` · ${regionName(ctx, q.region)}` : '',
          q.objectives.length ? ` · ${ctx.num(done)}/${ctx.num(q.objectives.length)}` : '')),
      q.tracked ? h('span', { class: 'quest-row__pin', title: ctx.t('quest.tracked') }, icon('flame')) : null));
  }

  private detail(q: QuestSnapshot): Child {
    const { ctx } = this;
    const set = ctx.backend.quests!.setTracked;
    return h('div', { class: 'detail' },
      h('div', { class: 'detail-head' },
        h('div', { class: 'detail-head__text' },
          h('h3', { class: 'detail-head__name' }, ctx.resolve(q.title)),
          h('div', { class: 'chips' },
            h('span', { class: 'chip' }, ctx.t(`quest.${q.kind}` as 'quest.main')),
            q.region ? h('span', { class: 'chip' }, icon('map'), regionName(ctx, q.region)) : null))),
      q.summary ? h('p', { class: 'detail__desc story-text' }, ctx.resolve(q.summary)) : null,
      q.objectives.length ? h('div', null, sectionTitle(ctx.t('quest.objectives'), 'check'),
        h('ul', { class: 'objectives' }, q.objectives.map((o) => h('li', { class: cx('objective', o.done && 'is-done') },
          icon(o.done ? 'check' : 'minus', 'objective__mark'),
          h('span', { class: 'objective__text' }, ctx.resolve(o.text)),
          o.target > 1 ? h('span', { class: 'objective__count', dir: 'ltr' }, `${ctx.num(Math.min(o.current, o.target))}/${ctx.num(o.target)}`) : null,
          o.target > 1 ? h('div', { class: 'objective__bar' }, h('i', { style: `width:${clamp((o.current / o.target) * 100, 0, 100)}%` })) : null)))) : null,
      q.rewards ? h('div', null, sectionTitle(ctx.t('quest.rewards'), 'gem'),
        h('div', { class: 'chips' },
          q.rewards.xp ? h('span', { class: 'chip' }, icon('star'), ctx.t('quest.xp', { n: q.rewards.xp })) : null,
          q.rewards.gold ? h('span', { class: 'chip chip--gold' }, icon('coin'), ctx.num(q.rewards.gold)) : null),
        q.rewards.items?.length ? h('div', { class: 'grid-slots grid-slots--small' }, q.rewards.items.map((s) => itemSlot(ctx, { item: s.item, qty: s.qty }))) : null) : null,
      q.status === 'active' && set ? h('div', { class: 'detail__actions' },
        btn({
          label: ctx.t(q.tracked ? 'quest.untrack' : 'quest.track'), icon: 'flame', variant: q.tracked ? 'secondary' : 'primary',
          onClick: () => void this.toggle(q),
        })) : null);
  }

  private async toggle(q: QuestSnapshot): Promise<void> {
    if (await run(this.ctx, this.ctx.backend.quests!.setTracked!(q.id, !q.tracked))) await this.refresh();
  }
}
