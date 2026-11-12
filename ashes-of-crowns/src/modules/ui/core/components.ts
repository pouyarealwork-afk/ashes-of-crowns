import { h, cx, clamp, type Child } from './dom';
import { icon, itemGlyph, glyph, type IconName } from './icons';
import type { ScreenId, UIContext } from './context';
import type { ItemDef, Rarity, StatId, StatMods } from '../contracts';

/* ---------------------------------------------------------------- buttons */

export interface BtnOpts {
  label?: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  block?: boolean;
  big?: boolean;
  title?: string;
  sub?: string;
  focus?: string;
  flipIcon?: boolean;
  class?: string;
}

export function btn(o: BtnOpts): HTMLButtonElement {
  const el = h('button', {
    type: 'button',
    class: cx('btn', `btn--${o.variant ?? 'secondary'}`, o.block && 'btn--block', o.big && 'btn--big', !o.label && 'btn--icon', o.class),
    'aria-label': o.label ? undefined : o.title,
    title: o.title,
    'data-focus': o.focus,
  },
    o.icon ? icon(o.icon, o.flipIcon ? 'flip-rtl' : '') : null,
    o.label || o.sub ? h('span', { class: 'btn__text' },
      o.label ? h('span', { class: 'btn__label' }, o.label) : null,
      o.sub ? h('span', { class: 'btn__sub' }, o.sub) : null) : null) as HTMLButtonElement;
  if (o.disabled) { el.disabled = true; el.setAttribute('aria-disabled', 'true'); }
  else if (o.onClick) el.addEventListener('click', (e) => o.onClick!(e));
  return el;
}

/* ------------------------------------------------------------------- bars */

export type BarKind = 'health' | 'mana' | 'stamina' | 'xp' | 'boss';
export interface BarHandle { el: HTMLElement; set(value: number, max: number): void }

/** Resource bar with a delayed "damage trail". Updates only touch DOM when values change. */
export function bar(ctx: UIContext, kind: BarKind, value: number, max: number, opts: { text?: boolean; icon?: string; label?: string } = {}): BarHandle {
  const fill = h('div', { class: 'bar__fill' });
  const trail = h('div', { class: 'bar__trail' });
  const text = opts.text === false ? null : h('span', { class: 'bar__text' });
  const el = h('div', {
    class: `bar bar--${kind}`, role: 'progressbar', 'aria-valuemin': 0,
    'aria-label': opts.label,
  }, trail, fill, text);
  let lastV = NaN, lastM = NaN;
  const set = (v: number, m: number) => {
    if (v === lastV && m === lastM) return;
    lastV = v; lastM = m;
    const ratio = m > 0 ? clamp(v / m, 0, 1) : 0;
    fill.style.transform = `scaleX(${ratio})`;
    trail.style.transform = `scaleX(${ratio})`;
    el.setAttribute('aria-valuenow', String(Math.round(v)));
    el.setAttribute('aria-valuemax', String(Math.round(m)));
    el.classList.toggle('is-low', kind === 'health' && ratio <= 0.25);
    if (text) text.textContent = `${ctx.num(Math.ceil(v))}/${ctx.num(Math.ceil(m))}`;
  };
  set(value, max);
  return { el, set };
}

/* ------------------------------------------------------------------ rarity */

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export function rarityBadge(ctx: UIContext, r: Rarity): HTMLElement {
  return h('span', { class: `rarity rar-${r}` },
    h('span', { class: 'rarity__gem', 'aria-hidden': 'true' }),
    ctx.t(`rarity.${r}` as 'rarity.common'));
}

/* -------------------------------------------------------------- item slots */

export interface SlotOpts {
  item?: ItemDef | null;
  qty?: number;
  selected?: boolean;
  equipped?: boolean;
  onClick?: () => void;
  /** Placeholder icon for an empty slot (e.g. the equipment slot glyph). */
  emptyIcon?: string;
  label?: string;
  disabled?: boolean;
  focus?: string;
}

export function itemSlot(ctx: UIContext, o: SlotOpts): HTMLElement {
  const rar = o.item?.rarity ?? 'common';
  const name = o.item ? ctx.resolve(o.item.name) : o.label ?? '';
  const el = h(o.onClick ? 'button' : 'div', {
    class: cx('slot', o.item ? `rar-${rar} has-item` : 'is-empty', o.selected && 'is-selected', o.disabled && 'is-disabled'),
    type: o.onClick ? 'button' : undefined,
    'aria-label': name || undefined,
    'aria-pressed': o.onClick && o.item ? String(!!o.selected) : undefined,
    'data-focus': o.focus,
  },
    h('span', { class: 'slot__art' },
      o.item ? itemGlyph(o.item) : o.emptyIcon ? icon(o.emptyIcon, 'slot__ghost') : null),
    o.item && (o.qty ?? 1) > 1 ? h('span', { class: 'slot__qty' }, ctx.num(o.qty!)) : null,
    o.equipped ? h('span', { class: 'slot__tag', title: ctx.t('inv.equipped') }, icon('check')) : null,
  ) as HTMLElement;
  if (o.onClick) el.addEventListener('click', o.onClick);
  return el;
}

/* ---------------------------------------------------------------- stat list */

const STAT_ICON: Record<StatId, IconName> = {
  attack: 'sword', defense: 'shield', magic: 'wand', speed: 'speed', crit: 'crit',
  maxHealth: 'heart', maxMana: 'mana', maxStamina: 'stamina',
};
export const STAT_ORDER: StatId[] = ['attack', 'defense', 'magic', 'speed', 'crit', 'maxHealth', 'maxMana', 'maxStamina'];

/** Signed stat lines like "+5 Attack". With `base`, shows the delta against another item's stats. */
export function statLines(ctx: UIContext, mods: StatMods | undefined, base?: StatMods | null): HTMLElement {
  const rows: HTMLElement[] = [];
  for (const k of STAT_ORDER) {
    const a = mods?.[k] ?? 0;
    const b = base ? base[k] ?? 0 : 0;
    const v = base !== undefined ? a - b : a;
    if (!v) continue;
    rows.push(h('li', { class: cx('stat-line', v > 0 ? 'is-up' : 'is-down') },
      icon(STAT_ICON[k]),
      h('span', { class: 'stat-line__name' }, ctx.t(`stat.${k}` as 'stat.attack')),
      h('span', { class: 'stat-line__val', dir: 'ltr' }, `${v > 0 ? '+' : '−'}${ctx.num(Math.abs(v))}`)));
  }
  return h('ul', { class: 'stat-lines' }, rows);
}

export function hasStats(m?: StatMods): boolean { return !!m && STAT_ORDER.some((k) => !!m[k]); }

/* -------------------------------------------------------------- form controls */

export function segmented<T extends string>(
  label: string, options: { value: T; label: string }[], value: T, onChange: (v: T) => void,
): HTMLElement {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button', class: cx('segmented__opt', o.value === value && 'is-on'),
      role: 'radio', 'aria-checked': String(o.value === value),
      onclick: () => { if (o.value !== value) onChange(o.value); },
    }, o.label)));
}

export function toggle(label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'toggle__input' }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'toggle row-setting' },
    h('span', { class: 'row-setting__text' },
      h('span', { class: 'row-setting__label' }, label),
      hint ? h('span', { class: 'row-setting__hint muted small' }, hint) : null),
    input, h('span', { class: 'toggle__track', 'aria-hidden': 'true' }, h('span', { class: 'toggle__thumb' })));
}

export function rangeRow(
  label: string, value: number, min: number, max: number, step: number,
  format: (v: number) => string, onInput: (v: number) => void,
): HTMLElement {
  const out = h('output', { class: 'range-row__val' }, format(value));
  const input = h('input', { type: 'range', class: 'range', min, max, step, value, 'aria-label': label }) as HTMLInputElement;
  input.addEventListener('input', () => { const v = Number(input.value); out.textContent = format(v); onInput(v); });
  return h('div', { class: 'row-setting row-setting--range' },
    h('span', { class: 'row-setting__label' }, label), input, out);
}

export function settingRow(label: string, control: Child): HTMLElement {
  return h('div', { class: 'row-setting' }, h('span', { class: 'row-setting__label' }, label), control);
}

/* --------------------------------------------------------------- misc blocks */

export function sectionTitle(text: string, iconName?: string): HTMLElement {
  return h('h3', { class: 'section-title' }, iconName ? icon(iconName) : null, h('span', null, text));
}

export function goldChip(ctx: UIContext, gold: number): HTMLElement {
  return h('div', { class: 'chip chip--gold', 'aria-label': `${ctx.t('common.gold')}: ${ctx.num(gold)}` },
    icon('coin'), h('span', { dir: 'ltr' }, ctx.num(gold)));
}

export function emptyState(text: string, iconName = 'bag'): HTMLElement {
  return h('div', { class: 'state-box' }, icon(iconName, 'state-box__icon'), h('p', null, text));
}

export function detailHeader(ctx: UIContext, item: ItemDef | { name: string; icon?: string; rarity?: Rarity }): HTMLElement {
  const isItem = 'type' in item;
  const rar: Rarity = (item as { rarity?: Rarity }).rarity ?? 'common';
  const art = isItem ? itemGlyph(item as ItemDef) : glyph((item as { icon?: string }).icon, 'star');
  const name = isItem ? ctx.resolve((item as ItemDef).name) : (item as { name: string }).name;
  return h('div', { class: `detail-head rar-${rar}` },
    h('div', { class: 'slot has-item detail-head__art' }, h('span', { class: 'slot__art' }, art)),
    h('div', { class: 'detail-head__text' },
      h('h3', { class: 'detail-head__name' }, name),
      isItem ? h('div', { class: 'detail-head__meta' }, rarityBadge(ctx, rar),
        h('span', { class: 'muted' }, ctx.t(`type.${(item as ItemDef).type}` as 'type.weapon'))) : null));
}

/* ---------------------------------------------------------------- menu frame */

export const TAB_DEFS: { id: ScreenId; icon: IconName; key: 'tab.inventory' | 'tab.equipment' | 'tab.character' | 'tab.skills' | 'tab.quests' | 'tab.map' }[] = [
  { id: 'inventory', icon: 'bag', key: 'tab.inventory' },
  { id: 'equipment', icon: 'shield', key: 'tab.equipment' },
  { id: 'character', icon: 'hero', key: 'tab.character' },
  { id: 'skills', icon: 'wand', key: 'tab.skills' },
  { id: 'quests', icon: 'scroll', key: 'tab.quests' },
  { id: 'map', icon: 'map', key: 'tab.map' },
];

export interface FrameOpts {
  title: string;
  /** Highlight this tab; omit for non-tab screens. */
  tab?: ScreenId;
  tabs?: boolean;
  gold?: number;
  actions?: Child;
  onBack?: () => void;
  backIcon?: 'back' | 'close';
}

/** Standard screen chrome: back button, title, gold, optional tab bar. */
export function frame(ctx: UIContext, o: FrameOpts, body: Child): HTMLElement {
  const showTabs = o.tabs ?? !!o.tab;
  const root = h('div', { class: 'frame panel panel--big' },
    h('header', { class: 'frame__head' },
      btn({ icon: o.backIcon ?? 'back', flipIcon: (o.backIcon ?? 'back') === 'back', title: ctx.t('common.back'), variant: 'ghost', onClick: o.onBack ?? (() => ctx.back()), focus: 'back' }),
      h('h1', { class: 'frame__title' }, o.title),
      h('div', { class: 'frame__tools' }, o.actions, o.gold !== undefined ? goldChip(ctx, o.gold) : null)),
    showTabs ? h('nav', { class: 'tabs', 'data-scroll': 'tabs', role: 'tablist' },
      TAB_DEFS.map((t) => h('button', {
        type: 'button', role: 'tab', class: cx('tab', t.id === o.tab && 'is-active'),
        'aria-selected': String(t.id === o.tab), 'data-focus': `tab-${t.id}`,
        onclick: () => { if (t.id !== o.tab) ctx.open(t.id, undefined, 'replace'); },
      }, icon(t.icon), h('span', { class: 'tab__label' }, ctx.t(t.key))))) : null,
    h('div', { class: 'frame__body' }, body));
  // On narrow screens the tab strip scrolls; make sure the active tab is visible.
  requestAnimationFrame(() => root.querySelector<HTMLElement>('.tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  return root;
}
