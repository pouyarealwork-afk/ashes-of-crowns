import type { ActiveBuff, EnemyTier, EquipSlot, Passives, RegionId, Stats, TreeId } from './types';
import type { AbilityEffect } from './data/skills';

/** Minimal bus contract. Phaser.Events.EventEmitter (scene.events / game.events) satisfies it. */
export interface ExternalBus {
  on(event: string, fn: (...args: any[]) => void, context?: any): unknown;
  off?(event: string, fn?: (...args: any[]) => void, context?: any): unknown;
  emit(event: string, ...args: any[]): unknown;
}

export interface RewardBundle { xp: number; gold: number; shards: number; items: { itemId: string; qty: number }[] }
export interface LevelUpReward { gold: number; shards: number; items: { itemId: string; qty: number }[]; recipes: string[] }

/** Events EMITTED by the RPG module (payload is the single argument). */
export interface RpgEventMap {
  'rpg:xp-gained': { amount: number; total: number; level: number; source: string };
  'rpg:level-up': { level: number; previousLevel: number; skillPointsGained: number; rewards: LevelUpReward; stats: Stats; fullRestore: true };
  'rpg:stats-changed': { stats: Stats; passives: Passives; flags: string[] };
  'rpg:inventory-changed': { reason: string };
  'rpg:item-added': { defId: string; qty: number };
  'rpg:loot-overflow': { items: { itemId: string; qty: number }[] };
  'rpg:equipment-changed': { slot: EquipSlot; equippedDefId: string | null; previousDefId: string | null };
  'rpg:consumable-used': { defId: string; heal: number; mana: number; stamina: number; xp: number; buffId: string | null };
  'rpg:gold-changed': { gold: number; delta: number };
  'rpg:shards-changed': { shards: number; delta: number };
  'rpg:purchase': { shopId: string; itemId: string; qty: number; price: number; currency: string };
  'rpg:sale': { defId: string; qty: number; gold: number };
  'rpg:skill-ranked': { skillId: string; rank: number; tree: TreeId; skillPoints: number };
  'rpg:skills-respec': { refunded: number; cost: number };
  'rpg:hotbar-changed': { hotbar: (string | null)[] };
  'rpg:ability-used': { abilityId: string; rank: number; manaCost: number; staminaCost: number; effect: AbilityEffect; cooldownMs: number };
  'rpg:buff-added': { buff: ActiveBuff };
  'rpg:buff-expired': { buffId: string };
  'rpg:recipe-learned': { recipeId: string };
  'rpg:craft-complete': { recipeId: string; itemId: string; qty: number };
  'rpg:item-upgraded': { uid: string; defId: string; level: number };
  'rpg:station-changed': { station: string | null };
  'rpg:skin-unlocked': { skinId: string; textureKey: string };
  'rpg:skin-equipped': { skinId: string; textureKey: string };
  'rpg:achievement-unlocked': { achievementId: string; name: string };
  'rpg:new-game-plus': { cycle: number; scaling: NgPlusScaling; levelCap: number };
  'rpg:reward-granted': { source: string; rewards: RewardBundle };
}
export interface NgPlusScaling { cycle: number; enemyHealthMult: number; enemyDamageMult: number; xpMult: number; goldMult: number; shardMult: number; dropRarityBonus: number }

/** Events LISTENED TO on the external bus (see RpgModule.connectBus). */
export interface InboundEventMap {
  'enemy:killed': { enemyId: string; tier: EnemyTier; level: number; region: RegionId; isBoss?: boolean };
  'quest:completed': { questId: string; rewards?: Partial<RewardBundle> & { recipes?: string[] } };
  'boss:defeated': { bossId: string };
  'story:flag': { flag: string; value?: boolean };
  'ending:reached': { endingId: string };
  'region:entered': { region: RegionId };
  'shops:restock': Record<string, never>;
  'station:open': { station: 'blacksmith' | 'alchemist' };
  'station:close': Record<string, never>;
}

type Handler<T> = (payload: T) => void;

export class RpgEmitter {
  private handlers = new Map<string, Set<Handler<any>>>();
  private bridge: ExternalBus | null = null;

  on<K extends keyof RpgEventMap>(event: K, fn: Handler<RpgEventMap[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); }
    set.add(fn);
    return () => this.off(event, fn);
  }
  once<K extends keyof RpgEventMap>(event: K, fn: Handler<RpgEventMap[K]>): () => void {
    const off = this.on(event, (p) => { off(); fn(p); });
    return off;
  }
  off<K extends keyof RpgEventMap>(event: K, fn: Handler<RpgEventMap[K]>): void { this.handlers.get(event)?.delete(fn); }
  emit<K extends keyof RpgEventMap>(event: K, payload: RpgEventMap[K]): void {
    const set = this.handlers.get(event);
    if (set) for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[rpg] listener for ${event} threw`, err); }
    }
    if (this.bridge) this.bridge.emit(event, payload);
  }
  setBridge(bus: ExternalBus | null): void { this.bridge = bus; }
}

