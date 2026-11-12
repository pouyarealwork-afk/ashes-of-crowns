/** ASHES OF CROWNS — Module 2: Combat. Public API. */
export { CombatEngine, enemyRect, intersects } from './core/CombatEngine';
export type { CombatEngineOptions, AbilityResources, AbilityUseOutcome } from './core/CombatEngine';
export { CombatWorld } from './phaser/CombatWorld';
export type { CombatWorldOptions, CombatPlayerActor, CombatRpgFacade, PlayerSkillBinding } from './phaser/CombatWorld';
export { ENEMIES, BOSSES, getEnemyArchetype, getBossDefinition } from './data/enemies';
export { DamageResolver, applyHitToEnemy } from './systems/DamageResolver';
export { EnemyAIController } from './systems/EnemyAI';
export { BossDirector } from './systems/BossDirector';
export { StatusEffectSystem } from './systems/StatusEffects';
export type * from './types';
