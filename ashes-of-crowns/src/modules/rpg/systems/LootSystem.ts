import type { EnemyTier, Rarity, RegionId } from '../types';
import { REGION_IDS } from '../types';
import type { RewardBundle } from '../events';
import type { RpgContext } from '../core/context';
import { RARITY_INFO, RARITY_ORDER } from '../data/config';
import { ITEM_LIST } from '../data/items';
import { REGION_LOOT, TIER_CONFIG } from '../data/loot';
import type { AchievementSystem } from './AchievementSystem';
import type { EconomySystem } from './EconomySystem';
import type { InventorySystem } from './InventorySystem';
import type { NgPlusSystem } from './NgPlusSystem';
import type { ProgressionSystem } from './ProgressionSystem';

export interface EnemyKillInfo { enemyId: string; tier: EnemyTier; level: number; region: RegionId; isBoss?: boolean }

/** Enemy rewards: XP, gold, Ancient Shards, materials, potions, gear. Tuned so progression and economy stay balanced (see tests). */
export class LootSystem {
  private ctx: RpgContext;
  private economy: EconomySystem;
  private inventory: InventorySystem;
  private progression: ProgressionSystem;
  private ng: NgPlusSystem;
  private ach: AchievementSystem;
  constructor(ctx: RpgContext, economy: EconomySystem, inventory: InventorySystem, progression: ProgressionSystem, ng: NgPlusSystem, ach: AchievementSystem) {
    this.ctx = ctx; this.economy = economy; this.inventory = inventory; this.progression = progression; this.ng = ng; this.ach = ach;
  }

  xpValue(tier: EnemyTier, enemyLevel: number): number {
    const t = TIER_CONFIG[tier];
    const diff = this.ctx.state.level - enemyLevel;
    const penalty = tier === 'boss' ? 1 : diff >= 8 ? 0.2 : diff >= 5 ? 0.5 : 1;
    return Math.max(1, Math.round(t.xp * (1 + 0.18 * (enemyLevel - 1)) * penalty * this.ng.getScaling().xpMult));
  }

  /** Rolls rewards for a kill without applying them. */
  rollEnemyDrops(info: EnemyKillInfo): RewardBundle {
    const rng = this.ctx.rng; const t = TIER_CONFIG[info.tier]; const loot = REGION_LOOT[info.region]; const sc = this.ng.getScaling();
    const passives = this.ctx.stats.getPassives();
    const items: { itemId: string; qty: number }[] = [];
    const push = (itemId: string, qty: number) => { const e = items.find((x) => x.itemId === itemId); if (e) e.qty += qty; else items.push({ itemId, qty }); };

    const gold = Math.round(t.gold * (1 + 0.15 * (info.level - 1)) * (0.8 + rng() * 0.4) * sc.goldMult * (1 + passives.goldFind));
    let shards = 0;
    if (rng() < t.shardChance) shards = Math.round((t.shardMin + Math.floor(rng() * (t.shardMax - t.shardMin + 1))) * sc.shardMult);

    for (let i = 0; i < t.matRolls; i++) {
      for (const m of loot.materials) if (rng() < m.chance * t.matChanceMult / t.matRolls * 1.4) push(m.itemId, m.min + Math.floor(rng() * (m.max - m.min + 1)));
    }
    if (rng() < t.potionChance) push(loot.potion, 1);
    if (rng() < t.gearChance) { const g = this.rollGear(info.region, info.level, info.tier, sc.dropRarityBonus); if (g) push(g, 1); }
    return { xp: this.xpValue(info.tier, info.level), gold, shards, items };
  }

  private rollGear(region: RegionId, level: number, tier: EnemyTier, bonus: number): string | null {
    const rng = this.ctx.rng; const w = { ...TIER_CONFIG[tier].rarityWeights };
    for (const r of RARITY_ORDER) w[r] *= 1 + bonus * RARITY_INFO[r].index * 4;
    const total = RARITY_ORDER.reduce((n, r) => n + w[r], 0);
    let roll = rng() * total; let rarity: Rarity = 'common';
    for (const r of RARITY_ORDER) { roll -= w[r]; if (roll <= 0) { rarity = r; break; } }
    // Gear from this region plus the previous one (so late regions still drop non-legendary upgrades).
    const ri = REGION_IDS.indexOf(region);
    const pool = ITEM_LIST.filter((i) => (i.regions ?? []).some((r) => { const k = REGION_IDS.indexOf(r); return k === ri || (k === ri - 1 && i.rarity !== 'legendary'); }) && (i.levelReq ?? 1) <= level + 3);
    if (pool.length === 0) return null;
    const idx = RARITY_INFO[rarity].index;
    for (const order of [idx, ...Array.from({ length: idx }, (_, k) => idx - 1 - k), ...Array.from({ length: 4 - idx }, (_, k) => idx + 1 + k)]) {
      const cands = pool.filter((i) => RARITY_INFO[i.rarity].index === order);
      if (cands.length) return cands[Math.floor(rng() * cands.length)]!.id;
    }
    return null;
  }

  /** Applies a reward bundle: XP, gold, shards, items (overflow is reported via 'rpg:loot-overflow'). */
  grant(r: Partial<RewardBundle>, source: string): void {
    const bundle: RewardBundle = { xp: r.xp ?? 0, gold: r.gold ?? 0, shards: r.shards ?? 0, items: r.items ?? [] };
    if (bundle.gold) this.economy.addGold(bundle.gold);
    if (bundle.shards) this.economy.addShards(bundle.shards);
    const overflow: { itemId: string; qty: number }[] = [];
    for (const it of bundle.items) { const res = this.inventory.add(it.itemId, it.qty); if (res.overflow > 0) overflow.push({ itemId: it.itemId, qty: res.overflow }); }
    if (overflow.length) this.ctx.events.emit('rpg:loot-overflow', { items: overflow });
    if (bundle.xp) this.progression.addXp(bundle.xp, source);
    this.ctx.events.emit('rpg:reward-granted', { source, rewards: bundle });
  }

  /** Full kill pipeline: roll, grant, counters, mana-on-kill hint. Returns the bundle so the caller can show floating text. */
  onEnemyKilled(info: EnemyKillInfo): RewardBundle {
    const bundle = this.rollEnemyDrops(info);
    this.grant(bundle, `kill:${info.enemyId}`);
    this.ach.bump('kills');
    if (info.tier === 'boss' || info.isBoss) this.ach.bump('bossKills');
    return bundle;
  }
}
