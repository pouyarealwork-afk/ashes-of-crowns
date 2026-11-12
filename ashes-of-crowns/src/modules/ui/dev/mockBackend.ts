/**
 * TEST FIXTURE ONLY. A small stateful in-memory implementation of the UIBackend contract,
 * used by the dev harness and the browser tests to exercise every screen. It is NOT a game system
 * and is not exported from the module's public index.
 */
import type {
  CraftingProvider, EquipSlot, InventoryProvider, ItemDef, ItemStack, PersistenceProvider, PlayerProvider,
  QuestProvider, QuestSnapshot, SaveSlotSummary, ShopProvider, SkillNode, SkillTree, SkillsProvider, UIBackend, WorldProvider,
  MapRegion, Recipe,
} from '../contracts';

const I = (id: string, en: string, fa: string, type: ItemDef['type'], rarity: ItemDef['rarity'], extra: Partial<ItemDef> = {}): ItemDef =>
  ({ id, name: { en, fa }, type, rarity, ...extra });

export const ITEMS: Record<string, ItemDef> = {
  rustySword: I('rustySword', 'Rusty Sword', 'شمشیر زنگ‌زده', 'weapon', 'common', { slot: 'weapon', stats: { attack: 4 }, value: 10, description: { en: 'Seen better days.', fa: 'روزهای بهتری دیده است.' } }),
  emberBlade: I('emberBlade', 'Emberbrand Blade', 'تیغهٔ شرارهٔ سوزان', 'weapon', 'legendary', { slot: 'weapon', stats: { attack: 18, crit: 6, speed: 2 }, value: 900, levelReq: 8, description: { en: 'Forged from the ashes of a fallen crown.', fa: 'از خاکستر یک تاج فروافتاده ساخته شده.' } }),
  ironHelm: I('ironHelm', 'Iron Helm', 'کلاه‌خود آهنی', 'armor', 'uncommon', { slot: 'head', stats: { defense: 5 }, value: 60 }),
  wolfCloak: I('wolfCloak', 'Wolfskin Cuirass', 'جلیقهٔ پوست گرگ', 'armor', 'rare', { slot: 'chest', stats: { defense: 9, maxStamina: 10 }, value: 180 }),
  shadowRing: I('shadowRing', 'Ring of Shadows', 'انگشتر سایه‌ها', 'armor', 'epic', { slot: 'ring', stats: { crit: 8, speed: 3 }, value: 400, levelReq: 3 }),
  leatherBoots: I('leatherBoots', 'Leather Boots', 'چکمهٔ چرمی', 'armor', 'common', { slot: 'boots', stats: { speed: 1 }, value: 15 }),
  healthPotion: I('healthPotion', 'Healing Draught', 'معجون شفا', 'consumable', 'common', { value: 20, description: { en: 'Restores 50 health.', fa: 'پنجاه سلامت بازمی‌گرداند.' } }),
  manaPotion: I('manaPotion', 'Mana Elixir', 'اکسیر مانا', 'consumable', 'uncommon', { value: 35 }),
  ironOre: I('ironOre', 'Iron Ore', 'سنگ آهن', 'material', 'common', { value: 5 }),
  emberShard: I('emberShard', 'Ember Shard', 'تکهٔ شراره', 'material', 'rare', { value: 40 }),
  oldLetter: I('oldLetter', "Darken's Letter", 'نامهٔ دارکن', 'quest', 'epic', { description: { en: 'The seal is broken.', fa: 'مهر آن شکسته است.' } }),
};

const st = (item: string, qty = 1): ItemStack => ({ item: ITEMS[item], qty });

export interface MockState {
  gold: number;
  items: Map<string, number>;
  equipped: Partial<Record<EquipSlot, string>>;
  skillRanks: Record<string, number>;
  skillPoints: number;
  hotbar: (string | null)[];
  tracked: Set<string>;
  slots: SaveSlotSummary[];
  currentRegion: MapRegion['id'];
  level: number;
  calls: string[];
}

export function createMock(opts: { empty?: boolean } = {}): { backend: UIBackend; state: MockState } {
  const state: MockState = {
    gold: 250,
    items: new Map(opts.empty ? [] : [
      ['rustySword', 1], ['emberBlade', 1], ['ironHelm', 1], ['wolfCloak', 1], ['shadowRing', 1], ['leatherBoots', 1],
      ['healthPotion', 5], ['manaPotion', 2], ['ironOre', 12], ['emberShard', 3], ['oldLetter', 1],
    ]),
    equipped: opts.empty ? {} : { weapon: 'rustySword' },
    skillRanks: { slash: 1 },
    skillPoints: 3,
    hotbar: ['slash', null, null],
    tracked: new Set(['q1']),
    slots: opts.empty ? [1, 2, 3].map((slot) => ({ slot, empty: true })) : [
      { slot: 1, empty: false, playerName: 'Aren', level: 7, region: 'whispering_forest', playTimeSec: 14500, savedAt: Date.UTC(2026, 10, 10, 18, 30) },
      { slot: 2, empty: false, playerName: 'Aren', level: 2, region: 'ashen_village', playTimeSec: 1900, savedAt: Date.UTC(2026, 10, 1, 9, 5) },
      { slot: 3, empty: true },
    ],
    currentRegion: 'whispering_forest',
    level: 7,
    calls: [],
  };
  const log = (s: string) => state.calls.push(s);
  const snapEquipped = () => {
    const out: Partial<Record<EquipSlot, ItemDef>> = {};
    for (const [slot, id] of Object.entries(state.equipped)) if (id) out[slot as EquipSlot] = ITEMS[id];
    return out;
  };
  const invItems = (): ItemStack[] => [...state.items].filter(([id]) => !Object.values(state.equipped).includes(id) || (state.items.get(id) ?? 0) > 1)
    .map(([id, qty]) => ({ item: ITEMS[id], qty }));

  const player: PlayerProvider = {
    getPlayer: () => ({
      name: { en: 'Aren', fa: 'آرن' }, level: state.level, xp: 340, xpToNext: 900,
      health: 72, maxHealth: 120, mana: 30, maxMana: 60, stamina: 48, maxStamina: 80, gold: state.gold,
      stats: { attack: 24, defense: 11, magic: 6, speed: 9, crit: 7, maxHealth: 120, maxMana: 60, maxStamina: 80 },
      playTimeSec: 14500,
      extra: [{ label: { en: 'Enemies slain', fa: 'دشمنان کشته‌شده' }, value: 143 }],
    }),
  };

  const inventory: InventoryProvider = {
    getInventory: () => ({ items: invItems(), capacity: 24, gold: state.gold, equipped: snapEquipped() }),
    equip: (id, slot) => {
      log(`equip:${id}:${slot}`);
      const it = ITEMS[id];
      if (!it || it.slot !== slot) return { ok: false, reason: { en: 'Cannot equip that here.', fa: 'اینجا قابل تجهیز نیست.' } };
      if (it.levelReq && it.levelReq > state.level) return { ok: false, reason: { en: 'Level too low.', fa: 'سطح کافی نیست.' } };
      state.equipped[slot] = id;
      return { ok: true };
    },
    unequip: (slot) => { log(`unequip:${slot}`); delete state.equipped[slot]; return { ok: true }; },
    use: (id) => {
      log(`use:${id}`);
      const n = state.items.get(id) ?? 0;
      if (n < 1) return { ok: false };
      if (n === 1) state.items.delete(id); else state.items.set(id, n - 1);
      return { ok: true };
    },
    drop: (id, qty) => {
      log(`drop:${id}:${qty}`);
      const n = state.items.get(id) ?? 0;
      if (n <= qty) state.items.delete(id); else state.items.set(id, n - qty);
      return { ok: true };
    },
  };

  const tree = (): SkillTree[] => {
    const r = (id: string) => state.skillRanks[id] ?? 0;
    const node = (id: string, en: string, fa: string, tier: number, row: number, cost: number, maxRank: number, active: boolean, requires: string[] = [], icon?: string): SkillNode => ({
      id, name: { en, fa }, tier, row, cost, maxRank, rank: r(id), active, requires, icon,
      available: requires.every((q) => r(q) > 0),
      description: { en: `${en} — a test skill.`, fa: `${fa} — مهارت آزمایشی.` },
      manaCost: active ? 8 : undefined, cooldownSec: active ? 4 : undefined,
    });
    return [
      { id: 'blade', name: { en: 'Blade', fa: 'شمشیر' }, icon: 'sword', nodes: [
        node('slash', 'Cleaving Slash', 'ضربهٔ شکافنده', 1, 1, 1, 3, true, [], 'sword'),
        node('guard', 'Iron Guard', 'نگهبان آهنین', 2, 0, 1, 2, false, ['slash'], 'shield'),
        node('rend', 'Ember Rend', 'دریدن شراره', 2, 2, 2, 3, true, ['slash'], 'flame'),
        node('wrath', "Crown's Wrath", 'خشم تاج', 3, 1, 3, 1, true, ['guard', 'rend'], 'crown'),
      ] },
      { id: 'shadow', name: { en: 'Shadow', fa: 'سایه' }, icon: 'eye', nodes: [
        node('step', 'Shadowstep', 'گام سایه', 1, 0, 1, 2, true, [], 'dodge'),
      ] },
    ];
  };
  const skills: SkillsProvider = {
    getSkillTrees: () => tree(),
    getSkillPoints: () => state.skillPoints,
    getHotbar: () => [...state.hotbar],
    unlockSkill: (id) => {
      log(`unlock:${id}`);
      const n = tree().flatMap((t) => t.nodes).find((x) => x.id === id);
      if (!n || !n.available || state.skillPoints < n.cost || n.rank >= n.maxRank) return { ok: false };
      state.skillPoints -= n.cost; state.skillRanks[id] = n.rank + 1; return { ok: true };
    },
    setHotbar: (i, id) => { log(`hotbar:${i}:${id}`); state.hotbar[i] = id; return { ok: true }; },
  };

  const quests = (): QuestSnapshot[] => [
    { id: 'q1', kind: 'main', status: 'active', tracked: state.tracked.has('q1'), region: 'whispering_forest',
      title: { en: 'Whispers of Betrayal', fa: 'نجواهای خیانت' },
      summary: { en: 'Darken’s soldiers were last seen on the old forest road. Follow their trail.', fa: 'سربازان دارکن آخرین بار در جادهٔ قدیمی جنگل دیده شدند. ردّشان را دنبال کن.' },
      objectives: [
        { text: { en: 'Find the abandoned camp', fa: 'اردوگاه متروکه را پیدا کن' }, current: 1, target: 1, done: true },
        { text: { en: 'Defeat Darken’s scouts', fa: 'پیش‌قراولان دارکن را شکست بده' }, current: 2, target: 5, done: false },
      ], rewards: { xp: 400, gold: 120, items: [st('emberShard', 2)] } },
    { id: 'q2', kind: 'side', status: 'active', tracked: state.tracked.has('q2'), region: 'ashen_village',
      title: { en: 'Bread for the Ashen', fa: 'نان برای خاکستری‌ها' },
      objectives: [{ text: { en: 'Deliver 3 loaves', fa: 'سه قرص نان برسان' }, current: 0, target: 3, done: false }], rewards: { gold: 30 } },
    { id: 'q3', kind: 'bounty', status: 'completed', tracked: false, title: { en: 'Wolf Pack', fa: 'گلهٔ گرگ‌ها' },
      objectives: [{ text: { en: 'Slay the alpha', fa: 'آلفا را بکش' }, current: 1, target: 1, done: true }], rewards: { xp: 150 } },
  ];
  const questProvider: QuestProvider = {
    getQuests: () => quests(),
    setTracked: (id, t) => { log(`track:${id}:${t}`); if (t) state.tracked.add(id); else state.tracked.delete(id); return { ok: true }; },
  };

  const world: WorldProvider = {
    getMap: () => ({
      current: state.currentRegion,
      regions: [
        { id: 'ashen_village', x: 12, y: 78, state: 'cleared', levelRange: [1, 4] },
        { id: 'whispering_forest', x: 30, y: 48, state: 'unlocked', levelRange: [4, 8] },
        { id: 'forgotten_desert', x: 52, y: 80, state: 'unlocked', levelRange: [8, 12], fastTravelCost: 40 },
        { id: 'frozen_highlands', x: 68, y: 30, state: 'locked' },
        { id: 'hollow_city', x: 84, y: 62, state: 'locked' },
        { id: 'crownfall', x: 90, y: 18, state: 'locked' },
      ],
    }),
    fastTravel: (r) => { log(`travel:${r}`); state.currentRegion = r; return { ok: true }; },
  };

  const recipes = (): Recipe[] => [
    { id: 'r1', known: true, result: st('healthPotion', 2), ingredients: [st('emberShard', 1), st('ironOre', 2)], station: { en: 'Alchemy bench', fa: 'میز کیمیاگری' } },
    { id: 'r2', known: true, result: st('ironHelm'), ingredients: [st('ironOre', 20)], station: { en: 'Forge', fa: 'کوره' } },
    { id: 'r3', known: false, result: st('emberBlade'), ingredients: [st('emberShard', 9)] },
  ];
  const crafting: CraftingProvider = {
    getRecipes: () => recipes(),
    craft: (id) => {
      log(`craft:${id}`);
      const r = recipes().find((x) => x.id === id);
      if (!r || !r.known) return { ok: false };
      for (const ing of r.ingredients) if ((state.items.get(ing.item.id) ?? 0) < ing.qty) return { ok: false };
      for (const ing of r.ingredients) { const n = state.items.get(ing.item.id)! - ing.qty; if (n) state.items.set(ing.item.id, n); else state.items.delete(ing.item.id); }
      state.items.set(r.result.item.id, (state.items.get(r.result.item.id) ?? 0) + r.result.qty);
      return { ok: true };
    },
  };

  const stock = { healthPotion: 8, manaPotion: 0, ironHelm: 1, wolfCloak: 2 } as Record<string, number>;
  const shop: ShopProvider = {
    getShop: (id) => ({
      id, name: { en: 'The Smoldering Anvil', fa: 'سندان خاموش' }, merchant: { en: 'Brenna', fa: 'برنا' }, sellRate: 0.5,
      stock: [
        { item: ITEMS.healthPotion, price: 25, stock: stock.healthPotion },
        { item: ITEMS.manaPotion, price: 40, stock: stock.manaPotion },
        { item: ITEMS.ironHelm, price: 90, stock: stock.ironHelm },
        { item: ITEMS.wolfCloak, price: 320, stock: stock.wolfCloak },
      ],
    }),
    buy: (id, item, qty) => {
      log(`buy:${item}:${qty}`);
      const price = { healthPotion: 25, manaPotion: 40, ironHelm: 90, wolfCloak: 320 }[item] ?? 0;
      if (state.gold < price * qty) return { ok: false, reason: { en: 'Not enough gold.', fa: 'طلای کافی نیست.' } };
      state.gold -= price * qty; stock[item] -= qty;
      state.items.set(item, (state.items.get(item) ?? 0) + qty);
      return { ok: true };
    },
    sell: (id, item, qty) => {
      log(`sell:${item}:${qty}`);
      const n = state.items.get(item) ?? 0;
      if (n < qty) return { ok: false };
      state.gold += Math.floor((ITEMS[item].value ?? 0) * 0.5) * qty;
      if (n === qty) state.items.delete(item); else state.items.set(item, n - qty);
      return { ok: true };
    },
  };

  const persistence: PersistenceProvider = {
    slotCount: 3,
    listSlots: () => state.slots.map((s) => ({ ...s })),
    save: (slot) => {
      log(`save:${slot}`);
      state.slots[slot - 1] = { slot, empty: false, playerName: 'Aren', level: state.level, region: state.currentRegion, playTimeSec: 15000, savedAt: Date.now() };
      return { ok: true };
    },
    deleteSlot: (slot) => { log(`delete:${slot}`); state.slots[slot - 1] = { slot, empty: true }; return { ok: true }; },
  };

  return { backend: { player, inventory, skills, quests: questProvider, world, crafting, shop, persistence }, state };
}
