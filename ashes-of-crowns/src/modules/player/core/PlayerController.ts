import { ATTACKS, DEFAULT_SKILLS, MOVE } from './config';
import { Emitter } from './Emitter';
import { PlayerStats } from './PlayerStats';
import type {
  AttackEvent,
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
} from './types';

const DEADZONE = 0.15;
const ACTION_STATES: ReadonlySet<PlayerState> = new Set(['attack', 'heavyAttack', 'skill']);
const BUFFER_DODGE = 0.12;

/**
 * Pure (Phaser-free) player brain: state machine + movement motor + damage rules.
 * Each frame the host passes the input and a snapshot of the physics body and applies the returned
 * MotorOutput. This makes every rule unit-testable without a renderer.
 */
export class PlayerController extends Emitter<PlayerEvents> {
  readonly stats: PlayerStats;
  state: PlayerState = 'idle';
  facing: Facing = 1;
  /** Seconds spent in the current state. */
  stateTime = 0;

  /** Current attack info while in an action state. */
  currentAttack: AttackEvent | null = null;
  comboIndex = 0;

  private skills: SkillDef[] = DEFAULT_SKILLS.map((s) => ({ ...s }));
  private skillCooldowns: number[] = [0, 0, 0];

  // motor
  private relVx = 0;
  private airJumpsUsed = 0;
  private airDodgeUsed = false;
  private jumpLock = 0;
  private peakFall = 0;
  private wasGrounded = true;
  private grounded = true;

  // timers
  private coyote = 0;
  private jumpBuf = 0;
  private attackBuf = 0;
  private heavyBuf = 0;
  private dodgeBuf = 0;
  private skillBuf = [0, 0, 0];
  private dodgeCd = 0;
  private comboTimer = 0;
  private invuln = 0;
  private landTimer = 0;
  private hardLand = false;

  // per-state data
  private stateDuration = 0;
  private activeFired = false;
  private activeEnded = false;
  private queuedAttack = false;
  private dodgeDir: Facing = 1;
  private blockTime = 0;
  private guardBrokenUntil = 0;
  private clock = 0;
  private pendingVy: number | null = null;
  /** Impulses queued by receiveHit/respawn between frames; applied at the next update. */
  private impulseVx: number | null = null;
  private impulseVy: number | null = null;
  private deathTimer = 0;
  private deathNotified = false;
  private lastVitals = '';

  constructor(statsConfig: Partial<PlayerStatsConfig> = {}) {
    super();
    this.stats = new PlayerStats(statsConfig);
  }

  // ---------------------------------------------------------------- public queries

  get isDead(): boolean {
    return this.state === 'dead';
  }

  get isBlocking(): boolean {
    return this.state === 'block';
  }

  /** True while the player cannot take damage (i-frames, post-hit, respawn). */
  get isInvulnerable(): boolean {
    if (this.invuln > 0) return true;
    return this.state === 'dodge' && this.stateTime >= MOVE.dodgeInvulnFrom && this.stateTime <= MOVE.dodgeInvulnTo;
  }

  /** Duration (s) of the current action/hit/dodge state; used to sync animation speed. */
  get currentStateDuration(): number {
    return this.state === 'dodge' ? MOVE.dodgeDuration : this.stateDuration;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  /** True while the current attack's hitbox should be live. */
  get hitboxActive(): boolean {
    return !!this.currentAttack && this.activeFired && !this.activeEnded;
  }

  skillCooldownRemaining(slot: SkillSlot): number {
    return this.skillCooldowns[slot] ?? 0;
  }

  getSkills(): ReadonlyArray<SkillDef> {
    return this.skills;
  }

  /** Replace skill definitions (RPG module: unlocked / equipped skills). Only given slots change. */
  setSkills(defs: SkillDef[]): void {
    for (const d of defs) {
      this.skills[d.slot] = { ...d };
    }
  }

  // ---------------------------------------------------------------- main update

  update(dtRaw: number, input: InputFrame, body: BodySnapshot): MotorOutput {
    const dt = Math.min(Math.max(dtRaw, 0), 0.05);
    this.clock += dt;
    this.tickTimers(dt);
    this.stats.update(dt);
    this.stateTime += dt;
    this.pendingVy = null;

    const out: MotorOutput = { vx: body.vx, vy: body.vy, gravityScale: 1 };

    // Effective ground: ignore the frame(s) right after a jump impulse.
    this.grounded = body.onGround && this.jumpLock <= 0 && body.vy >= -1;

    if (this.state === 'dead') {
      this.updateDead(dt, out, body);
      this.emitVitals();
      return out;
    }

    // Keep platform-relative velocity in sync with the body unless we drive it.
    if (this.grounded) this.relVx = body.vx - body.groundVx;
    else this.relVx = body.vx;
    if (this.impulseVx !== null) {
      this.relVx = this.impulseVx;
      this.impulseVx = null;
    }
    if (this.impulseVy !== null) {
      this.pendingVy = this.impulseVy;
      this.impulseVy = null;
    }

    this.lastBodyVy = body.vy;
    this.bufferInput(input);
    this.trackAirborne(body);

    switch (this.state) {
      case 'hit':
        this.updateHit(dt);
        break;
      case 'dodge':
        this.updateDodge(dt, out, input);
        break;
      case 'attack':
      case 'heavyAttack':
      case 'skill':
        this.updateAction(dt, out, input);
        break;
      default:
        this.updateFree(dt, out, input);
    }

    // Final write-back
    const groundCarry = this.grounded ? body.groundVx : 0;
    out.vx = this.relVx + groundCarry;
    if (this.pendingVy !== null) out.vy = this.pendingVy;
    if (out.vy > MOVE.maxFallSpeed) out.vy = MOVE.maxFallSpeed;

    this.wasGrounded = this.grounded;
    this.emitVitals();
    return out;
  }

  // ---------------------------------------------------------------- damage / death

  /** Called by the combat module when something hits the player. */
  receiveHit(hit: IncomingHit): DamageResult {
    const none: DamageResult = { applied: 0, blocked: false, dodged: false, died: false };
    if (this.state === 'dead' || hit.amount <= 0) return none;

    if (this.isInvulnerable) {
      const dodged = this.state === 'dodge';
      return { ...none, dodged };
    }

    // Blocking only protects the front.
    const frontal = hit.knockbackDir === (-this.facing as Facing);
    if (this.state === 'block' && frontal && !hit.unblockable) {
      if (this.blockTime <= MOVE.parryWindow) {
        this.emit('parry', { hit });
        this.invuln = Math.max(this.invuln, 0.25);
        const r = { ...none, blocked: true };
        this.emit('damaged', { result: r, hit, health: this.stats.health });
        return r;
      }
      const reduced = Math.round(this.stats.mitigate(hit.amount) * (1 - MOVE.blockReduction));
      const lost = this.stats.loseHealth(reduced);
      const broke = this.stats.drainStamina(MOVE.blockStaminaPerHit + hit.amount * 0.25);
      const died = this.stats.isDead;
      const r: DamageResult = { applied: lost, blocked: true, dodged: false, died };
      if (died) this.die();
      else if (broke) {
        this.guardBrokenUntil = this.clock + 1.0;
        this.emit('guardBreak', undefined);
        this.enterHit(hit, 0.6);
      } else {
        // small pushback without leaving block
        this.relVx = hit.knockbackDir * 90;
        this.impulseVx = this.relVx;
      }
      this.emit('damaged', { result: r, hit, health: this.stats.health });
      return r;
    }

    const dmg = hit.piercing ? Math.max(1, Math.round(hit.amount)) : this.stats.mitigate(hit.amount);
    const lost = this.stats.loseHealth(dmg);
    const died = this.stats.isDead;
    const r: DamageResult = { applied: lost, blocked: false, dodged: false, died };
    if (died) this.die();
    else this.enterHit(hit, MOVE.hitStun);
    this.emit('damaged', { result: r, hit, health: this.stats.health });
    return r;
  }

  /** Instantly kills the player (pits, scripted events). */
  kill(): void {
    if (this.state === 'dead') return;
    this.stats.health = 0;
    this.die();
  }

  /**
   * Bring the player back. `restore` = fraction of max health restored (default full).
   * The host moves the body to the checkpoint.
   */
  respawn(restore = 1): void {
    this.stats.fullRestore();
    this.stats.health = Math.max(1, Math.round(this.stats.config.maxHealth * Math.min(1, Math.max(0.01, restore))));
    this.resetTransient();
    this.invuln = MOVE.respawnInvuln;
    this.setState('idle');
    this.deathNotified = false;
    this.emit('respawn', undefined);
    this.emitVitals(true);
  }

  // ---------------------------------------------------------------- state internals

  private setState(next: PlayerState): void {
    if (next === this.state) return;
    const prev = this.state;
    if (prev === 'block') this.emit('blockEnd', undefined);
    if (ACTION_STATES.has(prev) && this.currentAttack && !ACTION_STATES.has(next)) this.endAttack();
    this.state = next;
    this.stateTime = 0;
    if (next === 'block') {
      this.blockTime = 0;
      this.emit('blockStart', undefined);
    }
    this.emit('stateChanged', { from: prev, to: next });
  }

  private resetTransient(): void {
    this.relVx = 0;
    this.airJumpsUsed = 0;
    this.airDodgeUsed = false;
    this.jumpLock = 0;
    this.peakFall = 0;
    this.coyote = 0;
    this.jumpBuf = this.attackBuf = this.heavyBuf = this.dodgeBuf = 0;
    this.skillBuf = [0, 0, 0];
    this.comboTimer = 0;
    this.comboIndex = 0;
    this.currentAttack = null;
    this.queuedAttack = false;
    this.landTimer = 0;
    this.invuln = 0;
    this.wasGrounded = true;
    this.impulseVx = 0;
    this.impulseVy = 0;
  }

  private tickTimers(dt: number): void {
    const dec = (v: number) => (v > 0 ? Math.max(0, v - dt) : 0);
    this.coyote = dec(this.coyote);
    this.jumpBuf = dec(this.jumpBuf);
    this.attackBuf = dec(this.attackBuf);
    this.heavyBuf = dec(this.heavyBuf);
    this.dodgeBuf = dec(this.dodgeBuf);
    this.dodgeCd = dec(this.dodgeCd);
    this.comboTimer = dec(this.comboTimer);
    this.invuln = dec(this.invuln);
    this.landTimer = dec(this.landTimer);
    this.jumpLock = dec(this.jumpLock);
    this.blockTime += dt;
    for (let i = 0; i < 3; i++) {
      this.skillCooldowns[i] = dec(this.skillCooldowns[i]);
      this.skillBuf[i] = dec(this.skillBuf[i]);
    }
    if (this.comboTimer === 0 && !ACTION_STATES.has(this.state)) this.comboIndex = 0;
  }

  private bufferInput(input: InputFrame): void {
    if (input.jumpPressed) this.jumpBuf = MOVE.jumpBuffer;
    if (input.attackPressed) this.attackBuf = ATTACKS.inputBuffer;
    if (input.heavyPressed) this.heavyBuf = ATTACKS.inputBuffer;
    if (input.dodgePressed) this.dodgeBuf = BUFFER_DODGE;
    for (let i = 0; i < 3; i++) if (input.skillPressed[i]) this.skillBuf[i] = ATTACKS.inputBuffer;
  }

  private trackAirborne(body: BodySnapshot): void {
    if (this.grounded) {
      this.coyote = MOVE.coyoteTime;
      this.airJumpsUsed = 0;
      this.airDodgeUsed = false;
      if (!this.wasGrounded) this.onLanded();
      this.peakFall = 0;
    } else if (body.vy > this.peakFall) {
      this.peakFall = body.vy;
    }
  }

  private onLanded(): void {
    const speed = this.peakFall;
    const hard = speed >= MOVE.hardLandSpeed;
    this.emit('land', { fallSpeed: speed, hard });
    if (this.state === 'jump' || this.state === 'doubleJump' || this.state === 'fall') {
      this.hardLand = hard;
      this.landTimer = hard ? MOVE.hardLandDuration : MOVE.landDuration;
      this.setState('land');
    }
  }

  private die(): void {
    this.endAttack();
    this.setState('dead');
    this.deathTimer = MOVE.deathDuration;
    this.relVx = 0;
    this.invuln = 0;
    this.emit('death', undefined);
  }

  private updateDead(dt: number, out: MotorOutput, body: BodySnapshot): void {
    this.relVx = (body.vx - (this.grounded ? body.groundVx : 0)) * Math.max(0, 1 - 8 * dt);
    out.vx = this.relVx + (this.grounded ? body.groundVx : 0);
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0 && !this.deathNotified) {
        this.deathNotified = true;
        this.emit('deathComplete', undefined);
      }
    }
  }

  private enterHit(hit: IncomingHit, stun: number): void {
    // Cancels any action.
    this.endAttack();
    this.queuedAttack = false;
    this.comboTimer = 0;
    this.stateDuration = stun;
    this.setState('hit');
    this.invuln = Math.max(this.invuln, MOVE.hitInvuln);
    const kb = hit.knockback ?? 220;
    this.relVx = hit.knockbackDir * kb;
    this.impulseVx = this.relVx;
    this.impulseVy = -Math.min(260, kb * 0.9);
    this.jumpLock = 0.05;
  }

  // ---------------------------------------------------------------- state updaters

  private updateHit(dt: number): void {
    this.relVx = approach(this.relVx, 0, (this.grounded ? 1200 : 300) * dt);
    if (this.stateTime >= this.stateDuration) {
      this.setState(this.grounded ? 'idle' : 'fall');
    }
  }

  private emitVitals(force = false): void {
    const s = this.stats;
    const key = `${Math.round(s.health * 10)}|${Math.round(s.mana * 10)}|${Math.round(s.stamina)}|${s.config.maxHealth}|${s.config.maxMana}|${s.config.maxStamina}`;
    if (!force && key === this.lastVitals) return;
    this.lastVitals = key;
    this.emit('vitals', {
      health: s.health,
      maxHealth: s.config.maxHealth,
      mana: s.mana,
      maxMana: s.config.maxMana,
      stamina: s.stamina,
      maxStamina: s.config.maxStamina,
    });
  }

  private updateDodge(dt: number, out: MotorOutput, input: InputFrame): void {
    const mul = clampNum(this.stats.speedMultiplier, 0.8, 1.4);
    this.relVx = this.dodgeDir * MOVE.dodgeSpeed * mul;
    if (!this.grounded) {
      out.gravityScale = 0;
      this.pendingVy = 0;
    }
    if (this.stateTime >= MOVE.dodgeDuration) {
      this.relVx = this.dodgeDir * MOVE.walkSpeed * this.stats.speedMultiplier;
      this.setState(this.grounded ? 'idle' : 'fall');
      // allow immediate chaining of other actions on the same frame
      this.updateFree(dt, out, input);
    }
  }

  private updateAction(dt: number, out: MotorOutput, input: InputFrame): void {
    const atk = this.currentAttack;
    if (!atk) {
      this.setState(this.grounded ? 'idle' : 'fall');
      return;
    }
    const t = this.stateTime;

    if (!this.activeFired && t >= atk.activeFrom) {
      this.activeFired = true;
      this.emit('attackActive', atk);
    }
    if (this.activeFired && !this.activeEnded && t >= atk.activeFrom + atk.activeFor) {
      this.activeEnded = true;
    }
    if (input.attackPressed && this.state === 'attack') this.queuedAttack = true;

    // Movement while acting
    const mul = this.stats.speedMultiplier;
    if (this.grounded) {
      this.relVx = approach(this.relVx, 0, 900 * dt);
    } else {
      const target = deadAxis(input.moveX) * MOVE.walkSpeed * mul * ATTACKS.airMoveFactor;
      this.relVx = approach(this.relVx, target, MOVE.airAccel * dt);
    }
    if (this.state === 'skill') out.gravityScale = this.grounded ? 1 : 0.4;

    const recovering = t >= atk.activeFrom + atk.activeFor;

    // Cancels out of recovery
    if (recovering) {
      if (this.dodgeBuf > 0 && this.tryDodge(input)) return;
      if (this.jumpBuf > 0 && this.tryJump()) return;
      if (input.blockHeld && this.grounded && this.canBlock()) {
        this.setState('block');
        return;
      }
    }

    if (t >= this.stateDuration) {
      const wasNormal = this.state === 'attack';
      const finished = atk;
      this.currentAttack = null;
      if (!this.activeEnded) this.activeEnded = true;
      this.emit('attackEnd', finished);
      if (this.queuedAttack && wasNormal) this.attackBuf = ATTACKS.inputBuffer;
      this.setState(this.grounded ? 'idle' : 'fall');
      if (wasNormal) this.comboTimer = ATTACKS.normal.comboWindow;
      // chain / next action immediately
      this.updateFree(dt, out, input);
    }
  }

  private endAttack(): void {
    if (this.currentAttack) {
      const a = this.currentAttack;
      this.currentAttack = null;
      this.emit('attackEnd', a);
    }
  }

  private updateFree(dt: number, out: MotorOutput, input: InputFrame): void {
    // Block handling
    const wantsBlock = input.blockHeld && this.grounded && this.canBlock();
    if (this.state === 'block' && !wantsBlock) this.setState('idle');

    if (this.dodgeBuf > 0 && this.tryDodge(input)) return;
    for (let i = 0; i < 3; i++) {
      if (this.skillBuf[i] > 0 && this.trySkill(i as SkillSlot)) return;
    }
    if (this.state !== 'block') {
      if (this.heavyBuf > 0 && this.tryHeavy(input)) return;
      if (this.attackBuf > 0 && this.tryAttack(input)) return;
    }
    if (this.jumpBuf > 0 && this.tryJump()) {
      this.applyMoveGravity(out, input);
      this.applyHorizontal(dt, input);
      return;
    }

    if (wantsBlock && this.state !== 'block') this.setState('block');

    this.applyHorizontal(dt, input);
    this.applyMoveGravity(out, input);
    if (this.state !== 'block') this.pickLocomotionState(input);
  }

  private canBlock(): boolean {
    return this.stats.stamina > 0 && this.clock >= this.guardBrokenUntil;
  }

  private applyHorizontal(dt: number, input: InputFrame): void {
    const mul = this.stats.speedMultiplier;
    const axis = deadAxis(input.moveX);
    const blocking = this.state === 'block';
    const base = input.run && !blocking ? MOVE.runSpeed : MOVE.walkSpeed;
    let target = axis * base * mul * (blocking ? MOVE.blockSpeedFactor : 1);
    if (this.state === 'land' && this.hardLand) target *= 0.3;
    // While guarding, facing is locked so the shield stays toward the enemy.
    if (axis !== 0 && !blocking) this.facing = axis > 0 ? 1 : -1;

    const same = Math.sign(target) === Math.sign(this.relVx);
    const speeding = target !== 0 && same && Math.abs(target) > Math.abs(this.relVx);
    let a: number;
    if (this.grounded) a = speeding ? MOVE.groundAccel : MOVE.groundDecel;
    else a = speeding ? MOVE.airAccel : MOVE.airDecel;
    this.relVx = approach(this.relVx, target, a * dt);
  }

  private applyMoveGravity(out: MotorOutput, input: InputFrame): void {
    const vy = this.pendingVy ?? out.vy;
    if (this.grounded) out.gravityScale = 1;
    else if (vy < 0) out.gravityScale = input.jumpHeld ? 1 : MOVE.lowJumpGravity;
    else out.gravityScale = MOVE.fallGravity;
  }

  private pickLocomotionState(input: InputFrame): void {
    const vy = this.pendingVy ?? 0;
    if (!this.grounded) {
      if (this.state === 'jump' || this.state === 'doubleJump') {
        // stay in the rising state until the apex
        if (this.risingNow(vy)) return;
      }
      this.setState('fall');
      return;
    }
    if (this.state === 'land' && this.landTimer > 0) return;
    const moving = deadAxis(input.moveX) !== 0;
    if (!moving && Math.abs(this.relVx) < 20) this.setState('idle');
    else if (moving) this.setState(input.run ? 'run' : 'walk');
    else this.setState('idle');
  }

  private risingNow(vy: number): boolean {
    return this.lastBodyVy < 0 || vy < 0;
  }

  private lastBodyVy = 0;

  // ---------------------------------------------------------------- action starters

  private tryJump(): boolean {
    if (this.jumpBuf <= 0) return false;
    if (this.grounded || this.coyote > 0) {
      this.jumpBuf = 0;
      this.coyote = 0;
      this.pendingVy = MOVE.jumpVelocity;
      this.jumpLock = 0.06;
      this.grounded = false;
      this.airJumpsUsed = 0;
      this.setState('jump');
      this.emit('jump', { double: false });
      return true;
    }
    if (this.airJumpsUsed < 1 && this.stats.spendStamina(MOVE.doubleJumpStamina, 0.3)) {
      this.jumpBuf = 0;
      this.airJumpsUsed++;
      this.pendingVy = MOVE.doubleJumpVelocity;
      this.jumpLock = 0.06;
      this.setState('doubleJump');
      this.emit('jump', { double: true });
      return true;
    }
    return false;
  }

  private tryDodge(input: InputFrame): boolean {
    if (this.dodgeCd > 0) return false;
    if (!this.grounded && this.airDodgeUsed) return false;
    if (!this.stats.spendStamina(MOVE.dodgeStamina, 0.6)) return false;
    this.dodgeBuf = 0;
    this.dodgeCd = MOVE.dodgeCooldown;
    const axis = deadAxis(input.moveX);
    this.dodgeDir = axis !== 0 ? (axis > 0 ? 1 : -1) : this.facing;
    this.facing = this.dodgeDir;
    if (!this.grounded) this.airDodgeUsed = true;
    this.endAttack();
    this.setState('dodge');
    this.emit('dodge', { facing: this.dodgeDir, airborne: !this.grounded });
    return true;
  }

  private tryAttack(input: InputFrame): boolean {
    if (!this.stats.spendStamina(ATTACKS.normal.stamina, 0.4)) return false;
    this.attackBuf = 0;
    const steps = ATTACKS.normal.steps;
    let idx = 0;
    if (this.comboTimer > 0 && this.comboIndex < steps.length - 1) idx = this.comboIndex + 1;
    // In air, always use the first step so the combo is ground-only.
    if (!this.grounded) idx = 0;
    this.comboIndex = idx;
    const s = steps[idx];
    const axis = deadAxis(input.moveX);
    if (axis !== 0) this.facing = axis > 0 ? 1 : -1;
    this.beginAction('attack', {
      kind: 'normal',
      comboIndex: idx,
      facing: this.facing,
      damage: this.stats.outgoingDamage(s.damageMul),
      hitbox: { offsetX: (s.w / 2 + 8) * this.facing, offsetY: -2, width: s.w, height: s.h },
      activeFrom: s.activeFrom,
      activeFor: s.activeFor,
    }, s.duration, s.lunge);
    return true;
  }

  private tryHeavy(input: InputFrame): boolean {
    const h = ATTACKS.heavy;
    if (!this.stats.spendStamina(h.stamina, 0.7)) return false;
    this.heavyBuf = 0;
    this.comboIndex = 0;
    this.comboTimer = 0;
    const axis = deadAxis(input.moveX);
    if (axis !== 0) this.facing = axis > 0 ? 1 : -1;
    this.beginAction('heavyAttack', {
      kind: 'heavy',
      comboIndex: 0,
      facing: this.facing,
      damage: this.stats.outgoingDamage(h.damageMul),
      hitbox: { offsetX: (h.w / 2 + 8) * this.facing, offsetY: -2, width: h.w, height: h.h },
      activeFrom: h.activeFrom,
      activeFor: h.activeFor,
    }, h.duration, h.lunge);
    return true;
  }

  private trySkill(slot: SkillSlot): boolean {
    const def = this.skills[slot];
    if (!def) {
      this.skillBuf[slot] = 0;
      this.emit('skillFailed', { slot, reason: 'unknown' });
      return false;
    }
    if (this.skillCooldowns[slot] > 0) {
      this.skillBuf[slot] = 0;
      this.emit('skillFailed', { slot, reason: 'cooldown' });
      return false;
    }
    if (!this.stats.spendMana(def.manaCost)) {
      this.skillBuf[slot] = 0;
      this.emit('skillFailed', { slot, reason: 'mana' });
      return false;
    }
    this.skillBuf[slot] = 0;
    this.skillCooldowns[slot] = def.cooldown;
    const w = def.width ?? 96;
    const h = def.height ?? 64;
    this.comboTimer = 0;
    this.beginAction('skill', {
      kind: 'skill',
      comboIndex: 0,
      facing: this.facing,
      damage: this.stats.outgoingDamage(def.damageMul ?? 2),
      skillId: def.id,
      hitbox: { offsetX: (w / 2 + 6) * this.facing, offsetY: -2, width: w, height: h },
      activeFrom: def.activeFrom ?? def.duration * 0.4,
      activeFor: def.activeFor ?? def.duration * 0.3,
    }, def.duration, 0);
    return true;
  }

  private beginAction(state: 'attack' | 'heavyAttack' | 'skill', ev: AttackEvent, duration: number, lunge: number): void {
    this.currentAttack = ev;
    this.stateDuration = duration;
    this.activeFired = false;
    this.activeEnded = false;
    this.queuedAttack = false;
    // force state restart even when chaining attack -> attack
    if (this.state === state) {
      this.stateTime = 0;
      this.emit('stateChanged', { from: state, to: state });
    } else {
      this.setState(state);
    }
    if (lunge > 0 && this.grounded) this.relVx = this.facing * Math.sqrt(2 * 900 * lunge * 0.4);
    this.emit('attackStart', ev);
  }
}

// -------------------------------------------------------------------- helpers

function approach(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

function deadAxis(v: number): number {
  return Math.abs(v) < DEADZONE ? 0 : Math.max(-1, Math.min(1, v));
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
