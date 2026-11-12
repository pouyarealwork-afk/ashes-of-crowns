import { Screen, unavailable } from '../core/Screen';
import { h, cx, type Child } from '../core/dom';
import { btn, detailHeader, emptyState, frame, hasStats, itemSlot, sectionTitle, statLines } from '../core/components';
import { icon } from '../core/icons';
import { run } from '../core/util';
import type { InventorySnapshot, ItemStack, ItemType } from '../contracts';

type Filter = 'all' | 'weapon' | 'armor' | 'consumable' | 'material' | 'quest';
const FILTERS: Filter[] = ['all', 'weapon', 'armor', 'consumable', 'material', 'quest'];
const FILTER_ICON: Record<Filter, string> = {
  all: 'bag', weapon: 'sword', armor: 'shield', consumable: 'potion', material: 'gem', quest: 'scroll',
};

export class InventoryScreen extends Screen {
  readonly id = 'inventory' as const;
  private data: InventorySnapshot | null = null;
  private playerLevel: number | null = null;
  private filter: Filter = 'all';
  private selectedId: string | null = null;

  protected override onOpen(): void { this.selectedId = null; }

  protected override async load(): Promise<void> {
    const b = this.ctx.backend;
    if (!b.inventory) { this.data = null; return; }
    this.data = await b.inventory.getInventory();
    try { this.playerLevel = b.player ? (await b.player.getPlayer()).level : null; } catch { this.playerLevel = null; }
    if (this.selectedId && !this.data.items.some((s) => s.item.id === this.selectedId)) this.selectedId = null;
  }

  protected override label(): string { return this.ctx.t('tab.inventory'); }

  private visible(): ItemStack[] {
    const items = this.data?.items ?? [];
    return this.filter === 'all' ? items : items.filter((s) => (s.item.type as ItemType) === this.filter);
  }

  protected render(): Child {
    const { ctx } = this;
    if (!ctx.backend.inventory || !this.data) {
      return frame(ctx, { title: ctx.t('tab.inventory'), tab: 'inventory' }, unavailable(ctx));
    }
    const d = this.data;
    const items = this.visible();
    const sel = d.items.find((s) => s.item.id === this.selectedId) ?? null;

    const emptyCells = this.filter === 'all' ? Math.max(0, d.capacity - items.length) : 0;
    const grid = items.length === 0 && this.filter !== 'all'
      ? emptyState(ctx.t('common.empty'), FILTER_ICON[this.filter])
      : h('div', { class: 'grid-slots' },
        items.map((s) => itemSlot(ctx, {
          item: s.item, qty: s.qty, selected: s.item.id === this.selectedId, focus: `item-${s.item.id}`,
          onClick: () => { this.selectedId = s.item.id === this.selectedId ? null : s.item.id; ctx.sfx('click'); this.rerender(); },
        })),
        Array.from({ length: emptyCells }, () => itemSlot(ctx, {})));

    return frame(ctx, { title: ctx.t('tab.inventory'), tab: 'inventory', gold: d.gold },
      h('div', { class: 'split' },
        h('section', { class: 'split__list' },
          h('div', { class: 'filters', 'data-scroll': 'filters', role: 'tablist' },
            FILTERS.map((f) => h('button', {
              type: 'button', role: 'tab', 'aria-selected': String(f === this.filter),
              class: cx('filter', f === this.filter && 'is-on'), title: ctx.t(`inv.filter.${f}` as 'inv.filter.all'),
              onclick: () => { this.filter = f; this.rerender(); },
            }, icon(FILTER_ICON[f]), h('span', { class: 'filter__label' }, ctx.t(`inv.filter.${f}` as 'inv.filter.all')))),
            h('span', { class: 'filters__cap muted small' }, ctx.t('inv.capacity', { used: d.items.length, cap: d.capacity }))),
          h('div', { class: 'split__scroll', 'data-scroll': 'grid' },
            d.items.length === 0 ? emptyState(ctx.t('inv.empty')) : grid)),
        h('aside', { class: 'split__detail panel panel--inset', 'data-scroll': 'detail' },
          sel ? this.detail(sel) : emptyState(ctx.t('inv.select'), 'hand'))));
  }

  private detail(stack: ItemStack): Child {
    const { ctx } = this;
    const it = stack.item;
    const inv = ctx.backend.inventory!;
    const equippedInSlot = it.slot ? this.data!.equipped[it.slot] : undefined;
    const tooLow = it.levelReq !== undefined && this.playerLevel !== null && this.playerLevel < it.levelReq;
    const canEquip = !!it.slot && !!inv.equip;

    return h('div', { class: 'detail' },
      detailHeader(ctx, it),
      it.description ? h('p', { class: 'detail__desc' }, ctx.resolve(it.description)) : null,
      hasStats(it.stats) ? h('div', null,
        sectionTitle(ctx.t(equippedInSlot ? 'inv.vsEquipped' : 'eq.bonuses')),
        statLines(ctx, it.stats, equippedInSlot ? equippedInSlot.stats ?? {} : undefined),
        equippedInSlot && !hasDelta(it.stats, equippedInSlot.stats) ? h('p', { class: 'muted small' }, ctx.t('inv.noChange')) : null) : null,
      h('dl', { class: 'facts' },
        it.value !== undefined ? fact(ctx.t('inv.value'), h('span', { class: 'inline' }, icon('coin', 'ico--gold'), ctx.num(it.value))) : null,
        stack.qty > 1 ? fact(ctx.t('inv.qty'), ctx.num(stack.qty)) : null),
      it.levelReq !== undefined ? h('p', { class: cx('small', tooLow ? 'text-bad' : 'muted') }, ctx.t('common.levelReq', { n: it.levelReq })) : null,
      h('div', { class: 'detail__actions' },
        canEquip ? btn({
          label: ctx.t('inv.equip'), icon: 'shield', variant: 'primary', disabled: tooLow,
          onClick: () => void this.equip(stack),
        }) : null,
        it.type === 'consumable' && inv.use ? btn({
          label: ctx.t('inv.use'), icon: 'potion', variant: 'primary', onClick: () => void this.use(stack),
        }) : null,
        inv.drop && it.type !== 'quest' ? btn({
          label: ctx.t('inv.drop'), icon: 'trash', variant: 'danger', onClick: () => void this.drop(stack),
        }) : null));
  }

  private async equip(s: ItemStack): Promise<void> {
    const { ctx } = this;
    if (!s.item.slot) return;
    if (await run(ctx, ctx.backend.inventory!.equip!(s.item.id, s.item.slot))) {
      ctx.sfx('equip');
      ctx.toast({ text: ctx.t('inv.equippedMsg', { name: ctx.resolve(s.item.name) }), kind: 'success', icon: 'shield' });
      await this.refresh();
    }
  }

  private async use(s: ItemStack): Promise<void> {
    const { ctx } = this;
    if (await run(ctx, ctx.backend.inventory!.use!(s.item.id))) {
      ctx.toast({ text: ctx.t('inv.used', { name: ctx.resolve(s.item.name) }), kind: 'success', icon: 'potion' });
      await this.refresh();
    }
  }

  private async drop(s: ItemStack): Promise<void> {
    const { ctx } = this;
    const name = ctx.resolve(s.item.name);
    let qty: number | null = 1;
    if (s.qty > 1) {
      qty = await ctx.askQuantity({ title: ctx.t('inv.dropTitle'), max: s.qty, confirmLabel: ctx.t('inv.drop'), icon: 'trash' });
    } else {
      const ok = await ctx.confirm({
        title: ctx.t('inv.dropTitle'), body: ctx.t('inv.dropBody', { name, n: 1 }), danger: true, icon: 'trash', confirmLabel: ctx.t('inv.drop'),
      });
      qty = ok ? 1 : null;
    }
    if (qty === null) return;
    if (await run(ctx, ctx.backend.inventory!.drop!(s.item.id, qty))) {
      ctx.toast({ text: ctx.t('inv.dropped', { name }), kind: 'info', icon: 'trash' });
      await this.refresh();
    }
  }
}

function fact(k: string, v: Child): Child {
  if (!k) return null;
  return h('div', { class: 'facts__row' }, h('dt', null, k), h('dd', null, v));
}
function hasDelta(a?: Record<string, number | undefined>, b?: Record<string, number | undefined>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) if ((a?.[k] ?? 0) !== (b?.[k] ?? 0)) return true;
  return false;
}
