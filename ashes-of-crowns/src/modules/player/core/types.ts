/**
 * Phaser-independent types for the Player module (ASHES OF CROWNS, Module 1).
 */

export type Facing = 1 | -1;

/** Stats supplied by the RPG module. All fields optional on update (partial merge). */
export interface PlayerStatsConfig {
  maxHealth: number;
  attack: number;
  defense: number;
  /** Speed multiplier base. 100 = baseline movement speed. */
  speed: number;
  maxMana: number;
  maxStamina: number;
  /** Stamina regenerated per second while not spending. */
  staminaRegen: number;
  /** Mana regenerated per second. */
  manaRegen: number;
}

export type PlayerState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'doubleJump'
  | 'fall'
  | 'land'
  | 'attack'
  | 'heavyAttack'
  | 'skill'
  | 'dodge'
  | 'block'
  | 'hit'
  | 'dead';

/** Skill slots exposed as touch buttons / keys. */
export type SkillSlot = 0 | 1 | 2;

/** One frame of input. Edge flags (`*Pressed`) are true for exactly one update. */
export interface InputFrame {
  /** -1..1 horizontal axis. */
  moveX: number;
  /** True when run modifier is on (joystick pushed far / shift). */
  run: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attackPressed: boolean;
  heavyPressed: boolean;
  dodgePressed: boolean;
  blockHeld: boolean;
  skillPressed: [boolean, boolean, boolean];
}

export const EMPTY_INPUT: Readonly<InputFrame> = Object.freeze({
  moveX: 0,
  run: false,
  jumpPressed: false,
  jumpHeld: false,
  attackPressed: false,
  heavyPressed: false,
  dodgePressed: false,
  blockHeld: false,
  skillPressed: [false, false, false] as [boolean, boolean, boolean],
});

export function makeInput(partial: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, skillPressed: [false, false, false], ...partial };
}

/** What the physics body reports to the motor each step. */
export interface BodySnapshot {
  vx: number;
  vy: number;
  onGround: boolean;
  /** Velocity of the platform the player stands on (moving platforms). */
  groundVx: number;
}

/** What the motor asks the physics body to do. */
export interface MotorOutput {
  vx: number;
  vy: number;
  /** Multiplier on world gravity for this frame (fall acceleration, variable jump). */
  gravityScale: number;
}

export interface SkillDef {
  slot: SkillSlot;
  id: string;
  manaCost: number;
  /** Seconds the player is locked in the skill animation. */
  duration: number;
  cooldown: number;
  /** Multiplier on Attack stat for the skill's damage (default 2). */
  damageMul?: number;
  /** Hitbox size in pixels (default 96x64). */
  width?: number;
  height?: number;
  /** Seconds into the animation when the effect becomes active (default 40% of duration). */
  activeFrom?: number;
  activeFor?: number;
}

/** Events emitted by PlayerController (and re-emitted by the Phaser entity). */
export interface PlayerEvents {
  stateChanged: { from: PlayerState; to: PlayerState };
  jump: { double: boolean };
  land: { fallSpeed: number; hard: boolean };
  dodge: { facing: Facing; airborne: boolean };
  blockStart: undefined;
  blockEnd: undefined;
  parry: { hit: IncomingHit };
  guardBreak: undefined;
  attackStart: AttackEvent;
  attackActive: AttackEvent;
  attackEnd: AttackEvent;
  skillFailed: { slot: SkillSlot; reason: 'cooldown' | 'mana' | 'busy' | 'unknown' };
  damaged: { result: DamageResult; hit: IncomingHit; health: number };
  death: undefined;
  deathComplete: undefined;
  respawn: undefined;
  vitals: { health: number; maxHealth: number; mana: number; maxMana: number; stamina: number; maxStamina: number };
}

export type AttackKind = 'normal' | 'heavy' | 'skill';

/** Payload for combat module hooks. Hitbox is relative to player centre, already mirrored by facing. */
export interface AttackEvent {
  kind: AttackKind;
  comboIndex: number;
  facing: Facing;
  damage: number;
  skillId?: string;
  hitbox: { offsetX: number; offsetY: number; width: number; height: number };
  /** Seconds after event when the hitbox is active. */
  activeFrom: number;
  activeFor: number;
}

export interface DamageResult {
  /** Final damage applied to health (0 if fully blocked or dodged). */
  applied: number;
  blocked: boolean;
  dodged: boolean;
  died: boolean;
}

export interface IncomingHit {
  amount: number;
  /** Direction the hit pushes the player: 1 right, -1 left. */
  knockbackDir: Facing;
  knockback?: number;
  /** Ignores defense (true damage) */
  piercing?: boolean;
  /** Cannot be blocked. */
  unblockable?: boolean;
}
