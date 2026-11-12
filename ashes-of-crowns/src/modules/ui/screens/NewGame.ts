import { Screen } from '../core/Screen';
import { h, type Child } from '../core/dom';
import { icon } from '../core/icons';
import { btn, frame, sectionTitle } from '../core/components';
import { slotCard } from '../core/util';
import type { SaveSlotSummary } from '../contracts';

export class NewGameScreen extends Screen {
  readonly id = 'newGame' as const;
  override readonly pausesGame = false;
  private slots: SaveSlotSummary[] = [];
  private selected = 1;

  protected override onOpen(): void { this.selected = 0; }

  protected override async load(): Promise<void> {
    const p = this.ctx.backend.persistence;
    if (p) {
      this.slots = await p.listSlots();
    } else {
      this.slots = [{ slot: 1, empty: true }]; // no save system: a single implicit slot
    }
    if (!this.slots.some((s) => s.slot === this.selected)) {
      this.selected = (this.slots.find((s) => s.empty) ?? this.slots[0])?.slot ?? 1;
    }
  }

  protected override label(): string { return this.ctx.t('new.heading'); }

  protected render(): Child {
    const { ctx } = this;
    const sel = this.slots.find((s) => s.slot === this.selected);
    return frame(ctx, { title: ctx.t('new.heading') },
      h('div', { class: 'newgame', 'data-scroll': 'newgame' },
        h('div', { class: 'newgame__story panel panel--inset' },
          icon('crown', 'newgame__crest'),
          h('p', { class: 'story-text' }, ctx.t('new.premise'))),
        h('div', { class: 'newgame__slots' },
          sectionTitle(ctx.t('new.chooseSlot'), 'save'),
          this.slots.map((s) => slotCard(ctx, {
            slot: s, selected: s.slot === this.selected, focus: `slot-${s.slot}`,
            onClick: () => { this.selected = s.slot; this.rerender(); },
          })),
          !ctx.backend.persistence ? h('p', { class: 'muted small' }, ctx.t('save.noBackend')) : null),
        h('div', { class: 'row row--center newgame__go' },
          btn({ label: ctx.t('new.begin'), icon: 'flame', variant: 'primary', big: true, disabled: !sel, onClick: () => void this.begin() }))));
  }

  private async begin(): Promise<void> {
    const { ctx } = this;
    const sel = this.slots.find((s) => s.slot === this.selected);
    if (!sel) return;
    if (!sel.empty) {
      const ok = await ctx.confirm({
        title: ctx.t('new.overwriteTitle'), body: ctx.t('new.overwriteBody'), danger: true, icon: 'skull',
        confirmLabel: ctx.t('new.begin'),
      });
      if (!ok) return;
    }
    ctx.sfx('confirm');
    ctx.events.emit('game:new', { slot: sel.slot });
    if (ctx.autoFlow) ctx.enterGame();
  }
}
