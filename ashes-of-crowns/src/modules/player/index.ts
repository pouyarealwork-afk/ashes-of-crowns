/**
 * ASHES OF CROWNS — Module 1: Player System & Game Core.
 * Public API. See README.md for the integration contract.
 */

// Phaser layer
export { Player } from './phaser/Player';
export type { PlayerOptions } from './phaser/Player';
export { PlayerCamera } from './phaser/PlayerCamera';
export type { PlayerCameraOptions } from './phaser/PlayerCamera';
export { TouchControls } from './phaser/TouchControls';
export type { TouchControlsOptions, TouchFrame } from './phaser/TouchControls';
export { InputSystem } from './phaser/InputSystem';
export { ensureAnimations, DEFAULT_TEXTURE_KEY } from './phaser/AnimationFactory';
export { ANIM_DEFS, animForState, animKey, FRAME_W, FRAME_H } from './phaser/animations';
export type { AnimName, AnimDef } from './phaser/animations';
export { PLAYER_IN, PLAYER_OUT } from './phaser/events';

// Phaser-free core (usable for tests, AI companions, replays)
export { PlayerController } from './core/PlayerController';
export { PlayerStats } from './core/PlayerStats';
export { Emitter } from './core/Emitter';
export { MOVE, ATTACKS, DEFAULT_STATS, DEFAULT_SKILLS, BODY } from './core/config';
export { EMPTY_INPUT, makeInput } from './core/types';
export type {
  AttackEvent,
  AttackKind,
  BodySnapshot,
  DamageResult,
  Facing,
  IncomingHit,
  InputFrame,
  MotorOutput,
  PlayerEvents,
  PlayerState,
  PlayerStatsConfig,
  SkillDef,
  SkillSlot,
} from './core/types';
