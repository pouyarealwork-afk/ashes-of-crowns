import { strict as assert } from 'node:assert';
declare const process: { exitCode: number };
import { CombatEngine } from '../src/modules/combat/core/CombatEngine';
import { RpgModule } from '../src/modules/rpg';
import { createWorldModule } from '../src/modules/world';
import { MemoryBackend, PersistenceModule, SimpleEmitter } from '../src/modules/persistence';
import { InputBridge } from '../src/game/InputBridge';
import { ashenVillage } from '../src/modules/world/data/regions/ashenVillage';
import { buildOverworld } from '../src/game/Overworld';

async function main(): Promise<void> {
  const opening = ashenVillage.levels.find(level => level.id === 'ashen_village_main')!;
  const openingSpawn = opening.spawns.start;
  assert.ok(openingSpawn.x >= 300, 'opening spawn stays clear of the mobile joystick overlay');
  assert.ok(opening.platforms.some(([x, y, w]) => openingSpawn.x >= x && openingSpawn.x <= x + w && y >= openingSpawn.y && y - openingSpawn.y <= 100), 'opening spawn is positioned directly above a safe ground platform');

  const worldForMap = createWorldModule(); const overworld = buildOverworld(worldForMap);
  assert.equal(overworld.segments.length, 10, 'six campaign regions and four expansion pockets share one atlas');
  assert.equal(new Set(overworld.segments.map(s => s.region)).size, 6, 'each region has its own segment');
  assert.ok(overworld.level.size.w > 40000, 'the atlas extends beyond the original campaign corridor');
  assert.ok(overworld.level.size.h > 9000, 'the atlas has substantial vertical exploration space');
  assert.ok(overworld.segments.length >= 10, 'two expansion waves add four exploration pockets');
  assert.ok(overworld.segments.some((s,i)=>i>0&&s.offsetY!==overworld.segments[i-1].offsetY),'regions occupy multiple vertical bands');
  assert.ok(Object.values(overworld.exitSources).some((s:any)=>s.route),'region graph links become playable passages');
  assert.ok(Object.values(overworld.exitSources).filter((s:any)=>s.teleport).length>=8,'each expansion pocket has entrance and return exits');
  for (const segment of overworld.segments.slice(0, 6)) {
    const spawn = overworld.level.spawns[`${segment.region}_start`];
    for (const exit of overworld.level.exits.filter((e: any) => e.id.startsWith(`route_${segment.region}_`))) assert.ok(Math.abs(exit.rect.x + exit.rect.w / 2 - spawn.x) > 100, `route ${exit.id} does not overlap its region entry spawn`);
  }
  assert.ok(overworld.level.platforms.length > 90, 'all six regions contribute their platforms');
  assert.ok(overworld.level.enemies.length > 25, 'all six regions contribute their enemies');

  const input = new InputBridge();
  const keys: Record<string, { isDown: boolean }> = Object.fromEntries(['left','right','a','d','shift','space','up','w','z','j','x','c','e','v','one','two','three'].map(k => [k, { isDown: false }]));
  input.attach(keys);
  input.axis(0.55); assert.equal(input.frame().moveX, 0.55, 'UI joystick axis reaches the Player input frame');
  input.action('attack', true); assert.equal(input.frame().attackPressed, true); assert.equal(input.frame().attackPressed, false, 'touch attack is consumed once');
  input.action('attack', false);
  input.action('jump', true); input.action('jump', true);
  const jump = input.frame(); assert.equal(jump.jumpPressed, true); assert.equal(jump.jumpHeld, true);
  input.action('jump', false); assert.equal(input.frame().jumpHeld, false, 'one final-release event from TouchControls must clear a multi-pointer jump hold');
  input.action('jump', false); assert.equal(input.frame().jumpHeld, false, 'duplicate release events are harmless');
  input.action('block', true); input.action('block', true);
  assert.equal(input.frame().blockHeld, true, 'multi-pointer block remains held while the action is active');
  input.action('block', false); assert.equal(input.frame().blockHeld, false, 'the single final-release event clears block');
  input.action('attack', true); input.action('attack', true);
  assert.equal(input.frame().attackPressed, true, 'simultaneous fingers trigger one attack edge');
  assert.equal(input.frame().attackPressed, false, 'a held multi-touch attack does not retrigger');
  input.action('attack', false); input.action('attack', false);
  let interactions = 0; input.onInteract = () => interactions++; keys.e.isDown = true; input.frame(); input.frame(); assert.equal(interactions, 1, 'keyboard interact is edge-triggered');

  const bus = new SimpleEmitter();
  const rpg = new RpgModule({ bus });
  const world = createWorldModule({ emitter: bus });
  const persistence = new PersistenceModule({ gameVersion: '1.0.0', bus, backend: new MemoryBackend(), autosave: { enabled: false } });

  // Bridge story rewards into RPG, and quest completion into RPG + autosave contract.
  bus.on('world:reward', (reward: any) => {
    if (reward.xp) rpg.progression.addXp(reward.xp, reward.source ?? 'story');
    if (reward.gold) rpg.economy.addGold(reward.gold);
    for (const item of reward.items ?? []) rpg.inventory.add(item.id, item.n ?? 1);
  });
  bus.on('world:quest-completed', (p: any) => {
    rpg.notifyQuestCompleted(p.id);
    bus.emit('rpg:quest-completed', { questId: p.id });
  });

  const combat = new CombatEngine({ emitter: bus, rpg: rpg as any, region: 'ashen_village', rng: () => 0.99 });
  const beforeXp = rpg.progression.xp;
  const enemy = combat.spawn('ash_wolf', { id: 'smoke_ash_wolf', x: 120, y: 700, region: 'ashen_village' });
  combat.damageEnemy(enemy.id, { amount: 100000, school: 'true' });
  assert.equal(world.serialize().counters['kills:ash_wolf'], 1, 'World receives combat kill events');
  assert.ok(rpg.progression.xp > beforeXp, 'RPG receives enemy-killed rewards');

  const goldBefore = rpg.getGold();
  const herbBefore = rpg.inventory.count('healing_herb');
  bus.emit('world:reward', { xp: 30, gold: 17, items: [{ id: 'healing_herb', n: 1 }], source: 'integration-smoke' });
  assert.equal(rpg.getGold(), goldBefore + 17, 'World rewards are bridged into RPG economy');
  assert.equal(rpg.inventory.count('healing_herb'), herbBefore + 1, 'World item rewards are bridged into RPG inventory');

  rpg.notifyEnding('true_king');
  const levelBeforeNg = rpg.getLevel();
  const ng = rpg.ngPlus.start();
  assert.equal(ng.ok, true, 'RPG permits New Game+ after an ending');
  if (ng.ok) { assert.equal(ng.cycle, 1); assert.equal(rpg.getLevel(), levelBeforeNg); assert.equal(rpg.ngPlus.getScaling().enemyHealthMult, 1.6); }
  world.newGame();

  await persistence.init();
  persistence.registerStateProvider(() => ({
    player: { stats: { health: 100, mana: 50, stamina: 100 }, level: rpg.getLevel(), xp: rpg.progression.xp, position: { x: 140, y: 700 } },
    inventory: { gold: rpg.getGold(), items: rpg.inventory.list().map(i => ({ id: i.defId, qty: i.qty })) },
    equipment: {}, skills: { unlocked: [], equipped: [], points: rpg.progression.skillPoints, levels: {} },
    quests: [], decisions: { __world: JSON.stringify(world.serialize()), __rpg: JSON.stringify(rpg.serialize()) },
    narrative: world.getHiddenVariables(), relationships: {}, difficulty: 'normal', currentRegion: 'ashen_village',
    unlockedSkins: [], progress: { playtimeMs: 0, regionsUnlocked: ['ashen_village'], regionsCompleted: [], bossesDefeated: [], flags: {}, endingsSeen: [] },
  }));
  await persistence.saveToSlot('slot1', 'integration smoke');
  const loaded = await persistence.loadSlot('slot1');
  assert.equal(loaded.ok, true, 'Persistence saves and reloads a combined world/RPG state');
  if (loaded.ok) {
    assert.ok(typeof loaded.record.state.decisions.__world === 'string');
    assert.ok(typeof loaded.record.state.decisions.__rpg === 'string');
  }
  await persistence.dispose();
  rpg.dispose(); world.detach();
  console.log('Integration smoke passed: Input ↔ Player + World ↔ Combat ↔ RPG ↔ Persistence + New Game+');
}

void main().catch(err => { console.error(err); process.exitCode = 1; });
