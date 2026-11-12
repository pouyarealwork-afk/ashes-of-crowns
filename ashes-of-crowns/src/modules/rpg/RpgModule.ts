import type { InboundEventMap } from './events';
import { RpgEmitter } from './events';
import type { ExternalBus, RewardBundle } from './events';
import type { Passives, Rng, RpgState, Stats } from './types';
import { mulberry32 } from './types';
import { RpgContext } from './core/context';
import { createInitialState, migrateSnapshot } from './core/state';
import { STARTING_KIT } from './data/config';
import { getItemDef } from './data/items';
import { StatSystem } from './systems/StatSystem';
import { EconomySystem } from './systems/EconomySystem';
import { InventorySystem } from './systems/InventorySystem';
import { EquipmentSystem } from './systems/EquipmentSystem';
import { BuffSystem } from './systems/BuffSystem';
import { ProgressionSystem } from './systems/ProgressionSystem';
import { SkillSystem } from './systems/SkillSystem';
import { CombatMath } from './systems/CombatMath';
import { ConsumableSystem } from './systems/ConsumableSystem';
import { CraftingSystem } from './systems/CraftingSystem';
import { ShopSystem } from './systems/ShopSystem';
import { SkinSystem } from './systems/SkinSystem';
import { AchievementSystem } from './systems/AchievementSystem';
import { LootSystem } from './systems/LootSystem';
import { NgPlusSystem } from './systems/NgPlusSystem';

export interface RpgModuleOptions {
  /** External event bus (e.g. Phaser game.events). Can also be attached later with connectBus(). */
  bus?: ExternalBus;
  /** Random source. Defaults to a seeded generator; pass Math.random for non-deterministic loot. */
  rng?: Rng; seed?: number;
  /** A snapshot from serialize(). If omitted, a new game is started. */
  snapshot?: unknown;
}

/** Facade for the whole RPG module. Construct once per game and share it with the other modules. */
export class RpgModule {
  readonly events: RpgEmitter;
  readonly ctx: RpgContext;
  readonly stats: StatSystem;
  readonly economy: EconomySystem;
  readonly inventory: InventorySystem;
  readonly equipment: EquipmentSystem;
  readonly buffs: BuffSystem;
  readonly progression: ProgressionSystem;
  readonly skills: SkillSystem;
  readonly combat: CombatMath;
  readonly consumables: ConsumableSystem;
  readonly crafting: CraftingSystem;
  readonly shops: ShopSystem;
  readonly skins: SkinSystem;
  readonly achievements: AchievementSystem;
  readonly loot: LootSystem;
  readonly ngPlus: NgPlusSystem;
  private bus: ExternalBus | null = null;
  private busHandlers: [string, (...a: any[]) => void][] = [];

  constructor(opts: RpgModuleOptions = {}) {
    this.events = new RpgEmitter();
    const rng = opts.rng ?? mulberry32(opts.seed ?? Date.now());
    this.ctx = new RpgContext(createInitialState(), this.events, rng);
    this.stats = this.ctx.stats = new StatSystem(this.ctx);
    this.economy = new EconomySystem(this.ctx);
    this.inventory = new InventorySystem(this.ctx, this.economy);
    this.equipment = new EquipmentSystem(this.ctx, this.inventory);
    this.buffs = new BuffSystem(this.ctx);
    this.progression = new ProgressionSystem(this.ctx, this.economy, this.inventory);
    this.skills = new SkillSystem(this.ctx, this.buffs, this.economy);
    this.combat = new CombatMath(this.ctx);
    this.consumables = new ConsumableSystem(this.ctx, this.inventory, this.buffs, this.progression);
    this.crafting = new CraftingSystem(this.ctx, this.inventory, this.economy);
    this.shops = new ShopSystem(this.ctx, this.inventory, this.economy);
    this.skins = new SkinSystem(this.ctx);
    this.achievements = new AchievementSystem(this.ctx);
    this.ngPlus = new NgPlusSystem(this.ctx, this.buffs);
    this.loot = new LootSystem(this.ctx, this.economy, this.inventory, this.progression, this.ngPlus, this.achievements);
    this.progression.learnRecipe = (id) => { this.crafting.learnRecipe(id); };
    this.achievements.grant = (r, src) => this.loot.grant(r, src);
    this.wireInternal();
    if (opts.snapshot !== undefined) this.load(opts.snapshot); else this.newGame();
    if (opts.bus) this.connectBus(opts.bus);
  }

  private wireInternal(): void {
    const e = this.events;
    e.on('rpg:level-up', (p) => { this.achievements.setMax('maxLevel', p.level); this.crafting.onLevel(p.level); });
    e.on('rpg:gold-changed', (p) => { if (p.delta > 0) this.achievements.bump('goldEarned', p.delta); });
    e.on('rpg:item-added', (p) => { if (getItemDef(p.defId).rarity === 'legendary') this.achievements.bump('legendaryObtained'); });
    e.on('rpg:craft-complete', (p) => { this.achievements.bump('itemsCrafted', p.qty); });
    e.on('rpg:item-upgraded', (p) => { this.achievements.setMax('maxUpgrade', p.level); });
    e.on('rpg:skill-ranked', (p) => { this.achievements.setMax(`points_${p.tree}`, this.skills.pointsSpent(p.tree)); });
    e.on('rpg:achievement-unlocked', () => { this.skins.evaluate(); });
    e.on('rpg:new-game-plus', (p) => { this.achievements.setMax('ngPlusCycle', p.cycle); });
  }

  // ---------------- lifecycle ----------------
  /** Starts a fresh game: level 1, starter gear equipped, 50 gold, 3 minor health potions, starting recipes. */
  newGame(): void {
    this.ctx.state = createInitialState();
    this.ctx.buffs = []; this.ctx.cooldowns = {}; this.ctx.station = null;
    this.ctx.state.gold = STARTING_KIT.gold;
    this.crafting.seedStartingRecipes();
    this.crafting.onLevel(1);
    for (const id of STARTING_KIT.equipped) { const r = this.inventory.add(id, 1); if (r.added) { const inst = this.inventory.list({ search: getItemDef(id).name }).find((i) => i.defId === id); if (inst) this.equipment.equip(inst.uid); } }
    for (const it of STARTING_KIT.items) this.inventory.add(it.itemId, it.qty);
    this.achievements.setMax('maxLevel', 1);
    this.skins.evaluate();
    this.ctx.statsChanged();
  }
  /** Serializes everything that must persist. Pure JSON. Buffs and cooldowns are intentionally transient. */
  serialize(): RpgState { return JSON.parse(JSON.stringify(this.ctx.state)) as RpgState; }
  load(snapshot: unknown): void {
    this.ctx.state = migrateSnapshot(snapshot);
    this.ctx.buffs = []; this.ctx.cooldowns = {}; this.ctx.station = null;
    this.ctx.statsChanged();
    this.events.emit('rpg:inventory-changed', { reason: 'load' });
  }
  /** Call every frame from the scene's update(time, delta). */
  update(dtMs: number): void { this.buffs.tick(dtMs); this.skills.tick(dtMs); }

  // ---------------- convenience reads ----------------
  getStats(): Stats { return this.stats.getStats(); }
  getPassives(): Passives { return this.stats.getPassives(); }
  getLevel(): number { return this.ctx.state.level; }
  getGold(): number { return this.ctx.state.gold; }
  getShards(): number { return this.ctx.state.shards; }
  /** Per-second regeneration the player module should apply to its CURRENT values. */
  getRegenPerSecond(): { health: number; mana: number; stamina: number } {
    const p = this.stats.getPassives(); return { health: p.healthRegen, mana: p.manaRegen, stamina: p.staminaRegen };
  }

  // ---------------- story / quest notifications ----------------
  setStoryFlag(flag: string, value = true): void {
    this.ctx.state.flags[flag] = value;
    if (value) this.crafting.onFlag(flag);
    this.skins.evaluate();
  }
  notifyQuestCompleted(questId: string, rewards?: Partial<RewardBundle> & { recipes?: string[] }): void {
    if (this.ctx.state.completedQuests.includes(questId)) return;
    this.ctx.state.completedQuests.push(questId);
    this.achievements.bump('questsCompleted');
    if (rewards) { this.loot.grant(rewards, `quest:${questId}`); for (const r of rewards.recipes ?? []) this.crafting.learnRecipe(r); }
    this.skins.evaluate();
  }
  notifyBossDefeated(bossId: string): void {
    if (!this.ctx.state.defeatedBosses.includes(bossId)) this.ctx.state.defeatedBosses.push(bossId);
    this.skins.evaluate();
  }
  notifyEnding(endingId: string): void { this.setStoryFlag(`ending_${endingId}`, true); }

  // ---------------- external bus ----------------
  /** Subscribes to inbound events (see InboundEventMap) and forwards every 'rpg:*' event to the bus. */
  connectBus(bus: ExternalBus): void {
    this.disconnectBus();
    this.bus = bus;
    const on = <K extends keyof InboundEventMap>(name: K, fn: (p: InboundEventMap[K]) => void) => {
      const h = (p: InboundEventMap[K]) => fn(p);
      bus.on(name, h); this.busHandlers.push([name, h]);
    };
    on('enemy:killed', (p) => { this.loot.onEnemyKilled(p); });
    on('quest:completed', (p) => { this.notifyQuestCompleted(p.questId, p.rewards); });
    on('boss:defeated', (p) => { this.notifyBossDefeated(p.bossId); });
    on('story:flag', (p) => { this.setStoryFlag(p.flag, p.value ?? true); });
    on('ending:reached', (p) => { this.notifyEnding(p.endingId); });
    on('shops:restock', () => { this.shops.restock(); });
    on('station:open', (p) => { this.crafting.setStation(p.station); });
    on('station:close', () => { this.crafting.setStation(null); });
    this.events.setBridge(bus);
  }
  disconnectBus(): void {
    if (this.bus?.off) for (const [n, h] of this.busHandlers) this.bus.off(n, h);
    this.busHandlers = []; this.bus = null; this.events.setBridge(null);
  }
  dispose(): void { this.disconnectBus(); }
}
