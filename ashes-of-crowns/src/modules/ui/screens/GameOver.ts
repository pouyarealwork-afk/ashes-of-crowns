import { Screen } from '../core/Screen';
import { h, type Child } from '../core/dom';
import { icon } from '../core/icons';
import { btn } from '../core/components';
import type { SaveSlotSummary } from '../contracts';

export class GameOverScreen extends Screen {
  readonly id = 'gameOver' as const;
  override readonly dismissable = false;
  private hasSaves = false;

  protected override async load(): Promise<void> {
    const p = this.ctx.backend.persistence;
    const slots: SaveSlotSummary[] = p ? await p.listSlots() : [];
    this.hasSaves = slots.some((s) => !s.empty);
  }
  protected override label(): string { return this.ctx.t('over.title'); }

  protected render(): Child {
    const { ctx } = this;
    return h('div', { class: 'over' },
      h('div', { class: 'over__vignette', 'aria-hidden': 'true' }),
      h('div', { class: 'over__content' },
        icon('skull', 'over__skull'),
        h('h1', { class: 'over__title' }, ctx.t('over.title')),
        h('p', { class: 'over__sub story-text' }, ctx.t('over.subtitle')),
        h('nav', { class: 'over__buttons' },
          btn({
            label: ctx.t('over.retry'), icon: 'reset', variant: 'primary', big: true, block: true, focus: 'retry',
            onClick: () => { ctx.events.emit('game:retry', {}); if (ctx.autoFlow) ctx.enterGame(); },
          }),
          this.hasSaves ? btn({ label: ctx.t('over.load'), icon: 'load', big: true, block: true, onClick: () => ctx.open('saveSelect', { mode: 'load' }) }) : null,
          btn({
            label: ctx.t('over.menu'), icon: 'house', big: true, block: true,
            onClick: () => { ctx.events.emit('game:quitToMenu', {}); if (ctx.autoFlow) ctx.exitToMenu(); },
          }))));
  }
}
