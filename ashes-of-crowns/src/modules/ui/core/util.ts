import { h, cx } from './dom';
import { icon, REGION_ICON } from './icons';
import type { UIContext } from './context';
import type { MaybePromise, RegionId, Result, SaveSlotSummary } from '../contracts';

/** Await a backend Result; toasts failures/exceptions. Resolves true only on success. */
export async function run(ctx: UIContext, p: MaybePromise<Result>): Promise<boolean> {
  try {
    const r = await p;
    if (r && r.ok) return true;
    ctx.sfx('error');
    ctx.reportFailure(r ?? { ok: false });
    return false;
  } catch (e) {
    console.error('[ui] backend call failed', e);
    ctx.sfx('error');
    ctx.toast({ text: ctx.t('common.actionFailed'), kind: 'error' });
    return false;
  }
}

export const REGIONS: RegionId[] = [
  'ashen_village', 'whispering_forest', 'forgotten_desert', 'frozen_highlands', 'hollow_city', 'crownfall',
];

export function regionName(ctx: UIContext, id: RegionId): string {
  return ctx.t(`region.${id}` as 'region.crownfall');
}

/** Most recently written, non-empty slot (used by Continue). */
export function latestSlot(slots: SaveSlotSummary[]): SaveSlotSummary | undefined {
  return slots
    .filter((s) => !s.empty)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0) || a.slot - b.slot)[0];
}

export interface SlotCardOpts {
  slot: SaveSlotSummary;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  actions?: (HTMLElement | null)[];
  focus?: string;
}

/** One save-slot card (used by Load / Save / New Game). */
export function slotCard(ctx: UIContext, o: SlotCardOpts): HTMLElement {
  const s = o.slot;
  const body = s.empty
    ? h('div', { class: 'slot-card__empty' }, icon('plus'), h('span', null, ctx.t('save.empty')))
    : h('div', { class: 'slot-card__info' },
        h('div', { class: 'slot-card__name' }, s.playerName ?? '—'),
        h('div', { class: 'slot-card__meta' },
          s.level !== undefined ? h('span', { class: 'chip' }, icon('star'), ctx.t('common.level', { n: s.level })) : null,
          s.region ? h('span', { class: 'chip' }, icon(REGION_ICON[s.region] ?? 'map'), regionName(ctx, s.region)) : null,
          s.playTimeSec !== undefined ? h('span', { class: 'chip' }, icon('book'), ctx.i18n.duration(s.playTimeSec)) : null),
        s.savedAt ? h('div', { class: 'slot-card__date muted small' }, `${ctx.t('save.savedAt')}: ${ctx.i18n.date(s.savedAt)}`) : null);
  const main = h(o.onClick ? 'button' : 'div', {
    class: 'slot-card__main', type: o.onClick ? 'button' : undefined, 'data-focus': o.focus,
    disabled: o.onClick && o.disabled ? true : undefined,
  }, h('div', { class: 'slot-card__num' }, ctx.t('save.slot', { n: s.slot })), body) as HTMLElement;
  if (o.onClick && !o.disabled) main.addEventListener('click', o.onClick);
  return h('div', { class: cx('slot-card panel', s.empty && 'is-empty', o.selected && 'is-selected', o.disabled && 'is-disabled') },
    main, o.actions?.length ? h('div', { class: 'slot-card__actions' }, o.actions) : null);
}
