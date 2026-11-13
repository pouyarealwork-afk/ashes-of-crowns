/**
 * Pixel-art toolkit (pure Canvas2D / typed arrays, no Phaser dependency).
 *
 * Everything in the game's new art pipeline is drawn into a `Px` buffer with hard, un-antialiased
 * pixels and then passed through the same finishing passes (selective outline + edge lighting),
 * which is what gives characters, enemies, tiles and props one coherent look.
 */

export type RGB = [number, number, number];

export function hex(s: string): RGB {
  const v = s.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const COOL: RGB = [34, 24, 58];
const WARM: RGB = [255, 233, 190];

/** Hue-shifted shading: shadows slide toward cool violet, highlights toward warm cream. */
export function shade(c: RGB, amt: number): RGB {
  return amt < 0 ? mix(c, COOL, Math.min(1, -amt)) : mix(c, WARM, Math.min(1, amt));
}

/** Five-step ramp: [deep shadow, shadow, base, light, highlight]. */
export function ramp(base: RGB | string): [RGB, RGB, RGB, RGB, RGB] {
  const b = typeof base === 'string' ? hex(base) : base;
  return [shade(b, -0.62), shade(b, -0.32), b, shade(b, 0.22), shade(b, 0.5)];
}

export const OUTLINE: RGB = [20, 14, 22];

export type Canvasish = HTMLCanvasElement;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Deterministic PRNG so every texture is identical between runs and devices. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class Px {
  readonly d: Uint8ClampedArray;
  /** Material id per pixel (0 = none). Used by lighting passes to find part boundaries. */
  readonly tag: Uint8Array;

  constructor(readonly w: number, readonly h: number) {
    this.d = new Uint8ClampedArray(w * h * 4);
    this.tag = new Uint8Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  alphaAt(x: number, y: number): number {
    return this.inside(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0;
  }

  tagAt(x: number, y: number): number {
    return this.inside(x, y) ? this.tag[y * this.w + x] : 0;
  }

  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }

  /** Opaque write. */
  set(x: number, y: number, c: RGB, tag = 0): void {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
    this.tag[y * this.w + x] = tag;
  }

  /** Source-over write with alpha 0..1 (keeps the existing tag). */
  blend(x: number, y: number, c: RGB, a: number): void {
    x |= 0; y |= 0;
    if (a <= 0 || !this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    const da = this.d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    this.d[i] = (c[0] * a + this.d[i] * da * (1 - a)) / oa;
    this.d[i + 1] = (c[1] * a + this.d[i + 1] * da * (1 - a)) / oa;
    this.d[i + 2] = (c[2] * a + this.d[i + 2] * da * (1 - a)) / oa;
    this.d[i + 3] = oa * 255;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, tag = 0): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, tag);
  }

  hline(x: number, y: number, w: number, c: RGB, tag = 0): void {
    for (let i = 0; i < w; i++) this.set(x + i, y, c, tag);
  }

  vline(x: number, y: number, h: number, c: RGB, tag = 0): void {
    for (let j = 0; j < h; j++) this.set(x, y + j, c, tag);
  }

  disc(cx: number, cy: number, r: number, c: RGB, tag = 0): void {
    const r2 = r * r + 0.25;
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) this.set(x, y, c, tag);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, tag = 0): void {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, c, tag);
    }
  }

  /** Thick line made of stamped square/round brushes (crisp, no antialiasing). */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1, tag = 0): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (thick <= 1) this.set(Math.round(x), Math.round(y), c, tag);
      else this.disc(x, y, thick / 2, c, tag);
    }
  }

  /** Scan-line polygon fill (even-odd). Points are [x, y] pairs. */
  poly(pts: Array<[number, number]>, c: RGB, tag = 0): void {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + ((yy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, c, tag);
    }
  }

  /** Vertical gradient quantised through an ordered (Bayer) dither: the classic pixel-art sky. */
  ditherV(x: number, y: number, w: number, h: number, top: RGB, bottom: RGB, steps = 6): void {
    for (let j = 0; j < h; j++) {
      const t = h <= 1 ? 0 : j / (h - 1);
      const f = t * (steps - 1);
      const lo = Math.floor(f), frac = f - lo;
      for (let i = 0; i < w; i++) {
        const thr = (BAYER4[((y + j) & 3) * 4 + ((x + i) & 3)] + 0.5) / 16;
        const k = Math.min(steps - 1, lo + (frac > thr ? 1 : 0));
        this.set(x + i, y + j, mix(top, bottom, k / (steps - 1)));
      }
    }
  }

  /** Stipple an area with `c` at density 0..1 using the Bayer matrix. */
  stipple(x: number, y: number, w: number, h: number, c: RGB, density: number, tag = 0): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if ((BAYER4[((y + j) & 3) * 4 + ((x + i) & 3)] + 0.5) / 16 < density && this.alphaAt(x + i, y + j) > 0) this.set(x + i, y + j, c, this.tagAt(x + i, y + j) || tag);
    }
  }

  blit(src: Px, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.d[i + 3] === 0) continue;
      if (src.d[i + 3] === 255) this.set(dx + x, dy + y, [src.d[i], src.d[i + 1], src.d[i + 2]], src.tag[y * src.w + x]);
      else this.blend(dx + x, dy + y, [src.d[i], src.d[i + 1], src.d[i + 2]], src.d[i + 3] / 255);
    }
  }

  /**
   * Edge lighting: light arrives from the upper right, so the first pixel of every shape facing
   * that way is lifted, and the first pixel facing away is sunk. Part boundaries (tag changes)
   * count as edges too, which makes armour plates and limbs read as separate volumes.
   */
  edgeLight(hi = 0.26, lo = 0.3, skipTags: number[] = []): void {
    const w = this.w, h = this.h;
    const src = new Uint8ClampedArray(this.d);
    const tags = new Uint8Array(this.tag);
    const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
    const tg = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : tags[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] < 200) continue;
      const t = tags[y * w + x];
      if (skipTags.includes(t)) continue;
      const up = alpha(x, y - 1) < 200 || (tg(x, y - 1) !== t && tg(x, y - 1) !== 0 && skipTags.indexOf(tg(x, y - 1)) < 0 && t < tg(x, y - 1));
      const right = alpha(x + 1, y) < 200 || (tg(x + 1, y) !== t && t < tg(x + 1, y));
      const down = alpha(x, y + 1) < 200 || (tg(x, y + 1) !== t && t > tg(x, y + 1) && tg(x, y + 1) !== 0);
      const left = alpha(x - 1, y) < 200;
      let c: RGB = [src[i], src[i + 1], src[i + 2]];
      if (up || right) c = shade(c, hi);
      else if (down || left) c = shade(c, -lo);
      this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
    }
  }

  /** Selective outline: every empty pixel touching a shape takes a dark tone of that shape's colour. */
  outline(strength = 0.78, fixed?: RGB, diagonals = false): void {
    const w = this.w, h = this.h;
    const src = new Uint8ClampedArray(this.d);
    const tags = new Uint8Array(this.tag);
    const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (diagonals) dirs.push([1, 1], [-1, 1], [1, -1], [-1, -1]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[(y * w + x) * 4 + 3] > 40) continue;
      let best = -1, bestA = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const a = src[(ny * w + nx) * 4 + 3];
        if (a > bestA && tags[ny * w + nx] !== 255) { bestA = a; best = (ny * w + nx) * 4; }
      }
      if (best < 0 || bestA < 200) continue;
      const c: RGB = fixed ?? mix([src[best], src[best + 1], src[best + 2]], OUTLINE, strength);
      const i = (y * w + x) * 4;
      this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
      this.tag[y * w + x] = 254;
    }
  }

  /** Nearest-neighbour rotation about (cx, cy); returns a new buffer. */
  rotated(angle: number, cx: number, cy: number): Px {
    const out = new Px(this.w, this.h);
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const sx = Math.floor(dx * cos - dy * sin + cx), sy = Math.floor(dx * sin + dy * cos + cy);
      if (!this.inside(sx, sy)) continue;
      const si = (sy * this.w + sx) * 4;
      if (this.d[si + 3] === 0) continue;
      out.set(x, y, [this.d[si], this.d[si + 1], this.d[si + 2]], this.tag[sy * this.w + sx]);
    }
    return out;
  }

  /** Lift every opaque pixel toward `c` (used for hit flashes). */
  tint(c: RGB, amount: number): void {
    for (let i = 0; i < this.d.length; i += 4) {
      if (this.d[i + 3] === 0) continue;
      this.d[i] += (c[0] - this.d[i]) * amount;
      this.d[i + 1] += (c[1] - this.d[i + 1]) * amount;
      this.d[i + 2] += (c[2] - this.d[i + 2]) * amount;
    }
  }

  toImageData(): ImageData {
    return new ImageData(new Uint8ClampedArray(this.d), this.w, this.h);
  }

  toCanvas(scale = 1): HTMLCanvasElement {
    const base = makeCanvas(this.w, this.h);
    base.getContext('2d')!.putImageData(this.toImageData(), 0, 0);
    if (scale === 1) return base;
    const out = makeCanvas(this.w * scale, this.h * scale);
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, out.width, out.height);
    return out;
  }
}

/** Nearest-neighbour upscale of any canvas. */
export function upscale(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const out = makeCanvas(src.width * scale, src.height * scale);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}
