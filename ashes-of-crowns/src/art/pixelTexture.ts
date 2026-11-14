import type Phaser from 'phaser';

/** Phaser FilterMode.NEAREST (kept as a literal so art code needs no runtime Phaser import). */
export const NEAREST = 1;

/** Register a canvas as a texture and force nearest-neighbour sampling so pixel art never blurs. */
export function addPixelCanvas(textures: Phaser.Textures.TextureManager, key: string, canvas: HTMLCanvasElement): Phaser.Textures.CanvasTexture | null {
  const tex = textures.addCanvas(key, canvas);
  tex?.setFilter(NEAREST);
  return tex;
}
