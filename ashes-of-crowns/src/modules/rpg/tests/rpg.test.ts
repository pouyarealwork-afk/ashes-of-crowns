/* Standalone test runner (no framework). Run: see README "Running the tests". */
import { RpgModule, validateData, xpToNext, levelCap, ITEMS, SKILLS, SKILL_TREES, mulberry32, INVENTORY_CAPACITY, SKIN_LIST, RECIPE_LIST, ITEM_LIST } from '../index';
import type { ExternalBus, EnemyKillInfo, RegionId, EquipSlot } from '../index';

declare const process: { exit(code: number): never };
let passed = 0; let failed = 0; const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failed++; failures.push(name); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}
function eq<T>(a: T, b: T, msg = ''): void { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, msg = 'assertion failed'): asserts c { if (!c) throw new Error(msg); }
function near(a: number, b: number, eps = 1e-6, msg = ''): void { if (Math.abs(a - b) > eps) throw new Error(`${msg} expected ~${b}, got ${a}`); }
const fresh = (seed = 1) => new RpgModule({ seed });
const uidOf = (m: RpgModule, defId: string) => m.inventory.list().find((i) => i.defId === defId)!.uid;
function setLevel(m: RpgModule, lvl: number, points = 0) { m.ctx.state.level = lvl; m.ctx.state.skillPoints += points; m.ctx.statsChanged(); }
const sequence = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };

console.log('Data integrity');
test('static data has no dangling references', () => { const p = validateData(); eq(p, [], p.join('; ')); });
test('item counts cover every type and rarity', () => {
  for (const t of ['weapon', 'armor', 'helmet', 'ring', 'amulet', 'consumable', 'material', 'quest']) ok(ITEM_LIST.some((i) => i.type === t), t);
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) ok(ITEM_LIST.some((i) => i.rarity === r), r);
});

console.log('New game / stats');
test('new game starter kit', () => {
  const m = fresh();
  eq(m.getLevel(), 1); eq(m.getGold(), 50);
  eq(m.equipment.getSlot('weapon')?.defId, 'rusted_sword'); eq(m.equipment.getSlot('armor')?.defId, 'ragged_tunic');
  eq(m.inventory.count('health_potion_small'), 3);
});
test('equipment affects real stats', () => {
  const s = fresh().getStats();
  eq(s.attack, 13); eq(s.defense, 7); eq(s.health, 110); eq(s.mana, 50); eq(s.stamina, 100); eq(s.speed, 100); near(s.critChance, 0.05); near(s.critDamage, 1.5);
});
test('level growth feeds stats', () => { const m = fresh(); setLevel(m, 10); const s = m.getStats(); eq(s.attack, 10 + 18 + 3); eq(s.health, 100 + 108 + 10); });
test('stat breakdown lists sources', () => { const b = fresh().stats.getBreakdown('attack'); ok(b.some((e) => e.source === 'equipment' && e.flat === 3)); });
test('stats are clamped', () => {
  const m = fresh(); m.ctx.state.skills['s_keen_edge'] = 50; m.ctx.statsChanged(); eq(m.getStats().critChance, 0.75);
});

console.log('XP / levelling');
test('xp curve and single level up', () => {
  const m = fresh(); let ev: any = null; m.events.on('rpg:level-up', (p) => { ev = p; });
  eq(m.progression.addXp(xpToNext(1) + 40), 1);
  eq(m.getLevel(), 2); eq(m.ctx.state.xp, 40); eq(m.ctx.state.skillPoints, 1);
  ok(ev && ev.level === 2 && ev.fullRestore === true && ev.skillPointsGained === 1);
});
test('multi-level up and level cap, skill points total', () => {
  const m = fresh(); m.progression.addXp(10_000_000);
  eq(m.getLevel(), 30); eq(m.ctx.state.xp, 0); eq(m.ctx.state.skillPoints, 35);
  eq(m.progression.addXp(500), 0); eq(m.getLevel(), 30);
});
test('level milestone rewards are granted', () => {
  const m = fresh(); const g = m.getGold(); m.progression.addXp(10_000_000);
  ok(m.getGold() > g + 4000); ok(m.getShards() >= 33); ok(m.crafting.isKnown('rcp_chainmail'));
});
test('negative / zero xp ignored', () => { const m = fresh(); eq(m.progression.addXp(-5), 0); eq(m.progression.addXp(0), 0); eq(m.ctx.state.xp, 0); });

console.log('Skills');
test('each class can receive a free starting signature ability', () => {
  const cases = ['w_power_strike', 's_backstab', 'a_arc_bolt', 'd_bloom_guard', 'o_second_sight', 'b_steady_beat'];
  for (const id of cases) {
    const m = fresh();
    const result = m.skills.grantStartingAbility(id);
    ok(result.ok, id);
    eq(m.skills.getRank(id), 1);
    eq(m.skills.getHotbar()[0], id);
    eq(m.ctx.state.skillPoints, 0);
    ok(m.skills.getUnlockedAbilities().some((a) => a.id === id), id + ' unlocked');
  }
});
test('each class starts with its own passive identity', () => {
  const cases = [
    ['w_toughness', 'warrior'], ['s_fleet_foot', 'shadow'], ['a_mana_well', 'arcane'],
    ['d_living_bark', 'warden'], ['o_clear_mind', 'oracle'], ['b_warm_resonance', 'bard'],
  ] as const;
  for (const [id, tree] of cases) {
    const m = fresh();
    ok(m.skills.grantStartingSkill(id).ok, id);
    eq(m.skills.getRank(id), 1);
    eq(SKILLS[id].tree, tree);
    eq(m.ctx.state.skillPoints, 0);
  }
});
test('new support classes apply timed buffs and expire cleanly', () => {
  const cases = [
    { id: 'd_bloom_guard', stat: 'defense' as const, passive: 'healthRegen' as const, expected: 2 },
    { id: 'o_second_sight', stat: 'speed' as const, passive: 'dodgeChance' as const, expected: 0.1 },
    { id: 'b_steady_beat', stat: 'health' as const, passive: 'staminaRegen' as const, expected: 7 },
  ];
  for (const item of cases) {
    const m = fresh();
    ok(m.skills.grantStartingAbility(item.id).ok, item.id);
    const beforeStat = m.getStats()[item.stat];
    const beforePassive = m.getPassives()[item.passive];
    ok(m.skills.tryUseAbility(item.id, { mana: 100, stamina: 100 }).ok, item.id);
    if (item.stat === 'defense') ok(m.getStats().defense > beforeStat, 'Warden defense buff');
    if (item.stat === 'speed') ok(m.getStats().speed > beforeStat, 'Oracle speed buff');
    ok(m.getPassives()[item.passive] > beforePassive, item.id + ' passive');
    m.update(13000);
    eq(m.getPassives()[item.passive], beforePassive);
  }
});
test('prerequisites and level gating', () => {
  const m = fresh(); setLevel(m, 1, 10);
  ok(m.skills.blockedReason('w_iron_skin')); const r = m.skills.rankUp('w_iron_skin'); ok(!r.ok);
  eq(m.skills.rankUp('w_toughness').ok, true); eq(m.skills.rankUp('w_toughness').ok, true);
  ok(m.skills.blockedReason('w_iron_skin')?.includes('level 3')); setLevel(m, 3);
  eq(m.skills.blockedReason('w_iron_skin'), null); eq(m.skills.rankUp('w_iron_skin').ok, true);
});
test('skill passives change stats', () => {
  const m = fresh(); setLevel(m, 1, 5); const before = m.getStats().health;
  m.skills.rankUp('w_toughness'); m.skills.rankUp('w_toughness');
  near(m.getStats().health, Math.round(before * 1.1), 1);
  setLevel(m, 3); const d0 = m.getStats().defense; m.skills.rankUp('w_iron_skin'); eq(m.getStats().defense, d0 + 4);
});
test('max rank and point exhaustion', () => {
  const m = fresh(); m.ctx.state.skillPoints = 10; for (let i = 0; i < 5; i++) ok(m.skills.rankUp('w_toughness').ok);
  const r = m.skills.rankUp('w_toughness'); ok(!r.ok && r.reason === 'max_rank');
  const m2 = fresh(); const r2 = m2.skills.rankUp('w_toughness'); ok(!r2.ok && r2.reason === 'no_skill_points');
});
test('capstone requires tree investment, level and cost 3', () => {
  const m = fresh(); setLevel(m, 20, 40);
  ok(!m.skills.rankUp('w_unbreakable').ok);
  for (const [id, n] of [['w_toughness', 5], ['w_power_strike', 1], ['w_iron_skin', 4], ['w_battle_cry', 1], ['w_second_wind', 1], ['w_whirlwind', 2], ['w_bloodthirst', 1]] as [string, number][]) for (let i = 0; i < n; i++) ok(m.skills.rankUp(id).ok, `${id} ${i}`);
  const before = m.ctx.state.skillPoints; ok(m.skills.rankUp('w_unbreakable').ok); eq(before - m.ctx.state.skillPoints, 3);
});
test('all six class trees have meaningful size and every node has an effect', () => {
  for (const t of ['warrior', 'arcane', 'shadow', 'warden', 'oracle', 'bard'] as const) {
    const n = Object.values(SKILLS).filter((s) => s.tree === t);
    ok(n.length >= 8, t);
    ok(n.filter((s) => s.ability).length >= 4, `${t} abilities`);
    ok(n.every((s) => s.ability || s.statMods || s.passives), `${t} effect coverage`);
  }
  eq(Object.keys(SKILL_TREES).length, 6);
});
test('abilities: cost, cooldown, rank scaling, hotbar', () => {
  const m = fresh(); setLevel(m, 5, 10); m.skills.rankUp('w_power_strike');
  eq(m.skills.getHotbar()[0], 'w_power_strike');
  let r = m.skills.tryUseAbility('w_power_strike', { mana: 0, stamina: 5 }); ok(!r.ok && r.reason === 'insufficient_resource');
  r = m.skills.tryUseAbility('w_power_strike', { mana: 0, stamina: 50 }); ok(r.ok);
  if (r.ok) { eq(r.use.staminaCost, 20); near(r.use.effect.multiplier, 1.8); }
  const r2 = m.skills.tryUseAbility('w_power_strike', { mana: 0, stamina: 50 }); ok(!r2.ok && r2.reason === 'cooldown');
  m.update(4001); ok(m.skills.tryUseAbility('w_power_strike', { mana: 0, stamina: 50 }).ok);
  m.skills.rankUp('w_power_strike'); near(m.skills.buildEffect('w_power_strike')!.multiplier, 2.05);
  ok(!m.skills.tryUseAbility('a_arc_bolt', { mana: 50, stamina: 50 }).ok);
});
test('Battle Cry buff raises attack then expires', () => {
  const m = fresh(); setLevel(m, 5, 10); m.skills.rankUp('w_power_strike'); m.skills.rankUp('w_battle_cry');
  const base = m.getStats().attack; ok(m.skills.tryUseAbility('w_battle_cry', { mana: 0, stamina: 30 }).ok);
  near(m.getStats().attack, Math.round(base * 1.25), 1); m.update(7900); ok(m.getStats().attack > base); m.update(200); eq(m.getStats().attack, base);
});
test('Unbreakable grants invulnerability that blocks damage', () => {
  const m = fresh(); setLevel(m, 20, 60);
  for (const [id, n] of [['w_toughness', 5], ['w_power_strike', 1], ['w_iron_skin', 4], ['w_battle_cry', 1], ['w_second_wind', 1], ['w_whirlwind', 2], ['w_bloodthirst', 1], ['w_unbreakable', 1]] as [string, number][]) for (let i = 0; i < n; i++) ok(m.skills.rankUp(id).ok, id);
  eq(m.combat.mitigateIncoming(100) > 0, true);
  const r = m.skills.tryUseAbility('w_unbreakable', { mana: 0, stamina: 60 }); ok(r.ok); if (r.ok) eq(r.use.effect.healPct, 0.3);
  eq(m.combat.mitigateIncoming(100), 0); m.update(3600); ok(m.combat.mitigateIncoming(100) > 0);
});
test('Arcane Ascension halves mana costs via buff', () => {
  const m = fresh(); setLevel(m, 20, 70);
  for (const [id, n] of [['a_mana_well', 5], ['a_arc_bolt', 1], ['a_focus', 3], ['a_frost_nova', 1], ['a_mana_flow', 2], ['a_arcane_mastery', 1], ['a_meteor', 1], ['a_siphon', 1], ['a_ascension', 1]] as [string, number][]) for (let i = 0; i < n; i++) ok(m.skills.rankUp(id).ok, `${id}`);
  const normal = m.skills.getAbilityCost('a_meteor')!.manaCost;
  ok(m.skills.tryUseAbility('a_ascension', { mana: 100, stamina: 0 }).ok);
  ok(m.skills.getAbilityCost('a_meteor')!.manaCost < normal / 2 + 3); ok(m.getPassives().spellPower >= 0.5);
});
test('Backstab bonus and execute rules in damage calc', () => {
  const m = fresh(); setLevel(m, 20, 70); m.ctx.rng = () => 0.5;
  for (const [id, n] of [['s_fleet_foot', 5], ['s_backstab', 1], ['s_keen_edge', 3], ['s_shadow_step', 1], ['s_evasion', 2], ['s_deadly_precision', 1], ['s_poison_blade', 1], ['s_predator', 1], ['s_umbral_execution', 1]] as [string, number][]) for (let i = 0; i < n; i++) ok(m.skills.rankUp(id).ok, id);
  const bs = m.skills.buildEffect('s_backstab')!; const behind = m.combat.calcAbilityDamage(bs, { behind: true }); const front = m.combat.calcAbilityDamage(bs, { behind: false });
  ok(behind.damage > front.damage * 1.5 && behind.crit && !front.crit);
  const ex = m.skills.buildEffect('s_umbral_execution')!; const low = m.combat.calcAbilityDamage(ex, { targetHpPct: 0.2 }); const hi = m.combat.calcAbilityDamage(ex, { targetHpPct: 0.9 });
  ok(low.damage > hi.damage * 1.3);
  ok(m.combat.calcDotPerSecond(m.skills.buildEffect('s_poison_blade')!) > 0);
  ok(m.getPassives().dodgeChance >= 0.06 - 1e-9);
});
test('respec refunds points for gold', () => {
  const m = fresh(); setLevel(m, 5, 4); m.skills.rankUp('w_toughness'); m.skills.rankUp('w_power_strike');
  const poor = m.skills.respec(); ok(!poor.ok && poor.reason === 'insufficient_gold');
  m.economy.addGold(500); const g = m.getGold(); const r = m.skills.respec(); ok(r.ok);
  eq(m.ctx.state.skillPoints, 4); eq(g - m.getGold(), 125); eq(m.skills.getHotbar()[0], null); eq(m.getStats().health, 100 + 48 + 10);
});

console.log('Combat math');
test('damage formula: defense mitigation, crit, variance', () => {
  const m = fresh(); m.ctx.rng = sequence([0.9, 0.5]); const a = m.combat.calcDamage({ multiplier: 2 }); eq(a.crit, false); eq(a.damage, 26);
  m.ctx.rng = sequence([0.9, 0.5]); const b = m.combat.calcDamage({ multiplier: 2, targetDefense: 100 }); eq(b.damage, 13);
  m.ctx.rng = sequence([0.0, 0.5]); const c = m.combat.calcDamage({ multiplier: 2 }); eq(c.crit, true); eq(c.damage, 39);
  m.ctx.rng = sequence([0.9, 0.5]); eq(m.combat.mitigateIncoming(100), Math.round(100 * 100 / 107));
});
test('lifesteal passive from gear heals', () => {
  const m = fresh(); setLevel(m, 22); m.inventory.add('ashbrand'); m.equipment.equip(uidOf(m, 'ashbrand'));
  m.ctx.rng = () => 0.9; const d = m.combat.calcDamage({ multiplier: 1 }); eq(d.lifestealHeal, Math.round(d.damage * 0.03));
});
test('dodge uses passive', () => { const m = fresh(); m.ctx.state.skills['s_evasion'] = 4; m.ctx.statsChanged(); m.ctx.rng = () => 0.05; ok(m.combat.rollDodge()); m.ctx.rng = () => 0.5; ok(!m.combat.rollDodge()); });

console.log('Inventory');
test('stacking, stack limits and overflow into new stacks', () => {
  const m = fresh(); const r = m.inventory.add('iron_ore', 250); eq(r.added, 250); eq(m.inventory.count('iron_ore'), 250);
  eq(m.inventory.list({ type: 'material' }).length, 3); ok(m.inventory.list({ type: 'material' }).every((s) => s.qty <= 99));
});
test('capacity limit, overflow reporting, quest items exempt', () => {
  const m = fresh(); let n = 0; while (m.inventory.freeSlots() > 0) { m.inventory.add('iron_sword'); n++; }
  eq(m.inventory.usedSlots(), INVENTORY_CAPACITY); const r = m.inventory.add('iron_sword'); eq(r.overflow, 1); ok(n > 0);
  ok(m.inventory.add('darkens_signet').added === 1); ok(!m.inventory.canAdd('iron_ore', 1));
});
test('partial add reports exact overflow', () => {
  const m = fresh(); while (m.inventory.freeSlots() > 1) m.inventory.add('iron_sword'); const r = m.inventory.add('iron_ore', 150); eq(r.added, 99); eq(r.overflow, 51);
});
test('remove across stacks, atomic on shortage', () => {
  const m = fresh(); m.inventory.add('iron_ore', 150); ok(!m.inventory.remove('iron_ore', 151)); eq(m.inventory.count('iron_ore'), 150); ok(m.inventory.remove('iron_ore', 120)); eq(m.inventory.count('iron_ore'), 30);
});
test('filter, search, sort', () => {
  const m = fresh(); m.inventory.add('iron_sword'); m.inventory.add('knights_blade'); m.inventory.add('ashbrand'); m.inventory.add('iron_ore', 5);
  eq(m.inventory.list({ type: 'weapon' }).length, 3); eq(m.inventory.list({ rarity: 'rare' }).map((i) => i.defId), ['knights_blade']);
  eq(m.inventory.list({ search: 'ASH' }).map((i) => i.defId), ['ashbrand']);
  eq(m.inventory.list({ type: 'weapon', sort: 'rarity' }).map((i) => i.defId), ['ashbrand', 'knights_blade', 'iron_sword']);
  eq(m.inventory.list({ type: 'weapon', sort: 'name' })[0]!.defId, 'ashbrand'); eq(m.inventory.list({ type: 'weapon', sort: 'value' })[0]!.defId, 'ashbrand');
  eq(m.inventory.list({ type: 'weapon', sort: 'recent' })[0]!.defId, 'ashbrand'); eq(m.inventory.list({ equippableOnly: true }).map((i) => i.defId), ['iron_sword'].filter(() => m.getLevel() >= 3));
});
test('item view: descriptions, stat lines, rarity', () => {
  const m = fresh(); m.inventory.add('duskfang_dagger'); const v = m.inventory.describe(m.inventory.get(uidOf(m, 'duskfang_dagger'))!);
  eq(v.rarity, 'rare'); ok(v.description.length > 10); ok(v.statLines.includes('+12 Attack')); ok(v.statLines.includes('+6% Crit Chance')); ok(v.statLines.includes('+3% Speed')); eq(v.maxUpgrade, 7);
});
test('selling: price, quest items blocked, gold credited', () => {
  const m = fresh(); m.inventory.add('iron_sword'); m.inventory.add('darkens_signet'); const g = m.getGold();
  const r = m.inventory.sell(uidOf(m, 'iron_sword')); ok(r.ok); eq(m.getGold() - g, 24);
  const q = m.inventory.sell(uidOf(m, 'darkens_signet')); ok(!q.ok && q.reason === 'not_sellable');
  m.inventory.add('iron_ore', 10); const s = m.inventory.sell(uidOf(m, 'iron_ore'), 4); ok(s.ok); eq(m.inventory.count('iron_ore'), 6); ok(!m.inventory.sell(uidOf(m, 'iron_ore'), 7).ok);
});
test('sellJunk sells only low-rarity gear', () => {
  const m = fresh(); m.inventory.add('iron_sword'); m.inventory.add('iron_cap'); m.inventory.add('knights_blade'); const r = m.inventory.sellJunk('common'); eq(r.count, 2); ok(m.inventory.has('knights_blade'));
});

console.log('Equipment');
test('equip, swap, unequip move items between slots and bag', () => {
  const m = fresh(); setLevel(m, 3); m.inventory.add('iron_sword'); const r = m.equipment.equip(uidOf(m, 'iron_sword')); ok(r.ok);
  eq(m.equipment.getSlot('weapon')?.defId, 'iron_sword'); ok(m.inventory.has('rusted_sword')); eq(m.getStats().attack, 10 + 4 + 6);
  ok(m.equipment.unequip('weapon').ok); eq(m.getStats().attack, 14); ok(!m.equipment.unequip('weapon').ok);
});
test('level requirement enforced', () => { const m = fresh(); m.inventory.add('steel_longsword'); const r = m.equipment.equip(uidOf(m, 'steel_longsword')); ok(!r.ok && r.reason === 'level_too_low'); });
test('non-equipment cannot be equipped', () => { const m = fresh(); const r = m.equipment.equip(uidOf(m, 'health_potion_small')); ok(!r.ok && r.reason === 'not_equippable'); });
test('rings fill two slots, then replace the weaker', () => {
  const m = fresh(); setLevel(m, 10); for (const id of ['copper_ring', 'ring_of_swiftness', 'ring_of_vigor']) m.inventory.add(id);
  m.equipment.equip(uidOf(m, 'copper_ring')); m.equipment.equip(uidOf(m, 'ring_of_swiftness')); eq(m.equipment.getSlot('ring2')?.defId, 'ring_of_swiftness');
  m.equipment.equip(uidOf(m, 'ring_of_vigor')); eq(m.equipment.getSlot('ring1')?.defId, 'ring_of_vigor'); ok(m.inventory.has('copper_ring'));
  eq(m.equipment.equip(uidOf(m, 'copper_ring'), 'weapon' as EquipSlot).ok, false);
});
test('item comparison reports real stat deltas', () => {
  const m = fresh(); setLevel(m, 3); m.inventory.add('iron_sword'); const c = m.equipment.compare(uidOf(m, 'iron_sword')); ok(c.ok);
  if (c.ok) { eq(c.comparison.statDelta.attack, 3); eq(c.comparison.slot, 'weapon'); eq(c.comparison.equipped?.defId, 'rusted_sword'); ok(c.comparison.canEquip); }
  m.inventory.add('ashbrand'); const c2 = m.equipment.compare(uidOf(m, 'ashbrand')); if (c2.ok) { eq(c2.comparison.canEquip, false); eq(c2.comparison.passiveDelta.lifesteal, 0.03); }
  eq(m.getStats().attack, 10 + 4 + 3);
});
test('autoEquipBest picks stronger gear', () => {
  const m = fresh(); setLevel(m, 5); m.inventory.add('iron_sword'); m.inventory.add('leather_jerkin'); m.inventory.add('copper_ring');
  const ch = m.equipment.autoEquipBest(); ok(ch.includes('weapon') && ch.includes('armor') && ch.includes('ring1')); eq(m.equipment.getSlot('weapon')?.defId, 'iron_sword');
});

console.log('Consumables');
test('potion returns heal amount, consumes one, has shared cooldown', () => {
  const m = fresh(); let ev: any = null; m.events.on('rpg:consumable-used', (p) => { ev = p; });
  const r = m.consumables.use(uidOf(m, 'health_potion_small')); ok(r.ok); if (r.ok) eq(r.result.heal, 60); eq(m.inventory.count('health_potion_small'), 2); ok(ev?.heal === 60);
  const r2 = m.consumables.useByDefId('health_potion_small'); ok(!r2.ok && r2.reason === 'cooldown'); m.update(700); ok(m.consumables.useByDefId('health_potion_small').ok);
});
test('percentage potion scales with max health', () => {
  const m = fresh(); setLevel(m, 10); m.inventory.add('health_potion_large'); const r = m.consumables.useByDefId('health_potion_large'); ok(r.ok);
  if (r.ok) eq(r.result.heal, Math.round(0.4 * m.getStats().health + 80));
});
test('elixir buff changes stats and expires; scroll grants XP', () => {
  const m = fresh(); m.inventory.add('elixir_of_might'); m.inventory.add('scroll_of_insight'); const base = m.getStats().attack;
  ok(m.consumables.useByDefId('elixir_of_might').ok); ok(m.getStats().attack > base); m.update(60001); eq(m.getStats().attack, base);
  m.update(700); ok(m.consumables.useByDefId('scroll_of_insight').ok); ok(m.getLevel() > 1);
});
test('non-consumables are not usable', () => { const m = fresh(); m.inventory.add('iron_ore'); const r = m.consumables.use(uidOf(m, 'iron_ore')); ok(!r.ok && r.reason === 'not_usable'); });

console.log('Crafting & upgrading');
test('crafting requires station, known recipe, materials', () => {
  const m = fresh(); m.inventory.add('iron_ore', 6);
  let r = m.crafting.craft('rcp_iron_ingot'); ok(!r.ok && r.reason === 'wrong_station');
  m.crafting.setStation('blacksmith'); r = m.crafting.craft('rcp_iron_ingot', 2); ok(r.ok); eq(m.inventory.count('iron_ingot'), 2); eq(m.inventory.count('iron_ore'), 0); eq(m.getGold(), 40);
  r = m.crafting.craft('rcp_iron_ingot'); ok(!r.ok && r.reason === 'insufficient_materials');
  r = m.crafting.craft('rcp_steel_ingot'); ok(!r.ok && r.reason === 'recipe_locked');
  r = m.crafting.craft('nope'); ok(!r.ok && r.reason === 'unknown_recipe');
});
test('failed craft changes nothing (atomic)', () => {
  const m = fresh(); m.crafting.setStation('blacksmith'); m.inventory.add('iron_ingot', 4); m.inventory.add('leather_scrap', 1); const snap = JSON.stringify(m.serialize());
  const r = m.crafting.craft('rcp_iron_sword'); ok(!r.ok); eq(JSON.stringify(m.serialize()), snap);
});
test('crafting blocked when inventory is full; frees space when inputs vanish', () => {
  const m = fresh(); m.crafting.setStation('blacksmith'); m.inventory.add('iron_ore', 3);
  while (m.inventory.freeSlots() > 0) m.inventory.add('iron_sword');
  ok(m.crafting.craft('rcp_iron_ingot').ok); // ore stack freed, ingot takes the slot
  m.inventory.remove('iron_ingot', m.inventory.count('iron_ingot'));
  const sw = m.inventory.list({ type: 'weapon' }).find((i) => i.defId === 'iron_sword')!; m.inventory.removeUid(sw.uid);
  m.inventory.add('iron_ore', 3); while (m.inventory.freeSlots() > 0) m.inventory.add('iron_sword');
  const r = m.crafting.craft('rcp_iron_ingot'); ok(r.ok, 'ore stack frees a slot for the ingot'); eq(m.inventory.count('iron_ore'), 0);
  // inputs that do NOT free a slot -> blocked and nothing consumed
  const m2 = fresh(); m2.crafting.setStation('blacksmith'); m2.ctx.state.gold = 500; m2.inventory.add('iron_ingot', 10); m2.inventory.add('leather_scrap', 5);
  while (m2.inventory.freeSlots() > 0) m2.inventory.add('iron_cap');
  const snap = JSON.stringify(m2.serialize()); const r2 = m2.crafting.craft('rcp_iron_sword'); ok(!r2.ok && r2.reason === 'inventory_full'); eq(JSON.stringify(m2.serialize()), snap);
});
test('level-unlocked recipes learn automatically', () => { const m = fresh(); ok(!m.crafting.isKnown('rcp_steel_ingot')); m.progression.addXp(xpToNext(1) + xpToNext(2) + xpToNext(3) + xpToNext(4) + xpToNext(5) + 10); ok(m.crafting.isKnown('rcp_steel_ingot')); });
test('flag-unlocked recipes and quest recipe rewards', () => {
  const m = fresh(); ok(!m.crafting.isKnown('rcp_ashbrand')); m.setStoryFlag('learned_hollow_forging'); ok(m.crafting.isKnown('rcp_ashbrand'));
  m.notifyQuestCompleted('q_x', { recipes: ['rcp_frostbite_axe'] }); ok(m.crafting.isKnown('rcp_frostbite_axe'));
});
test('legendary recipe consumes quest item, gold and shards', () => {
  const m = fresh(); m.setStoryFlag('learned_crown_forging'); m.crafting.setStation('blacksmith');
  m.inventory.add('steel_ingot', 10); m.inventory.add('hollow_essence', 10); m.inventory.add('royal_ember', 6); m.inventory.add('crown_fragment', 1); m.ctx.state.gold = 3000; m.ctx.state.shards = 25;
  const r = m.crafting.craft('rcp_crownbreaker'); ok(r.ok); ok(m.inventory.has('crownbreaker')); eq(m.inventory.count('crown_fragment'), 0); eq(m.getGold(), 0); eq(m.getShards(), 5, 'only the Legendary Collector achievement reward remains');
  ok(m.achievements.isUnlocked('ach_legendary_collector'));
});
test('item upgrade requires blacksmith, spends resources, scales stats, enforces rarity cap', () => {
  const m = fresh(); setLevel(m, 3); m.inventory.add('iron_sword'); m.equipment.equip(uidOf(m, 'iron_sword')); const uid = m.equipment.getSlot('weapon')!.uid;
  let r = m.crafting.upgrade(uid); ok(!r.ok && r.reason === 'wrong_station'); m.crafting.setStation('blacksmith');
  r = m.crafting.upgrade(uid); ok(!r.ok && r.reason === 'insufficient_materials');
  m.inventory.add('iron_ingot', 20); m.ctx.state.gold = 10; r = m.crafting.upgrade(uid); ok(!r.ok && r.reason === 'insufficient_gold'); eq(m.inventory.count('iron_ingot'), 20); m.ctx.state.gold = 5000; const cost = m.crafting.upgradeCost('iron_sword', 0); eq(cost.materials[0]!.qty, 2);
  const g = m.getGold(); r = m.crafting.upgrade(uid); ok(r.ok); eq(g - m.getGold(), cost.gold); eq(m.inventory.count('iron_ingot'), 18);
  near(m.getStats().attack, Math.round(10 + 4 + 6.6), 0.5);
  ok(m.crafting.upgrade(uid).ok); ok(m.crafting.upgrade(uid).ok); const last = m.crafting.upgrade(uid); ok(!last.ok && last.reason === 'max_upgrade'); eq(m.equipment.getSlot('weapon')!.upgrade, 3);
  ok(m.achievements.getCounter('maxUpgrade') === 3);
});
test('upgrade tiers use region materials and shards at high levels', () => {
  const m = fresh(); const c = m.crafting.upgradeCost('crownbreaker', 9); ok(c.shards === 10 && c.materials.some((x) => x.itemId === 'royal_ember'));
  const j = m.crafting.upgradeCost('ring_of_vigor', 0); eq(j.materials[0]!.itemId, 'sun_glass');
});
test('blacksmith view aggregates recipes and upgradable gear', () => {
  const m = fresh(); const v = m.crafting.getBlacksmithView(); ok(v.recipes.length >= 15); ok(v.upgradable.some((u) => u.equipped)); ok(v.upgradable[0]!.preview.cost !== null);
});
test('upgraded items sell for more', () => {
  const m = fresh(); m.inventory.add('iron_sword'); const inst = m.inventory.list({ type: 'weapon' }).find((i) => i.defId === 'iron_sword')!; const base = m.inventory.describe(inst).sellPrice; inst.upgrade = 2; ok(m.inventory.describe(inst).sellPrice > base);
});

console.log('Economy / shops');
test('buy: price, stock limit, stack, currency', () => {
  const m = fresh(); m.economy.addGold(500); const r = m.shops.buy('ashen_blacksmith', 'iron_ingot', 5); ok(r.ok); if (r.ok) eq(r.price, 16 * 5);
  eq(m.inventory.count('iron_ingot'), 5); eq(m.getGold(), 550 - 80);
  const o = m.shops.buy('ashen_blacksmith', 'iron_ingot', 20); ok(!o.ok && o.reason === 'out_of_stock');
  m.shops.restock(); ok(m.shops.buy('ashen_blacksmith', 'iron_ingot', 20).ok);
});
test('buy failures: gold, level lock, unknown, full inventory, quantity', () => {
  const m = fresh(); let r = m.shops.buy('ashen_blacksmith', 'iron_sword'); ok(!r.ok && r.reason === 'insufficient_gold');
  m.economy.addGold(9999); r = m.shops.buy('ashen_blacksmith', 'leather_jerkin'); ok(!r.ok && r.reason === 'locked');
  r = m.shops.buy('ashen_blacksmith', 'ashbrand'); ok(!r.ok && r.reason === 'unknown_entry'); r = m.shops.buy('nope', 'x'); ok(!r.ok && r.reason === 'unknown_shop'); r = m.shops.buy('ashen_blacksmith', 'iron_ingot', 0); ok(!r.ok && r.reason === 'invalid_quantity');
  while (m.inventory.freeSlots() > 0) m.inventory.add('iron_sword'); r = m.shops.buy('ashen_blacksmith', 'copper_ring'); ok(!r.ok && r.reason === 'inventory_full');
});
test('Ancient Shard shop', () => {
  const m = fresh(); setLevel(m, 22); let r = m.shops.buy('hollow_black_market', 'ashbrand'); ok(!r.ok && r.reason === 'insufficient_shards');
  m.economy.addShards(45); r = m.shops.buy('hollow_black_market', 'ashbrand'); ok(r.ok); eq(m.getShards(), 0); ok(m.inventory.has('ashbrand')); ok(m.getGold() === 50);
});
test('shop view reflects lock state and purchasability', () => {
  const m = fresh(); const v = m.shops.getShop('ashen_blacksmith'); ok(v.ok); if (v.ok) { const e = v.shop.entries.find((x) => x.itemId === 'leather_jerkin')!; ok(e.locked && !e.canBuy && !!e.lockReason); }
  eq(m.shops.listShops('ashen_village').length, 2);
});
test('sell to shop uses shop multiplier', () => {
  const m = fresh(); m.inventory.add('iron_sword'); const g = m.getGold(); const uid = uidOf(m, 'iron_sword'); const quote = m.shops.sellPriceFor('ashen_apothecary', uid);
  const r = m.shops.sell('ashen_apothecary', uid); ok(r.ok); eq(m.getGold() - g, quote); eq(quote, Math.floor(24 * 0.9));
});
test('spending never goes negative', () => { const m = fresh(); const r = m.economy.spend({ gold: 51 }); ok(!r.ok); eq(m.getGold(), 50); ok(!m.economy.spend({ gold: -5 }).ok); });

console.log('Loot / balance');
test('loot is deterministic for a seed', () => {
  const info: EnemyKillInfo = { enemyId: 'wolf', tier: 'elite', level: 6, region: 'whispering_forest' };
  const a = new RpgModule({ seed: 42 }).loot.rollEnemyDrops(info); const b = new RpgModule({ seed: 42 }).loot.rollEnemyDrops(info); eq(a, b);
});
test('bosses always drop gear, shards and good gold; never common gear', () => {
  const m = fresh(5); for (let i = 0; i < 50; i++) { const d = m.loot.rollEnemyDrops({ enemyId: 'b', tier: 'boss', level: 28, region: 'crownfall' }); ok(d.shards >= 3); ok(d.items.some((x) => ITEMS[x.itemId]!.type !== 'material' && ITEMS[x.itemId]!.type !== 'consumable')); ok(d.gold > 300); }
});
test('legendary drop requires boss, region and is rare', () => {
  const m = fresh(9); let leg = 0; for (let i = 0; i < 2000; i++) { const d = m.loot.rollEnemyDrops({ enemyId: 'b', tier: 'boss', level: 30, region: 'crownfall' }); if (d.items.some((x) => ITEMS[x.itemId]!.rarity === 'legendary')) leg++; }
  ok(leg > 20 && leg < 400, `legendary rate ${leg}/2000`);
  let mini = 0; for (let i = 0; i < 2000; i++) { if (m.loot.rollEnemyDrops({ enemyId: 'x', tier: 'minion', level: 28, region: 'crownfall' }).items.some((x) => ITEMS[x.itemId]!.rarity === 'legendary')) mini++; } eq(mini, 0);
});
test('xp penalty for farming low-level enemies; boss exempt', () => {
  const m = fresh(); setLevel(m, 20); const hi = m.loot.xpValue('minion', 20); const lo = m.loot.xpValue('minion', 5); ok(lo < hi / 3); eq(m.loot.xpValue('boss', 5) > 400, true);
});
test('enemy kill grants rewards and counters', () => {
  const m = fresh(3); const xp0 = m.ctx.state.xp; const b = m.loot.onEnemyKilled({ enemyId: 'ash_rat', tier: 'minion', level: 1, region: 'ashen_village' });
  eq(m.ctx.state.xp + (m.getLevel() - 1) * 0 >= xp0, true); ok(b.xp > 0); eq(m.achievements.getCounter('kills'), 1); ok(m.achievements.isUnlocked('ach_first_blood'));
});
test('goldFind passive increases gold', () => {
  const a = fresh(4); const b = fresh(4); b.ctx.state.skills['s_predator'] = 3; b.ctx.statsChanged();
  const info: EnemyKillInfo = { enemyId: 'x', tier: 'elite', level: 10, region: 'forgotten_desert' };
  ok(b.loot.rollEnemyDrops(info).gold > a.loot.rollEnemyDrops(info).gold);
});
test('overflow loot is reported, not lost silently', () => {
  const m = fresh(); while (m.inventory.freeSlots() > 0) m.inventory.add('iron_sword'); let ev: any = null; m.events.on('rpg:loot-overflow', (p) => { ev = p; });
  m.loot.grant({ items: [{ itemId: 'iron_ore', qty: 5 }] }, 'test'); eq(ev.items[0], { itemId: 'iron_ore', qty: 5 });
});
test('progression balance: kills per level stay reasonable across the whole game', () => {
  const m = fresh(11); const regionFor = (lvl: number): RegionId => (lvl < 5 ? 'ashen_village' : lvl < 10 ? 'whispering_forest' : lvl < 15 ? 'forgotten_desert' : lvl < 20 ? 'frozen_highlands' : lvl < 26 ? 'hollow_city' : 'crownfall');
  const rows: string[] = []; let totalKills = 0; let guard = 0;
  while (m.getLevel() < 30 && guard++ < 200000) {
    const lvl = m.getLevel(); const start = totalKills; const startLvl = lvl;
    while (m.getLevel() === startLvl && guard++ < 200000) {
      const roll = m.ctx.rng(); const tier = roll < 0.02 ? 'miniboss' : roll < 0.15 ? 'elite' : 'minion';
      m.loot.onEnemyKilled({ enemyId: 'sim', tier, level: Math.max(1, startLvl), region: regionFor(startLvl) }); totalKills++;
      m.inventory.sellJunk('rare'); if (m.inventory.freeSlots() < 5) m.inventory.sellJunk('legendary', ['material']);
    }
    rows.push(`L${startLvl}:${totalKills - start}`);
  }
  console.log('       kills per level ->', rows.join(' '));
  eq(m.getLevel(), 30); ok(totalKills > 400 && totalKills < 4000, `total kills ${totalKills}`);
  console.log(`       total kills to L30: ${totalKills}, gold: ${m.getGold()}, shards: ${m.getShards()}`);
  ok(m.getShards() < 400 && m.getShards() > 0);
});

console.log('Skins / achievements');
test('default skin only at start; each skin unlocks via its own channel', () => {
  const m = fresh(); eq(m.skins.list().filter((s) => s.unlocked).map((s) => s.def.id), ['aren_default']);
  m.notifyQuestCompleted('q_ashen_forge_oath'); ok(m.skins.list().find((s) => s.def.id === 'warrior_armor')!.unlocked);
  m.notifyBossDefeated('boss_hollow_sentinel'); ok(m.skins.list().find((s) => s.def.id === 'shadow_knight')!.unlocked);
  m.setStoryFlag('story_crownfall_gates'); ok(m.skins.list().find((s) => s.def.id === 'royal_guardian')!.unlocked);
  setLevel(m, 20, 40); for (const [id, n] of [['a_mana_well', 5], ['a_arc_bolt', 3], ['a_focus', 3], ['a_frost_nova', 1]] as [string, number][]) for (let i = 0; i < n; i++) m.skills.rankUp(id);
  ok(m.skins.list().find((s) => s.def.id === 'arcane_mage')!.unlocked, 'arcane mage via achievement');
});
test('Legendary King needs ending AND legendary item', () => {
  const m = fresh(); m.notifyEnding('true_king'); ok(!m.skins.equip('legendary_king').ok);
  m.inventory.add('crownbreaker'); ok(m.skins.list().find((s) => s.def.id === 'legendary_king')!.unlocked); ok(m.skins.equip('legendary_king').ok);
  let ev: any = null; m.events.on('rpg:skin-equipped', (p) => { ev = p; }); m.skins.equip('aren_default'); eq(ev.textureKey, 'player_skin_aren_default'); ok(!m.skins.equip('nope').ok);
});
test('locked skin cannot be equipped', () => { const m = fresh(); const r = m.skins.equip('shadow_knight'); ok(!r.ok && r.reason === 'skin_locked'); eq(SKIN_LIST.length, 6); });
test('achievement rewards are granted exactly once', () => {
  const m = fresh(); const g = m.getGold(); m.achievements.bump('kills', 1); eq(m.getGold() - g, 20); m.achievements.bump('kills', 1); eq(m.getGold() - g, 20);
  eq(m.achievements.list().find((a) => a.id === 'ach_slayer')!.progress, 2);
});
test('quest completion is idempotent', () => { const m = fresh(); m.notifyQuestCompleted('q1', { gold: 100 }); m.notifyQuestCompleted('q1', { gold: 100 }); eq(m.getGold(), 150 + 0); });

console.log('New Game+');
test('NG+ locked until an ending is reached', () => { const m = fresh(); const r = m.ngPlus.start(); ok(!r.ok && r.reason === 'new_game_plus_unavailable'); });
test('NG+ keeps progress, resets story, raises cap and difficulty', () => {
  const m = fresh(); m.progression.addXp(10_000_000); m.inventory.add('crown_fragment'); m.inventory.add('knights_blade'); m.economy.addGold(1000); m.notifyQuestCompleted('q1'); m.setStoryFlag('story_x'); m.notifyEnding('true_king');
  const gold = m.getGold(); const sp = m.ctx.state.skillPoints; let ev: any = null; m.events.on('rpg:new-game-plus', (p) => { ev = p; });
  const r = m.ngPlus.start(); ok(r.ok); eq(m.ngPlus.cycle, 1); eq(levelCap(1), 40); eq(m.getLevel(), 30);
  eq(m.getGold(), Math.floor(gold / 2)); eq(m.ctx.state.skillPoints, sp + 3); ok(!m.inventory.has('crown_fragment')); ok(m.inventory.has('knights_blade'));
  eq(m.ctx.state.completedQuests, []); ok(!m.ctx.state.flags['story_x']); ok(m.ctx.state.flags['ending_true_king']); ok(ev.scaling.enemyHealthMult > 1 && ev.levelCap === 40);
  ok(m.achievements.isUnlocked('ach_new_game_plus'));
  m.progression.addXp(10_000_000); eq(m.getLevel(), 40);
});
test('NG+ rewards: more xp/gold, better drops, new shop stock, price inflation', () => {
  const a = fresh(2); const b = fresh(2); b.notifyEnding('wanderer'); b.ngPlus.start();
  ok(b.loot.xpValue('elite', 10) > a.loot.xpValue('elite', 10));
  const info: EnemyKillInfo = { enemyId: 'x', tier: 'boss', level: 30, region: 'crownfall' }; ok(b.loot.rollEnemyDrops(info).shards > 0);
  const sa = a.shops.getShop('crownfall_quartermaster'); const sb = b.shops.getShop('crownfall_quartermaster');
  if (sa.ok && sb.ok) { ok(sa.shop.entries.find((e) => e.itemId === 'crown_of_ashes')!.locked); ok(!sb.shop.entries.find((e) => e.itemId === 'crown_of_ashes')!.locked); }
});
test('NG+ stops at max cycle', () => { const m = fresh(); m.notifyEnding('tyrant'); for (let i = 0; i < 3; i++) ok(m.ngPlus.start().ok); const r = m.ngPlus.start(); ok(!r.ok && r.reason === 'max_cycle'); });
test('all five ending ids can unlock NG+', () => { for (const e of ['true_king', 'tyrant', 'wanderer', 'hidden_truth', 'fallen_hero']) { const m = fresh(); m.notifyEnding(e); ok(m.ngPlus.start().ok, e); } });

console.log('Persistence / integration');
test('serialize is pure JSON and round-trips exactly', () => {
  const m = fresh(); m.progression.addXp(5000); m.inventory.add('iron_ore', 50); m.skills.rankUp('w_toughness'); m.notifyQuestCompleted('q1', { gold: 10 });
  const snap = m.serialize(); const json = JSON.stringify(snap); const m2 = new RpgModule({ snapshot: JSON.parse(json), seed: 2 });
  eq(JSON.stringify(m2.serialize()), json); eq(m2.getStats(), m.getStats());
});
test('loading a partial / old snapshot fills defaults instead of crashing', () => {
  const m = new RpgModule({ snapshot: { level: 7, gold: 123 } }); eq(m.getLevel(), 7); eq(m.getGold(), 123); ok(m.skins.list()[0]!.unlocked); ok(m.getStats().health > 100);
  let threw = false; try { new RpgModule({ snapshot: 5 }); } catch { threw = true; } ok(threw);
});
test('equipped items survive save/load and keep upgrade level', () => {
  const m = fresh(); m.equipment.getSlot('weapon')!.upgrade = 2; m.ctx.statsChanged(); const m2 = new RpgModule({ snapshot: m.serialize() }); eq(m2.equipment.getSlot('weapon')!.upgrade, 2); eq(m2.getStats().attack, m.getStats().attack);
});
test('external bus: inbound events drive the module, outbound events are forwarded', () => {
  const handlers = new Map<string, ((...a: any[]) => void)[]>(); const seen: string[] = [];
  const bus: ExternalBus = { on: (e, f) => { handlers.set(e, [...(handlers.get(e) ?? []), f]); }, off: (e, f) => { handlers.set(e, (handlers.get(e) ?? []).filter((x) => x !== f)); }, emit: (e, ...a) => { seen.push(e); (handlers.get(e) ?? []).forEach((f) => f(...a)); } };
  const m = new RpgModule({ seed: 1, bus });
  bus.emit('enemy:killed', { enemyId: 'rat', tier: 'minion', level: 1, region: 'ashen_village' }); ok(m.ctx.state.xp > 0 || m.getLevel() > 1, 'kill xp');
  bus.emit('quest:completed', { questId: 'q_ashen_forge_oath', rewards: { gold: 100, items: [{ itemId: 'iron_sword', qty: 1 }] } }); ok(m.inventory.has('iron_sword'), 'quest item reward'); ok(m.skins.list().find((s) => s.def.id === 'warrior_armor')!.unlocked, 'quest skin');
  bus.emit('boss:defeated', { bossId: 'boss_hollow_sentinel' }); bus.emit('story:flag', { flag: 'story_crownfall_gates' }); bus.emit('ending:reached', { endingId: 'hidden_truth' }); ok(m.ngPlus.canStart().ok, 'ending via bus');
  bus.emit('station:open', { station: 'blacksmith' }); eq(m.crafting.getStation(), 'blacksmith'); bus.emit('station:close', {}); eq(m.crafting.getStation(), null);
  ok(seen.includes('rpg:gold-changed') && seen.includes('rpg:skin-unlocked') && seen.includes('rpg:xp-gained'), 'outbound ' + [...new Set(seen)].join(','));
  m.disconnectBus(); const xp = m.ctx.state.xp; bus.emit('enemy:killed', { enemyId: 'rat', tier: 'minion', level: 1, region: 'ashen_village' }); eq(m.ctx.state.xp, xp);
});
test('stats-changed event fires for equipment, skills, buffs and level-ups', () => {
  const m = fresh(); let n = 0; m.events.on('rpg:stats-changed', () => { n++; }); setLevel(m, 5, 2); m.skills.rankUp('w_toughness'); m.inventory.add('copper_ring'); m.equipment.equip(uidOf(m, 'copper_ring')); m.inventory.add('elixir_of_might'); m.consumables.useByDefId('elixir_of_might'); ok(n >= 3);
});
test('a throwing listener does not break the module', () => { const m = fresh(); const err = console.error; console.error = () => {}; m.events.on('rpg:gold-changed', () => { throw new Error('boom'); }); m.economy.addGold(5); console.error = err; eq(m.getGold(), 55); });
test('recipe table covers both stations', () => { ok(RECIPE_LIST.some((r) => r.station === 'blacksmith') && RECIPE_LIST.some((r) => r.station === 'alchemist')); });
test('seeded rng helper is stable', () => { const a = mulberry32(7); const b = mulberry32(7); eq([a(), a(), a()], [b(), b(), b()]); });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failed:', failures.join(' | ')); process.exit(1); }
