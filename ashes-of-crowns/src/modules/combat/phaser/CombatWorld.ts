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
    on('world:companion-assist-actions', (actions: any[]) => {
      const view = { x: this.player.x, y: this.player.y, health: this.player.stats.health, maxHealth: this.player.stats.config.maxHealth, facing: this.player.facing };
      for (const action of actions ?? []) this.engine.receiveAssist(action, view);
    });
    on('combat:ability-request', (payload: { abilityId: string }) => { if (payload?.abilityId) this.useAbility(payload.abilityId); });
    on('combat:region-changed', (payload: { region: string }) => { if (payload?.region) this.engine.setRegion(payload.region); });
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
      const w = boss ? 96 : 56;
      const h = boss ? 112 : 68;
      const color = colors[i];
      const dark = Phaser.Display.Color.IntegerToColor(color).darken(42).color;
      const light = Phaser.Display.Color.IntegerToColor(color).brighten(28).color;
      const g = this.scene.add.graphics({ x: 0, y: 0 });
      const cx = w / 2;
      // Ground shadow and a readable, full-body silhouette.
      g.fillStyle(0x080707, 0.38); g.fillEllipse(cx, h - 4, w * 0.66, 9);
      // Cloak / rear silhouette; varies by creature family.
      if (type.includes('wolf') || type.includes('stag') || type.includes('serpent') || type.includes('scorpion')) {
        g.fillStyle(dark, 1);
        g.fillTriangle(cx - 12, h * 0.42, cx - 25, h * 0.75, cx - 5, h * 0.68);
        g.fillTriangle(cx + 12, h * 0.42, cx + 25, h * 0.75, cx + 5, h * 0.68);
      } else {
        g.fillStyle(dark, 1);
        g.fillTriangle(cx - w * 0.22, h * 0.38, cx - w * 0.31, h * 0.88, cx + w * 0.12, h * 0.78);
      }
      // Legs and boots.
      g.fillStyle(0x29242a, 1);
      g.fillRoundedRect(cx - (boss ? 17 : 10), h * 0.69, boss ? 13 : 9, h * 0.25, 3);
      g.fillRoundedRect(cx + (boss ? 4 : 2), h * 0.69, boss ? 13 : 9, h * 0.25, 3);
      g.fillStyle(0x8b684d, 1);
      g.fillRoundedRect(cx - (boss ? 19 : 12), h * 0.89, boss ? 17 : 12, 6, 2);
      g.fillRoundedRect(cx + (boss ? 2 : 0), h * 0.89, boss ? 17 : 12, 6, 2);
      // Torso armor with a bright edge and central plate.
      g.fillStyle(dark, 1); g.fillRoundedRect(cx - w * 0.24, h * 0.31, w * 0.48, h * 0.43, boss ? 12 : 7);
      g.fillStyle(color, 1); g.fillRoundedRect(cx - w * 0.19, h * 0.3, w * 0.38, h * 0.4, boss ? 10 : 6);
      g.fillStyle(light, 0.9); g.fillTriangle(cx, h * 0.34, cx - w * 0.1, h * 0.62, cx + w * 0.1, h * 0.62);
      // Head, helmet/horns, and unmistakable eyes.
      const headR = boss ? 17 : 11;
      const headY = h * 0.22;
      g.fillStyle(0x211c20, 1); g.fillCircle(cx, headY, headR + 3);
      g.fillStyle(light, 1); g.fillCircle(cx, headY, headR);
      g.fillStyle(dark, 1); g.fillRoundedRect(cx - headR * 0.82, headY - 2, headR * 1.64, headR * 0.9, 4);
      g.fillStyle(0xffd78a, 1);
      g.fillCircle(cx - headR * 0.38, headY + 1, boss ? 3.2 : 2.2);
      g.fillCircle(cx + headR * 0.38, headY + 1, boss ? 3.2 : 2.2);
      if (boss || type.includes('soldier') || type.includes('guard') || type.includes('champion') || type.includes('hobb') || type.includes('voss') || type.includes('morrow')) {
        g.lineStyle(boss ? 4 : 2.5, 0xd9bd80, 1);
        g.strokeRoundedRect(cx - headR - 4, headY - headR * 0.72, headR * 2 + 8, headR * 1.2, 5);
        g.lineBetween(cx - headR * 0.7, headY - headR, cx - headR * 1.25, headY - headR * 1.75);
        g.lineBetween(cx + headR * 0.7, headY - headR, cx + headR * 1.25, headY - headR * 1.75);
      }
      // A visible weapon or claw makes the enemy's attack direction readable.
      g.lineStyle(boss ? 5 : 3, 0x332b2a, 1);
      g.lineBetween(cx + w * 0.19, h * 0.48, cx + w * 0.38, h * 0.78);
      g.lineStyle(boss ? 4 : 2, 0xe2c78c, 1);
      g.lineBetween(cx + w * 0.38, h * 0.78, cx + w * 0.43, h * 0.88);
      if (boss) {
        g.lineStyle(3, 0xd6b56e, 0.95);
        g.strokeRoundedRect(3, 3, w - 6, h - 7, 17);
      }
      g.generateTexture(key, w, h);
      g.destroy();
    });
    const projectileKey = `${this.texturePrefix}-projectile`;
    if (!this.scene.textures.exists(projectileKey)) {
      const g = this.scene.add.graphics({ x: 0, y: 0 });
      g.fillStyle(0x6b2d28, 0.45); g.fillCircle(8, 8, 8);
      g.fillStyle(0xffd18a, 1); g.fillCircle(8, 8, 5);
      g.fillStyle(0xffffff, 0.9); g.fillCircle(6, 6, 2);
      g.generateTexture(projectileKey, 16, 16); g.destroy();
    }
  }
}
