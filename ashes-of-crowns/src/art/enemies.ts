import { Px, ramp, shade, hex, rng, type RGB } from './px';

/**
 * Enemy pixel art. Every archetype is built from the same ingredients (a tinted ramp, glowing
 * eyes, a cast shadow) and finished by the shared edge-light + outline passes so the whole
 * bestiary reads as one family. Creatures face right (+x).
 */

export const ENEMY_TYPES = ['ash_wolf','crown_soldier','thornling','rook_bandit','sand_scorpion','dune_raider','glass_serpent','sand_wraith','frost_wolf','ice_wraith','crown_scout','ironwatch_guard','crossbow_sentry','hushed_guard','hollow_shade','royal_champion','cellar_rat_swarm','sickened_stag','sergeant_hobb','thornwarden','sandglass_colossus','captain_voss','hush_mother_vesk','chancellor_morrow'] as const;
export const ENEMY_COLORS = [0x9b7561,0x9dabb8,0x65945d,0x8e7657,0xb78b49,0xa97943,0x6eabb0,0xc6b98e,0x8ab5c8,0x9bd8e5,0x8e9c9e,0x737b83,0x9c8a73,0x777b91,0x77718f,0xb99b65,0x82766b,0x786e60,0x965d4d,0x6c8b4d,0xb39b62,0x7898b4,0x8070a8,0x9b6574];

const toRgb = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const IRON = ramp('#59606a');
const LEATHER = ramp('#4a3829');
const BONE = ramp('#d8ccb0');
const T = { body: 1, armor: 2, dark: 3, light: 4, glow: 5, weapon: 6, cloth: 7, extra: 8 };

function glowEye(px: Px, x: number, y: number, c: RGB): void {
  px.set(x, y, c, T.glow); px.set(x + 1, y, c, T.glow);
  px.blend(x - 1, y, c, 0.35); px.blend(x + 2, y, c, 0.35); px.blend(x, y - 1, c, 0.3); px.blend(x, y + 1, c, 0.3);
}

function shadowFor(px: Px, cx: number, y: number, rx: number): void {
  for (let j = -2; j <= 2; j++) for (let i = -rx; i <= rx; i++) {
    if ((i * i) / (rx * rx) + (j * j) / 6 <= 1) px.blend(cx + i, y + j, [5, 4, 8], 0.4);
  }
}

function humanoid(px: Px, w: number, h: number, type: string, c: RGB, boss: boolean): void {
  const R = ramp(c);
  const cx = w >> 1, s = boss ? 1.55 : 1;
  const accent: RGB = type.includes('hollow') || type.includes('hushed') || type.includes('hush') ? [186, 150, 255] : type.includes('frost') || type.includes('ice') ? [160, 230, 255] : [255, 200, 110];
  const ground = h - 4;
  const hipY = Math.round(ground - 22 * s), shY = Math.round(hipY - 16 * s), headY = Math.round(shY - 8 * s);
  // Cloak/tabard behind.
  px.poly([[cx - 12 * s, shY], [cx + 4 * s, shY + 2], [cx + 6 * s, ground - 2], [cx - 18 * s, ground - 2]], R[1], T.cloth);
  // Legs (greaves) and boots.
  for (const side of [-1, 1]) {
    const lx = cx + side * 5 * s;
    px.line(lx, hipY, lx + side * 1, ground - 3, side < 0 ? IRON[1] : IRON[2], Math.max(4, 5 * s), T.armor);
    px.rect(Math.round(lx - 3 * s), ground - 3, Math.round(8 * s), 3, LEATHER[0], T.dark);
  }
  // Torso plate.
  px.poly([[cx - 8 * s, shY], [cx + 8 * s, shY], [cx + 6 * s, hipY + 2], [cx - 6 * s, hipY + 2]], R[2], T.armor);
  px.poly([[cx, shY + 2], [cx + 5 * s, shY + 8 * s], [cx, hipY - 2], [cx - 5 * s, shY + 8 * s]], R[3], T.light);
  px.rect(Math.round(cx - 7 * s), hipY - 1, Math.round(14 * s), 3, LEATHER[1], T.dark);
  // Emblem gem.
  px.disc(cx, shY + 7 * s, boss ? 2.6 : 1.6, accent, T.glow);
  // Pauldrons.
  px.ellipse(cx - 9 * s, shY + 2, 5 * s, 3.5 * s, IRON[2], T.armor);
  px.ellipse(cx + 9 * s, shY + 2, 5 * s, 3.5 * s, IRON[3], T.armor);
  // Head + helm.
  px.disc(cx + 1, headY, 6.4 * s, IRON[2], T.armor);
  px.rect(Math.round(cx - 4 * s), Math.round(headY - 1), Math.round(10 * s), 3, [18, 12, 18], T.dark);
  glowEye(px, Math.round(cx + 2 * s), Math.round(headY), accent);
  if (type.includes('royal') || type.includes('captain') || type.includes('chancellor') || type.includes('sergeant')) {
    // Crest / crown spikes.
    for (let k = -2; k <= 2; k++) px.line(cx + k * 3 * s, headY - 5 * s, cx + k * 3.4 * s, headY - (9 + (2 - Math.abs(k))) * s, accent, 1, T.glow);
  } else if (type.includes('soldier') || type.includes('guard') || type.includes('scout')) {
    px.line(cx + 1, headY - 6 * s, cx - 4 * s, headY - 11 * s, R[3], 2, T.cloth); // plume
  }
  // Weapon arm: spear / sword / crossbow.
  const hx = cx + 12 * s, hy = shY + 8 * s;
  px.line(cx + 6 * s, shY + 3, hx, hy, R[1], 4, T.cloth);
  if (type.includes('crossbow')) {
    px.line(hx - 4, hy, hx + 14 * s, hy - 2, LEATHER[2], 3, T.weapon);
    px.line(hx + 10 * s, hy - 8 * s, hx + 10 * s, hy + 8 * s, BONE[2], 1, T.weapon);
  } else if (type.includes('scout') || type.includes('bandit') || type.includes('raider')) {
    px.line(hx, hy + 10 * s, hx + 4 * s, hy - 26 * s, LEATHER[2], 2, T.weapon);
    px.poly([[hx + 4 * s, hy - 26 * s], [hx + 7 * s, hy - 32 * s], [hx + 9 * s, hy - 25 * s]], BONE[3], T.weapon);
  } else {
    px.line(hx, hy, hx + 7 * s, hy + 16 * s, IRON[3], boss ? 4 : 3, T.weapon);
    px.line(hx - 3 * s, hy + 1, hx + 4 * s, hy - 1, accent, 2, T.glow);
  }
  // Off arm with round shield for guards.
  if (type.includes('guard') || type.includes('soldier') || type.includes('champion') || boss) {
    px.disc(cx - 11 * s, shY + 12 * s, 6.5 * s, IRON[1], T.armor);
    px.disc(cx - 11 * s, shY + 12 * s, 3 * s, R[3], T.light);
  }
  if (boss) {
    // Boss crown halo and shoulder spikes.
    px.line(cx - 13 * s, shY - 2, cx - 19 * s, shY - 10, accent, 2, T.glow);
    px.line(cx + 13 * s, shY - 2, cx + 19 * s, shY - 10, accent, 2, T.glow);
  }
}

function beast(px: Px, w: number, h: number, type: string, c: RGB, boss: boolean): void {
  const R = ramp(c), cx = w >> 1;
  const frost = type.includes('frost'), stag = type.includes('stag');
  const eye: RGB = frost ? [190, 245, 255] : [255, 190, 100];
  const g = h - 5, bw = boss ? 34 : 24, by = g - 22;
  // Legs.
  for (const [lx, c2] of [[-bw * 0.7, R[1]], [-bw * 0.35, R[2]], [bw * 0.35, R[1]], [bw * 0.7, R[2]]] as Array<[number, RGB]>) {
    px.line(cx + lx, by + 6, cx + lx + (lx > 0 ? 3 : -2), g, c2, 5, T.dark);
    px.rect(Math.round(cx + lx) - 2, g - 2, 7, 3, R[0], T.dark);
  }
  // Torso, haunch and tail.
  px.ellipse(cx - 2, by, bw, 13, R[2], T.body);
  px.ellipse(cx - bw * 0.55, by + 1, bw * 0.45, 12, R[1], T.dark);
  px.ellipse(cx - 4, by - 7, bw * 0.8, 6, R[3], T.light);
  px.line(cx - bw, by - 2, cx - bw - 14, by - 14, R[1], 5, T.dark);
  // Neck, head, muzzle.
  px.line(cx + bw * 0.7, by - 4, cx + bw * 0.95, by - 14, R[2], 11, T.body);
  px.ellipse(cx + bw + 3, by - 16, 11, 9, R[2], T.body);
  px.ellipse(cx + bw + 13, by - 13, 8, 5, R[3], T.light);
  px.set(cx + bw + 19, by - 14, [16, 10, 16], T.dark);
  px.line(cx + bw + 9, by - 10, cx + bw + 17, by - 9, BONE[3], 1, T.light);
  glowEye(px, cx + bw + 6, by - 18, eye);
  if (stag) {
    for (const [dx, tx] of [[0, -8], [6, 6]]) {
      px.line(cx + bw + dx, by - 24, cx + bw + tx, by - 40, BONE[2], 2, T.light);
      px.line(cx + bw + tx / 2 + dx / 2, by - 32, cx + bw + tx - 8, by - 40, BONE[3], 1, T.light);
      px.line(cx + bw + tx / 2 + dx / 2, by - 32, cx + bw + tx + 8, by - 38, BONE[3], 1, T.light);
    }
  } else {
    px.poly([[cx + bw - 1, by - 22], [cx + bw + 1, by - 34], [cx + bw + 7, by - 23]], R[1], T.dark);
    px.poly([[cx + bw + 9, by - 22], [cx + bw + 15, by - 32], [cx + bw + 14, by - 21]], R[1], T.dark);
  }
  // Spine fur flecks.
  const r = rng(7);
  for (let i = 0; i < 14; i++) px.set(Math.round(cx - bw + r() * bw * 1.7), Math.round(by - 10 - r() * 3), R[4], T.light);
}

function scorpion(px: Px, w: number, h: number, c: RGB): void {
  const R = ramp(c), cx = w >> 1, g = h - 5, y = g - 15;
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
    const lx = cx + side * (6 + k * 2);
    px.line(lx, y + 4, lx + side * (10 + k * 3), g - 1 + k * 0.5, R[1], 3, T.dark);
  }
  px.ellipse(cx, y, 20, 11, R[2], T.body);
  for (let s = 0; s < 4; s++) px.ellipse(cx - 8 + s * 6, y - 2, 3, 8 - s, R[3], T.light);
  // Tail arching over the back.
  const pts: Array<[number, number]> = [[cx - 18, y - 2], [cx - 28, y - 14], [cx - 26, y - 30], [cx - 14, y - 40], [cx - 4, y - 36]];
  for (let i = 0; i < pts.length - 1; i++) px.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i % 2 ? R[2] : R[3], 6 - i, T.body);
  px.poly([[cx - 4, y - 36], [cx + 2, y - 28], [cx - 8, y - 30]], [235, 220, 160], T.light);
  // Claws.
  for (const dy of [-6, 6]) {
    px.line(cx + 16, y + dy * 0.4, cx + 28, y + dy, R[2], 4, T.body);
    px.ellipse(cx + 31, y + dy, 6, 4, R[3], T.light);
    px.line(cx + 33, y + dy, cx + 37, y + dy + (dy < 0 ? -2 : 2), BONE[2], 2, T.light);
  }
  glowEye(px, cx + 14, y - 5, [255, 210, 120]);
}

function serpent(px: Px, w: number, h: number, c: RGB): void {
  const R = ramp(c), g = h - 5, ox = (w - 64) >> 1;
  for (let s = 0; s < 8; s++) {
    const x = ox + 8 + s * 6, y = g - 12 - Math.sin(s * 0.9) * 9 - s * 1.5, r = 6.5 - s * 0.35;
    px.disc(x, y, r, s % 2 ? R[2] : R[3], T.body);
    px.disc(x - 1, y - 2, r * 0.45, R[4], T.light);
  }
  const hx = ox + 8 + 8 * 6, hy = g - 36;
  px.poly([[hx - 5, hy + 5], [hx + 4, hy - 8], [hx + 14, hy + 1], [hx + 10, hy + 7]], R[3], T.light);
  px.line(hx + 10, hy + 4, hx + 18, hy + 7, [230, 80, 80], 1, T.glow); // tongue
  px.line(hx + 7, hy + 4, hx + 8, hy + 10, BONE[3], 1, T.light);
  glowEye(px, hx + 4, hy, [255, 235, 160]);
}

function wraith(px: Px, w: number, h: number, type: string, c: RGB, boss: boolean): void {
  const R = ramp(c), cx = w >> 1, s = boss ? 1.5 : 1;
  const eye: RGB = type.includes('ice') ? [150, 240, 255] : [200, 160, 255];
  // Tattered robe tapering to wisps.
  const top = Math.round(10 * s), bot = h - 4;
  px.poly([[cx - 10 * s, top + 12 * s], [cx + 10 * s, top + 12 * s], [cx + 17 * s, bot - 20 * s], [cx + 9 * s, bot - 4], [cx + 3 * s, bot - 14 * s], [cx - 4 * s, bot], [cx - 10 * s, bot - 12 * s], [cx - 17 * s, bot - 22 * s]], R[2], T.cloth);
  px.stipple(cx - 18 * s, top, 36 * s, bot, R[1], 0.4, T.cloth);
  px.disc(cx, top + 8 * s, 8 * s, R[0], T.dark);
  px.poly([[cx - 9 * s, top + 8 * s], [cx, top - 6 * s], [cx + 9 * s, top + 8 * s]], R[1], T.cloth);
  glowEye(px, Math.round(cx - 4 * s), top + Math.round(8 * s), eye); glowEye(px, Math.round(cx + 3 * s), top + Math.round(8 * s), eye);
  // Reaching arms.
  px.line(cx - 8 * s, top + 16 * s, cx - 20 * s, top + 28 * s, R[3], 3, T.light);
  px.line(cx + 8 * s, top + 16 * s, cx + 20 * s, top + 26 * s, R[3], 3, T.light);
  const r = rng(3);
  for (let i = 0; i < 10; i++) px.blend(Math.round(cx + (r() - 0.5) * 40 * s), Math.round(bot - r() * 30), eye, 0.35);
}

function plant(px: Px, w: number, h: number, c: RGB, boss: boolean): void {
  const R = ramp(c), cx = w >> 1, g = h - 4, s = boss ? 1.5 : 1;
  px.line(cx - 8 * s, g, cx - 4 * s, g - 30 * s, R[1], 7 * s, T.dark);
  px.line(cx + 8 * s, g, cx + 4 * s, g - 30 * s, R[2], 7 * s, T.body);
  px.ellipse(cx, g - 32 * s, 12 * s, 16 * s, R[2], T.body);
  for (let k = 0; k < 6; k++) {
    const y = g - 12 * s - k * 6 * s, side = k % 2 ? 1 : -1;
    px.poly([[cx + side * 8 * s, y], [cx + side * 22 * s, y - 7 * s], [cx + side * 12 * s, y + 5 * s]], R[3], T.light);
  }
  px.disc(cx, g - 48 * s, 9 * s, R[1], T.dark);
  px.line(cx - 6 * s, g - 54 * s, cx - 14 * s, g - 66 * s, R[3], 3, T.light);
  px.line(cx + 6 * s, g - 54 * s, cx + 14 * s, g - 66 * s, R[3], 3, T.light);
  glowEye(px, cx - 5, Math.round(g - 48 * s), [200, 255, 140]); glowEye(px, cx + 3, Math.round(g - 48 * s), [200, 255, 140]);
}

function ratSwarm(px: Px, w: number, h: number, c: RGB): void {
  const R = ramp(c), g = h - 5, ox = (w - 64) >> 1;
  for (let k = 0; k < 6; k++) {
    const x = ox + 12 + (k % 3) * 19, y = g - 6 - Math.floor(k / 3) * 14;
    px.ellipse(x, y, 9, 5, R[2], T.body);
    px.ellipse(x + 7, y - 2, 4, 3, R[3], T.light);
    px.line(x - 8, y + 1, x - 17, y + 6, [168, 130, 120], 1, T.extra);
    px.disc(x + 5, y - 5, 1.6, R[3], T.light);
    glowEye(px, x + 8, y - 3, [255, 70, 60]);
  }
}

export function paintEnemy(type: string, w: number, h: number, color: number): Px {
  const px = new Px(w, h);
  const c = toRgb(color);
  const boss = ENEMY_TYPES.indexOf(type as any) >= 18;
  const art = new Px(w, h);
  if (type.includes('serpent')) serpent(art, w, h, c);
  else if (type.includes('scorpion')) scorpion(art, w, h, c);
  else if (type.includes('wolf') || type.includes('stag')) beast(art, w, h, type, c, boss);
  else if (type.includes('wraith') || type.includes('shade') || type.includes('hush_mother')) wraith(art, w, h, type, c, boss);
  else if (type.includes('rat_swarm')) ratSwarm(art, w, h, c);
  else if (type.includes('thorn')) plant(art, w, h, c, boss);
  else humanoid(art, w, h, type, c, boss);
  art.edgeLight(0.24, 0.3, [T.glow]);
  art.outline(0.85);
  shadowFor(px, w >> 1, h - 2, Math.round(w * 0.36));
  px.blit(art, 0, 0);
  if (boss) {
    // Ember rim to make major foes pop against the background.
    const r = rng(11);
    for (let i = 0; i < 18; i++) px.blend(Math.round(r() * w), Math.round(h * 0.15 + r() * h * 0.7), shade(hex('#ffb866'), 0.1), 0.35);
  }
  return px;
}

/** Ember-orb projectile (18×18). */
export function paintProjectile(): Px {
  const px = new Px(18, 18);
  for (let r = 8; r >= 2; r--) px.disc(9, 9, r, r > 5 ? [150, 60, 40] : r > 3 ? [255, 150, 70] : [255, 214, 140]);
  for (let i = 0; i < px.d.length; i += 4) if (px.d[i + 3]) px.d[i + 3] = Math.round(255 * Math.min(1, 0.45 + (1 - Math.hypot(((i / 4) % 18) - 9, Math.floor(i / 72) - 9) / 9)));
  px.set(7, 7, [255, 255, 255]); px.set(8, 7, [255, 245, 220]);
  return px;
}
