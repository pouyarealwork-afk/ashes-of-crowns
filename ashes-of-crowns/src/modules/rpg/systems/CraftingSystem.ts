import type { ErrorCode, ItemInstance, Result, StationId } from '../types';
import { fail } from '../types';
import type { RpgContext } from '../core/context';
import { INVENTORY_CAPACITY, RARITY_INFO } from '../data/config';
import { getItemDef, isEquipment, ITEMS } from '../data/items';
import type { Recipe } from '../data/recipes';
import { RECIPES, RECIPE_LIST } from '../data/recipes';
import { maxUpgradeFor, scaledMods, stackLimit } from './itemMath';
import type { EconomySystem } from './EconomySystem';
import type { InventorySystem } from './InventorySystem';

export interface Cost { gold: number; shards: number; materials: { itemId: string; qty: number }[] }
export interface RecipeView { recipe: Recipe; known: boolean; canCraft: boolean; reason: ErrorCode | null; missing: { itemId: string; have: number; need: number }[]; outputName: string }
export interface UpgradePreview {
  uid: string; defId: string; current: number; next: number; max: number; maxed: boolean; cost: Cost | null; canAfford: boolean; missing: { itemId: string; have: number; need: number }[];
  statsBefore: string; statsAfter: string;
}

/** Crafting (recipes) + the Blacksmith's item upgrade service. Both require the matching workstation to be active. */
export class CraftingSystem {
  private ctx: RpgContext;
  private inventory: InventorySystem;
  private economy: EconomySystem;
  constructor(ctx: RpgContext, inventory: InventorySystem, economy: EconomySystem) { this.ctx = ctx; this.inventory = inventory; this.economy = economy; }

  // ---- station (world module calls these when the player opens/leaves an NPC) ----
  setStation(station: StationId | null): void {
    if (this.ctx.station === station) return;
    this.ctx.station = station;
    this.ctx.events.emit('rpg:station-changed', { station });
  }
  getStation(): StationId | null { return this.ctx.station; }

  // ---- recipes ----
  seedStartingRecipes(): void { for (const r of RECIPE_LIST) if (r.startsKnown) this.learnRecipe(r.id); }
  isKnown(id: string): boolean { return this.ctx.state.recipes.includes(id); }
  learnRecipe(id: string): boolean {
    if (!RECIPES[id] || this.isKnown(id)) return false;
    this.ctx.state.recipes.push(id);
    this.ctx.events.emit('rpg:recipe-learned', { recipeId: id });
    return true;
  }
  onLevel(level: number): void { for (const r of RECIPE_LIST) if (r.unlockLevel !== undefined && r.unlockLevel <= level) this.learnRecipe(r.id); }
  onFlag(flag: string): void { for (const r of RECIPE_LIST) if (r.unlockFlag === flag) this.learnRecipe(r.id); }

  private missingFor(r: Recipe, qty: number): { itemId: string; have: number; need: number }[] {
    return r.inputs.map((i) => ({ itemId: i.itemId, have: this.inventory.count(i.itemId), need: i.qty * qty })).filter((m) => m.have < m.need);
  }
  /** Simulates inventory capacity after removing inputs and adding outputs. */
  private fits(removals: { itemId: string; qty: number }[], additions: { itemId: string; qty: number }[]): boolean {
    const sim = this.ctx.state.inventory.map((i) => ({ defId: i.defId, qty: i.qty, upgrade: i.upgrade }));
    for (const rem of removals) {
      let left = rem.qty;
      for (const s of sim.filter((x) => x.defId === rem.itemId).sort((a, b) => a.qty - b.qty)) { const t = Math.min(s.qty, left); s.qty -= t; left -= t; }
    }
    const live = sim.filter((s) => s.qty > 0);
    let used = live.filter((s) => ITEMS[s.defId]?.type !== 'quest').length;
    for (const add of additions) {
      const def = getItemDef(add.itemId); const limit = stackLimit(def);
      let left = add.qty;
      if (limit > 1) for (const s of live) if (s.defId === add.itemId && s.upgrade === 0 && s.qty < limit) { const t = Math.min(limit - s.qty, left); s.qty += t; left -= t; }
      if (def.type === 'quest') continue;
      const need = Math.ceil(left / limit);
      used += need;
      if (used > INVENTORY_CAPACITY) return false;
    }
    return true;
  }

  getRecipes(filter: { station?: StationId; knownOnly?: boolean } = {}): RecipeView[] {
    return RECIPE_LIST.filter((r) => (!filter.station || r.station === filter.station) && (!filter.knownOnly || this.isKnown(r.id))).map((r) => {
      const check = this.canCraft(r.id, 1, true);
      const known = this.isKnown(r.id);
      return { recipe: r, known, canCraft: check.ok, reason: check.ok ? null : check.reason, missing: this.missingFor(r, 1), outputName: ITEMS[r.output.itemId]?.name ?? r.output.itemId };
    });
  }

  canCraft(recipeId: string, qty = 1, ignoreStation = false): Result {
    const r = RECIPES[recipeId];
    if (!r) return fail('unknown_recipe');
    if (!Number.isInteger(qty) || qty <= 0) return fail('invalid_quantity');
    if (!this.isKnown(recipeId)) return fail('recipe_locked');
    if (!ignoreStation && this.ctx.station !== r.station) return fail('wrong_station');
    if (this.missingFor(r, qty).length > 0) return fail('insufficient_materials');
    if (this.economy.gold < r.gold * qty) return fail('insufficient_gold');
    if (this.economy.shards < r.shards * qty) return fail('insufficient_shards');
    if (!this.fits(r.inputs.map((i) => ({ itemId: i.itemId, qty: i.qty * qty })), [{ itemId: r.output.itemId, qty: r.output.qty * qty }])) return fail('inventory_full');
    return { ok: true };
  }

  /** Atomic: either everything is consumed and the output created, or nothing changes. */
  craft(recipeId: string, qty = 1): Result<{ itemId: string; qty: number }> {
    const check = this.canCraft(recipeId, qty);
    if (!check.ok) return check;
    const r = RECIPES[recipeId]!;
    for (const i of r.inputs) this.inventory.remove(i.itemId, i.qty * qty);
    this.economy.spend({ gold: r.gold * qty, shards: r.shards * qty });
    const total = r.output.qty * qty;
    this.inventory.add(r.output.itemId, total);
    this.ctx.events.emit('rpg:craft-complete', { recipeId, itemId: r.output.itemId, qty: total });
    return { ok: true, itemId: r.output.itemId, qty: total };
  }

  // ---- upgrades ----
  upgradeCost(defId: string, currentLevel: number): Cost {
    const def = getItemDef(defId);
    const gold = Math.round((20 + def.value * 0.35) * (currentLevel + 1) * (1 + RARITY_INFO[def.rarity].index * 0.4));
    const jewelry = def.type === 'ring' || def.type === 'amulet';
    const materials: { itemId: string; qty: number }[] = []; let shards = 0;
    if (currentLevel <= 2) materials.push(jewelry ? { itemId: 'sun_glass', qty: 1 + currentLevel } : { itemId: 'iron_ingot', qty: 2 + currentLevel });
    else if (currentLevel <= 5) materials.push(jewelry ? { itemId: 'frost_crystal', qty: currentLevel - 2 } : { itemId: 'steel_ingot', qty: currentLevel - 1 });
    else if (currentLevel <= 8) { materials.push({ itemId: 'hollow_essence', qty: currentLevel - 4 }); shards = currentLevel - 5; }
    else { materials.push({ itemId: 'hollow_essence', qty: 5 }, { itemId: 'royal_ember', qty: 2 }); shards = 10; }
    return { gold, shards, materials };
  }

  private findGear(uid: string): ItemInstance | undefined { return this.inventory.get(uid); }

  getUpgradePreview(uid: string): Result<{ preview: UpgradePreview }> {
    const inst = this.findGear(uid);
    if (!inst) return fail('not_found');
    const def = getItemDef(inst.defId);
    if (!isEquipment(def)) return fail('not_equippable');
    const max = maxUpgradeFor(def); const maxed = inst.upgrade >= max;
    const cost = maxed ? null : this.upgradeCost(def.id, inst.upgrade);
    const missing = cost ? cost.materials.map((m) => ({ itemId: m.itemId, have: this.inventory.count(m.itemId), need: m.qty })).filter((m) => m.have < m.need) : [];
    const fmt = (lvl: number) => scaledMods(def, lvl).filter((m) => m.flat).map((m) => `${m.stat} ${m.flat}`).join(', ');
    return { ok: true, preview: { uid, defId: def.id, current: inst.upgrade, next: Math.min(max, inst.upgrade + 1), max, maxed, cost, canAfford: !!cost && missing.length === 0 && this.economy.canAfford(cost), missing, statsBefore: fmt(inst.upgrade), statsAfter: fmt(Math.min(max, inst.upgrade + 1)) } };
  }

  /** Upgrades an inventory or equipped item by +1 at the Blacksmith. Deterministic (no failure chance). */
  upgrade(uid: string): Result<{ level: number }> {
    if (this.ctx.station !== 'blacksmith') return fail('wrong_station');
    const inst = this.findGear(uid);
    if (!inst) return fail('not_found');
    const def = getItemDef(inst.defId);
    if (!isEquipment(def)) return fail('not_equippable');
    if (inst.upgrade >= maxUpgradeFor(def)) return fail('max_upgrade');
    const cost = this.upgradeCost(def.id, inst.upgrade);
    for (const m of cost.materials) if (this.inventory.count(m.itemId) < m.qty) return fail('insufficient_materials');
    if (this.economy.gold < cost.gold) return fail('insufficient_gold');
    if (this.economy.shards < cost.shards) return fail('insufficient_shards');
    for (const m of cost.materials) this.inventory.remove(m.itemId, m.qty);
    this.economy.spend({ gold: cost.gold, shards: cost.shards });
    inst.upgrade += 1;
    this.ctx.events.emit('rpg:item-upgraded', { uid, defId: def.id, level: inst.upgrade });
    this.ctx.events.emit('rpg:inventory-changed', { reason: 'upgrade' });
    if (Object.values(this.ctx.state.equipment).some((e) => e?.uid === uid)) this.ctx.statsChanged();
    return { ok: true, level: inst.upgrade };
  }

  /** One call for the blacksmith UI: craftable recipes plus upgradeable gear (inventory and equipped). */
  getBlacksmithView(): { recipes: RecipeView[]; upgradable: { uid: string; equipped: boolean; preview: UpgradePreview }[] } {
    const gear = [...this.ctx.state.inventory, ...Object.values(this.ctx.state.equipment).filter((e): e is ItemInstance => !!e)].filter((i) => isEquipment(getItemDef(i.defId)));
    const upgradable = gear.map((i) => { const p = this.getUpgradePreview(i.uid); return p.ok ? { uid: i.uid, equipped: !this.ctx.state.inventory.some((x) => x.uid === i.uid), preview: p.preview } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
    return { recipes: this.getRecipes({ station: 'blacksmith' }), upgradable };
  }
}
