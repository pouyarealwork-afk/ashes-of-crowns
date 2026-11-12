import type { EquipSlot, ItemDef, ItemType, RegionId } from '../contracts';

/**
 * Original inline icon set (24×24, stroke-based, one visual style).
 * Markup below is a compile-time constant (never built from runtime data), so
 * assigning it through a <template> is safe.
 */
const P = (d: string) => `<path d="${d}"/>`;
const C = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

const ICONS = {
  sword: P('M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2'),
  shield: P('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'),
  helmet: P('M4 19v-5a8 8 0 0116 0v5h-4v-4H8v4z'),
  chest: P('M8 3L3 6l2 4 2-1v12h10V9l2 1 2-4-5-3c0 2-2 3-4 3S8 5 8 3z'),
  legs: P('M7 3h10l1 18h-4.5L12 11l-1.5 10H6z'),
  boots: P('M8 3h6v7l6 3.5V19H5v-3.5L8 14z'),
  ring: P('M12 9.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM9.5 6.5L12 3l2.5 3.5L12 9.5z'),
  amulet: P('M5 4l7 8 7-8M12 12l4 4.5-4 4.5-4-4.5z'),
  potion: P('M9 3h6M10 3v5l-4.5 9a3 3 0 002.7 4.3h7.6a3 3 0 002.7-4.3L14 8V3M7.5 14h9'),
  scroll: P('M6 3h12v15a3 3 0 01-3 3H6a3 3 0 003-3V6a3 3 0 00-3-3zM6 3a3 3 0 00-3 3v1h3M10 8h5M10 12h5'),
  map: P('M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14'),
  bag: P('M9 6V5a3 3 0 016 0v1M6 6h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2zM9 14h6v3H9z'),
  skull: P('M12 3a8 8 0 00-5 14v3h3v-2h4v2h3v-3a8 8 0 00-5-14z') + C(9.3, 11.5, 1.4) + C(14.7, 11.5, 1.4),
  heart: P('M12 20s-8-5-8-11a4.5 4.5 0 018-2.7A4.5 4.5 0 0120 9c0 6-8 11-8 11z'),
  mana: P('M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z'),
  stamina: P('M13 2L5 13h6l-1 9 8-12h-6z'),
  star: P('M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z'),
  coin: C(12, 12, 9) + C(12, 12, 5.5),
  gear: C(12, 12, 3.5) + C(12, 12, 7) + P('M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4'),
  close: P('M5 5l14 14M19 5L5 19'),
  back: P('M15 5l-7 7 7 7'),
  next: P('M9 5l7 7-7 7'),
  arrowRight: P('M5 12h14M13 6l6 6-6 6'),
  play: P('M7 4l13 8-13 8z'),
  pause: P('M8 4v16M16 4v16'),
  save: P('M5 3h11l4 4v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1zM8 3v5h7V3M8 21v-7h8v7'),
  load: P('M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z'),
  trash: P('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'),
  plus: P('M12 5v14M5 12h14'),
  minus: P('M5 12h14'),
  lock: P('M6 11h12v9H6zM8 11V8a4 4 0 018 0v3'),
  check: P('M4 12.5l5 5L20 6'),
  flame: P('M12 3c1 4 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z'),
  snow: P('M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9 4.5l3 2.5 3-2.5M9 19.5l3-2.5 3 2.5'),
  tree: P('M12 3l6 8h-3l4 6H5l4-6H6zM12 17v4'),
  sun: C(12, 12, 4) + P('M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'),
  tower: P('M6 21V9l3-2V4h2v3l1-.5 1 .5V4h2v3l3 2v12zM10 21v-5h4v5'),
  crown: P('M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 19h14'),
  house: P('M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6'),
  anvil: P('M4 8h14a3 3 0 01-3 4h-2l1 4h3v3H7v-3h3l1-4H8a4 4 0 01-4-4zM18 8h3'),
  purse: P('M9 3h6l-1 3h-4zM10 6C5 9 4 13 5 17c1 3 4 4 7 4s6-1 7-4c1-4 0-8-5-11M9 13h6'),
  book: P('M4 5a2 2 0 012-2h13v17H6a2 2 0 00-2 2zM4 5v17M9 8h6'),
  wand: P('M4 20L15 9M17 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z'),
  bow: P('M6 3c8 3 8 15 0 18M6 3v18M6 12h14M17 9l3 3-3 3'),
  speed: P('M4 12h8M2 8h8M6 16h8M15 5l6 7-6 7'),
  crit: C(12, 12, 7) + P('M12 1v6M12 17v6M1 12h6M17 12h6'),
  globe: C(12, 12, 9) + P('M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'),
  fullscreen: P('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'),
  volume: P('M4 9v6h4l5 4V5L8 9zM16 9c1.5 1.5 1.5 4.5 0 6M18.5 6.5c3 3 3 8 0 11'),
  hand: P('M9 12V5.5a1.5 1.5 0 013 0V11M12 10.5V4.5a1.5 1.5 0 013 0V11M15 11V7a1.5 1.5 0 013 0v7c0 4-2 7-6 7-3 0-4.5-1.5-6-4l-2.5-4a1.5 1.5 0 012.5-1.5L9 15'),
  jump: P('M12 20V5M6 11l6-6 6 6'),
  dodge: P('M3 8h11a3 3 0 10-3-3M3 12h15a3 3 0 11-3 3M3 16h7'),
  quest: P('M12 4v10M12 18v2'),
  hero: C(12, 8, 4) + P('M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7'),
  help: P('M9 9a3 3 0 116 0c0 2-3 2.5-3 5M12 18v.5'),
  reset: P('M20 12a8 8 0 11-3-6.2M20 4v5h-5'),
  gem: P('M12 3l7 6-7 12L5 9zM5 9h14M9 9l3 12 3-12'),
  menu: P('M4 7h16M4 12h16M4 17h16'),
  fist: P('M7 11V8a1.5 1.5 0 013 0M10 8V6.5a1.5 1.5 0 013 0V8M13 8V7a1.5 1.5 0 013 0v4M7 11H6a2 2 0 00-2 2v1c0 4 3 6 6 6h3c3 0 5-2 5-5v-4a2 2 0 00-4 0'),
  eye: P('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z') + C(12, 12, 3),
} as const;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

const cache = new Map<string, string>();
export function hasIcon(name: string): name is IconName { return name in ICONS; }

/** Build an inline SVG icon. Unknown names render the "gem" glyph rather than nothing. */
export function icon(name: string, extraClass = ''): SVGSVGElement {
  const key = hasIcon(name) ? name : 'gem';
  let markup = cache.get(key);
  if (!markup) {
    markup = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[key as IconName]}</svg>`;
    cache.set(key, markup);
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = markup;
  const svg = tpl.content.firstElementChild as SVGSVGElement;
  if (extraClass) svg.setAttribute('class', `ico ${extraClass}`);
  return svg;
}

const SLOT_ICON: Record<EquipSlot, IconName> = {
  weapon: 'sword', offhand: 'shield', head: 'helmet', chest: 'chest',
  legs: 'legs', boots: 'boots', ring: 'ring', amulet: 'amulet',
};
const TYPE_ICON: Record<ItemType, IconName> = {
  weapon: 'sword', armor: 'shield', consumable: 'potion', material: 'gem', quest: 'scroll', misc: 'bag',
};
export const REGION_ICON: Record<RegionId, IconName> = {
  ashen_village: 'house', whispering_forest: 'tree', forgotten_desert: 'sun',
  frozen_highlands: 'snow', hollow_city: 'tower', crownfall: 'crown',
};
export function slotIcon(slot: EquipSlot): IconName { return SLOT_ICON[slot]; }

const isUrl = (s: string) => /[./]/.test(s);

/**
 * Render an item/skill glyph: custom image URL, a named built-in icon, or a
 * sensible default derived from slot/type.
 */
export function glyph(spec: string | undefined, fallback: IconName | string = 'gem'): HTMLElement | SVGSVGElement {
  if (spec && isUrl(spec)) {
    const img = document.createElement('img');
    img.className = 'glyph-img';
    img.src = spec;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.addEventListener('error', () => img.replaceWith(icon(fallback as string)), { once: true });
    return img;
  }
  return icon(spec && hasIcon(spec) ? spec : (fallback as string));
}

export function itemGlyph(item: ItemDef): HTMLElement | SVGSVGElement {
  const fb = item.slot ? SLOT_ICON[item.slot] : TYPE_ICON[item.type];
  return glyph(item.icon, fb);
}
