import Phaser from 'phaser';
import { ANIM_DEFS, FRAME_H, FRAME_W, animKey } from './animations';
import { renderSheet, sheetLayout } from './ArenSprite';

export const DEFAULT_TEXTURE_KEY = 'aren';

/**
 * Creates (once per game) the procedural Aren texture and registers every animation.
 * If `textureKey` already exists in the texture manager (e.g. a hand-drawn atlas loaded by the
 * boot scene) it is reused as-is, as long as it provides frames named `${anim}_${index}`.
 */
export function ensureAnimations(scene: Phaser.Scene, textureKey = DEFAULT_TEXTURE_KEY): void {
  if (!scene.textures.exists(textureKey)) {
    const { rects, width, height } = sheetLayout();
    // Render at half resolution and upscale with nearest-neighbour sampling.
    const lowRes = document.createElement('canvas');
    lowRes.width = width / 2;
    lowRes.height = height / 2;
    const lowContext = lowRes.getContext('2d');
    if (!lowContext) throw new Error('[player] could not create low-resolution canvas');
    lowContext.imageSmoothingEnabled = false;
    lowContext.scale(0.5, 0.5);
    renderSheet(lowContext);
    const tex = scene.textures.createCanvas(textureKey, width, height);
    if (!tex) throw new Error('[player] could not create canvas texture');
    const context = tex.getContext();
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.drawImage(lowRes, 0, 0, width, height);
    for (const r of rects) tex.add(r.name, 0, r.x, r.y, FRAME_W, FRAME_H);
    tex.refresh();
    lowRes.width = 1;
    lowRes.height = 1;
  }
  for (const def of ANIM_DEFS) {
    const key = animKey(textureKey, def.name);
    if (scene.anims.exists(key)) continue;
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < def.frames; i++) frames.push({ key: textureKey, frame: `${def.name}_${i}` });
    scene.anims.create({ key, frames, frameRate: def.frameRate, repeat: def.loop ? -1 : 0 });
  }
}
