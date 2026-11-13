import type { UIBackend } from '../modules/ui/contracts';
import type { GameScene } from './GameScene';
import { getItemDef } from '../modules/rpg';

const text = (value: unknown) => String(value ?? '');
const itemType = (t: string): string => t === 'helmet' || t === 'ring' || t === 'amulet' ? 'armor' : t;
const uiSlotToRpg = (s: string): string => ({ head: 'helmet', chest: 'armor', ring: 'ring1' } as Record<string, string>)[s] ?? s;
const rpgSlotToUi = (s: string): string => ({ helmet: 'head', armor: 'chest', ring1: 'ring', ring2: 'ring' } as Record<string, string>)[s] ?? s;

/** Adapts the six independent module APIs to the UI module's provider contracts. */
export function createUIBackend(scene: GameScene): UIBackend {
  const { rpg, world, persistence } = scene.services;
  const player = () => scene.aren;
  const slotId = (n: number) => `slot${Math.max(1, Math.min(3, n))}`;
  const toUiItem = (id: string) => {
    const d = getItemDef(id);
    return { id: d.id, name: d.name, description: d.description, type: itemType(d.type) as any, rarity: d.rarity, icon: d.icon, slot: (d.type === 'weapon' ? 'weapon' : d.type === 'helmet' ? 'head' : d.type === 'armor' ? 'chest' : d.type === 'ring' ? 'ring' : d.type === 'amulet' ? 'amulet' : undefined) as any, stats: Object.fromEntries((d.stats ?? []).map((s: any) => [({ health: 'maxHealth', mana: 'maxMana', stamina: 'maxStamina', critChance: 'crit', critDamage: 'crit' } as Record<string, string>)[s.stat] ?? s.stat, s.flat ?? s.pct ?? 0])), value: d.value, levelReq: d.levelReq };
  };
  const ok = (r: any) => r?.ok ? { ok: true as const } : { ok: false as const, reason: text(r?.reason ?? r?.code ?? 'Action unavailable') };

  return {
    player: {
      getPlayer: () => {
        const p = player(); const stats = rpg.getStats(); const c = p?.stats;
        return {
          name: 'Aren', level: rpg.getLevel(), xp: rpg.progression.xp,
          xpToNext: rpg.progression.xpForNextLevel(),
          health: c?.health ?? stats.health, maxHealth: c?.config.maxHealth ?? stats.health,
          mana: c?.mana ?? stats.mana, maxMana: c?.config.maxMana ?? stats.mana,
          stamina: c?.stamina ?? stats.stamina, maxStamina: c?.config.maxStamina ?? stats.stamina,
          gold: rpg.getGold(), stats: { attack: stats.attack, defense: stats.defense, speed: stats.speed, maxHealth: stats.health, maxMana: stats.mana, maxStamina: stats.stamina },
        };
      },
    },
    inventory: {
      getInventory: () => {
        const equippedRaw = rpg.equipment.getEquipped();
        const equipped: Record<string, any> = {};
        for (const [slot, inst] of Object.entries(equippedRaw)) if (inst) equipped[rpgSlotToUi(slot)] = toUiItem((inst as any).defId);
        return { items: rpg.inventory.list().map((inst: any) => ({ item: toUiItem(inst.defId), qty: inst.qty })), capacity: rpg.inventory.capacity, gold: rpg.getGold(), equipped };
      },
      equip: (itemId: string, slot: any) => { const inst = rpg.inventory.list().find((i: any) => i.defId === itemId); return ok(inst ? rpg.equipment.equip(inst.uid, uiSlotToRpg(slot) as any) : { ok: false, reason: 'Item not found' }); },
      unequip: (slot: any) => ok(rpg.equipment.unequip(uiSlotToRpg(slot) as any)),
      use: (itemId: string) => {
        const result = rpg.consumables.useByDefId(itemId);
        if (result.ok && result.result) {
          const p = player(); if (p) { p.stats.heal(result.result.heal); p.stats.restoreMana(result.result.mana); p.stats.stamina = Math.min(p.stats.config.maxStamina, p.stats.stamina + result.result.stamina); }
        }
        return ok(result);
      },
      drop: (itemId: string, qty: number) => ok(rpg.inventory.remove(itemId, qty) ? { ok: true } : { ok: false, reason: 'Not enough items' }),
    },
    skills: {
      getSkillTrees: () => (['warrior', 'arcane', 'shadow'] as const).map(id => {
        const tree = rpg.skills.getTree(id);
        return { id, name: tree.name, icon: id, nodes: tree.nodes.map((v: any) => ({
          id: v.node.id, name: v.node.name, description: v.node.description, icon: v.node.icon,
          tier: v.node.tier, row: v.node.col, requires: v.node.requires?.map((r: any) => r.skillId),
          cost: v.node.costPerRank, maxRank: v.node.maxRank, rank: v.rank, available: v.canRank,
          active: !!v.node.ability, manaCost: v.node.ability?.manaCost, cooldownSec: v.node.ability?.cooldownMs / 1000,
        })) };
      }),
      getSkillPoints: () => rpg.progression.skillPoints,
      unlockSkill: (id: string) => ok(rpg.skills.rankUp(id)),
      getHotbar: () => rpg.skills.getHotbar(),
      setHotbar: (i: number, id: string | null) => ok(rpg.skills.setHotbar(i, id)),
    },
    quests: {
      getQuests: () => world.getQuestLog().map((q: any) => ({
        id: q.id, title: q.title, kind: q.type === 'main' ? 'main' : 'side', status: q.status === 'inactive' ? 'active' : q.status,
        summary: q.summary, region: q.region, tracked: scene.trackedQuest === q.id,
        objectives: q.objectives.map((o: any) => ({ text: o.text, current: o.progress?.current ?? (o.done ? 1 : 0), target: o.progress?.target ?? 1, done: o.done })),
      })),
      setTracked: (id: string, tracked: boolean) => { scene.trackedQuest = tracked ? id : (scene.trackedQuest === id ? null : scene.trackedQuest); return { ok: true }; },
    },
    world: {
      getMap: () => {
        const view=world.getMapView();
        return { regions:view.nodes.map((n:any)=>({id:n.id,name:n.name,description:n.tagline,
          x:({ashen_village:12,whispering_forest:34,forgotten_desert:56,frozen_highlands:34,hollow_city:56,crownfall:78} as Record<string,number>)[n.id],
          y:({ashen_village:55,whispering_forest:32,forgotten_desert:55,frozen_highlands:8,hollow_city:88,crownfall:32} as Record<string,number>)[n.id],
          connections:view.edges.filter((e:any)=>e.from===n.id).map((e:any)=>e.to),
          state:n.unlocked?(n.stats.percent>=100?'cleared':'unlocked'):'locked'})),current:scene.currentRegion};
      },
      fastTravel: (region: any) => world.travel(scene.currentRegion as any, region) ? { ok: true } : { ok: false, reason: 'That route is not available yet.' },
    },
    crafting: {
      getRecipes: () => rpg.crafting.getRecipes().map((v: any) => {
        const r = v.recipe;
        return { id: r.id, result: { item: toUiItem(r.output.itemId), qty: r.output.qty }, ingredients: r.inputs.map((i: any) => ({ item: toUiItem(i.itemId), qty: i.qty })), station: r.station, levelReq: getItemDef(r.output.itemId).levelReq, known: v.known };
      }),
      craft: (id: string) => ok(rpg.crafting.craft(id)),
    },
    shop: {
      getShop: (id: string) => {
        const result = rpg.shops.getShop(id); if (!result.ok) throw new Error('Shop unavailable');
        const shop = result.shop;
        return { id: shop.id, name: shop.name, merchant: shop.npc, sellRate: shop.sellMult, stock: shop.entries.map((e: any) => ({ item: toUiItem(e.itemId), price: e.price, stock: e.remaining ?? undefined })) };
      },
      buy: (shop: string, itemId: string, qty: number) => ok(rpg.shops.buy(shop, itemId, qty)),
      sell: (shop: string, itemId: string, qty: number) => { const inst = rpg.inventory.list().find((i: any) => i.defId === itemId); return ok(inst ? rpg.shops.sell(shop, inst.uid, qty) : { ok: false, reason: 'Item not found' }); },
    },
    persistence: {
      listSlots: async () => {
        const all = await persistence.saves.listSlots();
        return [1, 2, 3].map(slot => { const found = all.find((x: any) => x.slotId === slotId(slot)); return { slot, empty: !found || found.state === 'empty', playerName: 'Aren', level: found?.meta?.level, region: found?.meta?.regionId as any, playTimeSec: found?.meta?.playtimeMs ? found.meta.playtimeMs / 1000 : 0, savedAt: found?.meta?.updatedAt }; });
      },
      save: async (slot: number) => { try { scene.activeSaveSlot = slotId(slot); await persistence.saveToSlot(scene.activeSaveSlot, `Save ${slot}`); return { ok: true }; } catch (e) { return { ok: false, reason: text((e as Error).message) }; } },
      deleteSlot: async (slot: number) => { try { await persistence.saves.deleteSlot(slotId(slot)); return { ok: true }; } catch (e) { return { ok: false, reason: text((e as Error).message) }; } },
      slotCount: 3,
    },
  } as unknown as UIBackend;
}
