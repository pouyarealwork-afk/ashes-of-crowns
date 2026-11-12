import { Screen } from '../core/Screen';
import { h, type Child } from '../core/dom';
import { icon } from '../core/icons';
import { btn } from '../core/components';
import { latestSlot, regionName } from '../core/util';
import { LANG_META } from '../i18n';
import type { SaveSlotSummary } from '../contracts';

export const UI_VERSION = '1.0.0';

export class MainMenuScreen extends Screen {
  readonly id = 'mainMenu' as const;
  override readonly pausesGame = false;
  override readonly dismissable = false;
  private slots: SaveSlotSummary[] = [];

  protected override async load(): Promise<void> {
    const p = this.ctx.backend.persistence;
    this.slots = p ? await p.listSlots() : [];
  }

  protected override label(): string { return this.ctx.t('menu.title'); }

  protected render(): Child {
    const { ctx } = this;
    const latest = latestSlot(this.slots);
    const hasSaves = !!latest;
    const other = ctx.i18n.lang === 'en' ? 'fa' : 'en';
    const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;

    const embers = Array.from({ length: 22 }, (_, i) => h('i', {
      class: 'ember', style: `--x:${(i * 37) % 100}%;--d:${6 + ((i * 7) % 9)}s;--s:${0.3 + ((i * 13) % 10) / 14}em;--delay:${-((i * 11) % 14)}s`,
    }));

    return h('div', { class: 'menu' },
      h('div', { class: 'menu__bg', 'aria-hidden': 'true' },
        h('div', { class: 'menu__sky' }), h('div', { class: 'menu__ridge menu__ridge--far' }),
        h('div', { class: 'menu__ridge menu__ridge--near' }), h('div', { class: 'menu__embers' }, embers)),
      h('div', { class: 'menu__content' },
        h('header', { class: 'menu__title' },
          icon('crown', 'menu__crest'),
          h('h1', { class: 'logo' }, ctx.t('menu.title')),
          h('p', { class: 'menu__subtitle' }, ctx.t('menu.subtitle'))),
        h('nav', { class: 'menu__buttons', 'aria-label': ctx.t('menu.title') },
          btn({
            label: ctx.t('menu.continue'), icon: 'play', variant: 'primary', big: true, block: true, focus: 'continue',
            disabled: !hasSaves,
            sub: hasSaves
              ? ctx.t('menu.continueHint', { name: latest!.playerName ?? '—', level: latest!.level ?? 1, region: latest!.region ? regionName(ctx, latest!.region) : '—' })
              : ctx.t('menu.noSaves'),
            onClick: () => this.continueGame(latest!.slot),
          }),
          btn({ label: ctx.t('menu.newGame'), icon: 'flame', big: true, block: true, onClick: () => ctx.open('newGame', undefined, 'push') }),
          btn({
            label: ctx.t('menu.loadGame'), icon: 'load', big: true, block: true, disabled: !hasSaves,
            onClick: () => ctx.open('saveSelect', { mode: 'load' }, 'push'),
          }),
          btn({ label: ctx.t('menu.settings'), icon: 'gear', big: true, block: true, onClick: () => ctx.open('settings') }))),
      h('div', { class: 'menu__corner menu__corner--end' },
        btn({
          icon: 'globe', label: LANG_META[other].label, variant: 'ghost', title: ctx.t('menu.language'), focus: 'lang',
          onClick: () => ctx.updateSettings({ lang: other }),
        }),
        canFullscreen ? btn({
          icon: 'fullscreen', variant: 'ghost', title: ctx.t('menu.fullscreen'),
          onClick: () => void toggleFullscreen(),
        }) : null),
      h('div', { class: 'menu__corner menu__corner--start muted small', dir: 'ltr' }, ctx.t('menu.version', { v: UI_VERSION })));
  }

  private continueGame(slot: number): void {
    this.ctx.events.emit('game:continue', { slot });
    if (this.ctx.autoFlow) this.ctx.enterGame();
  }
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) {
    console.warn('[ui] fullscreen request failed', e);
  }
}
