import { Screen, unavailable } from '../core/Screen';
import { h, cx, type Child } from '../core/dom';
import { btn, detailHeader, frame, hasStats, itemSlot, sectionTitle, statLines } from '../core/components';
import { icon, slotIcon } from '../core/icons';
import { run } from '../core/util';
import type { EquipSlot, InventorySnapshot, ItemDef, StatMods } from '../contracts';

const LEFT: EquipSlot[] = ['head', 'chest', 'weapon', 'legs'];
const RIGHT: EquipSlot[] = ['amulet', 'ring', 'offhand', 'boots'];

export class EquipmentScreen extends Screen {
  readonly id = 'equipment' as const;
  private data: InventorySnapshot | null = null;
  private playerLevel: number | null = null;
  private slot: EquipSlot = 'weapon';

  protected override async load(): Promise<void> {
    const b = this.ctx.backend;
    if (!b.inventory) { this.data = null; return; }
    this.data = await b.inventory.getInventory();
    try { this.playerLevel = b.player ? (await b.player.getPlayer()).level : null; } catch { this.playerLevel = null; }
  }

  protected override label(): string { return this.ctx.t('tab.equipment'); }

  protected render(): Child {
    const { ctx } = this;
    if (!ctx.backend.inventory || !this.data) {
      return frame(ctx, { title: ctx.t('tab.equipment'), tab: 'equipment' }, unavailable(ctx));
    }
    const d = this.data;
    const cell = (s: EquipSlot) => h('div', { class: 'doll__cell' },
      itemSlot(ctx, {
        item: d.equipped[s] ?? null, emptyIcon: slotIcon(s), selected: s === this.slot, label: ctx.t(`eq.slot.${s}` as 'eq.slot.head'),
        focus: `slot-${s}`, onClick: () => { this.slot = s; ctx.sfx('click'); this.rerender(); },
      }),
      h('span', { class: 'doll__label' }, ctx.t(`eq.slot.${s}` as 'eq.slot.head')));

    return frame(ctx, { title: ctx.t('tab.equipment'), tab: 'equipment', gold: d.gold },
      h('div', { class: 'split' },
        h('section', { class: 'split__list' },
          h('div', { class: 'doll', 'data-scroll': 'doll' },
            h('div', { class: 'doll__col' }, LEFT.map(cell)),
            h('div', { class: 'doll__hero', 'aria-hidden': 'true' }, icon('hero')),
            h('div', { class: 'doll__col' }, RIGHT.map(cell))),
          this.totals(d)),
        h('aside', { class: 'split__detail panel panel--inset', 'data-scroll': 'detail' }, this.slotPanel(d))));
  }

  private totals(d: InventorySnapshot): Child {
    const sum: StatMods = {};
    for (const it of Object.values(d.equipped)) {
      for (const [k, v] of Object.entries(it?.stats ?? {})) sum[k as keyof StatMods] = (sum[k as keyof StatMods] ?? 0) + (v ?? 0);
    }
    return hasStats(sum)
      ? h('div', { class: 'equip-totals' }, sectionTitle(this.ctx.t('eq.bonuses'), 'star'), statLines(this.ctx, sum))
      : null;
  }

  private slotPanel(d: InventorySnapshot): Child {
    const { ctx } = this;
    const inv = ctx.backend.inventory!;
    const current = d.equipped[this.slot];
    const candidates = d.items.filter((s) => s.item.slot === this.slot);
    const slotName = ctx.t(`eq.slot.${this.slot}` as 'eq.slot.head');

    return h('div', { class: 'detail' },
      current
        ? [
          detailHeader(ctx, current),
          current.description ? h('p', { class: 'detail__desc' }, ctx.resolve(current.description)) : null,
          hasStats(current.stats) ? statLines(ctx, current.stats) : null,
          inv.unequip ? h('div', { class: 'detail__actions' },
            btn({ label: ctx.t('inv.unequip'), icon: 'close', variant: 'secondary', onClick: () => void this.unequip(current) })) : null,
        ]
        : h('div', { class: 'detail__emptyslot' }, icon(slotIcon(this.slot), 'state-box__icon'),
          h('h3', null, slotName), h('p', { class: 'muted' }, ctx.t('eq.empty'))),
      sectionTitle(ctx.t('eq.pick', { slot: slotName }), 'bag'),
      candidates.length === 0
        ? h('p', { class: 'muted' }, ctx.t('eq.noItems'))
        : h('ul', { class: 'pick-list' }, candidates.map((s) => this.candidateRow(s.item, current))));
  }

  private candidateRow(it: ItemDef, current?: ItemDef): Child {
    const { ctx } = this;
    const tooLow = it.levelReq !== undefined && this.playerLevel !== null && this.playerLevel < it.levelReq;
    return h('li', { class: cx('pick', `rar-${it.rarity}`) },
      itemSlot(ctx, { item: it }),
      h('div', { class: 'pick__text' },
        h('div', { class: 'pick__name' }, ctx.resolve(it.name)),
        hasStats(it.stats) ? statLines(ctx, it.stats, current ? current.stats ?? {} : undefined) : null,
        tooLow ? h('div', { class: 'small text-bad' }, ctx.t('common.levelReq', { n: it.levelReq! })) : null),
      ctx.backend.inventory!.equip ? btn({
        label: ctx.t('inv.equip'), variant: 'primary', disabled: tooLow, onClick: () => void this.equip(it),
      }) : null);
  }

  private async equip(it: ItemDef): Promise<void> {
    const { ctx } = this;
    if (await run(ctx, ctx.backend.inventory!.equip!(it.id, this.slot))) {
      ctx.sfx('equip');
      ctx.toast({ text: ctx.t('inv.equippedMsg', { name: ctx.resolve(it.name) }), kind: 'success', icon: 'shield' });
      await this.refresh();
    }
  }

  private async unequip(it: ItemDef): Promise<void> {
    const { ctx } = this;
    if (await run(ctx, ctx.backend.inventory!.unequip!(this.slot))) {
      ctx.toast({ text: ctx.t('inv.unequippedMsg', { name: ctx.resolve(it.name) }), kind: 'info', icon: 'shield' });
      await this.refresh();
    }
  }
}
