/** Shared contracts for ASHES OF CROWNS — Module 2: Combat. */
export type Facing = 1 | -1;
export type EnemyTier = 'normal' | 'elite' | 'boss';
export type EnemyRewardTier = 'minion' | 'elite' | 'miniboss' | 'boss';
export type EnemyAI = 'melee' | 'ranged' | 'charger' | 'flying' | 'ambusher' | 'support' | 'boss';
export type DamageSchool = 'physical' | 'magic' | 'true';
export type StatusKind = 'burn' | 'poison' | 'bleed' | 'slow' | 'stun' | 'weaken' | 'mark';
export type BossPhase = 1 | 2 | 3;

export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface PlayerAttackEvent { kind: 'normal' | 'heavy' | 'skill'; comboIndex: number; facing: Facing; damage: number; skillId?: string; hitbox: { offsetX: number; offsetY: number; width: number; height: number }; activeFrom: number; activeFor: number }
export interface EnemyArchetype {
  id: string; name: string; tier: EnemyTier; ai: EnemyAI;
  health: number; damage: number; defense: number; speed: number; aggroRange: number;
  attackRange: number; attackCooldownMs: number; attackWindupMs: number;
  hitbox: { width: number; height: number; offsetY: number };
  xp: number; gold: number; contactDamage?: boolean; ranged?: boolean;
  color: number; scale?: number; poise?: number; resistances?: Partial<Record<DamageSchool, number>>;
}
export interface EnemySpawnOptions {
  id?: string; x: number; y: number; level?: number; elite?: boolean;
  bossId?: string; patrol?: [number, number]; region?: string; seed?: number;
}
export interface StatusEffect { kind: StatusKind; remainingMs: number; tickMs?: number; tickRemainingMs?: number; tickDamage?: number; magnitude?: number; source?: string }
export interface EnemyState {
  id: string; archetypeId: string; name: string; tier: EnemyTier; ai: EnemyAI;
  x: number; y: number; vx: number; vy: number; facing: Facing;
  health: number; maxHealth: number; damage: number; defense: number; speed: number; aggroRange: number;
  level: number; xp: number; gold: number; alive: boolean; aggro: boolean;
  attackCooldownMs: number; attackWindupMs: number; attackRange: number; windupRemainingMs: number;
  stunRemainingMs: number; slowMultiplier: number; patrol?: [number, number];
  bossId?: string; bossPhase?: BossPhase; phaseThresholds?: number[];
  statuses: StatusEffect[]; hitFlashMs: number; attackSerial: number;
  resistances?: Partial<Record<DamageSchool, number>>; baseDamage?: number; baseSpeed?: number;
  elite: boolean; region: string; lastAttackAt: number; comboPressure: number; telegraphActive?: boolean;
}
export interface PlayerCombatView {
  x: number; y: number; health: number; maxHealth: number; facing: Facing;
  isDead?: boolean; isBlocking?: boolean;
}
export interface CombatHit {
  amount: number; school?: DamageSchool; sourceId?: string; knockback?: number;
  stunMs?: number; critical?: boolean; unblockable?: boolean; piercing?: boolean;
  status?: Omit<StatusEffect, 'remainingMs'> & { durationMs: number };
}
export interface CombatDamageResult {
  damage: number; critical: boolean; killed: boolean; targetId: string;
  remainingHealth: number; statusApplied?: StatusKind; lifestealHeal?: number;
}
export interface BossPhaseDef { threshold: number; damageMultiplier: number; speedMultiplier: number; pattern: string }
export interface BossDefinition {
  id: string; enemyType: string; name: string; title: string;
  phases: [BossPhaseDef, BossPhaseDef, BossPhaseDef];
  intro: string; defeatLine: string; arenaRadius: number;
}
export interface CombatEventMap {
  'combat:enemy-spawned': { enemyId: string; enemyType: string; x: number; y: number; tier: EnemyTier };
  'combat:enemy-hit': CombatDamageResult & { critical: boolean };
  'combat:enemy-defeated': { enemyId: string; bossId?: string; tier: EnemyTier; level: number; region: string };
  'enemy:killed': { enemyId: string; tier: EnemyRewardTier; level: number; region: string; isBoss?: boolean };
  'boss:defeated': { bossId: string };
  'combat:boss-defeated': { bossId: string; enemyId: string };
  'combat:boss-phase': { bossId: string; phase: BossPhase; pattern: string };
  'combat:player-hit': { enemyId: string; damage: number; blocked: boolean; dodged: boolean };
  'combat:combo': { count: number; multiplier: number };
  'combat:enemy-combo': { enemyId: string; count: number; multiplier: number };
  'combat:enemy-combo-reset': { enemyId: string };
  'combat:assist-request': { now: number; playerHpRatio: number; enemyCount: number; bossActive: boolean; comboCount: number };
  'combat:assist-applied': { companionId: string; abilityId: string; targets: number };
  'combat:ability-used': { abilityId: string; kind: string; targets: number };
  'combat:encounter-cleared': { region: string; enemiesDefeated: number; elapsedMs: number };
  'combat:telegraph': { enemyId: string; attack: string; durationMs: number };
  'combat:boss-intro': { bossId: string; name: string; title: string; intro: string };
  'combat:hazard-hit': { hazardType: string; damage: number; blocked: boolean; dodged: boolean };
  'combat:boss-pattern': { bossId: string; phase: BossPhase; pattern: string };
  'combat:lifesteal': { amount: number; sourceId: string };
}
export type CombatEventName = keyof CombatEventMap;
export type CombatListener<K extends CombatEventName> = (payload: CombatEventMap[K]) => void;
export interface EventBusLike {
  on(event: string, fn: (...args: any[]) => void, context?: unknown): unknown;
  off?(event: string, fn?: (...args: any[]) => void, context?: unknown): unknown;
  emit(event: string, ...args: any[]): unknown;
}
export interface RpgCombatBridge {
  calcDamage?(input?: { multiplier?: number; school?: 'physical' | 'magic'; targetDefense?: number; guaranteedCrit?: boolean; bonusCritChance?: number }): { damage: number; crit: boolean; lifestealHeal: number };
  calcAbilityDamage?(effect: any, options?: { behind?: boolean; targetHpPct?: number; targetDefense?: number }): { damage: number; crit: boolean; lifestealHeal: number };
  mitigateIncoming?(rawDamage: number): number;
}
export interface RpgSkillBridge {
  tryUseAbility?(id: string, resources: { mana: number; stamina: number }): { ok: boolean; use?: { abilityId: string; manaCost: number; staminaCost: number; effect: any }; reason?: string };
  buildEffect?(id: string): any;
  cooldownRemaining?(id: string): number;
}
export interface CombatRpgBridge { combat?: RpgCombatBridge; skills?: RpgSkillBridge; stats?: { getStats?: () => any; getPassives?: () => any } }
