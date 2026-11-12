import { Screen, unavailable } from '../core/Screen';
import { h, cx, type Child } from '../core/dom';
import { btn, emptyState, frame, itemSlot, sectionTitle } from '../core/components';
import { icon } from '../core/icons';
import { run } from '../core/util';
import type { InventorySnapshot, Recipe } from '../contracts';

export class CraftingScreen extends Screen {
  readonly id = 'crafting' as const;
  private recipes: Recipe[] = [];
  private inv: InventorySnapshot | null = null;
  private selectedId: string | null = null;
  private busy = false;

  protected override onOpen(): void { this.selectedId = null; }

  protected override async load(): Promise<void> {
    const b = this.ctx.backend;
    this.recipes = b.crafting ? await b.crafting.getRecipes() : [];
    // Ingredient availability is derived from the inventory provider; without it we cannot claim anything is craftable.
    this.inv = b.inventory ? await b.inventory.getInventory() : null;
  }

  protected override label(): string { return this.ctx.t('craft.heading'); }

  private have(itemId: string): number {
    return this.inv?.items.find((s) => s.item.id === itemId)?.qty ?? 0;
  }
  private craftable(r: Recipe): boolean {
    return r.known && !!this.inv && r.ingredients.every((i) => this.have(i.item.id) >= i.qty);
  }

  protected render(): Child {
    const { ctx } = this;
    if (!ctx.backend.crafting) return frame(ctx, { title: ctx.t('craft.heading') }, unavailable(ctx));
    const sel = this.recipes.find((r) => r.id === this.selectedId) ?? null;
    return frame(ctx, { title: ctx.t('craft.heading'), gold: this.inv?.gold, backIcon: 'close' },
      h('div', { class: 'split' },
        h('section', { class: 'split__list' },
          h('div', { class: 'split__scroll', 'data-scroll': 'recipes' },
            this.recipes.length === 0 ? emptyState(ctx.t('craft.none'), 'anvil')
              : h('ul', { class: 'pick-list' }, this.recipes.map((r) => this.row(r))))),
        h('aside', { class: 'split__detail panel panel--inset', 'data-scroll': 'detail' },
          sel ? this.detail(sel) : emptyState(ctx.t('craft.select'), 'anvil'))));
  }

  private row(r: Recipe): Child {
    const { ctx } = this;
    const ok = this.craftable(r);
    return h('li', null, h('button', {
      type: 'button', class: cx('pick pick--button', r.known ? `rar-${r.result.item.rarity}` : 'is-unknown', r.id === this.selectedId && 'is-selected', ok && 'is-ready'),
      'data-focus': `r-${r.id}`,
      onclick: () => { this.selectedId = r.id; ctx.sfx('click'); this.rerender(); },
    },
      r.known ? itemSlot(ctx, { item: r.result.item, qty: r.result.qty }) : h('div', { class: 'slot is-empty' }, h('span', { class: 'slot__art' }, icon('lock', 'slot__ghost'))),
      h('div', { class: 'pick__text' },
        h('div', { class: 'pick__name' }, r.known ? ctx.resolve(r.result.item.name) : ctx.t('craft.unknown')),
        r.station && r.known ? h('div', { class: 'small muted' }, ctx.t('craft.station', { s: ctx.resolve(r.station) })) : null),
      ok ? icon('check', 'pick__ready') : null));
  }

  private detail(r: Recipe): Child {
    const { ctx } = this;
    if (!r.known) {
      return h('div', { class: 'detail__emptyslot' }, icon('lock', 'state-box__icon'),
        h('h3', null, ctx.t('craft.unknown')), h('p', { class: 'muted' }, ctx.t('craft.unknownHint')));
    }
    const ok = this.craftable(r);
    return h('div', { class: 'detail' },
      sectionTitle(ctx.t('craft.result'), 'anvil'),
      h('div', { class: cx('pick', `rar-${r.result.item.rarity}`) },
        itemSlot(ctx, { item: r.result.item, qty: r.result.qty }),
        h('div', { class: 'pick__text' }, h('div', { class: 'pick__name' }, ctx.resolve(r.result.item.name)),
          r.result.item.description ? h('div', { class: 'small muted' }, ctx.resolve(r.result.item.description)) : null)),
      sectionTitle(ctx.t('craft.requires'), 'bag'),
      h('ul', { class: 'ingredients' }, r.ingredients.map((i) => {
        const have = this.have(i.item.id);
        const met = have >= i.qty;
        return h('li', { class: cx('ingredient', met ? 'is-met' : 'is-unmet') },
          itemSlot(ctx, { item: i.item }),
          h('span', { class: 'ingredient__name' }, ctx.resolve(i.item.name)),
          h('span', { class: 'ingredient__count', dir: 'ltr' }, `${ctx.num(have)}/${ctx.num(i.qty)}`));
      })),
      r.station ? h('p', { class: 'small muted' }, ctx.t('craft.station', { s: ctx.resolve(r.station) })) : null,
      !ok ? h('p', { class: 'small text-bad' }, ctx.t('craft.missing')) : null,
      h('div', { class: 'detail__actions' },
        btn({ label: ctx.t('craft.craft'), icon: 'anvil', variant: 'primary', disabled: !ok || this.busy, onClick: () => void this.craft(r) })));
  }

  private async craft(r: Recipe): Promise<void> {
    const { ctx } = this;
    this.busy = true;
    const ok = await run(ctx, ctx.backend.crafting!.craft(r.id));
    this.busy = false;
    if (ok) {
      ctx.sfx('equip');
      ctx.toast({ text: ctx.t('craft.done', { name: ctx.resolve(r.result.item.name) }), kind: 'success', icon: 'anvil' });
    }
    await this.refresh();
  }
}
