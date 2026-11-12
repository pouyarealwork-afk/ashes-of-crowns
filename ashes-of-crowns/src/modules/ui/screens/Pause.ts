import { Screen } from '../core/Screen';
import { h, type Child } from '../core/dom';
import { icon } from '../core/icons';
import { btn } from '../core/components';

export class PauseScreen extends Screen {
  readonly id = 'pause' as const;
  protected override needsData = false;

  protected override label(): string { return this.ctx.t('pause.title'); }

  protected render(): Child {
    const { ctx } = this;
    return h('div', { class: 'pause' },
      h('div', { class: 'pause__panel panel panel--big' },
        h('div', { class: 'pause__head' }, icon('crown', 'pause__crest'), h('h1', { class: 'pause__title' }, ctx.t('pause.title'))),
        h('nav', { class: 'pause__buttons' },
          btn({ label: ctx.t('pause.resume'), icon: 'play', variant: 'primary', big: true, block: true, focus: 'resume', onClick: () => ctx.back() }),
          btn({ label: ctx.t('tab.inventory'), icon: 'bag', big: true, block: true, onClick: () => ctx.open('inventory') }),
          btn({ label: ctx.t('pause.saveGame'), icon: 'save', big: true, block: true, onClick: () => ctx.open('saveSelect', { mode: 'save' }) }),
          btn({ label: ctx.t('save.headingLoad'), icon: 'load', big: true, block: true, onClick: () => ctx.open('saveSelect', { mode: 'load' }) }),
          btn({ label: ctx.t('menu.settings'), icon: 'gear', big: true, block: true, onClick: () => ctx.open('settings') }),
          btn({ label: ctx.t('pause.quit'), icon: 'close', variant: 'danger', big: true, block: true, onClick: () => void this.quit() }))));
  }

  private async quit(): Promise<void> {
    const { ctx } = this;
    const ok = await ctx.confirm({
      title: ctx.t('pause.quitTitle'), body: ctx.t('pause.quitBody'), danger: true, icon: 'close', confirmLabel: ctx.t('pause.quit'),
    });
    if (!ok) return;
    ctx.events.emit('game:quitToMenu', {});
    if (ctx.autoFlow) ctx.exitToMenu();
  }
}
