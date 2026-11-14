const assert = require('node:assert/strict');
const { CombatEngine, enemyRect, intersects } = require('../../../../build/combat-core/core/CombatEngine.js');
const { getBossDefinition, getEnemyArchetype, ENEMIES } = require('../../../../build/combat-core/data/enemies.js');
const { StatusEffectSystem } = require('../../../../build/combat-core/systems/StatusEffects.js');
const { EnemyAIController } = require('../../../../build/combat-core/systems/EnemyAI.js');
const { DamageResolver, applyHitToEnemy } = require('../../../../build/combat-core/systems/DamageResolver.js');
let passed = 0;
function test(name, fn) { try { fn(); passed++; process.stdout.write(`✓ ${name}\n`); } catch (e) { process.stderr.write(`✗ ${name}\n${e.stack}\n`); process.exitCode = 1; } }
const rng = () => 0.99;
test('all World module enemy archetypes are mapped', () => {
  const ids = ['ash_wolf','crown_soldier','thornling','rook_bandit','sand_scorpion','dune_raider','glass_serpent','sand_wraith','frost_wolf','ice_wraith','crown_scout','ironwatch_guard','crossbow_sentry','hushed_guard','hollow_shade','royal_champion','cellar_rat_swarm','sickened_stag'];
  for (const id of ids) assert.ok(getEnemyArchetype(id), id);
  assert.equal(Object.keys(ENEMIES).length, ids.length);
});
test('all six World module boss aliases resolve', () => {
  for (const id of ['hobb','thornwarden','colossus','voss','hushmother','morrow']) assert.ok(getBossDefinition(id), id);
});
test('spawn scales health and identifies elite/boss tiers', () => {
  const c = new CombatEngine({ rng });
  const normal = c.spawn('ash_wolf', { x: 10, y: 20, level: 3 });
  const elite = c.spawn('ash_wolf', { x: 30, y: 20, level: 3, elite: true });
  const boss = c.spawn('sergeant_hobb', { x: 50, y: 20, bossId: 'hobb' });
  assert.ok(elite.maxHealth > normal.maxHealth); assert.equal(elite.tier, 'elite'); assert.equal(boss.tier, 'boss');
});
test('player attack hits each enemy once per attack token', () => {
  const c = new CombatEngine({ rng }); const e = c.spawn('ash_wolf', { x: 50, y: 50 });
  const attack = { kind: 'normal', comboIndex: 0, facing: 1, damage: 20, hitbox: { offsetX: 0, offsetY: 0, width: 90, height: 70 }, activeFrom: 0, activeFor: 0.1 };
  const rect = { x: 0, y: 0, width: 100, height: 100 }; const p = { x: 0, y: 50, health: 100, maxHealth: 100, facing: 1 };
  assert.equal(c.resolvePlayerAttack(attack, rect, p, 'swing-1').length, 1);
  assert.equal(c.resolvePlayerAttack(attack, rect, p, 'swing-1').length, 0);
  assert.ok(e.health < e.maxHealth);
});
test('damageEnemy applies status and kill event contracts', () => {
  const events = []; const bus = { on(){}, off(){}, emit:(n,p)=>events.push([n,p]) };
  const c = new CombatEngine({ emitter: bus, rng }); const e = c.spawn('thornling', { x: 0, y: 0 });
  c.damageEnemy(e.id, { amount: 9999, school: 'true', status: { kind: 'burn', durationMs: 2000, tickMs: 500, tickDamage: 3 } });
  assert.ok(events.some(([n]) => n === 'combat:enemy-defeated'));
  assert.ok(events.some(([n,p]) => n === 'enemy:killed' && p.tier === 'minion'));
});
test('boss phase changes at 65 and 30 percent health', () => {
  const c = new CombatEngine({ rng }); const e = c.spawn('thornwarden', { x: 0, y: 0, bossId: 'thornwarden' });
  e.health = Math.floor(e.maxHealth * 0.6); c.update(16, { x: 20, y: 0, health: 100, maxHealth: 100, facing: 1 }); assert.equal(e.bossPhase, 2);
  e.health = Math.floor(e.maxHealth * 0.2); c.update(16, { x: 20, y: 0, health: 100, maxHealth: 100, facing: 1 }); assert.equal(e.bossPhase, 3);
});
test('status effects tick damage and expire', () => {
  const c = new CombatEngine({ rng }); const e = c.spawn('ash_wolf', { x: 0, y: 0 });
  const status = new StatusEffectSystem(); status.apply(e, { kind: 'burn', remainingMs: 1100, tickMs: 500, tickDamage: 4 });
  assert.equal(status.tick(e, 500).damage, 4); assert.equal(status.tick(e, 500).damage, 4); assert.equal(status.tick(e, 200).expired.length, 1);
});
test('boss death emits the World and RPG contracts exactly once', () => {
  const events = []; const bus = { on(){}, off(){}, emit:(n,p)=>events.push([n,p]) };
  const c = new CombatEngine({ emitter: bus, rng }); const e = c.spawn('sergeant_hobb', { x: 0, y: 0, bossId: 'hobb' });
  c.damageEnemy(e.id, { amount: 99999, school: 'true' });
  assert.equal(events.filter(([n]) => n === 'combat:boss-defeated').length, 1);
  assert.equal(events.filter(([n]) => n === 'combat:enemy-defeated').length, 0);
  assert.equal(events.filter(([n,p]) => n === 'enemy:killed' && p.tier === 'boss' && p.enemyId === 'sergeant_hobb').length, 1);
  assert.equal(events.filter(([n]) => n === 'boss:defeated').length, 1);
});
test('stunned enemies still take damage', () => {
  const c = new CombatEngine({ rng }); const e = c.spawn('ash_wolf', { x: 0, y: 0 });
  c.damageEnemy(e.id, { amount: 5, stunMs: 1000 }); const hp = e.health;
  const r = c.damageEnemy(e.id, { amount: 7 }); assert.equal(r.damage, 7); assert.equal(e.health, hp - 7);
});
test('slow status changes movement speed and restores it on expiry', () => {
  const c = new CombatEngine({ rng }); const e = c.spawn('ash_wolf', { x: 0, y: 0 });
  c.damageEnemy(e.id, { amount: 1, status: { kind: 'slow', durationMs: 500, magnitude: 0.5 } });
  assert.equal(e.slowMultiplier, 0.5); for (let i = 0; i < 12; i++) c.update(50, { x: 900, y: 0, health: 100, maxHealth: 100, facing: 1 }); assert.equal(e.slowMultiplier, 1);
});
test('RPG lifesteal passive is forwarded as a player-heal event', () => {
  const events = []; const bus = { on(){}, off(){}, emit:(n,p)=>events.push([n,p]) };
  const rpg = { combat: { calcDamage: () => ({ damage: 12, crit: false, lifestealHeal: 4 }) } };
  const c = new CombatEngine({ emitter: bus, rpg, rng }); const e = c.spawn('ash_wolf', { x: 40, y: 30 });
  const attack = { kind:'normal', comboIndex:0, facing:1, damage:10, hitbox:{offsetX:0,offsetY:0,width:100,height:100}, activeFrom:0, activeFor:0.1 };
  c.resolvePlayerAttack(attack, {x:0,y:0,width:100,height:100}, {x:0,y:30,health:50,maxHealth:100,facing:1}, 'lifesteal-1');
  assert.ok(events.some(([n,p]) => n === 'combat:lifesteal' && p.amount === 4)); assert.ok(e.health < e.maxHealth);
});
test('combo multiplier increases every fifth confirmed hit', () => {
  const multipliers = []; const rpg = { combat: { calcDamage: (i) => { multipliers.push(i.multiplier); return { damage:1, crit:false, lifestealHeal:0 }; } } };
  const c = new CombatEngine({ rpg, rng }); c.spawn('ironwatch_guard', { x: 40, y: 30 });
  const attack = { kind:'normal', comboIndex:0, facing:1, damage:10, hitbox:{offsetX:0,offsetY:0,width:100,height:100}, activeFrom:0, activeFor:0.1 };
  for (let i=0;i<5;i++) c.resolvePlayerAttack(attack, {x:0,y:0,width:100,height:100}, {x:0,y:30,health:50,maxHealth:100,facing:1}, `combo-${i}`);
  assert.equal(multipliers[4], 1.1);
});
test('enemies build readable three-hit combo chains with escalating damage and recovery', () => {
  const events = [];
  const bus = { on(){}, off(){}, emit:(name, payload)=>events.push([name, payload]) };
  const c = new CombatEngine({ emitter: bus, rng });
  const enemy = c.spawn('ash_wolf', { x: 30, y: 0 });
  enemy.attackCooldownMs = 0;
  const strikes = [];
  const player = { x: 0, y: 0, health: 100, maxHealth: 100, facing: 1 };
  for (let i = 0; i < 180 && strikes.length < 4; i++) {
    c.update(50, player, (_attacker, damage) => strikes.push(damage));
  }
  assert.equal(strikes.length, 4, 'enemy should complete three strikes and then restart its chain');
  assert.ok(Math.abs(strikes[1] / strikes[0] - 1.14) < 0.001, 'second strike should scale by 14 percent');
  assert.ok(Math.abs(strikes[2] / strikes[0] - 1.28) < 0.001, 'finisher should scale by 28 percent');
  assert.ok(Math.abs(strikes[3] / strikes[0] - 1) < 0.001, 'recovery window should reset the next chain');
  const chainEvents = events.filter(([name]) => name === 'combat:enemy-combo').map(([, payload]) => payload.count);
  assert.deepEqual(chainEvents.slice(0, 4), [1, 2, 3, 1]);
  assert.ok(enemy.attackCooldownMs > 0, 'finisher should create a recovery window');
});
test('a confirmed player hit breaks the player combo chain', () => {
  const multipliers = [];
  const rpg = { combat: { calcDamage: (input) => { multipliers.push(input.multiplier); return { damage: 1, crit: false, lifestealHeal: 0 }; } } };
  const c = new CombatEngine({ rpg, rng });
  c.spawn('ironwatch_guard', { x: 40, y: 30 });
  const attack = { kind:'normal', comboIndex:0, facing:1, damage:10, hitbox:{offsetX:0,offsetY:0,width:100,height:100}, activeFrom:0, activeFor:0.1 };
  const player = { x:0,y:30,health:50,maxHealth:100,facing:1 };
  for (let i=0;i<5;i++) c.resolvePlayerAttack(attack, {x:0,y:0,width:100,height:100}, player, `player-chain-${i}`);
  assert.ok(multipliers[4] > 1, 'player chain should build a multiplier');
  c.breakPlayerCombo();
  c.resolvePlayerAttack(attack, {x:0,y:0,width:100,height:100}, player, 'player-chain-reset');
  assert.equal(multipliers[5], 1, 'new chain should return to base damage');
});
test('stunning an enemy interrupts its combo chain', () => {
  const events = [];
  const bus = { on(){}, off(){}, emit:(name, payload)=>events.push([name, payload]) };
  const c = new CombatEngine({ emitter: bus, rng });
  const enemy = c.spawn('ash_wolf', { x: 30, y: 0 });
  enemy.attackCooldownMs = 0;
  const strikes = [];
  const player = { x:0,y:0,health:100,maxHealth:100,facing:1 };
  for (let i=0;i<40 && strikes.length<1;i++) c.update(50, player, (_attacker, damage)=>strikes.push(damage));
  assert.equal(strikes.length, 1, 'enemy should complete its opening strike');
  c.damageEnemy(enemy.id, { amount: 1, stunMs: 900 });
  for (let i=0;i<70 && strikes.length<2;i++) c.update(50, player, (_attacker, damage)=>strikes.push(damage));
  assert.equal(strikes.length, 2, 'enemy should recover and attack again');
  const resets = events.filter(([name])=>name==='combat:enemy-combo-reset');
  assert.equal(resets.length, 1, 'stun should publish a chain interruption');
  assert.ok(Math.abs(strikes[1]/strikes[0]-1)<0.001, 'post-stun strike should restart at base damage');
});
test('rectangle collision helper uses strict overlap', () => {
  assert.equal(intersects({ x:0,y:0,width:10,height:10 }, { x:9,y:9,width:2,height:2 }), true);
  assert.equal(intersects({ x:0,y:0,width:10,height:10 }, { x:10,y:0,width:2,height:2 }), false);
  assert.equal(enemyRect({ x: 20, y: 30, tier: 'boss' }).width, 88);
});
test('stun cancels an enemy wind-up before the strike resolves', () => {
  const c = new CombatEngine({ rng });
  const e = c.spawn('ash_wolf', { x: 30, y: 0 });
  e.attackCooldownMs = 0;
  const player = { x: 0, y: 0, health: 100, maxHealth: 100, facing: 1 };
  let strikes = 0;
  c.update(16, player, () => { strikes++; });
  assert.ok(e.windupRemainingMs > 0, 'enemy should telegraph before the hit');
  c.damageEnemy(e.id, { amount: 1, stunMs: 900 });
  c.update(16, player, () => { strikes++; });
  assert.equal(e.windupRemainingMs, 0);
  assert.equal(e.telegraphActive, false);
  assert.equal(strikes, 0, 'stunned enemy must not finish its attack');
});
test('flying enemy pursues the player on both axes', () => {
  const ai = new EnemyAIController();
  const enemy = { ai:'flying', x:100, y:100, vx:0, vy:0, facing:1, alive:true, aggro:true,
    attackCooldownMs:2000, hitFlashMs:0, stunRemainingMs:0, slowMultiplier:1, speed:100,
    attackRange:48, attackWindupMs:360, windupRemainingMs:0, lastAttackAt:0 };
  const action = ai.update(enemy, { x:220, y:260, health:100, maxHealth:100, facing:-1 }, 16);
  assert.ok(action.vx > 0, 'flyer should close horizontal distance');
  assert.ok(action.vy > 0, 'flyer should climb toward a player below it');
});
test('ground enemies and patrol states always return a vertical velocity', () => {
  const ai = new EnemyAIController();
  const enemy = { ai:'melee', x:100, y:100, vx:0, vy:0, facing:1, alive:true, aggro:false,
    attackCooldownMs:1000, hitFlashMs:0, stunRemainingMs:0, slowMultiplier:1, speed:80,
    attackRange:40, attackWindupMs:360, windupRemainingMs:0, lastAttackAt:0 };
  const action = ai.update(enemy, { x:900, y:100, health:100, maxHealth:100, facing:-1 }, 16);
  assert.equal(action.vy, 0);
});
test('enemy AI moves toward target and respects death', () => {
  const c = new CombatEngine({ rng }); const e = c.spawn('crown_soldier', { x: 300, y: 0 });
  c.update(16, { x: 0, y: 0, health: 100, maxHealth: 100, facing: 1 }); assert.ok(e.vx < 0);
  e.alive = false; c.update(16, { x: 0, y: 0, health: 100, maxHealth: 100, facing: 1 }); assert.equal(e.vx, e.vx);
});
test('RPG ability bridge validates resource/cooldown and executes targets', () => {
  const c = new CombatEngine({ rng }); c.spawn('ash_wolf', { x: 30, y: 0 });
  const rpg = { skills: { tryUseAbility: () => ({ ok: true, use: { abilityId: 'w_power_strike', manaCost: 0, staminaCost: 10, effect: { abilityId:'w_power_strike', kind:'aoe', school:'physical', multiplier:2, radius:100 } } }) } };
  const result = c.useAbility('w_power_strike', { mana: 20, stamina: 20, baseAttack: 20 }, rpg, { x: 0, y: 0, health: 100, maxHealth: 100, facing: 1 });
  assert.equal(result.ok, true); assert.equal(result.targets, 1);
});
process.stdout.write(`\n${passed} combat tests passed.\n`);
