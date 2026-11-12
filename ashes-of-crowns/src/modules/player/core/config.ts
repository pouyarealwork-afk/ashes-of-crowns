import type { PlayerStatsConfig, SkillDef } from './types';

/** Default stats used until the RPG module supplies real ones. */
export const DEFAULT_STATS: Readonly<PlayerStatsConfig> = Object.freeze({
  maxHealth: 100,
  attack: 10,
  defense: 5,
  speed: 100,
  maxMana: 50,
  maxStamina: 100,
  staminaRegen: 25,
  manaRegen: 2,
});

/** Tunable movement / action constants. Units: pixels, seconds. */
export const MOVE = Object.freeze({
  walkSpeed: 150,
  runSpeed: 260,
  groundAccel: 2200,
  groundDecel: 2800,
  airAccel: 1500,
  airDecel: 900,
  jumpVelocity: -520,
  doubleJumpVelocity: -460,
  /** Gravity multiplier while rising and jump is released (short hop). */
  lowJumpGravity: 2.4,
  fallGravity: 1.5,
  maxFallSpeed: 760,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  landDuration: 0.08,
  /** Fall speed above which a landing plays the (longer) land state. */
  hardLandSpeed: 420,
  hardLandDuration: 0.18,
  dodgeSpeed: 420,
  dodgeDuration: 0.28,
  dodgeInvulnFrom: 0.02,
  dodgeInvulnTo: 0.22,
  dodgeCooldown: 0.45,
  dodgeStamina: 25,
  blockSpeedFactor: 0.35,
  blockStaminaPerHit: 15,
  /** Fraction of damage blocked (before stamina break). */
  blockReduction: 0.8,
  /** Block within this window after raising = perfect parry. */
  parryWindow: 0.15,
  hitStun: 0.3,
  hitInvuln: 0.8,
  respawnInvuln: 1.5,
  deathDuration: 1.2,
  jumpStamina: 0,
  doubleJumpStamina: 8,
  runStaminaPerSec: 0,
});

export const ATTACKS = Object.freeze({
  normal: {
    /** Chain of combo steps; each lasts `duration`, input within `comboWindow` after chains. */
    steps: [
      { duration: 0.32, activeFrom: 0.1, activeFor: 0.1, damageMul: 1.0, lunge: 60, w: 52, h: 44 },
      { duration: 0.32, activeFrom: 0.1, activeFor: 0.1, damageMul: 1.1, lunge: 70, w: 56, h: 44 },
      { duration: 0.48, activeFrom: 0.18, activeFor: 0.12, damageMul: 1.5, lunge: 110, w: 64, h: 52 },
    ],
    comboWindow: 0.35,
    stamina: 8,
  },
  heavy: {
    duration: 0.7,
    activeFrom: 0.3,
    activeFor: 0.15,
    damageMul: 2.4,
    lunge: 40,
    w: 72,
    h: 60,
    stamina: 28,
  },
  /** Fraction of horizontal speed kept while attacking on the ground. */
  groundMoveFactor: 0.0,
  airMoveFactor: 0.8,
  /** Attack buffer so a press slightly early still registers. */
  inputBuffer: 0.15,
});

export const DEFAULT_SKILLS: ReadonlyArray<SkillDef> = Object.freeze([
  { slot: 0, id: 'skill_0', manaCost: 10, duration: 0.55, cooldown: 3 },
  { slot: 1, id: 'skill_1', manaCost: 20, duration: 0.7, cooldown: 6 },
  { slot: 2, id: 'skill_2', manaCost: 35, duration: 0.9, cooldown: 12 },
]);

/** Player body size (pixels) used by the Phaser adapter. */
export const BODY = Object.freeze({ width: 28, height: 52, frameW: 64, frameH: 64 });
