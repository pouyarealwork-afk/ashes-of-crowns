import { ACHIEVEMENT_LIST } from './achievements';
import { ITEM_LIST, ITEMS } from './items';
import { REGION_LOOT } from './loot';
import { RECIPE_LIST } from './recipes';
import { SHOP_LIST } from './shops';
import { SKILLS } from './skills';
import { SKIN_LIST } from './skins';
import { LEVEL_MILESTONES, STARTING_KIT } from './config';
import { RECIPES } from './recipes';

/** Static data integrity check. Returns a list of problems (empty = OK). Run in tests and during development. */
export function validateData(): string[] {
  const p: string[] = [];
  const has = (id: string, ctx: string) => { if (!ITEMS[id]) p.push(`${ctx}: unknown item "${id}"`); };
  const ids = new Set<string>();
  for (const i of ITEM_LIST) { if (ids.has(i.id)) p.push(`duplicate item ${i.id}`); ids.add(i.id); }
  for (const r of RECIPE_LIST) { has(r.output.itemId, r.id); r.inputs.forEach((x) => has(x.itemId, r.id)); if (!r.startsKnown && r.unlockLevel === undefined && !r.unlockFlag && !Object.values(LEVEL_MILESTONES).some((m) => m.recipes?.includes(r.id))) p.push(`${r.id}: recipe can never be learned`); }
  for (const s of SHOP_LIST) s.stock.forEach((e) => has(e.itemId, `shop ${s.id}`));
  for (const [reg, l] of Object.entries(REGION_LOOT)) { l.materials.forEach((m) => has(m.itemId, `loot ${reg}`)); has(l.potion, `loot ${reg}`); }
  for (const m of Object.values(LEVEL_MILESTONES)) { m.items?.forEach((x) => has(x.itemId, 'milestone')); m.recipes?.forEach((r) => { if (!RECIPES[r]) p.push(`milestone: unknown recipe ${r}`); }); }
  STARTING_KIT.equipped.forEach((x) => has(x, 'starting kit')); STARTING_KIT.items.forEach((x) => has(x.itemId, 'starting kit'));
  for (const n of Object.values(SKILLS)) {
    for (const r of n.requires ?? []) { const t = SKILLS[r.skillId]; if (!t) p.push(`${n.id}: unknown requirement ${r.skillId}`); else if (t.tree !== n.tree) p.push(`${n.id}: cross-tree requirement`); else if (r.rank > t.maxRank) p.push(`${n.id}: requires rank above max of ${t.id}`); else if (t.tier > n.tier) p.push(`${n.id}: requirement ${t.id} is in a higher tier`); }
    if (!n.ability && !n.statMods && !n.passives) p.push(`${n.id}: skill has no effect`);
  }
  for (const s of SKIN_LIST) {
    const check = (c: typeof s.unlock): void => { if (c.type === 'achievement' && !ACHIEVEMENT_LIST.some((a) => a.id === c.achievementId)) p.push(`${s.id}: unknown achievement`); if (c.type === 'all') c.of.forEach(check); };
    check(s.unlock);
  }
  for (const i of ITEM_LIST) { if (i.type === 'consumable' && !i.consumable) p.push(`${i.id}: consumable without effect`); if (['weapon', 'armor', 'helmet', 'ring', 'amulet'].includes(i.type) && !i.stats?.length && !i.passives) p.push(`${i.id}: equipment without stats`); }
  return p;
}
