import { Px, ramp, upscale } from './px';

/** Small, crisp pixel-art cast for the opening sequence. Kept separate from gameplay actors. */
export type CourtRole = 'king' | 'guard';

export function paintCourtActor(role: CourtRole): HTMLCanvasElement {
  const px = new Px(48, 64);
  const skin = ramp('#c58f70');
  const robe = ramp(role === 'king' ? '#542b3a' : '#343b48');
  const metal = ramp(role === 'king' ? '#9b794c' : '#8795a2');
  const leather = ramp('#392a29');
  const gold = ramp('#d7ad62');
  const shadow: [number, number, number] = [24, 16, 24];

  // Boots and lower silhouette.
  px.rect(14, 53, 8, 8, leather[2], 1);
  px.rect(27, 53, 8, 8, leather[2], 1);
  px.poly([[11, 28], [37, 28], [42, 59], [7, 59]], robe[2], 2);
  px.poly([[22, 30], [27, 30], [31, 58], [24, 56]], robe[3], 2);
  px.line(10, 34, 6, 56, robe[1], 3, 2);
  px.line(38, 34, 42, 56, robe[1], 3, 2);

  // Arms, hands and chest plate.
  px.line(13, 31, 8, 45, robe[2], 5, 2);
  px.line(35, 31, 40, 45, robe[2], 5, 2);
  px.disc(8, 46, 3, skin[2], 3);
  px.disc(40, 46, 3, skin[2], 3);
  px.poly([[16, 25], [32, 25], [36, 40], [24, 44], [12, 40]], metal[2], 4);
  px.hline(17, 27, 14, metal[4], 4);
  px.line(24, 28, 24, 41, gold[2], 5);
  px.disc(24, 34, 3, gold[3], 5);

  // Face and hair / helmet.
  px.rect(18, 11, 12, 15, skin[2], 6);
  px.set(21, 18, shadow, 7);
  px.set(27, 18, shadow, 7);
  px.hline(22, 22, 5, skin[0], 6);
  if (role === 'king') {
    px.poly([[16, 14], [17, 6], [21, 10], [24, 2], [28, 10], [32, 6], [33, 15]], gold[2], 8);
    px.hline(17, 14, 16, gold[4], 8);
    px.rect(22, 8, 4, 3, [154, 58, 65], 9);
    px.line(19, 25, 29, 25, robe[0], 3, 2);
    px.poly([[10, 28], [15, 25], [18, 37], [12, 45]], robe[1], 2);
    px.poly([[38, 28], [33, 25], [30, 37], [36, 45]], robe[1], 2);
  } else {
    px.poly([[15, 16], [15, 8], [19, 5], [29, 5], [33, 9], [33, 16], [29, 13], [19, 13]], metal[2], 8);
    px.hline(18, 14, 12, metal[4], 8);
    px.rect(22, 17, 4, 2, [28, 34, 43], 9);
    px.line(35, 29, 42, 55, metal[1], 2, 8);
    px.line(39, 27, 45, 27, gold[2], 2, 8);
    px.poly([[12, 31], [6, 34], [8, 45], [16, 43]], metal[1], 8);
  }

  px.edgeLight(0.24, 0.28);
  px.outline(0.8);
  return upscale(px.toCanvas(), 2);
}
