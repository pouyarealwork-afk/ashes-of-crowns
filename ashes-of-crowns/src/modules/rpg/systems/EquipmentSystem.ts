import type { EquipSlot, ItemInstance, Passives, Result, StatKey, Stats } from '../types';
import { EQUIP_SLOTS, fail, PASSIVE_KEYS, STAT_KEYS } from '../types';
import type { RpgContext } from '../core/context';
import { getItemDef, isEquipment } from '../data/items';
import { RARITY_INFO } from '../data/config';
import { slotsFor } from './itemMath';
import type { InventorySystem, ItemView } from './InventorySystem';

export interface ItemComparison {
  slot: EquipSlot | null; candidate: ItemView; equipped: ItemView | null;
  /** Final-stat change (after percentage bonuses and caps) if the candidate were equipped. */
  statDelta: Partial<Record<StatKey, number>>; passiveDelta: Partial<Record<keyof Passives, number>>;
  canEquip: boolean;
}

export class EquipmentSystem {
  private ctx: RpgContext;
  private inventory: InventorySystem;
  constructor(ctx: RpgContext, inventory: InventorySystem) { this.ctx = ctx; this.inventory = inventory; }

  getEquipped(): Record<EquipSlot, ItemInstance | null> { return { ...this.ctx.state.equipment }; }
  getSlot(slot: EquipSlot): ItemInstance | null { return this.ctx.state.equipment[slot]; }

  /** Chooses the slot an item would go in: first empty slot, else (for rings) the lower-rarity ring. */
  pickSlot(defId: string, hint?: EquipSlot): EquipSlot | null {
    const slots = slotsFor(getItemDef(defId));
    if (slots.length === 0) return null;
    if (hint) return slots.includes(hint) ? hint : null;
    const empty = slots.find((s) => !this.ctx.state.equipment[s]);
    if (empty) return empty;
    if (slots.length === 1) return slots[0] ?? null;
    const score = (s: EquipSlot) => { const e = this.ctx.state.equipment[s]; if (!e) return -1; const d = getItemDef(e.defId); return RARITY_INFO[d.rarity].index * 100000 + d.value; };
    return slots.reduce((a, b) => (score(b) < score(a) ? b : a));
  }

  equip(uid: string, slotHint?: EquipSlot): Result<{ slot: EquipSlot }> {
    const inst = this.ctx.state.inventory.find((i) => i.uid === uid);
    if (!inst) return fail('not_found');
    const def = getItemDef(inst.defId);
    if (!isEquipment(def)) return fail('not_equippable');
    if ((def.levelReq ?? 1) > this.ctx.state.level) return fail('level_too_low');
    if (slotHint && !slotsFor(def).includes(slotHint)) return fail('invalid_slot');
    const slot = this.pickSlot(def.id, slotHint);
    if (!slot) return fail('invalid_slot');
    const previous = this.ctx.state.equipment[slot];
    this.inventory.takeInstance(uid);
    this.ctx.state.equipment[slot] = inst;
    if (previous) this.inventory.insertInstance(previous);
    this.ctx.events.emit('rpg:equipment-changed', { slot, equippedDefId: def.id, previousDefId: previous?.defId ?? null });
    this.ctx.events.emit('rpg:inventory-changed', { reason: 'equip' });
    this.ctx.statsChanged();
    return { ok: true, slot };
  }

  unequip(slot: EquipSlot): Result {
    if (!EQUIP_SLOTS.includes(slot)) return fail('invalid_slot');
    const inst = this.ctx.state.equipment[slot];
    if (!inst) return fail('not_found');
    if (!this.inventory.insertInstance(inst)) return fail('inventory_full');
    this.ctx.state.equipment[slot] = null;
    this.ctx.events.emit('rpg:equipment-changed', { slot, equippedDefId: null, previousDefId: inst.defId });
    this.ctx.statsChanged();
    return { ok: true };
  }

  /** Compares an inventory item with what it would replace, using real final stats (percentages and caps included). */
  compare(uid: string, slotHint?: EquipSlot): Result<{ comparison: ItemComparison }> {
    const inst = this.inventory.get(uid);
    if (!inst) return fail('not_found');
    const def = getItemDef(inst.defId);
    if (!isEquipment(def)) return fail('not_equippable');
    const slot = this.pickSlot(def.id, slotHint);
    if (!slot) return fail('invalid_slot');
    const current = this.ctx.stats.compute();
    const hypothetical = { ...this.ctx.state.equipment, [slot]: inst } as Record<EquipSlot, ItemInstance | null>;
    const next = this.ctx.stats.compute(hypothetical);
    const statDelta: Partial<Record<StatKey, number>> = {};
    for (const k of STAT_KEYS) { const d = Math.round((next.stats[k as keyof Stats] - current.stats[k as keyof Stats]) * 10000) / 10000; if (d !== 0) statDelta[k] = d; }
    const passiveDelta: Partial<Record<keyof Passives, number>> = {};
    for (const k of PASSIVE_KEYS) { const d = Math.round((next.passives[k] - current.passives[k]) * 10000) / 10000; if (d !== 0) passiveDelta[k] = d; }
    const eq = this.ctx.state.equipment[slot];
    return { ok: true, comparison: { slot, candidate: this.inventory.describe(inst), equipped: eq ? this.inventory.describe(eq) : null, statDelta, passiveDelta, canEquip: (def.levelReq ?? 1) <= this.ctx.state.level } };
  }

  /** Equips the item in each slot that gives the highest sum of (attack + defense + health/10) from inventory. Convenience for UI "Auto-equip". */
  autoEquipBest(): EquipSlot[] {
    const changed: EquipSlot[] = [];
    const rate = (inst: ItemInstance) => { const c = this.compareScore(inst); return c; };
    for (const inst of this.inventory.list({ equippableOnly: true }).sort((a, b) => rate(b) - rate(a))) {
      const slot = this.pickSlot(inst.defId); if (!slot) continue;
      const cur = this.ctx.state.equipment[slot];
      if (!cur || rate(inst) > rate(cur)) { if (this.equip(inst.uid).ok) changed.push(slot); }
    }
    return changed;
  }
  private compareScore(inst: ItemInstance): number {
    const d = getItemDef(inst.defId); let s = RARITY_INFO[d.rarity].index * 0.01;
    for (const m of d.stats ?? []) {
      const f = m.flat ?? 0; const base = (1 + 0.1 * inst.upgrade);
      s += m.stat === 'attack' ? f * 3 * base : m.stat === 'defense' ? f * 2 * base : m.stat === 'health' ? f * 0.2 * base : f * base * (m.stat === 'critChance' ? 100 : m.stat === 'critDamage' ? 30 : 0.3);
      s += (m.pct ?? 0) * 100;
    }
    return s;
  }
}
