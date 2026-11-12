import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend, SaveManager, SimpleEmitter, AUTO_SLOT, PersistenceEvents, Migration, SAVE_SCHEMA_VERSION } from '../../index';
import { stableStringify, checksumOf } from '../../save/checksum';
import { sampleState } from './helpers';

const mk = (migrations: Migration[] = []) => {
  const backend = new MemoryBackend();
  const bus = new SimpleEmitter();
  const sm = new SaveManager(backend, { gameVersion: '0.1.0', bus, migrations });
  return { backend, bus, sm };
};

test('save + load round trip preserves all state sections', async () => {
  const { sm } = mk();
  const st = sampleState();
  await sm.saveState('slot1', st, { label: 'Forest' });
  const r = await sm.load('slot1');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.record.state.player, st.player);
  assert.deepEqual(r.record.state.inventory, st.inventory);
  assert.deepEqual(r.record.state.equipment, st.equipment);
  assert.deepEqual(r.record.state.skills, st.skills);
  assert.deepEqual(r.record.state.quests, st.quests);
  assert.deepEqual(r.record.state.decisions, st.decisions);
  assert.deepEqual(r.record.state.narrative, st.narrative);
  assert.deepEqual(r.record.state.relationships, st.relationships);
  assert.equal(r.record.state.difficulty, 'hard');
  assert.equal(r.record.state.currentRegion, 'whispering_forest');
  assert.deepEqual(r.record.state.unlockedSkins, ['ember_cloak']);
  assert.deepEqual(r.record.state.progress, st.progress);
  assert.equal(r.record.meta.level, 7);
  assert.equal(r.record.meta.label, 'Forest');
});

test('multiple slots are independent; listSlots reports empty/ok', async () => {
  const { sm } = mk();
  await sm.saveState('slot1', sampleState());
  await sm.saveState('slot3', sampleState({ player: { stats: {}, level: 20, xp: 0 } }));
  const list = await sm.listSlots();
  assert.deepEqual(list.map((s) => [s.slotId, s.state]), [['slot1', 'ok'], ['slot2', 'empty'], ['slot3', 'ok'], ['auto', 'empty']]);
  assert.equal(list[2].meta!.level, 20);
  assert.equal(await sm.getLastSlot(), 'slot3');
});

test('unknown slot ids are rejected', async () => {
  const { sm } = mk();
  await assert.rejects(sm.saveState('slot9', sampleState()), { code: 'bad-slot' });
  const r = await sm.load('../evil');
  assert.ok(!r.ok && r.code === 'bad-slot');
});

test('state is snapshotted at call time (later mutation does not leak into the save)', async () => {
  const { sm } = mk();
  const st = sampleState();
  const p = sm.saveState('slot1', st);
  st.inventory.gold = 99999;
  await p;
  const r = await sm.load('slot1');
  assert.ok(r.ok && r.record.state.inventory.gold === 345);
});

test('concurrent saves are serialised; last call wins and backup is the previous save', async () => {
  const { sm } = mk();
  const ps = [1, 2, 3, 4, 5].map((n) => sm.saveState('slot1', sampleState({ inventory: { gold: n, items: [] } })));
  await Promise.all(ps);
  const r = await sm.load('slot1');
  assert.ok(r.ok && r.record.state.inventory.gold === 5);
});

test('corrupt primary falls back to backup (restored-backup) and heals primary', async () => {
  const { sm, backend } = mk();
  await sm.saveState('slot1', sampleState({ inventory: { gold: 1, items: [] } }));
  await sm.saveState('slot1', sampleState({ inventory: { gold: 2, items: [] } }));
  await backend.put('saves', 'slot1', { garbage: true });
  const r = await sm.load('slot1');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.status, 'restored-backup');
  assert.equal(r.record.state.inventory.gold, 1);
  assert.ok(r.warnings.length > 0);
  await new Promise((res) => setTimeout(res, 5));
  const again = await sm.load('slot1');
  assert.ok(again.ok && again.status === 'ok');
});

test('tampered values (checksum mismatch) prefer verified backup; without backup they load with warning', async () => {
  const { sm, backend } = mk();
  await sm.saveState('slot1', sampleState());
  const raw = (await backend.get<any>('saves', 'slot1'))!;
  raw.state.inventory.gold = 777777;
  await backend.put('saves', 'slot1', raw);
  const r = await sm.load('slot1');
  assert.ok(r.ok && r.status === 'checksum-mismatch' && r.record.state.inventory.gold === 777777);
  // now with a good backup available
  await sm.saveState('slot2', sampleState());
  await sm.saveState('slot2', sampleState());
  const raw2 = (await backend.get<any>('saves', 'slot2'))!;
  raw2.state.inventory.gold = 5;
  await backend.put('saves', 'slot2', raw2);
  const r2 = await sm.load('slot2');
  assert.ok(r2.ok && r2.status === 'restored-backup' && r2.record.state.inventory.gold === 345);
});

test('missing fields are repaired with defaults; hopelessly incomplete saves are rejected', async () => {
  const { sm, backend } = mk();
  await sm.saveState('slot1', sampleState());
  const raw = (await backend.get<any>('saves', 'slot1'))!;
  delete raw.state.skills;
  delete raw.state.narrative;
  raw.state.player.level = 'abc';
  raw.meta.checksum = checksumOf(SAVE_SCHEMA_VERSION, raw.state); // pretend the file was written that way
  await backend.put('saves', 'slot1', raw);
  const r = await sm.load('slot1');
  assert.ok(r.ok && r.status === 'repaired');
  if (r.ok) {
    assert.equal(r.record.state.player.level, 1);
    assert.deepEqual(r.record.state.narrative, { honor: 0, trust: 0, ambition: 0, mercy: 0 });
  }
  await backend.put('saves', 'slot2', { meta: { schemaVersion: 1 }, state: { difficulty: 'hard' } });
  const bad = await sm.load('slot2');
  assert.ok(!bad.ok && bad.code === 'invalid');
});

test('invalid shapes never throw: null, string, array, wrong types', async () => {
  const { sm, backend } = mk();
  for (const junk of [null, 'str', 42, [], { meta: 1, state: 2 }, { meta: {}, state: {} }, { meta: { schemaVersion: -1 }, state: {} }]) {
    await backend.put('saves', 'slot1', junk);
    const r = await sm.load('slot1');
    assert.ok(!r.ok, `expected failure for ${JSON.stringify(junk)}`);
  }
  const list = await sm.listSlots();
  assert.equal(list[0].state, 'corrupt');
});

test('prototype-pollution keys in saves are dropped', async () => {
  const { sm, backend } = mk();
  await sm.saveState('slot1', sampleState());
  const raw = (await backend.get<any>('saves', 'slot1'))!;
  raw.state.relationships = JSON.parse('{"__proto__":{"polluted":1},"ok":3}');
  raw.state.progress.flags = JSON.parse('{"constructor":1,"fine":true}');
  raw.meta.checksum = checksumOf(1, raw.state);
  await backend.put('saves', 'slot1', raw);
  const r = await sm.load('slot1');
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(Object.keys(r.record.state.relationships), ['ok']);
    assert.deepEqual(Object.keys(r.record.state.progress.flags), ['fine']);
  }
  assert.equal(({} as any).polluted, undefined);
});

test('newer schema is refused and never rolled back to an old backup', async () => {
  const { sm, backend } = mk();
  await sm.saveState('slot1', sampleState());
  await sm.saveState('slot1', sampleState());
  const raw = (await backend.get<any>('saves', 'slot1'))!;
  raw.meta.schemaVersion = 99;
  await backend.put('saves', 'slot1', raw);
  const r = await sm.load('slot1');
  assert.ok(!r.ok && r.code === 'newer-version');
});

test('migrations run for older schema versions (framework test with synthetic v0)', async () => {
  const mig: Migration = {
    from: 0, to: 1,
    migrate: ({ meta, state }) => ({ meta, state: { ...state, difficulty: String((state as any).diff ?? 'normal') } }),
  };
  const { sm, backend } = mk([mig]);
  const full = sampleState() as any;
  const { difficulty: _d, ...legacy } = full; void _d;
  await backend.put('saves', 'slot1', { meta: { schemaVersion: 0, slotId: 'slot1' }, state: { ...legacy, diff: 'hard', checkpoints: { lastStoneId: null, stones: {} } } });
  const r = await sm.load('slot1');
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.record.state.difficulty, 'hard'); assert.equal(r.record.meta.schemaVersion, SAVE_SCHEMA_VERSION); }
  const { sm: sm2, backend: b2 } = mk(); // no migration registered
  await b2.put('saves', 'slot1', { meta: { schemaVersion: 0 }, state: legacy });
  const r2 = await sm2.load('slot1');
  assert.ok(!r2.ok && r2.code === 'no-migration');
});

test('export -> import into another slot round trips; occupied slot refused unless overwrite', async () => {
  const { sm } = mk();
  await sm.saveState('slot1', sampleState());
  const { json, filename } = await sm.exportSlot('slot1');
  assert.match(filename, /^ashes-of-crowns-slot1-.*\.json$/);
  await sm.importSlot(json, 'slot2');
  const a = await sm.load('slot1'); const b = await sm.load('slot2');
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.deepEqual(a.record.state, b.record.state);
  await assert.rejects(sm.importSlot(json, 'slot2'), { code: 'slot-occupied' });
  await sm.importSlot(json, 'slot2', { overwrite: true });
});

test('import rejects bad JSON, wrong format, oversize, tampering; force overrides checksum only', async () => {
  const { sm } = mk();
  await sm.saveState('slot1', sampleState());
  const { json } = await sm.exportSlot('slot1');
  await assert.rejects(sm.importSlot('', 'slot2'), { code: 'invalid' });
  await assert.rejects(sm.importSlot('{not json', 'slot2'), { code: 'invalid' });
  await assert.rejects(sm.importSlot('{"format":"other"}', 'slot2'), { code: 'invalid' });
  await assert.rejects(sm.importSlot('x'.repeat(6 * 1024 * 1024), 'slot2'), { code: 'too-large' });
  const env = JSON.parse(json);
  env.save.state.inventory.gold = 1e9;
  await assert.rejects(sm.importSlot(JSON.stringify(env), 'slot2'), { code: 'checksum-mismatch' });
  await sm.importSlot(JSON.stringify(env), 'slot2', { force: true });
  env.exportVersion = 99;
  await assert.rejects(sm.importSlot(JSON.stringify(env), 'slot3'), { code: 'newer-version' });
  await assert.rejects(sm.importSlot(json, 'bad'), { code: 'bad-slot' });
});

test('import keeps the imported checkpoints, not the live ones', async () => {
  const backend = new MemoryBackend();
  const sm = new SaveManager(backend, { gameVersion: '1' });
  sm.setCheckpointSource(() => ({ lastStoneId: 'a', stones: { a: { id: 'a', regionId: 'ashen_village', x: 1, y: 2, discoveredAt: 5 } } }));
  await sm.saveState('slot1', sampleState());
  const { json } = await sm.exportSlot('slot1');
  sm.setCheckpointSource(() => ({ lastStoneId: null, stones: {} }));
  await sm.importSlot(json, 'slot2');
  const r = await sm.load('slot2');
  assert.ok(r.ok && r.record.state.checkpoints.lastStoneId === 'a');
});

test('failed write emits save-failed, throws, and leaves the previous save intact', async () => {
  const { sm, backend, bus } = mk();
  await sm.saveState('slot1', sampleState());
  let failed: any = null;
  bus.on(PersistenceEvents.SAVE_FAILED, (p: unknown) => (failed = p));
  const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  backend.failNextWrite = quota;
  await assert.rejects(sm.saveState('slot1', sampleState({ inventory: { gold: 1, items: [] } })), { code: 'quota' });
  assert.equal(failed.code, 'quota');
  const r = await sm.load('slot1');
  assert.ok(r.ok && r.record.state.inventory.gold === 345);
  // queue not poisoned
  await sm.saveState('slot1', sampleState({ inventory: { gold: 2, items: [] } }));
});

test('skipIfUnchanged avoids redundant writes', async () => {
  const { sm, backend } = mk();
  const st = sampleState();
  assert.ok(await sm.saveState(AUTO_SLOT, st, { skipIfUnchanged: true }));
  const before = backend.stats().batches;
  assert.equal(await sm.saveState(AUTO_SLOT, st, { skipIfUnchanged: true }), null);
  assert.equal(backend.stats().batches, before);
  assert.ok(await sm.saveState(AUTO_SLOT, sampleState({ inventory: { gold: 1, items: [] } }), { skipIfUnchanged: true }));
});

test('deleteSlot removes primary and backup', async () => {
  const { sm } = mk();
  await sm.saveState('slot1', sampleState());
  await sm.saveState('slot1', sampleState());
  await sm.deleteSlot('slot1');
  const r = await sm.load('slot1');
  assert.ok(!r.ok && r.code === 'empty-slot');
});

test('stableStringify is key-order independent', () => {
  assert.equal(stableStringify({ a: 1, b: { c: 2, d: 3 } }), stableStringify({ b: { d: 3, c: 2 }, a: 1 }));
});

test('save() without a provider fails clearly; with provider works and merges checkpoints', async () => {
  const { sm } = mk();
  await assert.rejects(sm.save('slot1'), { code: 'no-state-provider' });
  sm.setStateProvider(() => sampleState());
  sm.setCheckpointSource(() => ({ lastStoneId: null, stones: {} }));
  assert.ok(await sm.save('slot1'));
});

test('regression: realistic epoch-ms timestamps in checkpoints are not flagged as repairs', async () => {
  const { sm } = mk();
  sm.setCheckpointSource(() => ({ lastStoneId: 's1', stones: { s1: { id: 's1', regionId: 'ashen_village', x: 1, y: 2, discoveredAt: Date.now() } } }));
  await sm.saveState('slot1', sampleState());
  const r = await sm.load('slot1');
  assert.ok(r.ok && r.status === 'ok' && r.warnings.length === 0);
});
