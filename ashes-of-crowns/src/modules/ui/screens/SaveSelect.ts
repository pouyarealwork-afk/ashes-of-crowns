import { Screen, unavailable } from '../core/Screen';
import { h, type Child } from '../core/dom';
import { btn, frame } from '../core/components';
import { run, slotCard } from '../core/util';
import type { SaveSlotSummary } from '../contracts';

export interface SaveSelectParams { mode: 'load' | 'save' }

export class SaveSelectScreen extends Screen<SaveSelectParams> {
  readonly id = 'saveSelect' as const;
  private slots: SaveSlotSummary[] = [];
  private busy = false;

  protected override async load(): Promise<void> {
    const p = this.ctx.backend.persistence;
    this.slots = p ? await p.listSlots() : [];
  }

  private get mode(): 'load' | 'save' { return this.params?.mode ?? 'load'; }
  protected override label(): string { return this.ctx.t(this.mode === 'save' ? 'save.headingSave' : 'save.headingLoad'); }

  protected render(): Child {
    const { ctx } = this;
    const p = ctx.backend.persistence;
    const title = ctx.t(this.mode === 'save' ? 'save.headingSave' : 'save.headingLoad');
    if (!p) return frame(ctx, { title }, unavailable(ctx, ctx.t('save.noBackend')));
    return frame(ctx, { title },
      h('div', { class: 'slots', 'data-scroll': 'slots' },
        this.slots.map((s) => slotCard(ctx, {
          slot: s,
          disabled: this.busy || (this.mode === 'load' && s.empty),
          focus: `slot-${s.slot}`,
          onClick: () => void this.activate(s),
          actions: [
            !s.empty && p.deleteSlot ? btn({
              icon: 'trash', variant: 'danger', title: ctx.t('save.delete'), disabled: this.busy,
              onClick: () => void this.remove(s),
            }) : null,
          ],
        }))));
  }

  private async activate(s: SaveSummaryLike): Promise<void> {
    const { ctx } = this;
    if (this.busy) return;
    if (this.mode === 'load') {
      ctx.sfx('confirm');
      ctx.events.emit('game:load', { slot: s.slot });
      if (ctx.autoFlow) ctx.enterGame();
      return;
    }
    if (!s.empty) {
      const ok = await ctx.confirm({
        title: ctx.t('save.overwriteTitle'), body: ctx.t('save.overwriteBody', { n: s.slot }),
        danger: true, icon: 'save', confirmLabel: ctx.t('save.save'),
      });
      if (!ok) return;
    }
    this.busy = true; this.rerender();
    const ok = await run(ctx, ctx.backend.persistence!.save(s.slot));
    this.busy = false;
    if (ok) {
      ctx.sfx('confirm');
      ctx.toast({ text: ctx.t('save.saved', { n: s.slot }), kind: 'success', icon: 'save' });
      ctx.events.emit('game:saved', { slot: s.slot });
    }
    await this.refresh();
  }

  private async remove(s: SaveSummaryLike): Promise<void> {
    const { ctx } = this;
    const ok = await ctx.confirm({
      title: ctx.t('save.deleteTitle'), body: ctx.t('save.deleteBody', { n: s.slot }),
      danger: true, icon: 'trash', confirmLabel: ctx.t('save.delete'),
    });
    if (!ok) return;
    this.busy = true; this.rerender();
    const done = await run(ctx, ctx.backend.persistence!.deleteSlot!(s.slot));
    this.busy = false;
    if (done) ctx.toast({ text: ctx.t('save.deleted'), kind: 'info', icon: 'trash' });
    await this.refresh();
  }
}

type SaveSummaryLike = SaveSlotSummary;
