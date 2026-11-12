import type { Result } from '../types';
import { fail } from '../types';
import type { RpgContext } from '../core/context';
import { CONSUMABLE_COOLDOWN_MS } from '../data/config';
import { getItemDef } from '../data/items';
import type { BuffSystem } from './BuffSystem';
import type { InventorySystem } from './InventorySystem';
import type { ProgressionSystem } from './ProgressionSystem';

export interface ConsumableResult { defId: string; heal: number; mana: number; stamina: number; xp: number; buffId: string | null }

/**
 * Using a consumable consumes one item, grants XP / buffs internally and returns the heal/mana/stamina amounts.
 * The player module owns CURRENT hp/mana/stamina, so it must apply the returned amounts (or listen to 'rpg:consumable-used').
 */
export class ConsumableSystem {
  private ctx: RpgContext;
  private inventory: InventorySystem;
  private buffs: BuffSystem;
  private progression: ProgressionSystem;
  constructor(ctx: RpgContext, inventory: InventorySystem, buffs: BuffSystem, progression: ProgressionSystem) {
    this.ctx = ctx; this.inventory = inventory; this.buffs = buffs; this.progression = progression;
  }

  use(uid: string): Result<{ result: ConsumableResult }> {
    const inst = this.ctx.state.inventory.find((i) => i.uid === uid);
    if (!inst) return fail('not_found');
    const def = getItemDef(inst.defId);
    const c = def.consumable;
    if (!c) return fail('not_usable');
    if ((this.ctx.cooldowns['consumable'] ?? 0) > 0) return fail('cooldown');
    const stats = this.ctx.stats.getStats();
    const result: ConsumableResult = {
      defId: def.id,
      heal: Math.round((c.heal ?? 0) + (c.healPct ?? 0) * stats.health),
      mana: Math.round((c.mana ?? 0) + (c.manaPct ?? 0) * stats.mana),
      stamina: Math.round((c.stamina ?? 0) + (c.staminaPct ?? 0) * stats.stamina),
      xp: c.xp ?? 0, buffId: c.buff?.id ?? null,
    };
    this.inventory.removeUid(uid, 1);
    this.ctx.cooldowns['consumable'] = CONSUMABLE_COOLDOWN_MS;
    if (c.buff) {
      const bd: { stats?: typeof c.buff.stats; passives?: typeof c.buff.passives } = {};
      if (c.buff.stats) bd.stats = c.buff.stats;
      if (c.buff.passives) bd.passives = c.buff.passives;
      this.buffs.add(c.buff.id, c.buff.durationMs, bd);
    }
    if (c.xp) this.progression.addXp(c.xp, 'consumable');
    this.ctx.events.emit('rpg:consumable-used', result);
    return { ok: true, result };
  }

  /** Convenience for hotkeys: uses the first stack of a definition. */
  useByDefId(defId: string): Result<{ result: ConsumableResult }> {
    const inst = this.ctx.state.inventory.find((i) => i.defId === defId);
    return inst ? this.use(inst.uid) : fail('not_found');
  }
}
