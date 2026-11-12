import { ANIM_DEFS, FRAME_H, FRAME_W, SHEET_COLUMNS } from './animations';
import type { AnimName } from './animations';

/**
 * Procedural dark-fantasy sprite for Aren, drawn with plain Canvas 2D (no Phaser dependency, so it
 * can be rendered/tested in any browser). Angle convention: 0 = pointing straight down,
 * +x = forward (facing right), PI/2 = horizontal forward, PI = straight up.
 * This is the module's built-in art; replace by supplying an atlas with the same frame names.
 */

interface Pose {
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

const C = {
  outline: '#140e0b',
  skin: '#d9b08c',
  hair: '#2b1d17',
  tunic: '#5a4632',
  trim: '#c9a45c',
  cloak: '#7a2e2e',
  cloakDark: '#541d1f',
  pants: '#3b3a40',
  boots: '#2a2019',
  steel: '#d3dae0',
  steelDark: '#8a949c',
  grip: '#6b4a2b',
};

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
      p.lean = -[0.45, 0.35, 0.2][i]!;
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

function seg(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = w + 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function limb(ctx: CanvasRenderingContext2D, x: number, y: number, a: [number, number], l1: number, l2: number, w: number, color: string, endColor: string): [number, number] {
  const kx = x + Math.sin(a[0]) * l1;
  const ky = y + Math.cos(a[0]) * l1;
  const ex = kx + Math.sin(a[0] + a[1]) * l2;
  const ey = ky + Math.cos(a[0] + a[1]) * l2;
  seg(ctx, x, y, kx, ky, w, color);
  seg(ctx, kx, ky, ex, ey, w - 0.5, endColor);
  return [ex, ey];
}

/** Draw one frame with its cell's top-left at (ox, oy). */
export function drawAren(ctx: CanvasRenderingContext2D, name: AnimName, i: number, n: number, ox: number, oy: number): void {
  const p = poseFor(name, i, n);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, FRAME_W, FRAME_H);
  ctx.clip();
  ctx.translate(ox, oy);

  // whole-body rotation around the hip; collapse/rolls
  const hipX = 32;
  const hipY = 41 + p.bob;
  ctx.translate(hipX, hipY);
  ctx.rotate(p.rot);
  ctx.translate(-hipX, -hipY);

  const shX = hipX + Math.sin(p.lean) * 14;
  const shY = hipY - Math.cos(p.lean) * 14;
  const hdX = shX + Math.sin(p.lean) * 8;
  const hdY = shY - Math.cos(p.lean) * 8 - 1;

  // aura behind everything (skill)
  if (p.aura && p.aura > 0) {
    const g = ctx.createRadialGradient(32, 36, 4, 32, 36, 30);
    g.addColorStop(0, `rgba(255,224,130,${0.55 * p.aura})`);
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 36, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  // cape
  const sway = p.cape;
  ctx.fillStyle = C.cloak;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(shX - 1, shY - 1);
  ctx.quadraticCurveTo(shX - 6 - sway * 8, shY + 10, shX - 10 - sway * 13, shY + 20 - sway * 7);
  ctx.lineTo(shX - 3 - sway * 7, shY + 22 - sway * 4);
  ctx.quadraticCurveTo(shX + 1, shY + 12, shX + 3, shY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.cloakDark;
  ctx.beginPath();
  ctx.moveTo(shX - 3, shY + 6);
  ctx.quadraticCurveTo(shX - 7 - sway * 8, shY + 14, shX - 10 - sway * 13, shY + 20 - sway * 7);
  ctx.lineTo(shX - 6 - sway * 9, shY + 21 - sway * 5);
  ctx.closePath();
  ctx.fill();

  // back arm + back leg
  limb(ctx, shX, shY + 2, p.armB, 8, 8, 4.5, C.tunic, C.skin);
  limb(ctx, hipX - 1, hipY, p.legB, 11, 11, 5.5, C.pants, C.boots);

  // torso
  ctx.save();
  ctx.translate(hipX, hipY);
  ctx.rotate(p.lean);
  ctx.fillStyle = C.tunic;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.5;
  roundRect(ctx, -6, -15, 12, 17, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.trim; // belt
  ctx.fillRect(-6, -2, 12, 3);
  ctx.fillRect(-1, -15, 2, 13);
  ctx.restore();

  // head
  ctx.fillStyle = C.skin;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(hdX, hdY, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.arc(hdX - 0.5, hdY - 1.5, 6.4, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  ctx.fillRect(hdX - 7, hdY - 2, 4, 6); // hair back
  ctx.fillStyle = name === 'dead' ? C.outline : '#1a110c';
  ctx.fillRect(hdX + 2, hdY - 0.5, 2, 2); // eye
  // scarf
  ctx.fillStyle = C.cloak;
  ctx.fillRect(shX - 4, shY - 3, 8, 3);

  // front leg
  limb(ctx, hipX + 1, hipY, p.legF, 11, 11, 5.5, C.pants, C.boots);

  // front arm + sword
  const hand = limb(ctx, shX, shY + 2, p.armF, 8, 8, 4.5, C.tunic, C.skin);
  if (!p.hideSword) drawSword(ctx, hand[0], hand[1], p.sword);
  else drawSwordSheathed(ctx, hipX, hipY);

  // slash trail
  if (p.trail) {
    const t = p.trail;
    const col = t.color ?? 'rgba(235,242,250,';
    ctx.save();
    ctx.translate(hand[0] - Math.sin(p.sword) * 2, hand[1] - Math.cos(p.sword) * 2);
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `${col}${(t.alpha * (1 - k * 0.3)).toFixed(2)})`;
      ctx.lineWidth = 5 - k * 1.6;
      ctx.beginPath();
      // Convert convention (0=down, +x forward) to canvas angles: canvasAngle = PI/2 - a
      ctx.arc(0, 0, t.r - k * 3, Math.PI / 2 - t.from, Math.PI / 2 - t.to, t.from < t.to);
      ctx.stroke();
    }
    ctx.restore();
  }

  // burst (skill / heavy impact)
  if (p.burst && p.burst > 0) {
    ctx.strokeStyle = `rgba(255,220,120,${(1 - p.burst).toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(32 + 12, 56, 10 + p.burst * 22, 3 + p.burst * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // hit flash
  if (p.flash > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${p.flash})`;
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function drawSword(ctx: CanvasRenderingContext2D, x: number, y: number, a: number): void {
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  // grip + guard
  seg(ctx, x - dx * 3, y - dy * 3, x + dx * 1, y + dy * 1, 3, C.grip);
  const gx = x + dx * 1;
  const gy = y + dy * 1;
  seg(ctx, gx - dy * 4, gy + dx * 4, gx + dy * 4, gy - dx * 4, 2.5, C.trim);
  seg(ctx, gx, gy, gx + dx * 20, gy + dy * 20, 3, C.steel);
  seg(ctx, gx + dx * 3, gy + dy * 3, gx + dx * 19, gy + dy * 19, 1, C.steelDark);
}

function drawSwordSheathed(ctx: CanvasRenderingContext2D, hx: number, hy: number): void {
  seg(ctx, hx - 4, hy - 2, hx - 12, hy + 8, 3, C.steelDark);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
