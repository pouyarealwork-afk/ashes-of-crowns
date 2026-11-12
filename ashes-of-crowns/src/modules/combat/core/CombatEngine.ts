import { BOSSES, getBossDefinition, getEnemyArchetype } from '../data/enemies';
import { DamageResolver, applyHitToEnemy } from '../systems/DamageResolver';
import { EnemyAIController } from '../systems/EnemyAI';
import { BossDirector } from '../systems/BossDirector';
import { StatusEffectSystem } from '../systems/StatusEffects';
import type {
  BossPhase, CombatDamageResult, CombatEventMap, CombatEventName, CombatHit, CombatListener,
  CombatRpgBridge, EnemySpawnOptions, EnemyState, EventBusLike, PlayerAttackEvent, PlayerCombatView, Rect, RpgSkillBridge,
} from '../types';

export interface CombatEngineOptions { emitter?: EventBusLike; rpg?: CombatRpgBridge; rng?: () => number; region?: string }
export interface AbilityResources { mana: number; stamina: number; baseAttack?: number }
export interface AbilityUseOutcome { ok: boolean; reason?: string; targets?: number; effect?: any; manaCost?: number; staminaCost?: number; lifestealHeal?: number }

/** Phaser-free encounter brain. Owns enemy state, damage, status effects, boss phases and combat events. */
export class CombatEngine {
  readonly enemies = new Map<string, EnemyState>();
  readonly damage: DamageResolver;
  readonly ai = new EnemyAIController();
  readonly bosses = new BossDirector();
  readonly statuses = new StatusEffectSystem();
  private listeners = new Map<string, Set<(p: any) => void>>();
  private emitter?: EventBusLike;
  private rng: () => number;
  private idCounter = 0;
  private now = 0;
  private encounterStartedAt = 0;
  private defeated = 0;
  private region: string;
  private combo = 0;
  private comboExpiresAt = 0;
  private attackHits = new Map<string, Set<string>>();

  constructor(opts: CombatEngineOptions = {}) {
    this.emitter = opts.emitter; this.rng = opts.rng ?? Math.random; this.region = opts.region ?? 'ashen_village';
    this.damage = new DamageResolver(opts.rpg?.combat, this.rng);
  }

  on<K extends CombatEventName>(event: K, fn: CombatListener<K>): () => void {
    let set = this.listeners.get(event); if (!set) this.listeners.set(event, set = new Set());
    set.add(fn as (p: any) => void); return () => set?.delete(fn as (p: any) => void);
  }
  emit<K extends CombatEventName>(event: K, payload: CombatEventMap[K]): void {
    for (const fn of [...(this.listeners.get(event) ?? [])]) { try { fn(payload); } catch (e) { console.error(`[combat] ${event} listener failed`, e); } }
    this.emitter?.emit(event, payload);
  }

  setRegion(region: string): void { this.region = region || this.region; }
  spawn(type: string, options: EnemySpawnOptions): EnemyState {
    const archetype = getEnemyArchetype(type);
    if (!archetype) throw new Error(`Unknown enemy archetype: ${type}`);
    const level = Math.max(1, Math.floor(options.level ?? 1));
    const bossId = options.bossId ?? (BOSSES[type] ? type : undefined);
    const isBoss = !!bossId;
    const elite = !!options.elite && !isBoss;
    const levelScale = 1 + (level - 1) * 0.115;
    const eliteScale = elite ? 1.65 : 1;
    const hpScale = isBoss ? levelScale : levelScale * eliteScale;
    const id = options.id ?? `${type}_${++this.idCounter}`;
    const state: EnemyState = {
      id, archetypeId: type, name: archetype.name, tier: isBoss ? 'boss' : elite ? 'elite' : archetype.tier,
      ai: archetype.ai, x: options.x, y: options.y, vx: 0, vy: 0, facing: -1,
      health: Math.round(archetype.health * hpScale), maxHealth: Math.round(archetype.health * hpScale),
      damage: Math.round(archetype.damage * levelScale * (elite ? 1.25 : 1)), defense: Math.round(archetype.defense * (elite ? 1.35 : 1)),
      speed: archetype.speed * (elite ? 1.08 : 1), level, xp: Math.round(archetype.xp * levelScale * (elite ? 1.6 : 1)),
      gold: Math.round(archetype.gold * levelScale * (elite ? 1.7 : 1)), alive: true, aggro: false,
      attackCooldownMs: this.rng() * 350, attackWindupMs: archetype.attackWindupMs, attackRange: archetype.attackRange, windupRemainingMs: 0,
      stunRemainingMs: 0, slowMultiplier: 1, patrol: options.patrol, bossId, bossPhase: isBoss ? 1 : undefined,
      phaseThresholds: isBoss ? [0.65, 0.3] : undefined, statuses: [], hitFlashMs: 0, attackSerial: 0,
      elite, region: options.region ?? this.region, lastAttackAt: 0, comboPressure: 0,
      resistances: archetype.resistances, baseDamage: Math.round(archetype.damage * levelScale * (elite ? 1.25 : 1)), baseSpeed: archetype.speed * (elite ? 1.08 : 1),
    };
    this.enemies.set(id, state);
    if (this.enemies.size === 1) { this.encounterStartedAt = this.now; this.defeated = 0; }
    this.emit('combat:enemy-spawned', { enemyId: id, enemyType: type, x: state.x, y: state.y, tier: state.tier });
    if (bossId) {
      const def = getBossDefinition(bossId);
      if (def) this.emit('combat:boss-intro', { bossId, name: def.name, title: def.title, intro: def.intro });
      this.emitter?.emit('audio:boss', { active: true, bossId });
    }
    return state;
  }

  spawnFromWorld(spawns: Array<{ type: string; x: number; y: number; elite?: boolean; boss?: string; patrol?: [number, number] }>, level = 1, region = this.region): EnemyState[] {
    return spawns.map((s, i) => this.spawn(s.type, { ...s, id: `${region}_${s.type}_${i}`, bossId: s.boss, level, region }));
  }

  getAlive(): EnemyState[] { return [...this.enemies.values()].filter(e => e.alive); }
  getEnemy(id: string): EnemyState | undefined { return this.enemies.get(id); }
  clear(remove = true): void { if (remove) this.enemies.clear(); else for (const e of this.enemies.values()) e.alive = false; this.combo = 0; }

  update(dtMs: number, player: PlayerCombatView, onEnemyAttack?: (enemy: EnemyState, damage: number, ranged: boolean) => void): void {
    const dt = Math.min(50, Math.max(0, dtMs)); this.now += dt;
    if (this.now > this.comboExpiresAt) this.combo = 0;
    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) continue;
      const tick = this.statuses.tick(enemy, dt);
      if (tick.damage > 0) this.damageEnemy(enemy.id, { amount: tick.damage, school: 'true', sourceId: 'status' });
      if (!enemy.alive) continue;
      const action = this.ai.update(enemy, player, dt);
      enemy.vx = action.vx;
      if (action.telegraph && !enemy.telegraphActive) {
        enemy.telegraphActive = true;
        this.emit('combat:telegraph', { enemyId: enemy.id, attack: enemy.ai, durationMs: enemy.attackWindupMs });
      }
      if (enemy.windupRemainingMs <= 0 && enemy.attackCooldownMs <= 0 && action.telegraph === false) {
        // The AI sets a wind-up on the decision frame; the adapter calls resolveEnemyAttack after it expires.
      }
      if (enemy.windupRemainingMs > 0) {
        const wasWinding = enemy.windupRemainingMs;
        enemy.windupRemainingMs = Math.max(0, enemy.windupRemainingMs - dt);
        if (wasWinding > 0 && enemy.windupRemainingMs === 0 && enemy.alive) {
          enemy.telegraphActive = false;
          enemy.attackCooldownMs = this.attackCooldownFor(enemy);
          enemy.attackSerial++;
          onEnemyAttack?.(enemy, enemy.damage, enemy.ai === 'ranged' || enemy.ai === 'support');
        }
      }
      const phase = this.bosses.update(enemy);
      if (phase) { this.emit('combat:boss-phase', { bossId: phase.bossId, phase: phase.phase as BossPhase, pattern: phase.pattern }); this.emit('combat:boss-pattern', { bossId: phase.bossId, phase: phase.phase as BossPhase, pattern: phase.pattern }); }
    }
    if (this.enemies.size && this.getAlive().length === 0) {
      this.emit('combat:encounter-cleared', { region: this.region, enemiesDefeated: this.defeated, elapsedMs: Math.max(0, this.now - this.encounterStartedAt) });
      this.enemies.clear();
    }
  }

  /** Resolve a single active player swing. attackToken prevents the same swing hitting an enemy twice. */
  resolvePlayerAttack(attack: PlayerAttackEvent, hitbox: Rect, player: PlayerCombatView, attackToken: string): CombatDamageResult[] {
    let hitIds = this.attackHits.get(attackToken);
    if (!hitIds) { hitIds = new Set<string>(); this.attackHits.set(attackToken, hitIds);
      if (this.attackHits.size > 12) this.attackHits.delete(this.attackHits.keys().next().value as string);
    }
    const results: CombatDamageResult[] = [];
    for (const enemy of this.getAlive()) {
      if (hitIds.has(enemy.id) || !intersects(hitbox, enemyRect(enemy))) continue;
      hitIds.add(enemy.id);
      const behind = player.x < enemy.x ? enemy.facing === 1 : enemy.facing === -1;
      const comboMultiplier = 1 + Math.min(0.5, Math.floor((this.combo + 1) / 5) * 0.1);
      const multiplier = (attack.kind === 'heavy' ? 1.7 : attack.kind === 'skill' ? 2 : 1) * comboMultiplier;
      const result = this.damage.outgoing({ baseDamage: attack.damage || 10, multiplier, target: enemy, school: 'physical', behind, bonusCritChance: attack.kind === 'heavy' ? 0.08 : 0 });
      const applied = applyHitToEnemy(enemy, { amount: result.damage, school: 'true', sourceId: 'aren', knockback: attack.kind === 'heavy' ? 220 : 110, stunMs: attack.kind === 'heavy' ? 260 : 90 }, this.damage);
      const payload: CombatDamageResult = { damage: applied.damage, critical: result.critical, killed: applied.killed, targetId: enemy.id, remainingHealth: enemy.health, lifestealHeal: result.lifestealHeal };
      results.push(payload); this.emit('combat:enemy-hit', { ...payload, critical: result.critical });
      if (result.lifestealHeal > 0) this.emit('combat:lifesteal', { amount: result.lifestealHeal, sourceId: 'aren' });
      this.advanceCombo();
      if (applied.killed) this.onEnemyDefeated(enemy);
    }
    return results;
  }

  damageEnemy(enemyId: string, hit: CombatHit): CombatDamageResult | null {
    const enemy = this.enemies.get(enemyId); if (!enemy?.alive) return null;
    const applied = applyHitToEnemy(enemy, hit, this.damage);
    const result: CombatDamageResult = { damage: applied.damage, critical: !!hit.critical, killed: applied.killed, targetId: enemy.id, remainingHealth: enemy.health, statusApplied: applied.statusApplied };
    if (hit.status) this.statuses.apply(enemy, { kind: hit.status.kind, remainingMs: hit.status.durationMs, tickMs: hit.status.tickMs, tickDamage: hit.status.tickDamage, magnitude: hit.status.magnitude, source: hit.sourceId });
    this.emit('combat:enemy-hit', result);
    if (applied.killed) this.onEnemyDefeated(enemy);
    return result;
  }

  receiveAssist(action: { companionId: string; abilityId: string; kind: string; power: number; targeting: string; vfx?: string }, player: PlayerCombatView): number {
    const alive = this.getAlive();
    let targets = action.targeting === 'all_in_range' ? alive.filter(e => Math.hypot(e.x - player.x, e.y - player.y) <= 260)
      : action.targeting === 'boss' ? alive.filter(e => e.tier === 'boss')
      : action.targeting === 'player' ? []
      : alive.sort((a, b) => Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)).slice(0, 1);
    if (action.kind === 'heal' || action.kind === 'shield' || action.kind === 'revive' || action.kind === 'buff') {
      this.emitter?.emit(`combat:companion-${action.kind}`, { ...action, target: 'player' });
    } else {
      for (const e of targets) this.damageEnemy(e.id, { amount: Math.max(1, Math.round(action.power)), school: 'physical', sourceId: `companion:${action.companionId}`, stunMs: action.kind === 'stun' ? 900 : undefined });
    }
    this.emit('combat:assist-applied', { companionId: action.companionId, abilityId: action.abilityId, targets: targets.length });
    return targets.length;
  }

  useAbility(id: string, resources: AbilityResources, rpg: { skills?: RpgSkillBridge }, player: PlayerCombatView, spendResources?: (mana: number, stamina: number) => boolean): AbilityUseOutcome {
    const result = rpg.skills?.tryUseAbility?.(id, { mana: resources.mana, stamina: resources.stamina });
    if (!result?.ok || !result.use) return { ok: false, reason: result?.reason ?? 'RPG skill bridge unavailable or ability not learned' };
    const effect = result.use.effect;
    if (spendResources && !spendResources(result.use.manaCost, result.use.staminaCost)) return { ok: false, reason: 'insufficient resources' };
    let targets = 0;
    const alive = this.getAlive(); let totalLifesteal = 0;
    const candidates = effect.kind === 'melee' ? alive.filter(e => Math.abs(e.x-player.x) <= 150 && Math.abs(e.y-player.y) <= 100)
      : effect.kind === 'projectile' ? alive.sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)).slice(0,1)
      : effect.kind === 'aoe' || effect.kind === 'dot' || effect.kind === 'execute' || effect.kind === 'ultimate'
        ? alive.filter(e => Math.hypot(e.x-player.x,e.y-player.y) <= (effect.radius ?? 180)) : [];
    for (const enemy of candidates) {
      const hpPct = enemy.health / enemy.maxHealth;
      const raw = resources.baseAttack ?? 14;
      const behind = player.x < enemy.x ? enemy.facing === 1 : enemy.facing === -1;
      const calc = this.damage.ability(effect, enemy, { targetHpPct: hpPct, behind });
      totalLifesteal += calc.lifestealHeal;
      const applied = this.damageEnemy(enemy.id, { amount: calc.damage, school: 'true', sourceId: id, critical: calc.critical,
        status: effect.dotMultiplierPerSec ? { kind: effect.school === 'magic' ? 'burn' : 'bleed', durationMs: effect.durationMs ?? 3500, tickMs: 700, tickDamage: Math.max(1, Math.round(raw * effect.dotMultiplierPerSec)) } : effect.slowPct ? { kind: 'slow', durationMs: effect.durationMs ?? 2500, magnitude: effect.slowPct } : undefined });
      if (applied) targets++;
    }
    if (effect.kind === 'buff' || effect.kind === 'dash') this.emitter?.emit(`combat:effect:${effect.kind}`, { abilityId: id, effect });
    this.emit('combat:ability-used', { abilityId: id, kind: effect.kind, targets });
    if (totalLifesteal > 0) this.emit('combat:lifesteal', { amount: totalLifesteal, sourceId: id });
    return { ok: true, targets, effect, manaCost: result.use.manaCost, staminaCost: result.use.staminaCost, lifestealHeal: totalLifesteal };
  }

  private advanceCombo(): void {
    this.combo = this.now <= this.comboExpiresAt ? this.combo + 1 : 1;
    this.comboExpiresAt = this.now + 1800;
    this.emit('combat:combo', { count: this.combo, multiplier: 1 + Math.min(0.5, Math.floor(this.combo / 5) * 0.1) });
  }
  private onEnemyDefeated(enemy: EnemyState): void {
    this.defeated++;
    const bossId = enemy.bossId;
    // WorldModule listens to combat:enemy-defeated for ordinary enemies and
    // combat:boss-defeated for bosses. Emitting both for a boss would double-count it.
    if (bossId) {
      this.emit('combat:boss-defeated', { bossId, enemyId: enemy.archetypeId });
      this.emit('boss:defeated', { bossId });
      this.emitter?.emit('audio:boss', { active: false, bossId });
    } else {
      this.emit('combat:enemy-defeated', { enemyId: enemy.archetypeId, tier: enemy.tier, level: enemy.level, region: enemy.region });
    }
    this.emit('enemy:killed', { enemyId: enemy.archetypeId, tier: enemy.tier === 'boss' ? 'boss' : enemy.tier === 'elite' ? 'elite' : 'minion', level: enemy.level, region: enemy.region, isBoss: enemy.tier === 'boss' });
  }
  private attackCooldownFor(enemy: EnemyState): number { return enemy.tier === 'boss' ? 1450 : enemy.ai === 'ranged' ? 2100 : 1350; }
}

export function enemyRect(e: EnemyState): Rect { const size = e.tier === 'boss' ? 88 : e.tier === 'elite' ? 54 : 42; return { x: e.x-size/2, y: e.y-size, width: size, height: size }; }
export function intersects(a: Rect, b: Rect): boolean { return a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y; }
