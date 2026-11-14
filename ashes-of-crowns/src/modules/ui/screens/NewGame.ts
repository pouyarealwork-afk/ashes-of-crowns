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
  private selectedClass: 'warrior' | 'assassin' | 'mage' | 'warden' | 'oracle' | 'bard' = 'warrior';

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
        h('div', { class: 'newgame__classes panel panel--inset' },
          sectionTitle(ctx.settings.lang === 'fa' ? 'کلاس قهرمان را انتخاب کن' : 'Choose your class', 'swords'),
          h('div', { class: 'row row--center', style: 'gap:10px;flex-wrap:wrap' },
            ...([
              { id: 'warrior' as const, fa: 'جنگجو', en: 'Warrior', descFa: 'سلامت و دفاع بیشتر؛ ضربهٔ قدرتی و فریاد نبرد', descEn: 'More health and defense; built for direct combat', icon: 'shield' },
              { id: 'assassin' as const, fa: 'قاتل', en: 'Assassin', descFa: 'سرعت و ضربهٔ بحرانی بیشتر؛ خنجر از پشت و گام سایه', descEn: 'Faster movement and stronger strikes', icon: 'swords' },
              { id: 'mage' as const, fa: 'جادوگر', en: 'Mage', descFa: 'مانای بیشتر و جادوی اسرارآمیز', descEn: 'More mana and arcane magic', icon: 'sparkles' },
              { id: 'warden' as const, fa: 'طبیعت‌بان', en: 'Warden', descFa: 'جادوی طبیعت، محافظت و بازیابی تدریجی', descEn: 'Nature magic, protection and restoration', icon: 'leaf' },
              { id: 'oracle' as const, fa: 'پیشگو', en: 'Oracle', descFa: 'پیش‌بینی خطر، چابکی و جابه‌جایی لحظه‌ای', descEn: 'Foresight, agility and short spatial shifts', icon: 'eye' },
              { id: 'bard' as const, fa: 'نغمه‌پرداز', en: 'Bard', descFa: 'آهنگ‌های پشتیبان برای بازیابی و تقویت توانایی‌ها', descEn: 'Supportive melodies for recovery and resilience', icon: 'music' },
            ]).map(c => btn({
              label: ctx.settings.lang === 'fa' ? c.fa : c.en,
              icon: c.icon,
              variant: this.selectedClass === c.id ? 'primary' : 'secondary',
              onClick: () => { this.selectedClass = c.id; this.rerender(); },
            }))),
          h('p', { class: 'muted small' }, (() => {
            const c = {
              warrior: ['سلامت و دفاع بیشتر؛ مهارت‌های جنگی', 'More health and defense; frontline resilience'],
              assassin: ['چابکی و گریز؛ مهارت‌های سایه', 'Agility, evasion and shadow arts'],
              mage: ['مانای بیشتر و جادوی اسرارآمیز', 'More mana and arcane magic'],
              warden: ['جادوی طبیعت، محافظت و بازیابی تدریجی', 'Nature magic, protection and restoration'],
              oracle: ['پیش‌بینی خطر، چابکی و جابه‌جایی لحظه‌ای', 'Foresight, agility and short spatial shifts'],
              bard: ['آهنگ‌های پشتیبان برای بازیابی و تقویت توانایی‌ها', 'Supportive melodies for recovery and resilience'],
            }[this.selectedClass];
            return c[ctx.settings.lang === 'fa' ? 0 : 1];
          })())),
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
    ctx.events.emit('game:new', { slot: sel.slot, classId: this.selectedClass });
    if (ctx.autoFlow) ctx.enterGame();
  }
}
