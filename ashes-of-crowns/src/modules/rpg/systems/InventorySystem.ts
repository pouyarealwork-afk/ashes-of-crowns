import type { EquipSlot, ItemDef, ItemInstance, ItemType, Rarity, Result } from '../types';
import { fail } from '../types';
import type { RpgContext } from '../core/context';
import { INVENTORY_CAPACITY, RARITY_INFO } from '../data/config';
import { getItemDef, ITEMS, isEquipment } from '../data/items';
import { baseSellPrice, formatMod, formatPassives, maxUpgradeFor, scaledMods, slotsFor, stackLimit } from './itemMath';
import type { EconomySystem } from './EconomySystem';

export type SortKey = 'rarity' | 'name' | 'type' | 'value' | 'recent' | 'level';
export interface InventoryQuery { type?: ItemType | ItemType[]; rarity?: Rarity; search?: string; equippableOnly?: boolean; sort?: SortKey; descending?: boolean }

export interface ItemView {
  uid: string; defId: string; name: string; displayName: string; type: ItemType; rarity: Rarity; rarityLabel: string; rarityColor: string;
  description: string; icon: string; qty: number; upgrade: number; maxUpgrade: number; levelReq: number;
  statLines: string[]; passiveLines: string[]; consumableLine: string | null;
  sellPrice: number; sellable: boolean; equippable: boolean; slots: EquipSlot[]; usable: boolean;
}

const TYPE_ORDER: ItemType[] = ['weapon', 'armor', 'helmet', 'ring', 'amulet', 'consumable', 'material', 'quest'];

export class InventorySystem {
  private ctx: RpgContext;
  private economy: EconomySystem;
  constructor(ctx: RpgContext, economy: EconomySystem) { this.ctx = ctx; this.economy = economy; }

  get capacity(): number { return INVENTORY_CAPACITY; }
  /** Quest items do not occupy capacity. */
  usedSlots(): number { return this.ctx.state.inventory.filter((i) => getItemDef(i.defId).type !== 'quest').length; }
  freeSlots(): number { return Math.max(0, INVENTORY_CAPACITY - this.usedSlots()); }

  get(uid: string): ItemInstance | undefined {
    return this.ctx.state.inventory.find((i) => i.uid === uid) ?? Object.values(this.ctx.state.equipment).find((e) => e?.uid === uid) ?? undefined;
  }
  count(defId: string): number { return this.ctx.state.inventory.reduce((n, i) => (i.defId === defId ? n + i.qty : n), 0); }
  has(defId: string, qty = 1): boolean { return this.count(defId) >= qty; }

  canAdd(defId: string, qty = 1): boolean {
    const def = ITEMS[defId]; if (!def || qty <= 0) return false;
    const limit = stackLimit(def);
    if (def.type === 'quest') return true;
    let room = 0;
    if (limit > 1) for (const i of this.ctx.state.inventory) if (i.defId === defId && i.upgrade === 0) room += limit - i.qty;
    return room + this.freeSlots() * limit >= qty;
  }

  /** Adds items, filling existing stacks first. Returns how many were added and how many did not fit. */
  add(defId: string, qty = 1, upgrade = 0): { added: number; overflow: number } {
    const def = getItemDef(defId);
    if (!Number.isFinite(qty) || qty <= 0) return { added: 0, overflow: 0 };
    let remaining = Math.floor(qty);
    const limit = stackLimit(def);
    if (limit > 1) {
      for (const i of this.ctx.state.inventory) {
        if (remaining <= 0) break;
        if (i.defId === defId && i.upgrade === 0 && i.qty < limit) { const t = Math.min(limit - i.qty, remaining); i.qty += t; remaining -= t; }
      }
    }
    while (remaining > 0 && (def.type === 'quest' || this.freeSlots() > 0)) {
      const t = Math.min(limit, remaining);
      this.ctx.state.inventory.push({ uid: this.ctx.nextUid(), defId, qty: t, upgrade, seq: this.ctx.nextSeq() });
      remaining -= t;
    }
    const added = Math.floor(qty) - remaining;
    if (added > 0) {
      this.ctx.events.emit('rpg:item-added', { defId, qty: added });
      this.ctx.events.emit('rpg:inventory-changed', { reason: 'add' });
    }
    return { added, overflow: remaining };
  }

  /** Re-inserts an existing instance (e.g. when unequipping). */
  insertInstance(inst: ItemInstance): boolean {
    const def = getItemDef(inst.defId);
    if (def.type !== 'quest' && this.freeSlots() <= 0) return false;
    this.ctx.state.inventory.push(inst);
    this.ctx.events.emit('rpg:inventory-changed', { reason: 'insert' });
    return true;
  }
  takeInstance(uid: string): ItemInstance | undefined {
    const idx = this.ctx.state.inventory.findIndex((i) => i.uid === uid);
    if (idx < 0) return undefined;
    const [inst] = this.ctx.state.inventory.splice(idx, 1);
    return inst;
  }

  /** Removes `qty` of a definition across stacks (smallest stacks first). Returns false and changes nothing if not enough. */
  remove(defId: string, qty = 1): boolean {
    if (qty <= 0 || this.count(defId) < qty) return false;
    let remaining = qty;
    const stacks = this.ctx.state.inventory.filter((i) => i.defId === defId).sort((a, b) => a.qty - b.qty);
    for (const s of stacks) {
      if (remaining <= 0) break;
      const t = Math.min(s.qty, remaining); s.qty -= t; remaining -= t;
    }
    this.ctx.state.inventory = this.ctx.state.inventory.filter((i) => i.qty > 0);
    this.ctx.events.emit('rpg:inventory-changed', { reason: 'remove' });
    return true;
  }
  removeUid(uid: string, qty = 1): boolean {
    const inst = this.ctx.state.inventory.find((i) => i.uid === uid);
    if (!inst || qty <= 0 || inst.qty < qty) return false;
    inst.qty -= qty;
    if (inst.qty <= 0) this.ctx.state.inventory = this.ctx.state.inventory.filter((i) => i.uid !== uid);
    this.ctx.events.emit('rpg:inventory-changed', { reason: 'remove' });
    return true;
  }

  list(q: InventoryQuery = {}): ItemInstance[] {
    const types = q.type === undefined ? null : Array.isArray(q.type) ? q.type : [q.type];
    const search = q.search?.trim().toLowerCase();
    let items = this.ctx.state.inventory.filter((i) => {
      const d = getItemDef(i.defId);
      if (types && !types.includes(d.type)) return false;
      if (q.rarity && d.rarity !== q.rarity) return false;
      if (search && !d.name.toLowerCase().includes(search) && !d.description.toLowerCase().includes(search)) return false;
      if (q.equippableOnly && !(isEquipment(d) && (d.levelReq ?? 1) <= this.ctx.state.level)) return false;
      return true;
    });
    const sort = q.sort ?? 'type';
    const cmp = (a: ItemInstance, b: ItemInstance): number => {
      const da = getItemDef(a.defId); const db = getItemDef(b.defId);
      switch (sort) {
        case 'rarity': return RARITY_INFO[db.rarity].index - RARITY_INFO[da.rarity].index || da.name.localeCompare(db.name);
        case 'name': return da.name.localeCompare(db.name);
        case 'type': return TYPE_ORDER.indexOf(da.type) - TYPE_ORDER.indexOf(db.type) || RARITY_INFO[db.rarity].index - RARITY_INFO[da.rarity].index || da.name.localeCompare(db.name);
        case 'value': return db.value * (1 + 0.25 * b.upgrade) - da.value * (1 + 0.25 * a.upgrade);
        case 'level': return (db.levelReq ?? 0) - (da.levelReq ?? 0);
        case 'recent': return b.seq - a.seq;
      }
    };
    items = items.slice().sort(cmp);
    if (q.descending) items.reverse();
    return items;
  }

  describe(inst: ItemInstance): ItemView {
    const def: ItemDef = getItemDef(inst.defId);
    const info = RARITY_INFO[def.rarity];
    const statLines = scaledMods(def, inst.upgrade).flatMap(formatMod);
    const passiveLines = formatPassives(def.passives ?? {});
    let consumableLine: string | null = null;
    if (def.consumable) {
      const c = def.consumable; const parts: string[] = [];
      if (c.heal) parts.push(`Restores ${c.heal} health`);
      if (c.healPct) parts.push(`Restores ${Math.round(c.healPct * 100)}% max health`);
      if (c.mana) parts.push(`Restores ${c.mana} mana`);
      if (c.stamina) parts.push(`Restores ${c.stamina} stamina`);
      if (c.xp) parts.push(`Grants ${c.xp} XP`);
      if (c.buff) parts.push(`Buff for ${Math.round(c.buff.durationMs / 1000)}s`);
      consumableLine = parts.join(', ');
    }
    const equippable = isEquipment(def);
    return {
      uid: inst.uid, defId: def.id, name: def.name, displayName: inst.upgrade > 0 ? `${def.name} +${inst.upgrade}` : def.name, type: def.type, rarity: def.rarity,
      rarityLabel: info.label, rarityColor: info.color, description: def.description, icon: def.icon, qty: inst.qty, upgrade: inst.upgrade,
      maxUpgrade: equippable ? maxUpgradeFor(def) : 0, levelReq: def.levelReq ?? 1, statLines, passiveLines, consumableLine,
      sellPrice: baseSellPrice(def, inst.upgrade), sellable: def.sellable !== false, equippable, slots: slotsFor(def), usable: !!def.consumable,
    };
  }

  /** Sells directly to a vendor-less NPC at base rate (shops use ShopSystem.sell with their own multiplier). */
  sell(uid: string, qty = 1, sellMult = 1): Result<{ gold: number }> {
    const inst = this.ctx.state.inventory.find((i) => i.uid === uid);
    if (!inst) return fail('not_found');
    const def = getItemDef(inst.defId);
    if (def.sellable === false) return fail('not_sellable');
    if (!Number.isInteger(qty) || qty <= 0 || qty > inst.qty) return fail('invalid_quantity');
    const gold = Math.floor(baseSellPrice(def, inst.upgrade) * sellMult) * qty;
    this.removeUid(uid, qty);
    this.economy.addGold(gold);
    this.ctx.events.emit('rpg:sale', { defId: def.id, qty, gold });
    return { ok: true, gold };
  }

  /** Sells every non-equipped item of a rarity or lower matching an optional type filter. Handy "sell junk" action. */
  sellJunk(maxRarity: Rarity = 'common', types: ItemType[] = ['weapon', 'armor', 'helmet', 'ring', 'amulet']): { gold: number; count: number } {
    let gold = 0; let count = 0;
    for (const inst of [...this.ctx.state.inventory]) {
      const d = getItemDef(inst.defId);
      if (!types.includes(d.type) || d.sellable === false) continue;
      if (RARITY_INFO[d.rarity].index > RARITY_INFO[maxRarity].index) continue;
      const qty = inst.qty;
      const r = this.sell(inst.uid, qty);
      if (r.ok) { gold += r.gold; count += qty; }
    }
    return { gold, count };
  }
}
