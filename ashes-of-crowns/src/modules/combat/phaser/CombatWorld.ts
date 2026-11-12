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
    body.setAllowGravity(false); body.setImmovable(false); body.setSize(archetype.hitbox.width, archetype.hitbox.height);
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
      if (enemy.ai === 'flying') body.setVelocityY(Math.sin(_time / 420 + enemy.x) * 18);
      sprite.setFlipX(enemy.facing < 0);
      if (enemy.hitFlashMs > 0) sprite.setTintFill(0xffffff); else sprite.clearTint();
      if (enemy.stunRemainingMs > 0) sprite.setTint(0x8dd8ff);
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
    }, (mana, stamina) => stats.spendMana(mana) && stats.spendStamina(stamina));
    if (outcome.ok && outcome.effect?.healPct) stats.heal(stats.config.maxHealth * outcome.effect.healPct);
    if (outcome.ok && outcome.effect?.dashDistance) {
      const body = this.player.body as Phaser.Physics.Arcade.Body; body.setVelocityX(this.player.facing * Math.min(650, outcome.effect.dashDistance * 2.5));
    }
    return outcome;
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
      manaRegen: passives.manaRegen, staminaRegen: passives.staminaRegen,
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
      const key = this.textureKey(type); if (this.scene.textures.exists(key)) return;
      const boss = i >= 18; const w = boss ? 96 : 48; const h = boss ? 96 : 48;
      const g = this.scene.add.graphics({ x: 0, y: 0 });
      g.fillStyle(colors[i], 1); g.fillRoundedRect(w * 0.2, h * 0.14, w * 0.6, h * 0.78, boss ? 18 : 10);
      g.fillStyle(0x20202a, 1); g.fillCircle(w * 0.38, h * 0.36, boss ? 5 : 3); g.fillCircle(w * 0.62, h * 0.36, boss ? 5 : 3);
      g.fillStyle(0xd9c7a1, 0.8); g.fillRect(w * 0.38, h * 0.72, w * 0.24, h * 0.06);
      if (boss) { g.lineStyle(5, 0xd6b56e, 1); g.strokeRoundedRect(w * 0.12, h * 0.08, w * 0.76, h * 0.86, 20); }
      g.generateTexture(key, w, h); g.destroy();
    });
    const projectileKey = `${this.texturePrefix}-projectile`;
    if (!this.scene.textures.exists(projectileKey)) {
      const g = this.scene.add.graphics({ x: 0, y: 0 }); g.fillStyle(0xffc27a, 1); g.fillCircle(8, 8, 7); g.generateTexture(projectileKey, 16, 16); g.destroy();
    }
  }
}
