/** Tiny hyperscript helper. No framework, no innerHTML with dynamic data (XSS-safe by construction). */

export type Child = Node | string | number | false | null | undefined | Child[];
export interface Attrs {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string | number | undefined>;
  [k: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'dataset') {
        for (const [dk, dv] of Object.entries(v as Record<string, unknown>)) {
          if (dv !== undefined) el.dataset[dk] = String(dv);
        }
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

/** Create an element in the SVG namespace (plain `h('svg')` would create an inert HTML element). */
export function svgEl(tag: string, attrs?: Record<string, string | number | undefined>, ...children: Child[]): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (typeof c === 'string' || typeof c === 'number') parent.appendChild(document.createTextNode(String(c)));
    else parent.appendChild(c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Capture `[data-scroll]` positions so a re-render (e.g. language switch) can restore them. */
export function captureScroll(root: Element): Map<string, number> {
  const m = new Map<string, number>();
  root.querySelectorAll<HTMLElement>('[data-scroll]').forEach((el) => {
    m.set(el.dataset.scroll!, el.scrollTop || 0);
    m.set(el.dataset.scroll! + ':x', el.scrollLeft || 0);
  });
  return m;
}
export function restoreScroll(root: Element, m: Map<string, number>): void {
  root.querySelectorAll<HTMLElement>('[data-scroll]').forEach((el) => {
    const y = m.get(el.dataset.scroll!);
    const x = m.get(el.dataset.scroll! + ':x');
    if (y !== undefined) el.scrollTop = y;
    if (x !== undefined) el.scrollLeft = x;
  });
}
