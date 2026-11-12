import type { Currency, ErrorCode, Result } from '../types';
import { fail } from '../types';
import type { RpgContext } from '../core/context';
import { getItemDef } from '../data/items';
import { SHOPS, SHOP_LIST } from '../data/shops';
import type { ShopEntry } from '../data/shops';
import { baseSellPrice } from './itemMath';
import type { EconomySystem } from './EconomySystem';
import type { InventorySystem } from './InventorySystem';

export interface ShopEntryView {
  itemId: string; name: string; rarity: string; icon: string; price: number; currency: Currency;
  remaining: number | null; locked: boolean; lockReason: string | null; canBuy: boolean; reason: ErrorCode | null;
}

/** Vendors. Buy prices follow item value * shop multiplier (gold prices +15% per New Game+ cycle); selling pays 40% of value. */
export class ShopSystem {
  private ctx: RpgContext;
  private inventory: InventorySystem;
  private economy: EconomySystem;
  constructor(ctx: RpgContext, inventory: InventorySystem, economy: EconomySystem) { this.ctx = ctx; this.inventory = inventory; this.economy = economy; }

  listShops(region?: string): { id: string; name: string; npc: string; region: string }[] {
    return SHOP_LIST.filter((s) => !region || s.region === region).map((s) => ({ id: s.id, name: s.name, npc: s.npc, region: s.region }));
  }
  private key(shopId: string, itemId: string): string { return `${shopId}:${itemId}`; }
  private priceOf(shopId: string, e: ShopEntry): { price: number; currency: Currency } {
    const shop = SHOPS[shopId]!; const currency = e.currency ?? 'gold';
    if (e.price !== undefined) return { price: e.price, currency };
    const cycleMult = 1 + 0.15 * this.ctx.state.ngPlus.cycle;
    return { price: Math.max(1, Math.ceil(getItemDef(e.itemId).value * shop.priceMult * cycleMult)), currency };
  }
  private lockReason(e: ShopEntry): string | null {
    if (e.minLevel && this.ctx.state.level < e.minLevel) return `Requires level ${e.minLevel}`;
    if (e.requiresFlag && !this.ctx.state.flags[e.requiresFlag]) return 'Not available yet';
    if (e.minNgCycle && this.ctx.state.ngPlus.cycle < e.minNgCycle) return 'Available in New Game+';
    return null;
  }
  private remaining(shopId: string, e: ShopEntry): number | null {
    return e.limit === undefined ? null : Math.max(0, e.limit - (this.ctx.state.shopPurchases[this.key(shopId, e.itemId)] ?? 0));
  }

  getShop(shopId: string): Result<{ shop: { id: string; name: string; npc: string; sellMult: number; entries: ShopEntryView[] } }> {
    const shop = SHOPS[shopId];
    if (!shop) return fail('unknown_shop');
    const entries: ShopEntryView[] = shop.stock.map((e) => {
      const def = getItemDef(e.itemId); const { price, currency } = this.priceOf(shopId, e);
      const lock = this.lockReason(e); const rem = this.remaining(shopId, e);
      const check = this.checkBuy(shopId, e.itemId, 1);
      return { itemId: e.itemId, name: def.name, rarity: def.rarity, icon: def.icon, price, currency, remaining: rem, locked: lock !== null, lockReason: lock, canBuy: check.ok, reason: check.ok ? null : check.reason };
    });
    return { ok: true, shop: { id: shop.id, name: shop.name, npc: shop.npc, sellMult: shop.sellMult, entries } };
  }

  private checkBuy(shopId: string, itemId: string, qty: number): Result<{ unit: number; currency: Currency }> {
    const shop = SHOPS[shopId];
    if (!shop) return fail('unknown_shop');
    const e = shop.stock.find((x) => x.itemId === itemId);
    if (!e) return fail('unknown_entry');
    if (!Number.isInteger(qty) || qty <= 0) return fail('invalid_quantity');
    if (this.lockReason(e)) return fail('locked');
    const rem = this.remaining(shopId, e);
    if (rem !== null && rem < qty) return fail('out_of_stock');
    const { price, currency } = this.priceOf(shopId, e);
    const total = price * qty;
    if (currency === 'gold' && this.economy.gold < total) return fail('insufficient_gold');
    if (currency === 'shards' && this.economy.shards < total) return fail('insufficient_shards');
    if (!this.inventory.canAdd(itemId, qty)) return fail('inventory_full');
    return { ok: true, unit: price, currency };
  }

  buy(shopId: string, itemId: string, qty = 1): Result<{ price: number; currency: Currency }> {
    const c = this.checkBuy(shopId, itemId, qty);
    if (!c.ok) return c;
    const total = c.unit * qty;
    this.economy.spendCurrency(c.currency, total);
    this.inventory.add(itemId, qty);
    const k = this.key(shopId, itemId);
    this.ctx.state.shopPurchases[k] = (this.ctx.state.shopPurchases[k] ?? 0) + qty;
    this.ctx.events.emit('rpg:purchase', { shopId, itemId, qty, price: total, currency: c.currency });
    return { ok: true, price: total, currency: c.currency };
  }

  sellPriceFor(shopId: string, uid: string): number {
    const inst = this.inventory.get(uid); const shop = SHOPS[shopId];
    if (!inst || !shop) return 0;
    return Math.floor(baseSellPrice(getItemDef(inst.defId), inst.upgrade) * shop.sellMult);
  }
  sell(shopId: string, uid: string, qty = 1): Result<{ gold: number }> {
    const shop = SHOPS[shopId];
    if (!shop) return fail('unknown_shop');
    return this.inventory.sell(uid, qty, shop.sellMult);
  }

  /** Resets purchase limits. Call when the player rests, sleeps or a day passes (or listen to 'shops:restock'). */
  restock(): void { this.ctx.state.shopPurchases = {}; }
}
