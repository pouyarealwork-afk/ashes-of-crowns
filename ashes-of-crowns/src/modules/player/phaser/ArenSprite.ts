import { ANIM_DEFS, FRAME_H, FRAME_W, SHEET_COLUMNS } from './animations';
import type { AnimName } from './animations';
import { paintAren } from '../../../art/aren';

/**
 * Aren's animation poses. The pixel-art painter lives in src/art/aren.ts (plain Canvas 2D / typed
 * arrays, no Phaser dependency, so it can be rendered and tested in any browser). Angle convention: 0 = pointing straight down,
 * +x = forward (facing right), PI/2 = horizontal forward, PI = straight up.
 * This is the module's built-in art; replace by supplying an atlas with the same frame names.
 */

export interface Pose {
  bob: number;
  lean: number;
  legF: [number, number];
  legB: [number, number];
  armF: [number, number];
  armB: [number, number];
  /** Absolute sword angle. */
  sword: number;
  cape: number;
  rot: number;
  flash: number;
  trail?: { from: number; to: number; r: number; alpha: number; color?: string };
  aura?: number;
  burst?: number;
  hideSword?: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t: number) => Math.pow(clamp01(t), 2);

function basePose(): Pose {
  return {
    bob: 0,
    lean: 0.05,
    legF: [0.12, -0.05],
    legB: [-0.12, -0.05],
    armF: [0.35, 0.6],
    armB: [-0.25, 0.3],
    sword: 0.95,
    cape: 0,
    rot: 0,
    flash: 0,
  };
}

/** Compute the pose for animation `name` at frame i of n. */
export function poseFor(name: AnimName, i: number, n: number): Pose {
  const p = basePose();
  const t = n > 1 ? i / n : 0;
  const u = n > 1 ? i / (n - 1) : 1; // 0..1 inclusive
  const TAU = Math.PI * 2;
  switch (name) {
    case 'idle': {
      p.bob = Math.sin(TAU * t) * 0.9;
      p.armF = [0.3 + Math.sin(TAU * t) * 0.05, 0.6];
      p.cape = 0.1 + Math.sin(TAU * t + 1) * 0.1;
      break;
    }
    case 'walk':
    case 'run': {
      const run = name === 'run';
      const amp = run ? 1.0 : 0.65;
      const s = Math.sin(TAU * t);
      const c = Math.cos(TAU * t);
      p.legF = [s * amp, -Math.max(0, -c) * (run ? 1.3 : 0.8)];
      p.legB = [-s * amp, -Math.max(0, c) * (run ? 1.3 : 0.8)];
      p.bob = -Math.abs(c) * (run ? 2.2 : 1.2);
      p.lean = run ? 0.3 : 0.1;
      p.armF = run ? [-s * 0.9 + 0.2, 1.1] : [-s * 0.4 + 0.25, 0.5];
      p.armB = run ? [s * 0.9 - 0.2, 1.0] : [s * 0.4 - 0.2, 0.4];
      p.sword = run ? 1.9 : 0.95;
      p.cape = run ? 0.9 : 0.35;
      break;
    }
    case 'jump': {
      p.bob = [2, -1, -2][i] ?? 0;
      p.legF = [lerp(0.2, 0.9, u), lerp(-0.2, -1.2, u)];
      p.legB = [lerp(-0.2, -0.3, u), lerp(-0.2, -1.0, u)];
      p.armF = [lerp(0.4, 2.2, u), 0.4];
      p.armB = [lerp(-0.3, -1.6, u), 0.2];
      p.lean = 0.12;
      p.cape = 0.2;
      p.sword = lerp(1.0, 2.0, u);
      break;
    }
    case 'fall': {
      p.bob = -1;
      p.legF = [0.35 + Math.sin(TAU * t) * 0.1, -0.35];
      p.legB = [-0.5, -0.5];
      p.armF = [2.5, 0.3];
      p.armB = [-2.3, 0.2];
      p.cape = 1.3;
      p.lean = 0.0;
      p.sword = 2.7;
      break;
    }
    case 'doubleJump': {
      p.rot = TAU * u * 0.97;
      p.legF = [1.0, -1.5];
      p.legB = [0.4, -1.4];
      p.armF = [1.0, 1.6];
      p.armB = [0.6, 1.5];
      p.bob = 3;
      p.cape = 0.8;
      p.sword = 1.6;
      break;
    }
    case 'land': {
      p.bob = [5, 7, 3][i] ?? 0;
      p.legF = [0.8, -1.3];
      p.legB = [-0.6, -1.0];
      p.lean = 0.35;
      p.armF = [0.9, 0.9];
      p.cape = 0.5;
      break;
    }
    case 'attack0': {
      // down-forward slash
      const wind = clamp01(u / 0.3);
      const strike = easeOut((u - 0.3) / 0.35);
      const a = u < 0.3 ? lerp(2.9, 3.6, wind) : lerp(3.6, 0.45, strike);
      applySlash(p, a, u, 0.3, 0.65);
      break;
    }
    case 'attack1': {
      // rising back-slash
      const wind = clamp01(u / 0.3);
      const strike = easeOut((u - 0.3) / 0.35);
      const a = u < 0.3 ? lerp(0.5, -0.25, wind) : lerp(-0.25, 2.8, strike);
      applySlash(p, a, u, 0.3, 0.65, true);
      break;
    }
    case 'attack2': {
      // overhead finisher
      const wind = clamp01(u / 0.45);
      const strike = easeIn((u - 0.45) / 0.25);
      const a = u < 0.45 ? lerp(1.6, 3.9, easeOut(wind)) : lerp(3.9, 0.2, clamp01(strike));
      applySlash(p, a, u, 0.45, 0.75);
      p.lean = u < 0.45 ? -0.1 : 0.45;
      p.bob = u < 0.45 ? 0 : 2;
      if (p.trail) p.trail.r = 30;
      break;
    }
    case 'heavy': {
      const windEnd = 0.55;
      const a = u < windEnd ? lerp(1.0, 4.3, easeOut(u / windEnd)) : lerp(4.3, 0.15, easeIn((u - windEnd) / 0.25));
      applySlash(p, a, u, windEnd, 0.82);
      p.lean = u < windEnd ? -0.3 : 0.5;
      p.bob = u < windEnd ? 2 : 4;
      p.legF = [0.9, -0.5];
      p.legB = [-0.9, -0.2];
      if (p.trail) {
        p.trail.r = 34;
        p.trail.color = 'rgba(255,170,70,';
      }
      if (u >= 0.8) p.burst = 0.5;
      break;
    }
    case 'skill': {
      p.sword = Math.PI - 0.05;
      p.armF = [Math.PI - 0.15, 0.1];
      p.armB = [-1.4, 0.3];
      p.lean = -0.1;
      p.legF = [0.4, -0.2];
      p.legB = [-0.4, -0.2];
      p.cape = 1.0;
      p.aura = u < 0.6 ? easeOut(u / 0.6) * 0.8 : 1 - (u - 0.6) * 1.5;
      if (u > 0.55 && u < 0.9) p.burst = (u - 0.55) / 0.35;
      if (u >= 0.6) {
        p.armF = [lerp(Math.PI - 0.15, 0.6, easeIn((u - 0.6) / 0.3)), 0.1];
        p.sword = lerp(Math.PI - 0.05, 0.5, easeIn((u - 0.6) / 0.3));
        p.lean = 0.3;
      }
      p.bob = u < 0.6 ? -u * 3 : 1;
      break;
    }
    case 'dodge': {
      p.rot = TAU * u * 0.95;
      p.bob = 8;
      p.legF = [1.4, -2.0];
      p.legB = [1.0, -1.9];
      p.armF = [1.0, 2.0];
      p.armB = [0.8, 2.0];
      p.lean = 0.5;
      p.cape = 1.2;
      p.hideSword = true;
      break;
    }
    case 'block': {
      const k = easeOut(u);
      p.legF = [lerp(0.1, 0.55, k), lerp(-0.05, -0.5, k)];
      p.legB = [lerp(-0.1, -0.55, k), lerp(-0.05, -0.3, k)];
      p.bob = lerp(0, 2.5, k);
      p.armF = [lerp(0.4, 1.15, k), lerp(0.6, 2.0, k)];
      p.sword = lerp(1.0, Math.PI - 0.1, k);
      p.armB = [0.9 * k, 1.8 * k];
      p.lean = 0.12 * k;
      break;
    }
    case 'hit': {
      p.lean = -([0.45, 0.35, 0.2, 0.12, 0.05][i] ?? 0.05);
      p.flash = [0.55, 0.3, 0.0][i] ?? 0;
      p.legF = [0.5, -0.2];
      p.legB = [-0.5, -0.3];
      p.armF = [-0.8, 0.5];
      p.armB = [-1.0, 0.4];
      p.bob = [1, 2, 1][i] ?? 0;
      p.cape = 0.7;
      p.sword = 0.4;
      break;
    }
    case 'dead': {
      const k = easeOut(clamp01(u * 1.15));
      p.rot = -k * 1.5;
      p.bob = k * 20;
      p.legF = [lerp(0.1, 0.5, k), lerp(-0.05, -0.4, k)];
      p.legB = [lerp(-0.1, 0.1, k), lerp(-0.05, -0.2, k)];
      p.armF = [lerp(0.35, 2.4, k), 0.3];
      p.armB = [lerp(-0.25, -1.8, k), 0.3];
      p.sword = lerp(0.95, 2.2, k);
      p.cape = 0.2;
      p.lean = 0;
      break;
    }
  }
  return p;
}

function applySlash(p: Pose, a: number, u: number, strikeFrom: number, strikeTo: number, reverse = false): void {
  p.sword = a;
  p.armF = [a, 0.05];
  p.armB = [-0.9, 0.6];
  p.lean = u < strikeFrom ? -0.12 : 0.28;
  p.legF = u < strikeFrom ? [0.2, -0.1] : [0.75, -0.2];
  p.legB = u < strikeFrom ? [-0.3, -0.2] : [-0.7, 0.0];
  p.cape = u < strikeFrom ? 0.2 : 1.0;
  if (u >= strikeFrom && u <= strikeTo) {
    const from = reverse ? a - 1.1 : a + 1.1;
    p.trail = { from, to: a, r: 26, alpha: 0.75 * (1 - (u - strikeFrom) / (strikeTo - strikeFrom + 0.01) * 0.6) };
  }
}

// ------------------------------------------------------------------------------ drawing

/** Draw one frame with its cell's top-left at (ox, oy). */
export function drawAren(ctx: CanvasRenderingContext2D, name: AnimName, i: number, n: number, ox: number, oy: number): void {
  const px = paintAren(poseFor(name, i, n), name === 'dead');
  ctx.putImageData(px.toImageData(), ox, oy);
}

/** Layout used both by the sheet renderer and by Phaser frame registration. */
export interface FrameRect {
  name: string;
  anim: AnimName;
  index: number;
  x: number;
  y: number;
}

export function sheetLayout(): { rects: FrameRect[]; width: number; height: number } {
  const rects: FrameRect[] = [];
  ANIM_DEFS.forEach((def, row) => {
    for (let i = 0; i < def.frames; i++) {
      rects.push({ name: `${def.name}_${i}`, anim: def.name, index: i, x: i * FRAME_W, y: row * FRAME_H });
    }
  });
  return { rects, width: SHEET_COLUMNS * FRAME_W, height: ANIM_DEFS.length * FRAME_H };
}

/** Render the full sheet into a 2D context (frames laid out one animation per row). */
export function renderSheet(ctx: CanvasRenderingContext2D): void {
  const { rects } = sheetLayout();
  for (const r of rects) {
    const def = ANIM_DEFS.find((d) => d.name === r.anim)!;
    drawAren(ctx, r.anim, r.index, def.frames, r.x, r.y);
  }
}
