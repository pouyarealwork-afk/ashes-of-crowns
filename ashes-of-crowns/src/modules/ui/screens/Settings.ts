import { Screen } from '../core/Screen';
import { h, type Child } from '../core/dom';
import { icon } from '../core/icons';
import { btn, frame, rangeRow, sectionTitle, segmented, settingRow, toggle } from '../core/components';
import { LANG_META } from '../i18n';
import { toggleFullscreen } from './MainMenu';
import type { Lang, UISettings } from '../contracts';

export class SettingsScreen extends Screen {
  readonly id = 'settings' as const;
  protected override needsData = false;

  protected override label(): string { return this.ctx.t('set.heading'); }

  protected render(): Child {
    const { ctx } = this;
    const s: Readonly<UISettings> = ctx.settings;
    const pct = (v: number) => `${ctx.num(Math.round(v * 100))}%`;
    const scales = (): { value: 'small' | 'medium' | 'large'; label: string }[] => [
      { value: 'small', label: ctx.t('set.small') },
      { value: 'medium', label: ctx.t('set.medium') },
      { value: 'large', label: ctx.t('set.large') },
    ];
    const fsOk = !!document.fullscreenEnabled;

    return frame(ctx, { title: ctx.t('set.heading') },
      h('div', { class: 'settings', 'data-scroll': 'settings' },
        h('section', { class: 'settings__group panel panel--inset' },
          sectionTitle(ctx.t('set.language'), 'globe'),
          segmented<Lang>(ctx.t('set.language'),
            (Object.keys(LANG_META) as Lang[]).map((l) => ({ value: l, label: LANG_META[l].label })),
            s.lang, (lang) => ctx.updateSettings({ lang })),
          toggle(ctx.t('set.persianDigits'), s.persianDigits, (v) => ctx.updateSettings({ persianDigits: v }))),

        h('section', { class: 'settings__group panel panel--inset' },
          sectionTitle(ctx.t('set.audio'), 'volume'),
          rangeRow(ctx.t('set.master'), s.masterVolume, 0, 1, 0.05, pct, (v) => ctx.updateSettings({ masterVolume: v })),
          rangeRow(ctx.t('set.music'), s.musicVolume, 0, 1, 0.05, pct, (v) => ctx.updateSettings({ musicVolume: v })),
          rangeRow(ctx.t('set.sfx'), s.sfxVolume, 0, 1, 0.05, pct, (v) => ctx.updateSettings({ sfxVolume: v }))),

        h('section', { class: 'settings__group panel panel--inset' },
          sectionTitle(ctx.t('set.controls'), 'fist'),
          toggle(ctx.t('set.touch'), s.touchControls, (v) => ctx.updateSettings({ touchControls: v })),
          rangeRow(ctx.t('set.controlScale'), s.controlScale, 0.8, 1.4, 0.05, pct, (v) => ctx.updateSettings({ controlScale: v })),
          rangeRow(ctx.t('set.controlOpacity'), s.controlOpacity, 0.3, 1, 0.05, pct, (v) => ctx.updateSettings({ controlOpacity: v })),
          toggle(ctx.t('set.leftHanded'), s.leftHanded, (v) => ctx.updateSettings({ leftHanded: v })),
          toggle(ctx.t('set.vibration'), s.vibration, (v) => ctx.updateSettings({ vibration: v }))),

        h('section', { class: 'settings__group panel panel--inset' },
          sectionTitle(ctx.t('set.display'), 'eye'),
          settingRow(ctx.t('set.hudScale'), segmented(ctx.t('set.hudScale'), scales(), s.hudScale, (v) => ctx.updateSettings({ hudScale: v }))),
          settingRow(ctx.t('set.textScale'), segmented(ctx.t('set.textScale'), scales(), s.textScale, (v) => ctx.updateSettings({ textScale: v }))),
          toggle(ctx.t('set.reduceMotion'), s.reduceMotion, (v) => ctx.updateSettings({ reduceMotion: v })),
          fsOk
            ? settingRow(ctx.t('set.fullscreen'), btn({ icon: 'fullscreen', label: ctx.t('set.fullscreen'), onClick: () => void toggleFullscreen() }))
            : h('p', { class: 'muted small' }, icon('lock'), ' ', ctx.t('set.fullscreenUnsupported'))),

        h('div', { class: 'row row--center settings__footer' },
          btn({ icon: 'reset', label: ctx.t('set.reset'), variant: 'danger', onClick: () => void this.reset() }))));
  }

  private async reset(): Promise<void> {
    const ok = await this.ctx.confirm({
      title: this.ctx.t('set.resetTitle'), body: this.ctx.t('set.resetBody'), danger: true, icon: 'reset',
      confirmLabel: this.ctx.t('set.reset'),
    });
    if (ok) { this.ctx.resetSettings(); this.rerender(); }
  }
}
