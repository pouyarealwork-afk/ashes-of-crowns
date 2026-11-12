import Phaser from 'phaser';
import { BODY, MOVE } from '../core/config';
import { PlayerController } from '../core/PlayerController';
import type {
  AttackEvent,
  IncomingHit,
  InputFrame,
  PlayerEvents,
  PlayerState,
  PlayerStatsConfig,
  SkillDef,
} from '../core/types';
import { ANIM_DEFS, animForState, animKey } from './animations';
import { DEFAULT_TEXTURE_KEY, ensureAnimations } from './AnimationFactory';
import { PLAYER_IN, PLAYER_OUT } from './events';
import { InputSystem } from './InputSystem';
import { PlayerCamera } from './PlayerCamera';
import type { PlayerCameraOptions } from './PlayerCamera';
import { TouchControls } from './TouchControls';
import type { TouchControlsOptions } from './TouchControls';

export interface PlayerOptions {
  x: number;
  y: number;
  /** Stats from the RPG module. Can be updated later via `applyStats` or the `player:cmd:stats` event. */
  stats?: Partial<PlayerStatsConfig>;
  /** Texture/atlas key. Default: procedural 'aren' sheet generated at runtime. */
  textureKey?: string;
  /** Spawn / first checkpoint. Defaults to the start position. */
  checkpoint?: { x: number; y: number };
  /** Touch controls: true = show on touch devices (default), false = none, object = options (e.g. forceVisible). */
  touch?: boolean | TouchControlsOptions;
  /** Camera follow. false disables (host handles camera). */
  camera?: PlayerCameraOptions | false;
  /** Respawn automatically after death (default true). */
  autoRespawn?: boolean;
  respawnDelay?: number;
  /** Health fraction restored on respawn (default 1). */
  respawnHealth?: number;
  /** If the player falls below this world Y they die (void). Default: bounds bottom + 300 or off. */
  fallKillY?: number;
  /** Override input (AI, replays, tests). Called once per frame. */
  inputProvider?: () => InputFrame;
  depth?: number;
}

/**
 * Aren: the playable character. Arcade-physics sprite driven by the Phaser-free PlayerController.
 * The sprite hooks into the scene's UPDATE event itself, so the host does not need to call update().
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly controller: PlayerController;
  readonly inputSystem: InputSystem;
  readonly touch?: TouchControls;
  readonly cameraRig?: PlayerCamera;

  private textureKeyName: string;
  private checkpoint: { x: number; y: number };
  private autoRespawn: boolean;
  private respawnDelay: number;
  private respawnHealth: number;
  private fallKillY?: number;
  private inputProvider?: () => InputFrame;
  private groundBody: Phaser.Physics.Arcade.Body | null = null;
  private offs: Array<() => void> = [];
  private lastAnim = '';
  private respawnTimer?: Phaser.Time.TimerEvent;
  private disposed = false;

  constructor(scene: Phaser.Scene, opts: PlayerOptions) {
    const textureKey = opts.textureKey ?? DEFAULT_TEXTURE_KEY;
    ensureAnimations(scene, textureKey);
    super(scene, opts.x, opts.y, textureKey, 'idle_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.textureKeyName = textureKey;
    this.checkpoint = { ...(opts.checkpoint ?? { x: opts.x, y: opts.y }) };
    this.autoRespawn = opts.autoRespawn ?? true;
    this.respawnDelay = opts.respawnDelay ?? 0.8;
    this.respawnHealth = opts.respawnHealth ?? 1;
    this.fallKillY = opts.fallKillY;
    this.inputProvider = opts.inputProvider;
    this.setDepth(opts.depth ?? 10);

    // Body: feet at the bottom of the 64x64 frame.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(BODY.width, BODY.height);
    body.setOffset((BODY.frameW - BODY.width) / 2, BODY.frameH - BODY.height - 2);
    body.setMaxVelocity(900, MOVE.maxFallSpeed + 100);
    body.setDragX(0);
    this.setCollideWorldBounds(true);

    this.controller = new PlayerController(opts.stats);

    if (opts.touch !== false) {
      this.touch = new TouchControls(scene, typeof opts.touch === 'object' ? opts.touch : {});
    }
    this.inputSystem = new InputSystem(scene, this.touch);

    if (opts.camera !== false) {
      this.cameraRig = new PlayerCamera(scene, this, opts.camera ?? {});
      this.cameraRig.snap();
    }

    this.wireControllerEvents();
    this.wireCommands();
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.playAnimFor('idle');
    scene.game.events.emit(PLAYER_OUT.ready, this);
  }

  // ------------------------------------------------------------------ public API

  /** Current player state (named playerState because GameObject already owns `state`). */
  get playerState(): PlayerState {
    return this.controller.state;
  }

  get stats() {
    return this.controller.stats;
  }

  get facing(): 1 | -1 {
    return this.controller.facing;
  }

  /** Feed the player with a stats object from the RPG module. */
  applyStats(stats: Partial<PlayerStatsConfig>, refill = false): void {
    this.controller.stats.applyConfig(stats, refill);
  }

  setSkills(defs: SkillDef[]): void {
    this.controller.setSkills(defs);
  }

  /** Combat module calls this when an enemy hit connects with the player. */
  takeHit(hit: IncomingHit) {
    return this.controller.receiveHit(hit);
  }

  heal(amount: number): number {
    return this.controller.stats.heal(amount);
  }

  setCheckpoint(x: number, y: number): void {
    this.checkpoint = { x, y };
  }

  getCheckpoint(): { x: number; y: number } {
    return { ...this.checkpoint };
  }

  lockInput(locked: boolean): void {
    this.inputSystem.locked = locked;
  }

  setInputProvider(fn?: () => InputFrame): void {
    this.inputProvider = fn;
  }

  /** Move to the checkpoint and revive. */
  respawn(): void {
    if (this.disposed) return;
    this.respawnTimer?.remove(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.reset(this.checkpoint.x, this.checkpoint.y);
    this.setAlpha(1);
    this.controller.respawn(this.respawnHealth);
    this.cameraRig?.snap();
    this.playAnimFor('idle');
    this.scene.game.events.emit(PLAYER_OUT.respawned, { ...this.checkpoint });
    this.emit('respawned', { ...this.checkpoint });
  }

  /** World-space rectangle of an attack hitbox (for the combat module's overlap tests). */
  getHitboxRect(ev: AttackEvent | null = this.controller.currentAttack): Phaser.Geom.Rectangle | null {
    if (!ev) return null;
    const b = this.body as Phaser.Physics.Arcade.Body;
    const cx = b.center.x + ev.hitbox.offsetX;
    const cy = b.center.y + ev.hitbox.offsetY;
    return new Phaser.Geom.Rectangle(cx - ev.hitbox.width / 2, cy - ev.hitbox.height / 2, ev.hitbox.width, ev.hitbox.height);
  }

  /** Active hitbox this frame or null (only while the attack's active window is open). */
  getActiveHitbox(): Phaser.Geom.Rectangle | null {
    return this.controller.hitboxActive ? this.getHitboxRect() : null;
  }

  /**
   * Collide with solid ground / platforms. Pass a moving platform group to be carried by it
   * (the platform body must have a velocity, e.g. via setVelocityX with immovable = true).
   */
  addGround(target: Phaser.Types.Physics.Arcade.ArcadeColliderType): Phaser.Physics.Arcade.Collider {
    return this.scene.physics.add.collider(this, target, (_p, other) => {
      const ob = (other as Phaser.GameObjects.GameObject & { body?: Phaser.Physics.Arcade.Body }).body;
      const b = this.body as Phaser.Physics.Arcade.Body;
      if (ob && b.touching.down && ob.velocity) this.groundBody = ob;
    });
  }

  /**
   * One-way platforms: collide only when falling onto the top. Use for jump-through ledges.
   */
  addOneWayPlatforms(target: Phaser.Types.Physics.Arcade.ArcadeColliderType): Phaser.Physics.Arcade.Collider {
    return this.scene.physics.add.collider(
      this,
      target,
      (_p, other) => {
        const ob = (other as Phaser.GameObjects.GameObject & { body?: Phaser.Physics.Arcade.Body }).body;
        if (ob && ob.velocity) this.groundBody = ob;
      },
      (_p, other) => {
        const b = this.body as Phaser.Physics.Arcade.Body;
        const ob = (other as Phaser.GameObjects.GameObject & { body?: Phaser.Physics.Arcade.Body }).body;
        if (!ob) return true;
        // Only solid when moving down and feet were above the platform top last frame.
        return b.velocity.y >= 0 && b.prev.y + b.height <= ob.top + 6;
      },
    );
  }

  // ------------------------------------------------------------------ frame loop

  private tick(_time: number, deltaMs: number): void {
    if (this.disposed || !this.active) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    const body = this.body as Phaser.Physics.Arcade.Body;

    const input = this.inputProvider ? this.inputProvider() : this.inputSystem.poll();
    const onGround = body.blocked.down || body.touching.down;
    const groundVx = onGround && this.groundBody ? this.groundBody.velocity.x : 0;
    this.groundBody = null; // re-set by collider callback on the next physics step

    const out = this.controller.update(dt, input, { vx: body.velocity.x, vy: body.velocity.y, onGround, groundVx });
    body.setVelocity(out.vx, out.vy);
    body.setGravityY((out.gravityScale - 1) * this.scene.physics.world.gravity.y);

    this.setFlipX(this.controller.facing === -1);
    this.updateAnimationSpeed();
    this.updateInvulnVisual();
    this.updateTouchHud();
    this.cameraRig?.update(dt, this.controller.facing, body.velocity.x);

    // Void death
    const killY = this.fallKillY ?? (this.scene.physics.world.bounds.bottom + 300);
    if (this.y > killY && !this.controller.isDead) this.controller.kill();
  }

  private updateAnimationSpeed(): void {
    const c = this.controller;
    const s = c.state;
    if (s === 'attack' || s === 'heavyAttack' || s === 'skill' || s === 'dodge') {
      const def = ANIM_DEFS.find((d) => d.name === animForState(s, c.comboIndex));
      const dur = c.currentStateDuration;
      if (def && dur > 0) this.anims.timeScale = Math.max(0.3, Math.min(3, def.frames / def.frameRate / dur));
    } else if (s === 'walk' || s === 'run') {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const ref = s === 'run' ? MOVE.runSpeed : MOVE.walkSpeed;
      this.anims.timeScale = Math.max(0.6, Math.min(1.6, Math.abs(body.velocity.x) / (ref * c.stats.speedMultiplier) || 1));
    } else {
      this.anims.timeScale = 1;
    }
  }

  private updateInvulnVisual(): void {
    const c = this.controller;
    if (c.isDead) {
      this.setAlpha(1);
      return;
    }
    if (c.isInvulnerable && c.state !== 'dodge') {
      this.setAlpha(Math.floor(this.scene.time.now / 70) % 2 === 0 ? 0.45 : 1);
    } else if (c.state === 'dodge') this.setAlpha(0.6);
    else this.setAlpha(1);
  }

  private updateTouchHud(): void {
    if (!this.touch) return;
    const c = this.controller;
    const skills = c.getSkills();
    for (let i = 0; i < 3; i++) {
      const def = skills[i];
      if (!def) {
        this.touch.setSkillEnabled(i as 0 | 1 | 2, false);
        continue;
      }
      this.touch.setSkillEnabled(i as 0 | 1 | 2, c.stats.mana >= def.manaCost);
      this.touch.setSkillCooldown(i as 0 | 1 | 2, def.cooldown > 0 ? c.skillCooldownRemaining(i as 0 | 1 | 2) / def.cooldown : 0);
    }
  }

  // ------------------------------------------------------------------ animation

  private playAnimFor(state: PlayerState): void {
    const name = animForState(state, this.controller.comboIndex);
    const key = animKey(this.textureKeyName, name);
    const def = ANIM_DEFS.find((d) => d.name === name);
    if (!def) return;
    // Loops keep running; one-shots restart (e.g. attack chaining attack0 -> attack1).
    const restart = !def.loop || this.lastAnim !== key;
    if (this.scene.anims.exists(key)) {
      this.anims.play(key, !restart);
      this.lastAnim = key;
    }
  }

  // ------------------------------------------------------------------ wiring

  private wireControllerEvents(): void {
    const forward = <K extends keyof PlayerEvents>(name: K) => {
      const off = this.controller.on(name, (payload) => {
        this.emit(name as string, payload);
        this.scene.game.events.emit(PLAYER_OUT[name], payload);
      });
      this.offs.push(off);
    };
    (Object.keys(PLAYER_OUT) as Array<keyof typeof PLAYER_OUT>)
      .filter((k) => k !== 'respawned' && k !== 'ready')
      .forEach((k) => forward(k as keyof PlayerEvents));

    this.offs.push(
      this.controller.on('stateChanged', ({ to }) => this.playAnimFor(to)),
      this.controller.on('land', ({ hard }) => {
        if (hard) this.cameraRig?.shake(90, 0.003);
      }),
      this.controller.on('damaged', ({ result }) => {
        if (result.applied > 0) this.cameraRig?.shake(140, 0.007);
      }),
      this.controller.on('deathComplete', () => {
        if (!this.autoRespawn || this.disposed) return;
        this.respawnTimer = this.scene.time.delayedCall(this.respawnDelay * 1000, () => this.respawn());
      }),
    );
  }

  private wireCommands(): void {
    const ev = this.scene.game.events;
    const on = <T>(name: string, fn: (p: T) => void) => {
      ev.on(name, fn);
      this.offs.push(() => ev.off(name, fn));
    };
    on<IncomingHit>(PLAYER_IN.hit, (h) => this.takeHit(h));
    on<number>(PLAYER_IN.heal, (n) => this.heal(n));
    on<Partial<PlayerStatsConfig> | { stats: Partial<PlayerStatsConfig>; refill?: boolean }>(PLAYER_IN.stats, (p) => {
      if ('stats' in p && typeof (p as { stats: unknown }).stats === 'object') {
        const q = p as { stats: Partial<PlayerStatsConfig>; refill?: boolean };
        this.applyStats(q.stats, !!q.refill);
      } else this.applyStats(p as Partial<PlayerStatsConfig>);
    });
    on<{ x: number; y: number }>(PLAYER_IN.checkpoint, (c) => this.setCheckpoint(c.x, c.y));
    on<SkillDef[]>(PLAYER_IN.skills, (s) => this.setSkills(s));
    on<boolean>(PLAYER_IN.lockInput, (b) => this.lockInput(b));
    on<boolean>(PLAYER_IN.touchVisible, (b) => this.touch?.setVisible(b));
    on<undefined>(PLAYER_IN.respawn, () => this.respawn());
    on<undefined>(PLAYER_IN.kill, () => this.controller.kill());
  }

  destroy(fromScene?: boolean): void {
    if (this.disposed) return;
    this.disposed = true;
    this.respawnTimer?.remove(false);
    this.scene?.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.offs.forEach((f) => f());
    this.offs = [];
    this.controller.clear();
    this.touch?.destroy();
    this.inputSystem.destroy();
    this.cameraRig?.destroy();
    super.destroy(fromScene);
  }
}
