// Edge-clip audit: reports enemies whose opaque pixels touch the canvas border (they would be cut off in game).
import { ENEMY_TYPES, ENEMY_COLORS, paintEnemy } from '../../src/art/enemies';
const rows: string[] = [];
ENEMY_TYPES.forEach((t, i) => {
  const boss = i >= 18, wide = /wolf|stag|scorpion|serpent|rat_swarm/.test(t), w = boss ? 128 : wide ? 96 : 64, h = boss ? 128 : 78;
  const px = paintEnemy(t, w, h, ENEMY_COLORS[i]);
  let l = 0, r = 0, tp = 0;
  for (let y = 0; y < h; y++) { if (px.alphaAt(0, y) > 40) l++; if (px.alphaAt(w - 1, y) > 40) r++; }
  for (let x = 0; x < w; x++) if (px.alphaAt(x, 0) > 40) tp++;
  if (l || r || tp) rows.push(`${t}: left=${l} right=${r} top=${tp}`);
});
console.log('CLIPPED:', rows.length ? '\n' + rows.join('\n') : 'none');
(window as any).__ready = true;
