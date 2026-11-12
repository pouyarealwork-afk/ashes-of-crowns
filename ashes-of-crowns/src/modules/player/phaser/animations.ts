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
  { name: 'idle', frames: 6, frameRate: 7, loop: true },
  { name: 'walk', frames: 8, frameRate: 11, loop: true },
  { name: 'run', frames: 8, frameRate: 16, loop: true },
  { name: 'jump', frames: 3, frameRate: 12, loop: false },
  { name: 'doubleJump', frames: 6, frameRate: 18, loop: false },
  { name: 'fall', frames: 3, frameRate: 10, loop: true },
  { name: 'land', frames: 3, frameRate: 24, loop: false },
  { name: 'attack0', frames: 5, frameRate: 18, loop: false },
  { name: 'attack1', frames: 5, frameRate: 18, loop: false },
  { name: 'attack2', frames: 7, frameRate: 16, loop: false },
  { name: 'heavy', frames: 8, frameRate: 12, loop: false },
  { name: 'skill', frames: 8, frameRate: 12, loop: false },
  { name: 'dodge', frames: 6, frameRate: 22, loop: false },
  { name: 'block', frames: 3, frameRate: 14, loop: false },
  { name: 'hit', frames: 3, frameRate: 12, loop: false },
  { name: 'dead', frames: 8, frameRate: 9, loop: false },
];

export const FRAME_W = 64;
export const FRAME_H = 64;
export const SHEET_COLUMNS = 8;

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
