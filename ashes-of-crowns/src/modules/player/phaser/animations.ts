import type { PlayerState } from '../core/types';

/**
 * Animation table. Frame names in the texture/atlas are `${name}_${index}` (0-based).
 * To replace the procedural art with a hand-drawn atlas, provide an atlas with the same frame
 * names and pass its key as `textureKey` to the Player (see README).
 */
export interface AnimDef {
  name: AnimName;
  frames: number;
  frameRate: number;
  loop: boolean;
}

export type AnimName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'doubleJump'
  | 'fall'
  | 'land'
  | 'attack0'
  | 'attack1'
  | 'attack2'
  | 'heavy'
  | 'skill'
  | 'dodge'
  | 'block'
  | 'hit'
  | 'dead';

export const ANIM_DEFS: ReadonlyArray<AnimDef> = [
  // Denser pose sampling gives movement arcs and attack anticipation smoother timing.
  { name: 'idle', frames: 12, frameRate: 12, loop: true },
  { name: 'walk', frames: 12, frameRate: 16, loop: true },
  { name: 'run', frames: 12, frameRate: 24, loop: true },
  { name: 'jump', frames: 6, frameRate: 18, loop: false },
  { name: 'doubleJump', frames: 8, frameRate: 24, loop: false },
  { name: 'fall', frames: 6, frameRate: 15, loop: true },
  { name: 'land', frames: 6, frameRate: 26, loop: false },
  { name: 'attack0', frames: 8, frameRate: 22, loop: false },
  { name: 'attack1', frames: 8, frameRate: 22, loop: false },
  { name: 'attack2', frames: 10, frameRate: 20, loop: false },
  { name: 'heavy', frames: 12, frameRate: 16, loop: false },
  { name: 'skill', frames: 12, frameRate: 16, loop: false },
  { name: 'dodge', frames: 10, frameRate: 28, loop: false },
  { name: 'block', frames: 6, frameRate: 17, loop: false },
  { name: 'hit', frames: 5, frameRate: 15, loop: false },
  { name: 'dead', frames: 12, frameRate: 12, loop: false },
];

export const FRAME_W = 64;
export const FRAME_H = 64;
export const SHEET_COLUMNS = 12;

/** Resolve the animation to play for a state (+ combo step for attacks). */
export function animForState(state: PlayerState, comboIndex: number): AnimName {
  switch (state) {
    case 'attack':
      return (`attack${Math.min(2, Math.max(0, comboIndex))}`) as AnimName;
    case 'heavyAttack':
      return 'heavy';
    default:
      return state as AnimName;
  }
}

export function animKey(prefix: string, name: AnimName): string {
  return `${prefix}:${name}`;
}
