import { Screen, unavailable } from '../core/Screen';
import { h, cx, type Child } from '../core/dom';
import { btn, detailHeader, emptyState, frame, hasStats, itemSlot, statLines } from '../core/components';
import { icon } from '../core/icons';
import { run } from '../core/util';
import type { InventorySnapshot, ItemDef, ShopSnapshot } from '../contracts';

export interface ShopParams { shopId: string }
type Mode = 'buy' | 'sell';

export class ShopScreen extends Screen<ShopParams> {
  readonly id = 'shop' as const;
  private shop: ShopSnapshot | null = null;
  private inv: InventorySnapshot | null = null;
  private mode: Mode = 'buy';
  private selectedId: string | null = null;
  private busy = false;

  protected override onOpen(): void { this.mode = 'buy'; this.selectedId = null; }

  protected override async load(): Promise<void> {
    const b = this.ctx.backend;
    this.shop = b.shop && this.params?.shopId ? await b.shop.getShop(this.params.shopId) : null;
    this.inv = b.inventory ? await b.inventory.getInventory() : null;
  }

  protected override label(): string { return this.shop ? this.ctx.resolve(this.shop.name) : this.ctx.t('shop.buy'); }

  private get gold(): number { return this.inv?.gold ?? 0; }
  private get sellRate(): number { return this.shop?.sellRate ?? 0.5; }
  private sellPrice(it: ItemDef): number { return Math.floor((it.value ?? 0) * this.sellRate); }

  protected render(): Child {
    const { ctx } = this;
    if (!ctx.backend.shop || !this.shop) return frame(ctx, { title: ctx.t('shop.buy'), backIcon: 'close' }, unavailable(ctx));
    const shop = this.shop;
    const canSell = !!ctx.backend.shop.sell && !!ctx.backend.inventory;

    const entries = this.mode === 'buy'
      ? shop.stock.map((e) => ({ item: e.item, price: e.price, qty: e.stock, soldOut: e.stock !== undefined && e.stock <= 0 }))
      : (this.inv?.items ?? [])
        .filter((s) => s.item.type !== 'quest' && (s.item.value ?? 0) > 0)
        .map((s) => ({ item: s.item, price: this.sellPrice(s.item), qty: s.qty, soldOut: false }));
    const sel = entries.find((e) => e.item.id === this.selectedId) ?? null;

    return frame(ctx, { title: ctx.resolve(shop.name), gold: this.gold, backIcon: 'close' },
      h('div', { class: 'split' },
        h('section', { class: 'split__list' },
          shop.merchant ? h('div', { class: 'merchant muted small' }, icon('hero'), ctx.resolve(shop.merchant)) : null,
          canSell ? h('div', { class: 'filters', role: 'tablist' },
            (['buy', 'sell'] as Mode[]).map((m) => h('button', {
              type: 'button', role: 'tab', class: cx('filter', m === this.mode && 'is-on'), 'aria-selected': String(m === this.mode),
              onclick: () => { this.mode = m; this.selectedId = null; this.rerender(); },
            }, icon(m === 'buy' ? 'purse' : 'coin'), h('span', { class: 'filter__label filter__label--always' }, ctx.t(`shop.${m}` as 'shop.buy'))))) : null,
          h('div', { class: 'split__scroll', 'data-scroll': 'stock' },
            entries.length === 0 ? emptyState(ctx.t(this.mode === 'buy' ? 'common.empty' : 'shop.sellEmpty'), 'purse')
              : h('ul', { class: 'pick-list' }, entries.map((e) => h('li', null, h('button', {
                type: 'button', class: cx('pick pick--button', `rar-${e.item.rarity}`, e.item.id === this.selectedId && 'is-selected', e.soldOut && 'is-disabled'),
                'data-focus': `s-${e.item.id}`,
                onclick: () => { this.selectedId = e.item.id; ctx.sfx('click'); this.rerender(); },
              },
                itemSlot(ctx, { item: e.item, qty: this.mode === 'sell' ? e.qty : undefined }),
                h('div', { class: 'pick__text' },
                  h('div', { class: 'pick__name' }, ctx.resolve(e.item.name)),
                  this.mode === 'buy' && e.qty !== undefined ? h('div', { class: 'small muted' }, e.soldOut ? ctx.t('shop.soldOut') : ctx.t('shop.stock', { n: e.qty })) : null),
                h('span', { class: cx('price', this.mode === 'buy' && e.price > this.gold && 'is-unaffordable') }, icon('coin', 'ico--gold'), ctx.num(e.price)))))))),
        h('aside', { class: 'split__detail panel panel--inset', 'data-scroll': 'detail' },
          sel ? this.detail(sel.item, sel.price, sel.qty, sel.soldOut) : emptyState(ctx.t('shop.select'), 'purse'))));
  }

  private detail(it: ItemDef, price: number, qty: number | undefined, soldOut: boolean): Child {
    const { ctx } = this;
    const buying = this.mode === 'buy';
    const owned = this.inv?.items.find((s) => s.item.id === it.id)?.qty ?? 0;
    const maxAffordable = price > 0 ? Math.floor(this.gold / price) : (qty ?? 99);
    const maxBuy = Math.max(0, Math.min(qty ?? 99, maxAffordable));
    const canBuy = buying && !soldOut && maxBuy >= 1 && !this.busy;
    const canSellNow = !buying && owned >= 1 && !this.busy;
    return h('div', { class: 'detail' },
      detailHeader(ctx, it),
      it.description ? h('p', { class: 'detail__desc' }, ctx.resolve(it.description)) : null,
      hasStats(it.stats) ? statLines(ctx, it.stats) : null,
      h('div', { class: 'facts' },
        h('div', { class: 'facts__row' }, h('dt', null, ctx.t('shop.price')), h('dd', null, h('span', { class: 'inline' }, icon('coin', 'ico--gold'), ctx.num(price)))),
        buying && owned ? h('div', { class: 'facts__row' }, h('dt', null, ctx.t('shop.owned')), h('dd', null, ctx.num(owned))) : null),
      buying && !soldOut && price > this.gold ? h('p', { class: 'small text-bad' }, ctx.t('shop.notEnough')) : null,
      h('div', { class: 'detail__actions' },
        btn({
          label: ctx.t(buying ? 'shop.buy' : 'shop.sell'), icon: buying ? 'purse' : 'coin', variant: 'primary',
          disabled: buying ? !canBuy : !canSellNow, onClick: () => void this.trade(it, price, buying ? maxBuy : owned),
        })));
  }

  private async trade(it: ItemDef, price: number, max: number): Promise<void> {
    const { ctx } = this;
    const buying = this.mode === 'buy';
    if (max < 1) return;
    const qty = max === 1 ? 1 : await ctx.askQuantity({
      title: ctx.resolve(it.name), max, unitPrice: price, icon: buying ? 'purse' : 'coin',
      confirmLabel: ctx.t(buying ? 'shop.buy' : 'shop.sell'),
    });
    if (!qty) return;
    this.busy = true; this.rerender();
    const shopApi = ctx.backend.shop!;
    const ok = await run(ctx, buying ? shopApi.buy(this.shop!.id, it.id, qty) : shopApi.sell!(this.shop!.id, it.id, qty));
    this.busy = false;
    if (ok) {
      ctx.sfx('coin');
      ctx.toast({ text: ctx.t(buying ? 'shop.bought' : 'shop.sold', { name: ctx.resolve(it.name) }), kind: 'success', icon: 'coin' });
    }
    await this.refresh();
  }
}
