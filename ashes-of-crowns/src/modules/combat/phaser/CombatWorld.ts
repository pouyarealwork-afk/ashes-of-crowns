import Phaser from 'phaser';
import { CombatEngine } from '../core/CombatEngine';
import { getEnemyArchetype } from '../data/enemies';
import type { PlayerAttackEvent } from '../types';
import type { EnemyState, EventBusLike } from '../types';

export interface PlayerSkillBinding {
  slot: 0 | 1 | 2; id: string; manaCost: number; duration: number; cooldown: number;
  damageMul?: number; width?: number; height?: number; activeFrom?: number; activeFor?: number;
}
export interface CombatPlayerActor {
  x: number; y: number; facing: 1 | -1; playerState: string;
  stats: { health: number; mana: number; stamina: number; config: { maxHealth: number; attack: number; defense: number; speed: number; maxMana: number; maxStamina: number }; spendMana(n: number): boolean; spendStamina(n: number): boolean; heal(n: number): number; restoreMana(n: number): void };
  body: any;
  getActiveHitbox(): Phaser.Geom.Rectangle | null;
  getBounds(): Phaser.Geom.Rectangle;
  takeHit(hit: { amount: number; knockbackDir: 1 | -1; knockback?: number; unblockable?: boolean }): { applied: number; blocked: boolean; dodged: boolean };
  applyStats(stats: Partial<{ maxHealth: number; attack: number; defense: number; speed: number; maxMana: number; maxStamina: number; manaRegen: number; staminaRegen: number }>, refill?: boolean): void;
  setSkills(defs: PlayerSkillBinding[]): void;
}
export interface CombatAbilityDef { id: string; kind: string; manaCost: number; staminaCost: number; cooldownMs: number; durationMs?: number; radius?: number }
export interface CombatRpgFacade {
  events: {
    on(event: 'rpg:stats-changed', fn: (payload: any) => void): () => void;
    on(event: 'rpg:level-up', fn: (payload: any) => void): () => void;
    on(event: 'rpg:hotbar-changed', fn: (payload: any) => void): () => void;
    on(event: 'rpg:skill-ranked', fn: (payload: any) => void): () => void;
  };
  getStats(): Record<string, number>;
  getPassives(): Record<string, number>;
  skills: {
    getHotbar(): (string | null)[];
    getUnlockedAbilities(): CombatAbilityDef[];
    tryUseAbility(id: string, resources: { mana: number; stamina: number }): { ok: boolean; use?: { abilityId: string; manaCost: number; staminaCost: number; effect: any }; reason?: string };
  };
  combat: {
    calcDamage(input?: any): { damage: number; crit: boolean; lifestealHeal: number };
    calcAbilityDamage(effect: any, options?: any): { damage: number; crit: boolean; lifestealHeal: number };
    mitigateIncoming(raw: number): number;
    isInvulnerable(): boolean;
    rollDodge(): boolean;
  };
}

export interface CombatWorldOptions {
  scene: Phaser.Scene;
  player: CombatPlayerActor;
  rpg?: CombatRpgFacade;
  region?: string;
  level?: number;
  /** Spawn list returned by WorldModule.getLevelRuntime(levelId).level.enemies. */
  spawns?: Array<{ type: string; x: number; y: number; elite?: boolean; boss?: string; patrol?: [number, number] }>;
  /** Optional existing Phaser event emitter; defaults to scene.game.events. */
  bus?: EventBusLike;
  /** Physics groups/platforms supplied by the level builder. */
  ground?: Phaser.Types.Physics.Arcade.ArcadeColliderType;
  texturePrefix?: string;
  hazards?: Array<{ type: string; rect: { x: number; y: number; width: number; height: number }; damage: number; note?: string }>;
}

/** Phaser 3 adapter for CombatEngine. No external art assets are required; placeholder silhouettes are generated safely. */
export class CombatWorld {
  readonly engine: CombatEngine;
  readonly scene: Phaser.Scene;
  readonly player: CombatPlayerActor;
  private bus: EventBusLike;
  private rpg?: CombatRpgFacade;
  private sprites = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private activeAttack: PlayerAttackEvent | null = null;
  private attackSequence = 0;
  private activeAttackToken = '';
  private offs: Array<() => void> = [];
  private projectiles: Phaser.Physics.Arcade.Group;
  private texturePrefix: string;
  private disposed = false;
  private groundTargets: Phaser.Types.Physics.Arcade.ArcadeColliderType[] = [];
  private nextAssistAt = 0;
  private hazards: NonNullable<CombatWorldOptions['hazards']> = [];
  private hazardCooldowns = new Map<number, number>();
  private colliders: Phaser.Physics.Arcade.Collider[] = [];

  constructor(options: CombatWorldOptions) {
    this.scene = options.scene; this.player = options.player; this.rpg = options.rpg;
    this.bus = options.bus ?? options.scene.game.events as unknown as EventBusLike;
    this.texturePrefix = options.texturePrefix ?? 'aoc-combat';
    this.engine = new CombatEngine({ emitter: this.bus, rpg: options.rpg, region: options.region });
    this.projectiles = options.scene.physics.add.group({ allowGravity: false, immovable: false });
    this.createTextures();
    this.hazards = options.hazards ?? [];
    if (options.ground) this.addGround(options.ground);
    if (options.spawns?.length) this.spawnFromWorld(options.spawns, options.level ?? 1, options.region);
    this.bindEvents();
    this.offs.push(this.engine.on('combat:lifesteal', ({ amount }) => { this.player.stats.heal(amount); }));
    this.offs.push(this.engine.on('enemy:killed', () => { const mana = this.rpg?.getPassives().manaOnKill ?? 0; if (mana > 0) this.player.stats.restoreMana(mana); }));
    if (this.rpg) {
      this.syncRpgToPlayer(false);
      this.offs.push(this.rpg.events.on('rpg:stats-changed', () => this.syncRpgToPlayer(false)));
      this.offs.push(this.rpg.events.on('rpg:level-up', () => this.syncRpgToPlayer(true)));
      this.offs.push(this.rpg.events.on('rpg:hotbar-changed', () => this.syncPlayerSkills()));
      this.offs.push(this.rpg.events.on('rpg:skill-ranked', () => this.syncPlayerSkills()));
    }
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  spawn(type: string, x: number, y: number, opts: { level?: number; elite?: boolean; bossId?: string; patrol?: [number, number] } = {}): EnemyState {
    const enemy = this.engine.spawn(type, { x, y, level: opts.level, elite: opts.elite, bossId: opts.bossId, patrol: opts.patrol });
    const archetype = getEnemyArchetype(type)!;
    const sprite = this.scene.physics.add.sprite(x, y, this.textureKey(type));
    sprite.setDepth(9).setOrigin(0.5, 1).setScale(archetype.scale ?? (enemy.elite ? 1.16 : 1));
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(enemy.ai !== 'flying'); body.setImmovable(false); body.setCollideWorldBounds(true); body.setSize(archetype.hitbox.width, archetype.hitbox.height);
    body.setOffset((sprite.width - archetype.hitbox.width) / 2, sprite.height - archetype.hitbox.height);
    sprite.setData('combatEnemyId', enemy.id);
    this.sprites.set(enemy.id, sprite);
    for (const target of this.groundTargets) this.colliders.push(this.scene.physics.add.collider(sprite, target));
    return enemy;
  }

  spawnFromWorld(spawns: NonNullable<CombatWorldOptions['spawns']>, level = 1, region = 'ashen_village'): EnemyState[] {
    this.engine.setRegion(region);
    return spawns.map(s => this.spawn(s.type, s.x, s.y, { level, elite: s.elite, bossId: s.boss, patrol: s.patrol }));
  }

  addGround(target: Phaser.Types.Physics.Arcade.ArcadeColliderType): Phaser.Physics.Arcade.Collider[] {
    this.groundTargets.push(target);
    const made = [...this.sprites.values()].map(sprite => this.scene.physics.add.collider(sprite, target));
    this.colliders.push(...made); return made;
  }

  update(_time: number, delta: number): void {
    if (this.disposed) return;
    const p = this.player;
    for (const enemy of this.engine.enemies.values()) { const sprite = this.sprites.get(enemy.id); if (sprite?.active) { enemy.x = sprite.x; enemy.y = sprite.y; } }
    const playerView = { x: p.x, y: p.y, health: p.stats.health, maxHealth: p.stats.config.maxHealth, facing: p.facing, isDead: p.playerState === 'dead', isBlocking: p.playerState === 'block' };
    this.engine.update(delta, playerView, (enemy, damage, ranged) => this.performEnemyAttack(enemy, damage, ranged));
    const healthRegen = this.rpg?.getPassives().healthRegen ?? 0;
    if (healthRegen > 0 && p.playerState !== 'dead') p.stats.heal(healthRegen * Math.min(50, delta) / 1000);
    for (const enemy of this.engine.enemies.values()) {
      const sprite = this.sprites.get(enemy.id); if (!sprite) continue;
      if (!enemy.alive) { sprite.disableBody(true, false); sprite.setAlpha(0.25); continue; }
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(enemy.vx);
      // Only flyers are gravity-free; leave ground-enemy Y velocity to Arcade Physics.
      if (enemy.ai === 'flying') body.setVelocityY(enemy.vy);
      sprite.setFlipX(enemy.facing < 0);
      const moving = Math.abs(enemy.vx) > 12;
      const lean = enemy.ai === 'flying'
        ? Math.max(-9, Math.min(9, enemy.vx * 0.035))
        : moving ? Math.sin(_time / 82 + enemy.x * 0.03) * 3.2 : Math.sin(_time / 520 + enemy.x) * 1.1;
      sprite.setAngle(enemy.windupRemainingMs > 0 ? enemy.facing * 4 : lean);
      if (enemy.hitFlashMs > 0) sprite.setTintFill(0xffffff);
      else if (enemy.stunRemainingMs > 0) sprite.setTint(0x8dd8ff);
      else if (enemy.windupRemainingMs > 0) sprite.setTint(0xffb45c);
      else sprite.clearTint();
      if (enemy.windupRemainingMs > 0) {
        const pulse = 1 + Math.sin(_time / 48) * 0.045;
        sprite.setScale((getEnemyArchetype(enemy.archetypeId)?.scale ?? 1) * (enemy.elite ? 1.16 : 1) * pulse);
      } else sprite.setScale((getEnemyArchetype(enemy.archetypeId)?.scale ?? 1) * (enemy.elite ? 1.16 : 1));
    }
    this.checkHazards();
    if (this.scene.time.now >= this.nextAssistAt && this.engine.getAlive().length) {
      this.requestCompanionAssist(this.scene.time.now); this.nextAssistAt = this.scene.time.now + 1200;
    }
    if (this.activeAttack && this.activeAttack.kind !== 'skill') {
      const rect = p.getActiveHitbox();
      if (rect) this.engine.resolvePlayerAttack(this.activeAttack, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, playerView, this.activeAttackToken);
    }
  }

  useAbility(id: string): { ok: boolean; reason?: string; targets?: number } {
    if (!this.rpg) return { ok: false, reason: 'RPG module is not connected' };
    const stats = this.player.stats;
    const outcome = this.engine.useAbility(id, { mana: stats.mana, stamina: stats.stamina, baseAttack: stats.config.attack }, this.rpg, {
      x: this.player.x, y: this.player.y, health: stats.health, maxHealth: stats.config.maxHealth, facing: this.player.facing,
    }, (mana, stamina) => { if (stats.mana < mana || stats.stamina < stamina) return false; if (mana > 0 && !stats.spendMana(mana)) return false; return stamina <= 0 || stats.spendStamina(stamina); });
    if (outcome.ok && outcome.effect?.healPct) stats.heal(stats.config.maxHealth * outcome.effect.healPct);
    if (outcome.ok) this.playAbilityVfx(id, outcome.effect);
    if (outcome.ok && outcome.effect?.dashDistance) {
      const body = this.player.body as Phaser.Physics.Arcade.Body; body.setVelocityX(this.player.facing * Math.min(650, outcome.effect.dashDistance * 2.5));
    }
    return outcome;
  }

  /** Lightweight class-coloured combat feedback built from Phaser primitives (no external assets required). */
  private playAbilityVfx(id: string, effect: any): void {
    const x = this.player.x + this.player.facing * 34;
    const y = this.player.y - 42;
    const mage = id.startsWith('a_');
    const assassin = id.startsWith('s_');
    const color = mage ? 0x75d8ff : assassin ? 0xb58aff : 0xffbd72;
    const radius = Math.max(34, Math.min(210, effect?.radius ?? 72));
    const ring = this.scene.add.circle(this.player.x, y, radius, color, effect?.kind === 'buff' ? 0.12 : 0.2)
      .setStrokeStyle(mage ? 3 : 4, color, 0.9).setDepth(18);
    this.scene.tweens.add({ targets: ring, scale: effect?.kind === 'buff' ? 1.12 : 1.55, alpha: 0, duration: effect?.kind === 'ultimate' ? 720 : 420, ease: 'Cubic.Out', onComplete: () => ring.destroy() });

    if (effect?.kind === 'projectile' || id === 'a_meteor') {
      const target = this.engine.getAlive()
        .filter(e => (e.x - this.player.x) * this.player.facing >= -12)
        .sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))[0];
      const orb = this.scene.add.circle(id === 'a_meteor' ? (target?.x ?? x) : x, id === 'a_meteor' ? (target?.y ?? y) - 190 : y, id === 'a_meteor' ? 18 : 10, color, 1).setDepth(22);
      this.scene.tweens.add({ targets: orb, x: target?.x ?? this.player.x + this.player.facing * 280, y: target?.y ?? y, scale: id === 'a_meteor' ? 1.8 : 1.25, duration: id === 'a_meteor' ? 520 : 260, ease: 'Cubic.In', onComplete: () => orb.destroy() });
    } else if (effect?.kind === 'melee' || effect?.kind === 'execute') {
      const slash = this.scene.add.graphics().setDepth(21);
      slash.lineStyle(5, color, 0.95);
      slash.beginPath(); slash.moveTo(this.player.x, y - 18); slash.lineTo(this.player.x + this.player.facing * 104, y + 28); slash.strokePath();
      this.scene.tweens.add({ targets: slash, alpha: 0, duration: 230, onComplete: () => slash.destroy() });
    } else if (effect?.kind === 'dash') {
      const trail = this.scene.add.circle(this.player.x - this.player.facing * 24, y, 22, color, 0.5).setDepth(17);
      this.scene.tweens.add({ targets: trail, scaleX: 2.4, alpha: 0, duration: 320, onComplete: () => trail.destroy() });
    }
  }

  /** Connect the world's companion system and consume its assist responses. */
  requestCompanionAssist(now = this.scene.time.now): void {
    const alive = this.engine.getAlive();
    this.bus.emit('combat:assist-request', {
      now, playerHpRatio: this.player.stats.health / Math.max(1, this.player.stats.config.maxHealth),
      enemyCount: alive.length, bossActive: alive.some(e => e.tier === 'boss'), comboCount: 0,
    });
  }

  destroy(): void {
    if (this.disposed) return; this.disposed = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.offs.forEach(off => off()); this.offs = [];
    this.colliders.forEach(c => c.destroy()); this.colliders = [];
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear(); this.projectiles.destroy(true);
    this.engine.clear();
  }

  private bindEvents(): void {
    const on = (name: string, fn: (p: any) => void) => {
      this.bus.on(name, fn); this.offs.push(() => this.bus.off?.(name, fn));
    };
    on('player:attackStart', (attack: PlayerAttackEvent) => {
      this.activeAttack = attack; this.attackSequence++; this.activeAttackToken = `aren-${this.attackSequence}`;
      if (attack.kind === 'skill' && attack.skillId) this.useAbility(attack.skillId);
    });
    on('player:attackActive', (attack: PlayerAttackEvent) => { this.activeAttack = attack; if (!this.activeAttackToken) { this.attackSequence++; this.activeAttackToken = `aren-${this.attackSequence}`; } });
    on('player:attackEnd', () => { this.activeAttack = null; this.activeAttackToken = ''; });
    on('player:death', () => this.bus.emit('player:died', {}));
    on('combat:enemy-hit', (payload: any) => this.playEnemyHitFeedback(payload));
    on('world:companion-assist-actions', (actions: any[]) => {
      const view = { x: this.player.x, y: this.player.y, health: this.player.stats.health, maxHealth: this.player.stats.config.maxHealth, facing: this.player.facing };
      for (const action of actions ?? []) this.engine.receiveAssist(action, view);
    });
    on('combat:ability-request', (payload: { abilityId: string }) => { if (payload?.abilityId) this.useAbility(payload.abilityId); });
    on('combat:region-changed', (payload: { region: string }) => { if (payload?.region) this.engine.setRegion(payload.region); });
  }

  /** Hit-stop style visual punctuation: enemy recoil, impact sparks and a brief shock ring. */
  private playEnemyHitFeedback(payload: any): void {
    const sprite = this.sprites.get(String(payload?.targetId ?? ''));
    if (!sprite?.active) return;
    const critical = !!payload?.critical;
    const color = critical ? 0xffd27b : 0xe7c6a0;
    const x = sprite.x + (this.player.x >= sprite.x ? 12 : -12);
    const y = sprite.y - Math.max(20, sprite.displayHeight * 0.48);

    sprite.setTintFill(critical ? 0xffefc4 : 0xffffff);
    this.scene.time.delayedCall(75, () => {
      if (sprite.active) sprite.clearTint();
    });
    const baseScaleX = sprite.scaleX, baseScaleY = sprite.scaleY;
    this.scene.tweens.add({
      targets: sprite, scaleX: baseScaleX * (critical ? 1.13 : 1.07),
      scaleY: baseScaleY * (critical ? 0.91 : 0.96), duration: 65, yoyo: true,
      ease: 'Quad.Out', onComplete: () => { if (sprite.active) sprite.setScale(baseScaleX, baseScaleY); },
    });

    const ring = this.scene.add.circle(x, y, critical ? 13 : 9, color, 0.12)
      .setStrokeStyle(critical ? 3 : 2, color, 0.9).setDepth(24);
    this.scene.tweens.add({
      targets: ring, scale: critical ? 2.8 : 2.1, alpha: 0,
      duration: critical ? 310 : 220, ease: 'Cubic.Out', onComplete: () => ring.destroy(),
    });

    const count = critical ? 9 : 5;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (critical ? 0.18 : 0);
      const distance = critical ? 34 + (i % 3) * 8 : 22 + (i % 2) * 7;
      const spark = this.scene.add.rectangle(x, y, critical ? 4 : 3, critical ? 10 : 7, color, 0.95)
        .setDepth(25).setRotation(angle);
      this.scene.tweens.add({
        targets: spark, x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance, alpha: 0, scale: 0.25,
        duration: critical ? 340 : 245, ease: 'Cubic.Out', onComplete: () => spark.destroy(),
      });
    }
    if (critical) this.scene.cameras.main.shake(105, 0.0025);
  }

  private syncRpgToPlayer(refill: boolean): void {
    if (!this.rpg) return;
    const stats = this.rpg.getStats(); const passives = this.rpg.getPassives();
    this.player.applyStats({
      maxHealth: stats.health, attack: stats.attack, defense: stats.defense, speed: stats.speed,
      maxMana: stats.mana, maxStamina: stats.stamina,
      manaRegen: Math.max(2, passives.manaRegen ?? 0), staminaRegen: Math.max(22, passives.staminaRegen ?? 0),
    }, refill);
    this.syncPlayerSkills();
  }

  private syncPlayerSkills(): void {
    if (!this.rpg) return;
    const hotbar = this.rpg.skills.getHotbar();
    const unlocked = this.rpg.skills.getUnlockedAbilities();
    const defs: PlayerSkillBinding[] = [0, 1, 2].map(slot => {
      const id = hotbar[slot];
      const ability = id ? unlocked.find(a => a.id === id) : undefined;
      if (!id || !ability) return { slot: slot as 0 | 1 | 2, id: `aoc_locked_${slot}`, manaCost: Number.MAX_SAFE_INTEGER, duration: 0.2, cooldown: 0.2 };
      return {
        slot: slot as 0 | 1 | 2, id, manaCost: 0, duration: Math.max(0.3, (ability.durationMs ?? 450) / 1000),
        cooldown: Math.max(0.1, ability.cooldownMs / 1000), damageMul: 1,
        width: Math.max(96, (ability.radius ?? 70) * 2), height: 100, activeFrom: 0.12, activeFor: 0.18,
      };
    });
    this.player.setSkills(defs);
  }

  private applyIncomingHit(sourceId: string, rawDamage: number, knockbackDir: 1 | -1, knockback: number, unblockable: boolean): { applied: number; blocked: boolean; dodged: boolean } {
    if (this.rpg?.combat.isInvulnerable()) {
      const result = { applied: 0, blocked: false, dodged: true };
      this.bus.emit('combat:player-hit', { enemyId: sourceId, damage: 0, blocked: false, dodged: true });
      return result;
    }
    if (!unblockable && this.rpg?.combat.rollDodge()) {
      const result = { applied: 0, blocked: false, dodged: true };
      this.bus.emit('combat:player-hit', { enemyId: sourceId, damage: 0, blocked: false, dodged: true });
      return result;
    }
    const reduction = Math.min(0.8, Math.max(0, this.rpg?.getPassives().damageReduction ?? 0));
    const amount = Math.max(1, Math.round(rawDamage * (1 - reduction)));
    const result = this.player.takeHit({ amount, knockbackDir, knockback, unblockable });
    this.bus.emit('combat:player-hit', { enemyId: sourceId, damage: result.applied, blocked: result.blocked, dodged: result.dodged });
    return result;
  }

  private performEnemyAttack(enemy: EnemyState, damage: number, ranged: boolean): void {
    if (!enemy.alive || this.player.playerState === 'dead') return;
    if (enemy.tier === 'boss' && enemy.bossId && enemy.bossPhase) this.bus.emit('combat:boss-pattern', { bossId: enemy.bossId, phase: enemy.bossPhase, pattern: enemy.bossPhase === 3 ? 'desperation volley' : enemy.bossPhase === 2 ? 'heavy assault' : 'guarded opening' });
    if (ranged || (enemy.tier === 'boss' && enemy.bossPhase === 3)) {
      if (enemy.tier === 'boss' && enemy.bossPhase === 3) { this.fireProjectile(enemy, damage); this.scene.time.delayedCall(120, () => this.fireProjectile(enemy, damage * 0.75)); this.scene.time.delayedCall(240, () => this.fireProjectile(enemy, damage * 0.75)); }
      else this.fireProjectile(enemy, damage); return;
    }
    const range = enemy.tier === 'boss' ? 118 : 62;
    if (Math.abs(this.player.x - enemy.x) > range || Math.abs(this.player.y - enemy.y) > 90) return;
    const dir = this.player.x >= enemy.x ? 1 : -1;
    this.applyIncomingHit(enemy.id, damage, dir as 1 | -1, enemy.tier === 'boss' ? 280 : 150, enemy.tier === 'boss' && enemy.bossPhase === 3);
  }

  private fireProjectile(enemy: EnemyState, damage: number): void {
    const dir = this.player.x >= enemy.x ? 1 : -1;
    const projectile = this.scene.physics.add.image(enemy.x, enemy.y - 28, `${this.texturePrefix}-projectile`);
    projectile.setDepth(12).setTint(0xffc27a);
    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false); body.setVelocity(dir * (enemy.tier === 'boss' ? 300 : 235), 0);
    this.projectiles.add(projectile);
    const collider = this.scene.physics.add.overlap(projectile, this.player as unknown as Phaser.Physics.Arcade.Sprite, () => {
      if (!projectile.active) return;
      this.applyIncomingHit(enemy.id, damage, dir as 1 | -1, 95, false);
      projectile.destroy();
    });
    projectile.once(Phaser.GameObjects.Events.DESTROY, () => collider.destroy());
    this.scene.time.delayedCall(2600, () => { if (projectile.active) projectile.destroy(); });
  }

  setHazards(hazards: NonNullable<CombatWorldOptions['hazards']>): void { this.hazards = hazards; this.hazardCooldowns.clear(); }

  private checkHazards(): void {
    const now = this.scene.time.now; const bounds = this.player.getBounds();
    this.hazards.forEach((hazard, index) => {
      if (now < (this.hazardCooldowns.get(index) ?? 0)) return;
      const r = hazard.rect;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(bounds, new Phaser.Geom.Rectangle(r.x, r.y, r.width, r.height))) return;
      const type = hazard.type.toLowerCase();
      const multiplier = type.includes('avalanche') || type.includes('void') || type.includes('pit') ? 1.8 : type.includes('ember') || type.includes('fire') ? 1.15 : 1;
      const dir = this.player.x >= r.x + r.width / 2 ? 1 : -1;
      const result = this.applyIncomingHit(`hazard:${hazard.type}`, Math.max(1, Math.round(hazard.damage * multiplier)), dir as 1 | -1, type.includes('avalanche') ? 260 : 80, type.includes('void') || type.includes('pit'));
      this.bus.emit('combat:hazard-hit', { hazardType: hazard.type, damage: result.applied, blocked: result.blocked, dodged: result.dodged });
      if (type.includes('frost') || type.includes('quicksand') || type.includes('hush')) this.bus.emit('combat:hazard-effect', { type: hazard.type, durationMs: 900 });
      this.hazardCooldowns.set(index, now + (type.includes('pit') || type.includes('void') ? 1500 : 900));
    });
  }

  private textureKey(type: string): string { return `${this.texturePrefix}-${type}`; }
  private createTextures(): void {
    const types = ['ash_wolf','crown_soldier','thornling','rook_bandit','sand_scorpion','dune_raider','glass_serpent','sand_wraith','frost_wolf','ice_wraith','crown_scout','ironwatch_guard','crossbow_sentry','hushed_guard','hollow_shade','royal_champion','cellar_rat_swarm','sickened_stag','sergeant_hobb','thornwarden','sandglass_colossus','captain_voss','hush_mother_vesk','chancellor_morrow'];
    const colors = [0x9b7561,0x9dabb8,0x65945d,0x8e7657,0xb78b49,0xa97943,0x6eabb0,0xc6b98e,0x8ab5c8,0x9bd8e5,0x8e9c9e,0x737b83,0x9c8a73,0x777b91,0x77718f,0xb99b65,0x82766b,0x786e60,0x965d4d,0x6c8b4d,0xb39b62,0x7898b4,0x8070a8,0x9b6574];
    types.forEach((type, i) => {
      const key = this.textureKey(type);
      if (this.scene.textures.exists(key)) return;
      const boss = i >= 18;
      const w = boss ? 112 : 64, h = boss ? 128 : 78, cx = w / 2;
      const color = colors[i];
      const dark = Phaser.Display.Color.IntegerToColor(color).darken(42).color;
      const light = Phaser.Display.Color.IntegerToColor(color).brighten(28).color;
      const g = this.scene.add.graphics({ x: 0, y: 0 });
      const line = (x1: number, y1: number, x2: number, y2: number, tint: number, width: number) => { g.lineStyle(width, tint, 1); g.lineBetween(x1, y1, x2, y2); };
      const gem = (x: number, y: number, r: number, tint: number) => {
        g.fillStyle(tint, 0.18); g.fillCircle(x, y, r * 2.4);
        g.fillStyle(tint, 1); g.fillCircle(x, y, r);
        g.fillStyle(0xffffff, 0.82); g.fillCircle(x - r * 0.3, y - r * 0.35, Math.max(1, r * 0.28));
      };
      g.fillStyle(0x050505, 0.42); g.fillEllipse(cx, h - 3, w * 0.78, 10);

      const beast = type.includes('wolf') || type.includes('stag') || type.includes('serpent') || type.includes('scorpion') || type.includes('rat_swarm');
      const wraith = type.includes('wraith') || type.includes('shade') || type.includes('hush_mother');
      const plant = type.includes('thorn');
      if (type.includes('serpent')) {
        // Glass serpent: a chain of overlapping plated segments and a raised, fanged head.
        for (let s = 0; s < 6; s++) {
          const x = 9 + s * 9, y = 49 - Math.sin(s * 0.8) * 10;
          g.fillStyle(dark, 1); g.fillCircle(x, y, 9 - s * 0.45);
          g.fillStyle(color, 1); g.fillCircle(x, y - 2, 7 - s * 0.35);
          g.lineStyle(1.5, light, 0.8); g.strokeCircle(x, y - 2, 6 - s * 0.35);
          g.fillStyle(0x172326, 0.8); g.fillCircle(x - 2, y - 4, 1.4);
        }
        g.fillStyle(light, 1); g.fillTriangle(49, 27, 60, 36, 48, 43);
        gem(54, 31, 2.2, 0xffe5a2);
        line(51, 39, 58, 45, 0xe9e0c9, 2);
      } else if (type.includes('scorpion')) {
        // Sand scorpion: segmented shell, articulated claws and a raised hooked tail.
        g.fillStyle(dark, 1); g.fillEllipse(cx, 51, 34, 25);
        g.fillStyle(color, 1); g.fillEllipse(cx, 48, 29, 20);
        for (let s = 0; s < 4; s++) { g.fillStyle(light, 0.72); g.fillEllipse(cx, 41 + s * 5, 23 - s * 2, 4); }
        line(22, 48, 9, 36, dark, 6); line(9, 36, 5, 23, color, 5);
        line(5, 23, 17, 14, light, 4); line(17, 14, 21, 5, 0x3a2920, 4);
        g.fillStyle(0x2c211c, 1); g.fillCircle(21, 5, 4);
        for (const side of [-1, 1]) {
          line(cx + side * 12, 47, cx + side * 25, 38, dark, 5);
          line(cx + side * 25, 38, cx + side * 29, 27, color, 4);
          g.fillStyle(light, 1); g.fillEllipse(cx + side * 30, 24, 13, 8);
          for (let leg = 0; leg < 3; leg++) line(cx + side * 7, 53 + leg * 2, cx + side * (20 + leg * 3), 63 + leg * 2, dark, 3);
        }
        gem(cx + 3, 45, 2.3, 0xffd078);
      } else if (type.includes('wolf') || type.includes('stag')) {
        // Four-legged beasts have a long torso, articulated limbs, ears and a readable muzzle.
        g.fillStyle(dark, 1); g.fillEllipse(cx, 48, boss ? 68 : 47, boss ? 35 : 26);
        g.fillStyle(color, 1); g.fillEllipse(cx - 2, 44, boss ? 62 : 42, boss ? 27 : 20);
        g.fillStyle(light, 0.8); g.fillEllipse(cx - 4, 39, boss ? 37 : 26, 7);
        for (const side of [-1, 1]) {
          line(cx + side * 14, 54, cx + side * 18, 68, dark, 6);
          line(cx + side * 18, 68, cx + side * 16, 73, light, 4);
        }
        g.fillStyle(dark, 1); g.fillEllipse(cx + 19, 35, 22, 19);
        g.fillStyle(light, 1); g.fillEllipse(cx + 25, 39, 16, 10);
        g.fillTriangle(cx + 10, 29, cx + 9, 10, cx + 23, 27);
        g.fillTriangle(cx + 25, 27, cx + 34, 10, cx + 34, 33);
        gem(cx + 26, 32, 2.1, type.includes('frost') ? 0xc5f2ff : 0xffc16c);
        if (type.includes('stag')) {
          line(cx - 3, 24, cx - 13, 4, light, 3); line(cx - 13, 4, cx - 23, 1, light, 2);
          line(cx - 13, 4, cx - 10, -5, light, 2); line(cx + 8, 23, cx + 14, 4, light, 3);
          line(cx + 14, 4, cx + 25, 0, light, 2);
        }
      } else if (wraith) {
        // Wraiths float: tapering spectral robes, ragged trailing edges and bright face slits.
        g.fillStyle(dark, 0.94); g.beginPath(); g.moveTo(cx - 21, 33); g.lineTo(cx - 28, 60); g.lineTo(cx - 12, 53); g.lineTo(cx - 4, 75); g.lineTo(cx + 8, 55); g.lineTo(cx + 24, 67); g.lineTo(cx + 20, 32); g.closePath(); g.fillPath();
        g.fillStyle(color, 0.94); g.fillEllipse(cx, 39, 38, 48);
        g.fillStyle(dark, 0.98); g.fillEllipse(cx, 14, 27, 30);
        g.fillStyle(light, 0.78); g.fillTriangle(cx, -1, cx - 16, 19, cx + 16, 19);
        gem(cx - 6, 17, 2.7, type.includes('ice') ? 0x9deaff : 0xc4a2ff);
        gem(cx + 6, 17, 2.7, type.includes('ice') ? 0x9deaff : 0xc4a2ff);
        line(cx - 17, 38, cx - 30, 51, light, 3); line(cx + 17, 38, cx + 29, 49, light, 3);
        for (let k = 0; k < 3; k++) line(cx - 12 + k * 12, 57, cx - 18 + k * 17, 75, dark, 3);
      } else if (type.includes('rat_swarm')) {
        for (let k = 0; k < 5; k++) {
          const x = 9 + (k % 3) * 16, y = 53 - Math.floor(k / 3) * 15;
          g.fillStyle(dark, 1); g.fillEllipse(x, y, 18, 12);
          g.fillStyle(color, 1); g.fillEllipse(x + 2, y - 2, 13, 8);
          g.fillStyle(light, 1); g.fillCircle(x + 7, y - 3, 2);
          line(x - 5, y + 4, x - 12, y + 8, 0x8d7062, 1.5);
        }
      } else if (plant) {
        // Thornling / thornwarden: bark core wrapped in roots and outward-facing thorns.
        g.fillStyle(dark, 1); g.fillRoundedRect(cx - 13, 27, 26, 43, 9);
        g.fillStyle(color, 1); g.fillRoundedRect(cx - 9, 25, 18, 39, 7);
        for (let k = 0; k < 5; k++) {
          const y = 25 + k * 9;
          g.fillStyle(light, 1); g.fillTriangle(cx - 9, y, cx - 26, y - 8, cx - 13, y + 5);
          g.fillTriangle(cx + 9, y + 3, cx + 27, y - 5, cx + 13, y + 9);
        }
        g.fillStyle(dark, 1); g.fillCircle(cx, 17, 15);
        g.fillStyle(color, 1); g.fillCircle(cx, 16, 12);
        line(cx - 8, 12, cx - 17, -1, light, 4); line(cx + 8, 12, cx + 17, -1, light, 4);
        gem(cx - 5, 17, 2.4, 0xcaff8c); gem(cx + 5, 17, 2.4, 0xcaff8c);
      } else {
        // Armoured humanoids: layered cloak, greaves, pauldrons, plated chest and weapon silhouette.
        g.fillStyle(dark, 1);
        g.fillTriangle(cx - 15, 27, cx - 28, 72, cx + 17, 66);
        g.fillRoundedRect(cx - 15, 48, 12, 22, 3); g.fillRoundedRect(cx + 3, 48, 12, 22, 3);
        g.fillStyle(0x302a2a, 1);
        g.fillRoundedRect(cx - 17, 65, 15, 9, 3); g.fillRoundedRect(cx + 2, 65, 15, 9, 3);
        g.fillStyle(dark, 1); g.fillRoundedRect(cx - 17, 26, 34, 33, 7);
        g.fillStyle(color, 1); g.fillRoundedRect(cx - 14, 25, 28, 29, 6);
        g.fillStyle(light, 0.94); g.fillTriangle(cx, 29, cx - 9, 48, cx + 9, 48);
        g.fillStyle(dark, 1); g.fillRoundedRect(cx - 24, 28, 13, 13, 5); g.fillRoundedRect(cx + 11, 28, 13, 13, 5);
        g.fillStyle(light, 0.8); g.fillRoundedRect(cx - 22, 29, 8, 7, 3); g.fillRoundedRect(cx + 14, 29, 8, 7, 3);
        g.fillStyle(0x241e1e, 1); g.fillCircle(cx, 14, 13);
        g.fillStyle(light, 1); g.fillRoundedRect(cx - 10, 5, 20, 17, 5);
        g.fillStyle(dark, 1); g.fillRect(cx - 11, 13, 22, 6);
        gem(cx - 5, 15, 1.8, 0xffd68b); gem(cx + 5, 15, 1.8, 0xffd68b);
        line(cx + 17, 38, cx + 29, 68, 0x30251f, boss ? 7 : 4);
        line(cx + 29, 68, cx + 33, 76, 0xd5c19a, boss ? 4 : 2);
        line(cx - 18, 38, cx - 27, 54, 0x30251f, 5);
        g.fillStyle(0xb89a6b, 0.9); g.fillRect(cx - 16, 52, 32, 3);
        g.fillStyle(0x2a2020, 0.8); g.fillCircle(cx, 41, 5);
        gem(cx, 41, boss ? 4 : 2.6, type.includes('hollow') || type.includes('hushed') ? 0xb89aff : 0xf3c878);
        if (type.includes('scout') || type.includes('bandit') || type.includes('raider') || type.includes('sentry')) {
          line(cx + 23, 31, cx + 30, 63, 0x5b4939, 3); line(cx + 30, 31, cx + 30, 63, 0xc5b18b, 1.5);
        }
      }

      if (boss) {
        // Boss frame, crown-like silhouette and a pulsing core give major foes a distinct visual read.
        g.lineStyle(3, 0xd6b56e, 0.95); g.strokeRoundedRect(3, 3, w - 6, h - 7, 18);
        g.lineStyle(2, light, 0.85); g.strokeRoundedRect(8, 8, w - 16, h - 17, 14);
        g.fillStyle(0x120d12, 0.92); g.fillTriangle(cx, -7, cx - 18, 15, cx + 18, 15);
        gem(cx, 9, 3.8, type.includes('hush') || type.includes('morrow') ? 0xc4a0ff : 0xffd17c);
      }
      g.generateTexture(key, w, h);
      g.destroy();
    });

    const projectileKey = `${this.texturePrefix}-projectile`;
    if (!this.scene.textures.exists(projectileKey)) {
      const g = this.scene.add.graphics({ x: 0, y: 0 });
      g.fillStyle(0x6b2d28, 0.35); g.fillCircle(9, 9, 9);
      g.fillStyle(0xff9d4d, 0.22); g.fillCircle(9, 9, 14);
      g.fillStyle(0xffd18a, 1); g.fillCircle(9, 9, 5);
      g.fillStyle(0xffffff, 0.92); g.fillCircle(7, 7, 2);
      g.generateTexture(projectileKey, 18, 18); g.destroy();
    }
  }
}
