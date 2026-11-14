import { Px, hex, ramp, shade, mix, rng, makeCanvas, upscale, type RGB } from './px';

/**
 * Environment pixel art: platform materials sized exactly to each collider, seamless parallax
 * backdrops per region, and the small props/NPC portraits placed in levels. Everything is painted
 * at half resolution (2×2 "fat pixels") and upscaled with nearest-neighbour so the whole world
 * shares one pixel grid.
 */

export const WORLD_PIXEL = 2;
export const SCREEN_W = 1280;
export const SCREEN_H = 720;

// ------------------------------------------------------------------ platforms

const MATERIAL: Record<string, string> = {
  ground: '#5a4637', stone: '#756a63', wood: '#7a5539', ice: '#9fbfcf', sand: '#9a7a4f',
  crumble: '#6f5448', oneway: '#8c6b4c', vine: '#4f6b48', metal: '#5c6671',
};

export function paintPlatform(kind: string, w: number, h: number): HTMLCanvasElement {
  const pw = Math.max(2, Math.ceil(w / WORLD_PIXEL)), ph = Math.max(2, Math.ceil(h / WORLD_PIXEL));
  const px = new Px(pw, ph);
  const R = ramp(MATERIAL[kind] ?? MATERIAL.ground);
  const rnd = rng(w * 31 + h * 17 + kind.length * 131);
  px.rect(0, 0, pw, ph, R[2], 1);
  // Mottled body: two tone speckle for texture without noise blur.
  for (let i = 0; i < pw * ph * 0.16; i++) px.set(Math.floor(rnd() * pw), Math.floor(rnd() * ph), rnd() < 0.5 ? R[1] : R[3], 1);

  const bricks = (bw: number, bh: number, mortar: RGB) => {
    for (let y = 0; y < ph; y += bh) {
      px.hline(0, y + bh - 1, pw, mortar, 2);
      const off = (Math.floor(y / bh) % 2) * (bw >> 1);
      for (let x = -off; x < pw; x += bw) {
        px.vline(x + bw - 1, y, bh, mortar, 2);
        px.hline(x + 1, y + 1, bw - 3, R[3], 1); // lit top edge of each block
      }
    }
  };

  switch (kind) {
    case 'wood': case 'oneway': {
      const pl = Math.max(4, Math.min(8, ph));
      for (let y = 0; y < ph; y += pl) {
        px.hline(0, y + pl - 1, pw, R[0], 2);
        px.hline(0, y, pw, R[3], 1);
        for (let x = 6 + ((y / pl) % 2) * 9; x < pw; x += 22) { px.set(x, y + 2, R[0], 2); px.set(x + 1, y + 2, R[1], 2); }
        for (let k = 0; k < 3; k++) px.hline(Math.floor(rnd() * pw), y + 2 + Math.floor(rnd() * (pl - 4)), 6 + Math.floor(rnd() * 8), R[1], 1);
      }
      break;
    }
    case 'ice': {
      for (let x = 3; x < pw; x += 11) { px.line(x, 1, x + 3, ph - 2, [225, 248, 255], 1, 3); px.line(x + 1, 2, x + 4, ph - 3, R[4], 1, 3); }
      px.rect(0, ph - 3, pw, 3, R[1], 2);
      break;
    }
    case 'sand': {
      for (let y = 3; y < ph; y += 4) for (let x = 0; x < pw; x++) if (Math.sin(x * 0.23 + y) > 0.2) px.set(x, y + (x % 3 === 0 ? 1 : 0), y % 8 === 3 ? R[3] : R[1], 1);
      break;
    }
    case 'vine': {
      bricks(14, 8, R[0]);
      for (let x = 4; x < pw; x += 9) {
        const len = 3 + Math.floor(rnd() * Math.max(2, ph - 5));
        for (let y = 1; y < len; y++) px.set(x + Math.round(Math.sin(y * 0.8)), y, y % 4 === 0 ? [150, 190, 100] : [58, 96, 52], 3);
        px.set(x + 1, len, [160, 200, 108], 3);
      }
      break;
    }
    case 'metal': {
      px.rect(0, 0, pw, 2, R[4], 1);
      for (let x = 5; x < pw; x += 16) { px.vline(x, 2, ph - 2, R[1], 2); px.set(x + 3, 4, R[4], 3); px.set(x + 3, ph - 4, R[0], 3); }
      px.hline(0, ph - 3, pw, R[0], 2);
      break;
    }
    case 'crumble': {
      bricks(14, 9, R[0]);
      for (let x = 8; x < pw; x += 19) { let cx = x; for (let y = 2; y < ph - 1; y++) { cx += rnd() < 0.5 ? 0 : (rnd() < 0.5 ? -1 : 1); px.set(cx, y, [28, 20, 22], 3); } }
      break;
    }
    case 'stone': bricks(16, 9, R[0]); break;
    default: {
      // Earth: strata, pebbles and roots.
      for (let i = 0; i < pw * ph * 0.012; i++) px.disc(Math.floor(rnd() * pw), 6 + Math.floor(rnd() * Math.max(1, ph - 8)), 1, R[3], 3);
      for (let x = 6; x < pw; x += 13) { const len = 3 + Math.floor(rnd() * 8); for (let y = 4; y < Math.min(ph, 4 + len); y++) px.set(x + (y % 2), y, [64, 44, 34], 3); }
    }
  }

  // Cap and edges. Natural earth/vines get a mossy lip with hanging blades; others a lit lip.
  const grassy = kind === 'ground' || kind === 'vine';
  if (grassy) {
    const G = ramp(kind === 'ground' ? '#6d8a45' : '#7aa05a');
    px.rect(0, 0, pw, 3, G[2], 4); px.hline(0, 0, pw, G[4], 4); px.hline(0, 3, pw, G[0], 4);
    for (let x = 0; x < pw; x++) {
      const drop = Math.floor(rnd() * 4);
      for (let k = 0; k < drop; k++) px.set(x, 3 + k, k === drop - 1 ? G[1] : G[2], 4);
    }
    for (let x = 2; x < pw; x += 7 + Math.floor(rnd() * 5)) { px.vline(x, -1 < 0 ? 0 : 0, 1, G[4], 4); }
  } else if (kind !== 'oneway') {
    px.hline(0, 0, pw, R[4], 4); px.hline(0, 1, pw, R[3], 4);
  }
  px.vline(0, 0, ph, R[3], 5); px.vline(pw - 1, 0, ph, R[0], 5);
  px.hline(0, ph - 1, pw, R[0], 5); if (ph > 4) px.hline(0, ph - 2, pw, R[1], 5);
  // Underside fog darkening gives depth when stacked above the backdrop.
  for (let y = Math.max(0, ph - 6); y < ph; y++) for (let x = 0; x < pw; x++) {
    if ((x + y) % 2 === 0) px.set(x, y, mix(px.get(x, y), [10, 8, 14], 0.35), px.tagAt(x, y));
  }
  const out = upscale(px.toCanvas(), WORLD_PIXEL);
  if (out.width === w && out.height === h) return out;
  const fit = makeCanvas(w, h);
  fit.getContext('2d')!.drawImage(out, 0, 0);
  return fit;
}

// ------------------------------------------------------------------ backdrops

export interface Atmosphere { sky: string; mid: string; fore: string }
export type RegionKind = 'village' | 'forest' | 'desert' | 'frost' | 'hollow' | 'crown';

export function regionKind(region: string): RegionKind {
  if (region.includes('forest')) return 'forest';
  if (region.includes('desert')) return 'desert';
  if (region.includes('highland')) return 'frost';
  if (region.includes('hollow')) return 'hollow';
  if (region.includes('crown')) return 'crown';
  return 'village';
}

const W = SCREEN_W / WORLD_PIXEL; // 640
const H = SCREEN_H / WORLD_PIXEL; // 360

function accentFor(k: RegionKind): RGB {
  return k === 'frost' ? [160, 218, 238] : k === 'forest' ? [160, 190, 120] : k === 'hollow' ? [184, 140, 228] : k === 'desert' ? [236, 168, 98] : [230, 160, 105];
}

/** Seamless ridge height: integer-period sines so the layer tiles perfectly in x. */
function ridge(x: number, base: number, amp: number, seed: number): number {
  const TAU = Math.PI * 2;
  return base - amp * (0.5 + 0.28 * Math.sin(TAU * 2 * x / W + seed) + 0.17 * Math.sin(TAU * 5 * x / W + seed * 2.3) + 0.09 * Math.sin(TAU * 11 * x / W + seed * 4.1));
}

function fillRidge(px: Px, base: number, amp: number, seed: number, c: RGB, tag = 1): void {
  for (let x = 0; x < W; x++) {
    const y = Math.round(ridge(x, base, amp, seed));
    for (let j = y; j < H; j++) px.set(x, j, c, tag);
  }
}

function wrapped(px: Px, x: number, fn: (ox: number) => void): void { fn(x); fn(x - W); fn(x + W); }

/** Static sky: dithered gradient, stars, haloed moon and thin cloud streaks. */
export function paintSky(a: Atmosphere, region: string): HTMLCanvasElement {
  const k = regionKind(region);
  const px = new Px(W, H);
  const top = shade(hex(a.sky), -0.25), mid = hex(a.mid);
  const bottom = mix(mid, accentFor(k), 0.3);
  px.ditherV(0, 0, W, H, top, bottom, 8);
  const r = rng(21);
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H * 0.62), big = r() < 0.1;
    px.blend(x, y, [255, 244, 220], big ? 0.95 : 0.35 + r() * 0.3);
    if (big) { px.blend(x - 1, y, [255, 230, 190], 0.4); px.blend(x + 1, y, [255, 230, 190], 0.4); px.blend(x, y - 1, [255, 230, 190], 0.4); px.blend(x, y + 1, [255, 230, 190], 0.4); }
  }
  const mx = Math.round(W * (k === 'desert' ? 0.78 : 0.72)), my = Math.round(H * 0.22), mr = k === 'frost' ? 17 : 13;
  const acc = accentFor(k);
  for (let rr = mr * 3; rr > mr; rr -= 2) for (let t = 0; t < 360; t += 2) {
    const ang = (t * Math.PI) / 180;
    for (let q = mr; q < rr; q += 1) px.blend(Math.round(mx + Math.cos(ang) * q), Math.round(my + Math.sin(ang) * q), acc, 0.012);
  }
  px.disc(mx, my, mr, [240, 230, 208]);
  px.disc(mx + 4, my - 2, mr - 2, mix([240, 230, 208], top, 0.7)); // crescent bite
  px.disc(mx - 5, my + 4, 2, [214, 202, 182]); px.disc(mx - 2, my + 8, 1.4, [214, 202, 182]);
  for (let c = 0; c < 4; c++) {
    const cy = Math.round(H * (0.16 + c * 0.1)), cx = Math.floor(r() * W), len = 60 + Math.floor(r() * 90);
    for (let x = 0; x < len; x++) for (let y = 0; y < 3; y++) if ((x + y * 2) % 3 === 0) px.blend((cx + x) % W, cy + y + Math.round(Math.sin(x * 0.08) * 2), shade(mid, 0.15), 0.22);
  }
  return upscale(px.toCanvas(), WORLD_PIXEL);
}

/** One parallax layer (transparent canvas, seamless in x). depth 0 = far, 1 = mid, 2 = near. */
export function paintLayer(a: Atmosphere, region: string, depth: 0 | 1 | 2): HTMLCanvasElement {
  const k = regionKind(region);
  const px = new Px(W, H);
  const sky = hex(a.sky), mid = hex(a.mid), fore = hex(a.fore);
  const r = rng(100 + depth * 17 + k.length);
  const fog = mix(mid, accentFor(k), 0.18);
  const colFar = mix(fog, sky, 0.25), colMid = mix(shade(fore, -0.5), fog, 0.4), colNear = shade(fore, -0.78);
  const horizon = H - 78;

  if (depth === 0) {
    fillRidge(px, horizon - 36, k === 'frost' ? 150 : 96, 1.3, colFar);
    if (k === 'frost') for (let x = 0; x < W; x++) { const y = Math.round(ridge(x, horizon - 36, 150, 1.3)); for (let j = 0; j < 7; j++) if (j < 7 - Math.abs((x % 40) - 20) / 4) px.set(x, y + j, [214, 232, 238], 2); }
    px.edgeLight(0.12, 0);
  } else if (depth === 1) {
    fillRidge(px, horizon - 8, 54, 2.1, colMid);
    switch (k) {
      case 'forest':
        for (let i = 0; i < 22; i++) wrapped(px, Math.floor(r() * W), (x) => {
          const th = 46 + Math.floor(r() * 40), tw = 10 + Math.floor(r() * 6), by = Math.round(ridge(x, horizon - 8, 54, 2.1)) + 6;
          px.rect(x - 1, by - th * 0.4, 3, th * 0.4, shade(colMid, -0.3), 2);
          for (let t = 0; t < 4; t++) px.poly([[x - tw + t * 2, by - th * 0.3 - t * th * 0.17], [x, by - th * 0.5 - t * th * 0.17 - 6], [x + tw - t * 2, by - th * 0.3 - t * th * 0.17]], t % 2 ? colMid : shade(colMid, 0.08), 2);
        });
        break;
      case 'desert':
        for (let i = 0; i < 5; i++) wrapped(px, Math.floor((i + 0.4) * W / 5), (x) => {
          const by = Math.round(ridge(x, horizon - 8, 54, 2.1)) + 4, hgt = 50 + Math.floor(r() * 34);
          px.rect(x - 5, by - hgt, 10, hgt, shade(colMid, -0.15), 2); px.poly([[x - 6, by - hgt], [x, by - hgt - 14], [x + 6, by - hgt]], shade(colMid, -0.15), 2);
          px.rect(x - 3, by - hgt + 14, 2, 8, fog, 3);
        });
        break;
      case 'frost':
        for (let i = 0; i < 7; i++) wrapped(px, Math.floor((i + 0.5) * W / 7), (x) => {
          const by = horizon + 6, hgt = 70 + Math.floor(r() * 60);
          px.poly([[x - 40, by], [x, by - hgt], [x + 44, by]], colMid, 2); px.poly([[x - 10, by - hgt + 28], [x, by - hgt], [x + 10, by - hgt + 28], [x + 3, by - hgt + 22], [x - 3, by - hgt + 26]], [214, 232, 238], 3);
        });
        break;
      default: // village / hollow / crown: broken keeps, arches and spires
        for (let i = 0; i < 9; i++) wrapped(px, Math.floor((i + 0.3) * W / 9), (x) => {
          const by = horizon + 4, tw = 20 + Math.floor(r() * 14), th = 40 + Math.floor(r() * 60);
          px.rect(x - tw / 2, by - th, tw, th, colMid, 2);
          for (let c = 0; c < 3; c++) px.rect(x - tw / 2 + c * Math.floor(tw / 3), by - th - 5, Math.floor(tw / 4), 5, colMid, 2);
          if (k !== 'village') px.poly([[x - tw / 2 - 2, by - th], [x, by - th - 30], [x + tw / 2 + 2, by - th]], colMid, 2);
          px.rect(x - 2, by - th + 14, 4, 9, mix(accentFor(k), colMid, 0.2), 4); // lit window
          if (r() < 0.5) px.poly([[x + tw / 2, by - 14], [x + tw / 2 + 24, by], [x + tw / 2, by]], colMid, 2); // fallen wall
        });
    }
    px.edgeLight(0.16, 0);
  } else {
    // Near: dark ground lip with silhouettes of grass/rocks/bones, fading into fog at the top.
    fillRidge(px, H - 22, 26, 3.7, colNear);
    for (let i = 0; i < 40; i++) wrapped(px, Math.floor(r() * W), (x) => {
      const by = Math.round(ridge(x, H - 22, 26, 3.7)) + 2;
      if (k === 'forest' || k === 'village') { for (let b = -2; b <= 2; b++) px.line(x + b, by, x + b * 2, by - 5 - Math.floor(r() * 7), colNear, 1, 2); }
      else if (k === 'frost') px.poly([[x - 4, by], [x, by - 9 - Math.floor(r() * 8)], [x + 4, by]], colNear, 2);
      else if (k === 'desert') px.ellipse(x, by, 7, 4, colNear, 2);
      else px.rect(x - 2, by - 4 - Math.floor(r() * 5), 4, 6, colNear, 2);
    });
    px.edgeLight(0.1, 0);
  }
  // Atmospheric haze toward the horizon so distant layers sit back.
  if (depth < 2) for (let y = horizon - 70; y < H; y++) for (let x = 0; x < W; x++) if (px.alphaAt(x, y) && (x + y) % 2 === 0) px.set(x, y, mix(px.get(x, y), fog, 0.12 * (1 - depth * 0.4)), px.tagAt(x, y));
  return upscale(px.toCanvas(), WORLD_PIXEL);
}

// ------------------------------------------------------------------ NPCs & props

const NPC_LOOK: Record<string, { cloth: string; hair: string; hood?: boolean; tool?: 'hammer' | 'staff' | 'sack' | 'none' }> = {
  tamsin: { cloth: '#875447', hair: '#2d1a16', tool: 'sack' },
  kael: { cloth: '#526a7a', hair: '#4a3a2a', hood: true, tool: 'staff' },
  lyra: { cloth: '#667b55', hair: '#6a4a2a', hood: true, tool: 'staff' },
  brom: { cloth: '#9a7544', hair: '#8a8a8a', tool: 'hammer' },
  hobb: { cloth: '#805447', hair: '#3a2a22', tool: 'hammer' },
  marta: { cloth: '#7d6250', hair: '#b0a8a0', tool: 'sack' },
  mira: { cloth: '#536d62', hair: '#b77d55', hood: true, tool: 'none' },
};

/** Villager portrait sprite, 48×64 fat-pixel grid (feet at the bottom edge, facing the player). */
export function paintNpc(id: string, cloth: number): HTMLCanvasElement {
  const look = NPC_LOOK[id] ?? { cloth: '#' + cloth.toString(16).padStart(6, '0'), hair: '#33261f', tool: 'none' as const };
  const px = new Px(24, 32);
  const C = ramp(look.cloth), S = ramp('#d8a67f'), Hh = ramp(look.hair), L = ramp('#4a3829');
  const cx = 12;
  px.poly([[cx - 6, 14], [cx + 6, 14], [cx + 8, 29], [cx - 8, 29]], C[2], 1);            // robe
  px.poly([[cx - 3, 14], [cx + 3, 14], [cx + 2, 29], [cx - 2, 29]], C[3], 1);            // lit centre fold
  px.rect(cx - 6, 20, 12, 2, L[1], 2);                                                    // belt
  px.rect(cx - 1, 20, 2, 2, [214, 170, 90], 3);                                           // buckle
  px.rect(cx - 8, 28, 16, 3, L[0], 2);                                                    // boots / hem shadow
  px.line(cx - 6, 15, cx - 8, 22, C[1], 2, 1); px.line(cx + 6, 15, cx + 8, 22, C[1], 2, 1);
  px.disc(cx - 8, 23, 1.2, S[2], 4); px.disc(cx + 8, 23, 1.2, S[2], 4);
  px.disc(cx, 9, 4.4, S[2], 4);                                                           // head
  px.set(cx - 2, 9, [34, 22, 26], 5); px.set(cx + 2, 9, [34, 22, 26], 5);                 // eyes
  px.hline(cx - 1, 12, 3, S[0], 4);                                                       // mouth
  if (look.hood) { px.poly([[cx - 6, 14], [cx - 5, 5], [cx, 2], [cx + 5, 5], [cx + 6, 14], [cx + 3, 8], [cx - 3, 8]], C[1], 6); }
  else px.poly([[cx - 5, 8], [cx - 3, 4], [cx + 3, 4], [cx + 5, 8], [cx + 3, 6], [cx - 3, 6]], Hh[2], 6);
  if (look.tool === 'staff') { px.line(cx + 10, 8, cx + 10, 29, L[2], 1, 2); px.disc(cx + 10, 7, 1.6, [160, 220, 235], 3); }
  if (look.tool === 'hammer') { px.line(cx + 10, 16, cx + 10, 29, L[2], 1, 2); px.rect(cx + 8, 13, 5, 3, [150, 156, 166], 3); }
  if (look.tool === 'sack') px.ellipse(cx - 10, 27, 3, 3, L[3], 2);
  px.edgeLight(0.22, 0.28);
  px.outline(0.8);
  return upscale(px.toCanvas(), 2);
}

export type PropKind = 'well' | 'forge' | 'chest' | 'shrine' | 'generic';

/** Prop sprites on a 40×40 fat-pixel grid. Bright dynamic parts (fire/glow) are separate frames so scenes can tween them. */
export function paintProp(kind: PropKind): HTMLCanvasElement {
  const px = new Px(40, 40);
  const ST = ramp('#7a6f66'), WD = ramp('#7b5738'), MT = ramp('#5d6772');
  const cx = 20;
  if (kind === 'well') {
    px.rect(cx - 12, 22, 24, 16, ST[2], 1);
    for (let y = 22; y < 38; y += 4) { px.hline(cx - 12, y, 24, ST[0], 2); for (let x = cx - 12 + ((y / 4) % 2) * 4; x < cx + 12; x += 8) px.vline(x, y, 4, ST[0], 2); }
    px.ellipse(cx, 22, 13, 4, ST[3], 3); px.ellipse(cx, 22, 9, 2.5, [14, 22, 36], 4);
    px.rect(cx - 12, 6, 2, 17, WD[1], 5); px.rect(cx + 10, 6, 2, 17, WD[1], 5);
    px.poly([[cx - 15, 8], [cx, 0], [cx + 15, 8]], WD[2], 5);
    px.line(cx, 8, cx, 18, [190, 170, 130], 1, 6); px.rect(cx - 2, 18, 5, 4, WD[0], 5);
  } else if (kind === 'forge') {
    px.rect(cx - 12, 24, 24, 14, ST[1], 1); px.rect(cx - 10, 26, 20, 4, ST[0], 2);
    px.rect(cx - 8, 31, 16, 7, [20, 12, 12], 2);
    px.rect(cx - 7, 33, 14, 5, [255, 128, 52], 3); px.rect(cx - 4, 34, 8, 4, [255, 200, 96], 3);
    px.poly([[cx - 10, 24], [cx + 12, 24], [cx + 8, 18], [cx - 14, 18]], MT[3], 4); px.rect(cx - 6, 24, 12, 2, MT[1], 4);
    px.rect(cx + 8, 4, 6, 20, ST[0], 2); px.rect(cx + 8, 2, 8, 3, ST[2], 2);
  } else if (kind === 'chest') {
    px.rect(cx - 9, 24, 18, 12, WD[2], 1); px.poly([[cx - 9, 24], [cx - 7, 17], [cx + 7, 17], [cx + 9, 24]], WD[3], 2);
    px.rect(cx - 9, 24, 18, 2, [200, 160, 90], 3); px.rect(cx - 9, 30, 18, 1, WD[0], 4);
    px.rect(cx - 2, 25, 4, 5, [224, 190, 110], 3); px.set(cx, 27, WD[0], 4);
  } else if (kind === 'shrine') {
    px.rect(cx - 8, 30, 16, 8, ST[1], 1); px.rect(cx - 5, 18, 10, 12, ST[2], 2);
    px.poly([[cx - 7, 18], [cx, 8], [cx + 7, 18]], ST[3], 3);
    px.disc(cx, 21, 3, [150, 214, 238], 4); px.disc(cx, 21, 1.3, [235, 252, 255], 4);
    px.hline(cx - 8, 30, 16, ST[4], 5);
  } else {
    px.rect(cx - 7, 12, 14, 24, WD[1], 1); px.rect(cx - 7, 12, 14, 3, WD[3], 2); px.rect(cx - 7, 24, 14, 2, [200, 160, 90], 3);
    px.disc(cx, 20, 2, [228, 190, 120], 3);
  }
  px.edgeLight(0.22, 0.28);
  px.outline(0.8);
  return upscale(px.toCanvas(), 2);
}

/** Collectible: a faceted ember shard with a halo, 24×24 real pixels. */
export function paintShard(): HTMLCanvasElement {
  const px = new Px(12, 12);
  px.poly([[6, 0], [10, 6], [6, 11], [2, 6]], [244, 190, 96], 1);
  px.poly([[6, 0], [10, 6], [6, 6]], [255, 228, 150], 2);
  px.poly([[6, 6], [2, 6], [6, 11]], [196, 118, 52], 3);
  px.set(5, 3, [255, 255, 240], 4);
  px.outline(0.7);
  return upscale(px.toCanvas(), 2);
}

export function paintGlow(size = 48, color: RGB = [238, 184, 94]): HTMLCanvasElement {
  const px = new Px(size / 2, size / 2);
  const c = size / 4;
  for (let y = 0; y < size / 2; y++) for (let x = 0; x < size / 2; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
    if (d < 1) { const a = Math.pow(1 - d, 2) * 0.55; if ((x + y) % 2 === 0 || a > 0.25) px.blend(x, y, color, a); }
  }
  return upscale(px.toCanvas(), 2);
}


/** Grounded pixel-art buildings and trees used as world-space dressing (feet/base aligned to terrain). */
export function paintHouse(variant: 'ruined' | 'cottage' | 'watch' = 'ruined'): HTMLCanvasElement {
  const px = new Px(112, 112);
  const stone = ramp(variant === 'cottage' ? '#88765e' : '#62585a');
  const roof = ramp(variant === 'cottage' ? '#76513c' : '#3e343a');
  const wood = ramp('#654638');
  const glass = variant === 'cottage' ? [214, 178, 104] : [184, 104, 62];
  // Broad foundation, wall mass and roof are all drawn to the same bottom baseline.
  px.rect(12, 48, 88, 60, stone[2], 1);
  px.rect(18, 54, 76, 48, stone[3], 2);
  px.rect(18, 54, 76, 5, stone[4], 3);
  px.poly([[5, 52], [53, 12], [107, 52], [99, 59], [53, 27], [13, 59]], roof[2], 4);
  px.poly([[53, 12], [107, 52], [99, 59], [53, 27]], roof[1], 4);
  px.line(7, 53, 52, 15, roof[4], 2, 5);
  px.line(55, 15, 105, 53, roof[3], 2, 5);
  // Timber framing and grounded doorway.
  px.rect(23, 58, 5, 43, wood[2], 5);
  px.rect(84, 58, 5, 43, wood[2], 5);
  px.rect(47, 73, 19, 35, wood[1], 6);
  px.rect(50, 76, 13, 32, [28, 20, 22], 7);
  px.rect(59, 89, 2, 2, [220, 183, 112], 8);
  px.rect(31, 65, 13, 15, [27, 29, 35], 6);
  px.rect(33, 67, 9, 11, glass, 7);
  px.vline(37, 66, 13, wood[2], 8); px.hline(32, 72, 11, wood[2], 8);
  if (variant === 'ruined') {
    px.poly([[12, 52], [25, 44], [30, 55], [20, 63]], stone[1], 9);
    px.poly([[78, 50], [92, 45], [103, 57], [92, 61]], stone[1], 9);
    px.line(16, 43, 31, 57, [37, 29, 31], 2, 10);
    px.rect(72, 82, 12, 5, [39, 31, 30], 10);
    px.line(76, 82, 82, 93, [39, 31, 30], 2, 10);
  } else if (variant === 'watch') {
    px.rect(44, 31, 17, 19, stone[1], 11);
    px.rect(49, 35, 7, 15, [24, 22, 29], 12);
    px.rect(39, 25, 27, 5, roof[2], 11);
  } else {
    px.rect(68, 65, 13, 15, [27, 29, 35], 6);
    px.rect(70, 67, 9, 11, glass, 7);
  }
  px.rect(8, 102, 96, 7, [31, 25, 26], 13);
  px.edgeLight(0.2, 0.22);
  px.outline(0.72);
  return upscale(px.toCanvas(), 2);
}

export function paintTree(variant: 'pine' | 'broadleaf' = 'pine'): HTMLCanvasElement {
  const px = new Px(64, 112);
  const bark = ramp('#49382d');
  const leaf = ramp(variant === 'pine' ? '#355b42' : '#456d48');
  px.rect(29, 61, 8, 49, bark[2], 1);
  px.line(32, 67, 18, 91, bark[1], 4, 2);
  px.line(34, 71, 48, 91, bark[3], 4, 2);
  if (variant === 'pine') {
    px.poly([[32, 2], [8, 48], [56, 48]], leaf[2], 3);
    px.poly([[32, 20], [5, 72], [59, 72]], leaf[1], 4);
    px.poly([[32, 40], [1, 93], [63, 93]], leaf[2], 5);
    px.line(32, 4, 32, 93, leaf[4], 2, 6);
  } else {
    px.disc(32, 37, 24, leaf[2], 3);
    px.disc(16, 48, 16, leaf[1], 4);
    px.disc(47, 49, 17, leaf[3], 5);
    px.disc(31, 22, 16, leaf[4], 6);
    for (let i = 0; i < 18; i++) px.set(8 + (i * 17) % 48, 18 + (i * 23) % 55, i % 2 ? leaf[4] : leaf[1], 7);
  }
  px.rect(6, 106, 52, 5, [24, 28, 21], 8);
  px.edgeLight(0.22, 0.2);
  px.outline(0.7);
  return upscale(px.toCanvas(), 2);
}

export function paintPrisonDetail(kind: 'bars' | 'torch' = 'bars'): HTMLCanvasElement {
  const px = new Px(48, 80);
  const iron = ramp('#667078');
  if (kind === 'bars') {
    px.rect(3, 3, 42, 4, iron[2], 1);
    px.rect(3, 73, 42, 4, iron[1], 1);
    for (let x = 7; x <= 41; x += 9) {
      px.rect(x, 6, 3, 68, iron[2], 2);
      px.line(x, 7, x, 71, iron[4], 1, 3);
    }
    px.hline(4, 39, 40, iron[1], 4);
  } else {
    px.rect(20, 23, 7, 44, [69, 48, 34], 2);
    px.poly([[23, 2], [14, 20], [19, 30], [27, 27], [33, 18]], [230, 116, 55], 4);
    px.poly([[23, 8], [19, 22], [25, 26], [29, 17]], [255, 205, 112], 5);
    px.disc(23, 19, 18, [255, 151, 70], 0);
  }
  px.edgeLight(0.18, 0.18);
  return upscale(px.toCanvas(), 2);
}
