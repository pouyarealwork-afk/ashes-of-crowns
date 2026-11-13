import { Px, hex, ramp, shade, mix, type RGB } from './px';
import type { Pose } from '../modules/player/phaser/ArenSprite';

/**
 * Aren, rebuilt as true pixel art: every limb, plate and cloth fold is placed on a 64×64 grid with
 * hard pixels, then run through edge lighting and a selective outline.
 *
 * Angle convention (shared with the pose table): 0 = straight down, +x = forward (right).
 */

// Material tags (used by Px.edgeLight to separate overlapping parts).
const T = { skin: 1, hair: 2, cloth: 3, metal: 4, leather: 5, cloak: 6, pants: 7, boots: 8, blade: 9, gold: 10, scarf: 11 };

const PAL = {
  skin: ramp('#dba57c'),
  hair: ramp('#33221f'),
  cloth: ramp('#4d3d35'),
  metal: ramp('#a9b4be'),
  leather: ramp('#5c4331'),
  cloak: ramp('#8c2f34'),
  pants: ramp('#383843'),
  boots: ramp('#2d231d'),
  blade: ramp('#d9e1e8'),
  gold: ramp('#d6ab5a'),
};

function tip(angle: number, len: number, x: number, y: number): [number, number] {
  return [x + Math.sin(angle) * len, y + Math.cos(angle) * len];
}

/** Two-segment limb: returns the end point. */
function limb(
  px: Px, x: number, y: number, a: [number, number], l1: number, l2: number,
  w1: number, w2: number, c1: RGB, c2: RGB, t1: number, t2: number,
): [number, number] {
  const k = tip(a[0], l1, x, y);
  const e = tip(a[0] + a[1], l2, k[0], k[1]);
  px.line(x, y, k[0], k[1], c1, w1, t1);
  px.line(k[0], k[1], e[0], e[1], c2, w2, t2);
  return e;
}

function blade(px: Px, x: number, y: number, a: number, long: number): void {
  const dx = Math.sin(a), dy = Math.cos(a);
  const nx = dy, ny = -dx; // perpendicular
  // Grip and pommel.
  px.line(x - dx * 4, y - dy * 4, x + dx * 0.5, y + dy * 0.5, PAL.leather[1], 2, T.leather);
  px.disc(x - dx * 5, y - dy * 5, 1.2, PAL.gold[2], T.gold);
  // Cross-guard.
  px.line(x + dx * 1 - nx * 3.5, y + dy * 1 - ny * 3.5, x + dx * 1 + nx * 3.5, y + dy * 1 + ny * 3.5, PAL.gold[2], 2, T.gold);
  // Tapered steel blade.
  const bx = x + dx * 2, by = y + dy * 2;
  const ex = bx + dx * long, ey = by + dy * long;
  px.poly([
    [bx - nx * 1.7, by - ny * 1.7], [bx + nx * 1.7, by + ny * 1.7],
    [ex + nx * 0.6, ey + ny * 0.6], [ex + dx * 2, ey + dy * 2], [ex - nx * 0.6, ey - ny * 0.6],
  ], PAL.blade[2], T.blade);
  px.line(bx + dx, by + dy, ex - dx * 1, ey - dy * 1, PAL.blade[4], 1, T.blade);
}

function sheathed(px: Px, hx: number, hy: number): void {
  px.line(hx - 3, hy - 2, hx - 12, hy + 9, PAL.leather[1], 3, T.leather);
  px.line(hx - 4, hy - 3, hx - 7, hy + 2, PAL.gold[2], 1, T.gold);
}

export function paintAren(pose: Pose, dead: boolean): Px {
  let body = new Px(64, 64);
  const hipX = 32;
  const hipY = Math.round(41 + pose.bob);
  const lean = pose.lean;
  const rot = (x: number, y: number): [number, number] => [x * Math.cos(lean) - y * Math.sin(lean) + hipX, x * Math.sin(lean) + y * Math.cos(lean) + hipY];
  const shX = hipX + Math.sin(lean) * 14;
  const shY = hipY - Math.cos(lean) * 14;
  const hdX = shX + Math.sin(lean) * 7;
  const hdY = shY - Math.cos(lean) * 7 - 1;
  const sway = pose.cape;

  // --- cloak: ragged crimson sheet that trails behind the shoulders.
  const c0: [number, number] = [shX - 1, shY - 1];
  const tipX = shX - 8 - sway * 14, tipY = shY + 20 - sway * 8;
  body.poly([
    c0, [shX + 3, shY + 2],
    [shX + 1, shY + 12], [shX - 3 - sway * 4, shY + 21],
    [shX - 6 - sway * 8, shY + 17 - sway * 5],
    [tipX + 2, tipY + 2], [tipX, tipY - 2],
    [shX - 8 - sway * 7, shY + 6],
  ], PAL.cloak[2], T.cloak);
  // Inner fold (darker) for volume.
  body.poly([
    [shX - 4, shY + 4], [shX - 2 - sway * 3, shY + 14], [shX - 5 - sway * 7, shY + 18 - sway * 4], [shX - 8 - sway * 8, shY + 8],
  ], PAL.cloak[1], T.cloak);

  // --- back arm and back leg (drawn behind the torso, a shade darker).
  limb(body, shX - 1, shY + 2, pose.armB, 7, 7, 3, 3, shade(PAL.cloth[1], -0.1), PAL.skin[1], T.cloth, T.skin);
  limb(body, hipX - 1, hipY, pose.legB, 11, 11, 4, 4, PAL.pants[1], PAL.boots[1], T.pants, T.boots);

  // --- torso: leather jerkin, belt and buckle.
  const tors: Array<[number, number]> = [rot(-5, 1), rot(-6, -13), rot(0, -15), rot(6, -13), rot(5, 1)];
  body.poly(tors, PAL.cloth[2], T.cloth);
  // Lower tassets.
  body.poly([rot(-5, 0), rot(5, 0), rot(6, 5), rot(0, 7), rot(-6, 5)], PAL.leather[2], T.leather);
  // Belt.
  const b0 = rot(-5.5, -2), b1 = rot(5.5, -2);
  body.line(b0[0], b0[1], b1[0], b1[1], PAL.leather[0], 2, T.leather);
  const buckle = rot(1, -2);
  body.rect(Math.round(buckle[0]) - 1, Math.round(buckle[1]) - 1, 3, 3, PAL.gold[3], T.gold);
  // Cross-strap with a stitched edge.
  const s0 = rot(-4, -13), s1 = rot(4, -3);
  body.line(s0[0], s0[1], s1[0], s1[1], PAL.leather[1], 2, T.leather);
  // Crest plate on the chest.
  const cr = rot(0, -9);
  body.poly([[cr[0], cr[1] - 3], [cr[0] + 2, cr[1]], [cr[0], cr[1] + 3], [cr[0] - 2, cr[1]]], PAL.gold[2], T.gold);
  body.set(Math.round(cr[0]), Math.round(cr[1]), PAL.cloak[1], T.cloak);

  // --- head.
  body.rect(Math.round(shX) - 1, Math.round(shY) - 3, 3, 3, PAL.skin[1], T.skin); // neck
  body.disc(hdX, hdY, 5, PAL.skin[2], T.skin);
  // Hair: cap, fringe and a ponytail that follows the cloak sway.
  body.poly([
    [hdX - 6, hdY + 1], [hdX - 5, hdY - 5], [hdX, hdY - 6.5], [hdX + 4, hdY - 5], [hdX + 5, hdY - 2],
    [hdX + 2, hdY - 3], [hdX - 1, hdY - 1.5], [hdX - 3, hdY + 1.5],
  ], PAL.hair[2], T.hair);
  body.line(hdX - 5, hdY - 3, hdX - 8 - sway * 4, hdY + 3 - sway * 2, PAL.hair[1], 2, T.hair);
  // Face: brow, eye and a small scar.
  body.set(Math.round(hdX + 2), Math.round(hdY - 1.5), PAL.hair[0], T.hair);
  body.set(Math.round(hdX + 2), Math.round(hdY), [244, 232, 212], T.skin);
  body.set(Math.round(hdX + 3), Math.round(hdY), dead ? PAL.hair[0] : [34, 22, 26], T.skin);
  body.set(Math.round(hdX + 3), Math.round(hdY + 2), PAL.skin[0], T.skin);
  // Scarf: crimson band at the neck with a tail streaming back.
  body.rect(Math.round(shX) - 3, Math.round(shY) - 3, 7, 3, PAL.cloak[3], T.scarf);
  body.line(shX - 3, shY - 2, shX - 7 - sway * 8, shY + 2 + sway * 2, PAL.cloak[3], 2, T.scarf);

  // --- steel pauldron on the sword shoulder, rimmed in gold.
  const pa = rot(1, -13);
  body.ellipse(pa[0] + 1, pa[1] + 1, 5, 3.5, PAL.metal[2], T.metal);
  body.hline(Math.round(pa[0]) - 3, Math.round(pa[1]) + 3, 8, PAL.gold[2], T.gold);

  // --- front leg, front arm and sword.
  limb(body, hipX + 1, hipY, pose.legF, 11, 11, 4, 4, PAL.pants[2], PAL.boots[2], T.pants, T.boots);
  const hand = limb(body, shX + 1, shY + 2, pose.armF, 7, 7, 3, 3, PAL.cloth[2], PAL.skin[2], T.cloth, T.skin);
  // Bracer.
  const bm = tip(pose.armF[0] + pose.armF[1], 3.5, tip(pose.armF[0], 7, shX + 1, shY + 2)[0], tip(pose.armF[0], 7, shX + 1, shY + 2)[1]);
  body.disc(bm[0], bm[1], 1.6, PAL.metal[1], T.metal);
  if (!pose.hideSword) blade(body, hand[0], hand[1], pose.sword, 21);
  else sheathed(body, hipX, hipY);

  if (pose.rot) body = body.rotated(pose.rot, hipX, hipY);

  // Finishing: volume lighting first, then the outline wraps the final silhouette.
  body.edgeLight(0.28, 0.34);
  body.outline(0.82);

  // --- effects composed around the finished body so they never get outlined.
  const out = new Px(64, 64);
  if (pose.aura && pose.aura > 0) {
    const a = Math.min(1, pose.aura);
    for (let r = 30; r >= 6; r -= 3) out.disc(32, 36, r, mix([255, 200, 90], [255, 244, 190], 1 - r / 30), 0);
    for (let i = 0; i < out.d.length; i += 4) if (out.d[i + 3]) out.d[i + 3] = Math.round(70 * a * (1 - (Math.hypot(((i / 4) % 64) - 32, Math.floor(i / 256) - 36) / 32)));
  }
  out.blit(body, 0, 0);

  if (pose.trail) {
    const t = pose.trail;
    const cx = hand[0] - Math.sin(pose.sword) * 2, cy = hand[1] - Math.cos(pose.sword) * 2;
    const col: RGB = t.color && t.color.includes('255,170') ? [255, 176, 84] : [232, 242, 252];
    const span = 36;
    for (let s = 0; s <= span; s++) {
      const u = s / span;
      const ang = t.from + (t.to - t.from) * u;
      const fade = (0.25 + 0.75 * u) * t.alpha;
      for (let rr = 0; rr < 3; rr++) {
        const r = t.r - rr * 2.2;
        out.blend(Math.round(cx + Math.sin(ang) * r), Math.round(cy + Math.cos(ang) * r), rr === 0 ? [255, 255, 255] : col, fade * (1 - rr * 0.3));
      }
    }
  }
  if (pose.burst && pose.burst > 0) {
    const k = pose.burst;
    const rx = 10 + k * 22, ry = 3 + k * 4;
    for (let s = 0; s < 80; s++) {
      const a = (s / 80) * Math.PI * 2;
      out.blend(Math.round(44 + Math.cos(a) * rx), Math.round(56 + Math.sin(a) * ry), [255, 222, 128], 1 - k);
    }
  }
  if (pose.flash > 0) out.tint([255, 255, 255], Math.min(1, pose.flash));
  return out;
}
