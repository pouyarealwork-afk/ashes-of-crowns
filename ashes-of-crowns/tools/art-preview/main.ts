// Contact-sheet harness: renders the pure-Canvas art modules in a real browser so they can be inspected.
import { ANIM_DEFS, FRAME_W, FRAME_H } from '../../src/modules/player/phaser/animations';
import { renderSheet, sheetLayout } from '../../src/modules/player/phaser/ArenSprite';
import { upscale, makeCanvas } from '../../src/art/px';
import { paintPlatform, paintSky, paintLayer, paintNpc, paintProp, paintShard } from '../../src/art/world';
import { ENEMY_TYPES, ENEMY_COLORS, paintEnemy } from '../../src/art/enemies';

const mode = new URLSearchParams(location.search).get('m') ?? 'aren';
const root = document.getElementById('root')!;

function add(c: HTMLCanvasElement, label?: string) {
  const wrap = document.createElement('div');
  if (label) { const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'color:#c9a66f;font:12px monospace;margin:6px 0 2px'; wrap.appendChild(l); }
  c.style.imageRendering = 'pixelated';
  wrap.appendChild(c);
  root.appendChild(wrap);
}

if (mode === 'aren') {
  const { width, height } = sheetLayout();
  const sheet = makeCanvas(width, height);
  const ctx = sheet.getContext('2d')!;
  renderSheet(ctx);
  // Show a bg + selected rows at 3x. Rows: one animation per row.
  const bg = makeCanvas(width, height);
  const b = bg.getContext('2d')!;
  b.fillStyle = '#2a2230'; b.fillRect(0, 0, width, height);
  b.drawImage(sheet, 0, 0);
  const maxCols = 12;
  const rows = ANIM_DEFS.length;
  void rows; void maxCols; void FRAME_W; void FRAME_H;
  add(upscale(bg, 2), 'Aren sheet x2 (rows = idle, walk, run, jump, doubleJump, fall, land, attack0-2, heavy, skill, dodge, block, hit, dead)');
}
if (mode === 'enemies') (async () => {
  const board = makeCanvas(1500, 520);
  const b = board.getContext('2d')!;
  b.fillStyle = '#2a2230'; b.fillRect(0, 0, 1500, 520);
  let x = 6, y = 4, rowH = 0;
  ENEMY_TYPES.forEach((t, i) => {
    const boss = i >= 18; const w = boss ? 112 : 64, h = boss ? 128 : 78;
    if (x + w + 6 > 1500) { x = 6; y += rowH + 4; rowH = 0; }
    b.drawImage(paintEnemy(t, w, h, ENEMY_COLORS[i]).toCanvas(), x, y);
    x += w + 6; rowH = Math.max(rowH, h);
  });
  add(upscale(board, 1), 'enemies x1');
  add(upscale(board, 2), 'x2');
  (window as any).__ready = true;
})(); else if (mode === 'world') {
  const regions: Array<[string, { sky: string; mid: string; fore: string }]> = [
    ['ashen_village', { sky: '#1c1722', mid: '#4a2f2f', fore: '#3a2a2b' }],
    ['whispering_forest', { sky: '#0f1a18', mid: '#27402f', fore: '#1d3324' }],
    ['forgotten_desert', { sky: '#241a22', mid: '#6b4a38', fore: '#4a3428' }],
    ['frozen_highlands', { sky: '#0f1822', mid: '#35566a', fore: '#24394a' }],
    ['hollow_city', { sky: '#150f1f', mid: '#3a2a55', fore: '#2a1f3d' }],
  ];
  const cv = makeCanvas(1280, 720 * regions.length / 2 + 40); void cv;
  regions.forEach(([name, a]) => {
    const c = makeCanvas(1280, 720); const g = c.getContext('2d')!;
    g.drawImage(paintSky(a, name), 0, 0);
    for (const d of [0, 1, 2] as const) g.drawImage(paintLayer(a, name, d), 0, 0);
    // a stretch of ground to judge the layers
    g.drawImage(paintPlatform('ground', 1280, 96), 0, 624);
    g.drawImage(paintNpc('kael', 0), 300, 560); g.drawImage(paintProp('well'), 500, 544); g.drawImage(paintProp('forge'), 640, 544);
    g.drawImage(paintProp('chest'), 780, 544); g.drawImage(paintProp('shrine'), 880, 544); g.drawImage(paintShard(), 1000, 580);
    add(upscale(c, 1), name);
  });
  const kinds = ['ground','stone','wood','ice','sand','crumble','oneway','vine','metal'];
  const strip = makeCanvas(1280, 120); const sg = strip.getContext('2d')!; sg.fillStyle = '#2a2230'; sg.fillRect(0, 0, 1280, 120);
  kinds.forEach((k, i) => sg.drawImage(paintPlatform(k, 130, k === 'oneway' ? 20 : 96), 6 + i * 140, 10));
  add(strip, 'platforms');
  (window as any).__ready = true;
} else if (mode === 'selftest') {
  const kinds = ['ground','stone','wood','ice','sand','crumble','oneway','vine','metal','unknown'];
  let bad = 0, n = 0;
  for (const k of kinds) for (const [w, h] of [[1, 1], [3, 5], [16, 16], [33, 17], [96, 24], [320, 96], [1000, 64], [2400, 120]]) {
    const c = paintPlatform(k, w, h); n++;
    if (c.width !== w || c.height !== h) { bad++; console.log('SIZE MISMATCH', k, w, h, c.width, c.height); }
  }
  for (const r of ['ashen_village','whispering_forest','forgotten_desert','frozen_highlands','hollow_city','crownfall']) for (const d of [0, 1, 2] as const) {
    const c = paintLayer({ sky: '#101820', mid: '#304050', fore: '#203040' }, r, d); n++;
    if (c.width !== 1280 || c.height !== 720) bad++;
  }
  for (const id of ['tamsin','kael','lyra','brom','hobb','marta','unknown']) { paintNpc(id, 0x665544); n++; }
  for (const k of ['well','forge','chest','shrine','generic'] as const) { paintProp(k); n++; }
  console.log('SELFTEST', n, 'assets,', bad, 'problems');
  (window as any).__ready = true;
} else (window as any).__ready = true;

