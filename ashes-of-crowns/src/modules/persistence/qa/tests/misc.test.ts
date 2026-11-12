import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend, SettingsManager, defaultSettings, sanitizeSettings, CheckpointManager, SimpleEmitter, SaveManager, AutoSaver, DEFAULT_AUTOSAVE, PersistenceModule, PersistenceEvents, AUTO_SLOT } from '../../index';
import { sampleState } from './helpers';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('settings: defaults, clamping, invalid values, persistence across instances', async () => {
  const b = new MemoryBackend();
  const bus = new SimpleEmitter();
  const s = new SettingsManager(b, { bus, debounceMs: 5 });
  await s.load();
  assert.deepEqual(s.get(), defaultSettings());
  const events: any[] = [];
  bus.on(PersistenceEvents.SETTINGS_CHANGED, (p: any) => events.push(p));
  s.update({ audio: { music: 5, sfx: -1, muted: true }, language: 'fr', controls: { buttonScale: 9, touchLayout: 'left-handed' }, graphics: { targetFps: 30 } });
  const g = s.get();
  assert.equal(g.audio.music, 1); assert.equal(g.audio.sfx, 0); assert.equal(g.audio.muted, true);
  assert.equal(g.controls.buttonScale, 1.5); assert.equal(g.controls.touchLayout, 'left-handed');
  assert.equal(g.language, 'fr'); assert.equal(g.graphics.targetFps, 30);
  assert.equal(events.length, 1);
  s.update({ language: 'not a lang!!', graphics: { targetFps: 45 as any, quality: 'ultra' as any } });
  assert.equal(s.get().language, 'fr'); assert.equal(s.get().graphics.targetFps, 30); assert.equal(s.get().graphics.quality, 'auto');
  s.update({ audio: { muted: true } }); // no-op
  assert.equal(events.length, 1);
  await sleep(20);
  const s2 = new SettingsManager(b);
  await s2.load();
  assert.deepEqual(s2.get(), s.get());
  assert.deepEqual(s2.reset().audio, defaultSettings().audio);
});

test('settings: corrupt stored settings fall back to defaults; write failure keeps in-memory values', async () => {
  const b = new MemoryBackend();
  await b.put('settings', 'settings', 'garbage');
  const s = new SettingsManager(b, { debounceMs: 1 });
  assert.deepEqual(await s.load(), defaultSettings());
  b.failNextWrite = new Error('boom');
  s.update({ audio: { music: 0.2 } });
  assert.equal(await s.flush(), false);
  assert.equal(s.get().audio.music, 0.2);
  assert.equal(await s.flush(), true); // retried
});

test('settings: language allow-list and prototype-pollution patch', () => {
  assert.equal(sanitizeSettings({ language: 'de' }, defaultSettings(), ['en', 'fr']).language, 'en');
  const s = new SettingsManager(new MemoryBackend());
  s.update(JSON.parse('{"__proto__":{"x":1},"audio":{"music":0.1}}'));
  assert.equal(({} as any).x, undefined);
  assert.equal(s.get().audio.music, 0.1);
});

test('checkpoints: register/activate/respawn/snapshot/restore', () => {
  const bus = new SimpleEmitter();
  const ev: string[] = [];
  bus.on('checkpoint:activated', (p: any) => ev.push('act:' + p.stoneId));
  bus.on('checkpoint:respawn', (p: any) => ev.push('resp:' + p.stoneId));
  const c = new CheckpointManager(bus, () => 1000);
  c.setDefaultSpawn({ regionId: 'ashen_village', x: 5, y: 6 });
  c.register({ id: 's1', regionId: 'ashen_village', x: 100, y: 200 }, { id: 's2', regionId: 'whispering_forest', x: 300, y: 50 });
  assert.deepEqual(c.getRespawnPoint(), { stoneId: null, regionId: 'ashen_village', x: 5, y: 6 });
  assert.equal(c.activate('nope'), false);
  assert.equal(c.activate('s1'), true);
  assert.equal(c.activate('s1'), false); // no duplicate event
  assert.equal(c.activate('s2'), true);
  assert.equal(c.activate('s1'), false); // switching back emits again
  assert.deepEqual(ev, ['act:s1', 'act:s2', 'act:s1']);
  assert.deepEqual(c.respawn(), { stoneId: 's1', regionId: 'ashen_village', x: 100, y: 200 });
  const snap = c.snapshot();
  const c2 = new CheckpointManager(bus);
  c2.restore(snap); // stones known from save even before world re-registers them
  assert.equal(c2.getRespawnPoint().stoneId, 's1');
  assert.equal(c2.activate('s2'), false);
  assert.equal(c2.isDiscovered('s2'), true);
  c2.restore(undefined);
  assert.equal(c2.getDiscovered().length, 0);
});

test('autosave: bursts coalesce, unchanged state skipped, no-provider is not a failure', async () => {
  const b = new MemoryBackend();
  const bus = new SimpleEmitter();
  const sm = new SaveManager(b, { gameVersion: '1', bus });
  const a = new AutoSaver(sm, bus, { ...DEFAULT_AUTOSAVE, intervalMs: 100000, minGapMs: 30 }, undefined, undefined);
  a.start();
  bus.emit('world:region-changed'); // provider missing
  await sleep(50);
  assert.equal(a.counters.failed, 0);
  let gold = 1;
  sm.setStateProvider(() => sampleState({ inventory: { gold, items: [] } }));
  for (let i = 0; i < 10; i++) bus.emit('rpg:level-up');
  await sleep(80);
  assert.equal(a.counters.saved, 1);
  bus.emit('rpg:level-up');
  await sleep(80);
  assert.equal(a.counters.skippedUnchanged, 1);
  gold = 2;
  bus.emit('checkpoint:activated');
  await sleep(80);
  assert.equal(a.counters.saved, 2);
  const r = await sm.load(AUTO_SLOT);
  assert.ok(r.ok && r.record.state.inventory.gold === 2 && r.record.meta.kind === 'auto');
  a.stop();
  assert.equal(bus.listenerCount('rpg:level-up'), 0);
});

test('PersistenceModule end-to-end with memory backend: save, load, checkpoint restore, settings->audio wiring, dispose', async () => {
  const backend = new MemoryBackend();
  const bus = new SimpleEmitter();
  const m = new PersistenceModule({ gameVersion: '0.1', bus, backend, autosave: { enabled: false } });
  await m.init();
  m.registerStateProvider(() => sampleState());
  m.checkpoints.register({ id: 'stone_a', regionId: 'whispering_forest', x: 9, y: 9 });
  m.checkpoints.activate('stone_a');
  await m.saveToSlot('slot2', 'test');
  m.checkpoints.restore(undefined);
  let loaded: any = null;
  bus.on(PersistenceEvents.STATE_LOADED, (p: unknown) => (loaded = p));
  const r = await m.continueLast();
  assert.ok(r.ok);
  assert.equal(loaded.slotId, 'slot2');
  assert.equal(m.checkpoints.getRespawnPoint().stoneId, 'stone_a');
  m.settings.update({ audio: { music: 0.3, muted: true } });
  assert.deepEqual(m.audio.getVolumes(), { music: 0.3, sfx: 0.8, muted: true });
  bus.emit('persistence:request-save', { slotId: 'slot1' });
  await sleep(20);
  assert.ok((await m.saves.load('slot1')).ok);
  m.dispose();
  assert.equal(bus.listenerCount('settings:changed'), 0);
  assert.equal(bus.listenerCount('audio:play-sfx'), 0);
});

test('PersistenceModule degrades to memory when IndexedDB is unavailable (node has none)', async () => {
  const bus = new SimpleEmitter();
  let degraded = false;
  bus.on(PersistenceEvents.DEGRADED, () => (degraded = true));
  const m = new PersistenceModule({ gameVersion: '0.1', bus, autosave: { enabled: false } });
  await m.init();
  assert.equal(degraded, true);
  assert.equal(m.getDiagnostics().backend, 'memory');
  m.dispose();
});
