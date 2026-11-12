import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, SimpleEmitter, AudioManifest } from '../../index';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
class Param { value = 1; cancelScheduledValues() {} setValueAtTime(v: number) { this.value = v; } linearRampToValueAtTime(v: number) { this.value = v; } setTargetAtTime(v: number) { this.value = v; } }
class Node { connected = true; connect(n: any) { return n; } disconnect() { this.connected = false; } }
class Gain extends Node { gain = new Param(); }
class Src extends Node { buffer: any; loop = false; playbackRate = new Param(); onended: any; started = false; start() { this.started = true; } stop() { this.onended?.(); } }
class Ctx {
  state = 'suspended'; currentTime = 0; destination = new Node(); gains: Gain[] = []; sources: Src[] = []; decodes = 0; closed = false; resumeFails = false;
  createGain() { const g = new Gain(); this.gains.push(g); return g; }
  createBuffer() { return {}; }
  createBufferSource() { const s = new Src(); this.sources.push(s); return s; }
  createMediaElementSource() { return new Node(); }
  async resume() { if (!this.resumeFails) this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.closed = true; }
  decodeAudioData(_d: ArrayBuffer, ok?: any) { this.decodes++; const b = { duration: 1 }; ok?.(b); return Promise.resolve(b); }
}
class El { src = ''; paused = true; loop = false; currentTime = 0; plays = 0; loaded = 0; blocked = false;
  addEventListener() {} removeAttribute() { this.src = ''; } load() { this.loaded++; } pause() { this.paused = true; }
  play() { this.plays++; if (this.blocked) return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); this.paused = false; return Promise.resolve(); } }

const manifest: AudioManifest = {
  m_village: { url: '/a/village.ogg', category: 'music' }, m_forest: { url: '/a/forest.ogg', category: 'music' },
  m_combat: { url: '/a/combat.ogg', category: 'music' }, m_boss: { url: '/a/boss.ogg', category: 'music' },
  m_a: { url: '/a/a.ogg', category: 'music' }, m_b: { url: '/a/b.ogg', category: 'music' }, m_c: { url: '/a/c.ogg', category: 'music' },
  ui_click: { url: '/a/click.ogg', category: 'ui', cooldownMs: 50 }, hit: { url: '/a/hit.ogg', category: 'sfx', maxVoices: 2 },
  wind: { url: '/a/wind.ogg', category: 'env', volume: 0.5 },
};
function setup(extra: Partial<ConstructorParameters<typeof AudioManager>[0]> = {}) {
  const ctx = new Ctx(); const els: El[] = []; const fetched: string[] = []; const bus = new SimpleEmitter();
  const am = new AudioManager({
    manifest, bus, ctx: undefined, regionMusic: { ashen_village: 'm_village', whispering_forest: 'm_forest' }, combatMusicId: 'm_combat', combatExitDelayMs: 20, maxVoices: 3, maxCachedMusicTracks: 3,
    createContext: () => ctx as any, createMediaElement: () => { const e = new El(); els.push(e); return e as any; },
    fetchFn: (async (u: string) => { fetched.push(u); if (u.includes('missing')) return { ok: false, status: 404 }; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; }) as any,
    ...extra,
  } as any);
  const errors: any[] = []; bus.on('audio:error', (p: unknown) => errors.push(p));
  return { ctx, els, fetched, bus, am, errors };
}

test('nothing plays before unlock; music requested early starts at unlock; failed resume keeps locked', async () => {
  const { ctx, els, am, bus } = setup();
  let unlockedEv = 0; bus.on('audio:unlocked', () => unlockedEv++);
  am.setRegion('ashen_village');
  assert.equal(els.length, 0);
  assert.equal(am.playSfx('hit'), false);
  ctx.resumeFails = true;
  assert.equal(await am.unlock(), false);
  assert.equal(am.isUnlocked(), false); assert.equal(els.length, 0);
  ctx.resumeFails = false;
  assert.equal(await am.unlock(), true);
  assert.equal(unlockedEv, 1); assert.equal(els.length, 1); assert.equal(els[0].paused, false);
  assert.equal(am.getCurrentMusicId(), 'm_village');
  assert.equal(await am.unlock(), true); assert.equal(unlockedEv, 1);
});

test('music priority boss > combat > region, combat exit delay, crossfade stops old element after fade', async () => {
  const { els, am } = setup();
  await am.unlock(); am.setRegion('ashen_village');
  assert.equal(am.getCurrentMusicId(), 'm_village');
  am.setCombatActive(true); assert.equal(am.getCurrentMusicId(), 'm_combat');
  am.setBossMusic('m_boss'); assert.equal(am.getCurrentMusicId(), 'm_boss');
  am.setBossMusic(null); assert.equal(am.getCurrentMusicId(), 'm_combat');
  am.setCombatActive(false); assert.equal(am.getCurrentMusicId(), 'm_combat'); // delay not elapsed
  await sleep(40); assert.equal(am.getCurrentMusicId(), 'm_village');
  am.setCombatActive(true); am.setCombatActive(false); am.setCombatActive(true); await sleep(40); // re-entering cancels the exit timer
  assert.equal(am.getCurrentMusicId(), 'm_combat');
  await sleep(1100);
  const playing = els.filter((e) => !e.paused).length;
  assert.equal(playing, 1);
  am.dispose();
});

test('same music request does not restart; region without mapping keeps silence; stopMusic', async () => {
  const { els, am } = setup();
  await am.unlock(); am.setRegion('ashen_village'); am.setRegion('ashen_village');
  assert.equal(els[0].plays, 1);
  am.setRegion('crownfall'); assert.equal(am.getCurrentMusicId(), null);
  am.setRegion('ashen_village'); assert.equal(els.length, 1); // track element reused
  am.stopMusic(10); assert.equal(am.getCurrentMusicId(), null);
  await sleep(100); assert.equal(els[0].paused, true);
});

test('music track cache is bounded and evicted elements are fully released', async () => {
  const { els, am } = setup();
  await am.unlock();
  for (const id of ['m_a', 'm_b', 'm_c', 'm_boss', 'm_forest']) { am.playMusic(id, 10); await sleep(2); }
  assert.ok(am.cachedTrackCount() <= 3);
  assert.ok(els.filter((e) => e.src === '' && e.loaded > 0).length >= 2);
  am.dispose(); assert.equal(am.cachedTrackCount(), 0);
});

test('autoplay block (NotAllowedError) emits audio:blocked and re-locks', async () => {
  const { els, am, bus } = setup({ createMediaElement: undefined } as any);
  void els;
  const blocked: any[] = []; bus.on('audio:blocked', (p: unknown) => blocked.push(p));
  const e = new El(); e.blocked = true;
  const am2 = new AudioManager({ manifest, bus, createContext: () => new Ctx() as any, createMediaElement: () => e as any, regionMusic: { ashen_village: 'm_village' } });
  await am2.unlock(); am2.setRegion('ashen_village'); await sleep(5);
  assert.equal(blocked.length, 1); assert.equal(am2.isUnlocked(), false);
  void am;
});

test('sfx: preload dedupes fetch/decode, unloaded sfx dropped (and loads), cooldown, per-id and global voice limits, cleanup on end', async () => {
  const { ctx, fetched, am } = setup();
  await am.unlock();
  assert.equal(am.playSfx('hit'), false); await sleep(5); // triggers load
  await Promise.all([am.preload(['hit', 'hit', 'ui_click']), am.preload(['hit'])]);
  assert.equal(fetched.filter((u) => u.includes('hit')).length, 1);
  assert.equal(ctx.decodes, 2);
  assert.equal(am.playSfx('hit', { volume: 0.5, rate: 1.2 }), true);
  assert.equal(am.playSfx('hit'), true);
  assert.equal(am.playSfx('hit'), false); // maxVoices 2
  assert.equal(am.playSfx('ui_click'), true);
  assert.equal(am.playSfx('ui_click'), false); // cooldown
  assert.equal(am.activeVoiceCount(), 3);
  am.stopSfx('hit'); assert.equal(am.activeVoiceCount(), 1);
  am.stopSfx(); assert.equal(am.activeVoiceCount(), 0);
  assert.equal(am.playSfx('nope'), false);
  assert.equal(am.playSfx('m_village'), false);
  assert.ok(am.counters.errors >= 2);
});

test('missing asset never throws, emits audio:error, is not re-fetched immediately', async () => {
  const { fetched, am, errors } = setup();
  (am as any).manifest.gone = { url: '/missing.ogg', category: 'sfx' };
  await am.unlock();
  await am.preload(['gone']); await am.preload(['gone']);
  assert.equal(fetched.filter((u) => u.includes('missing')).length, 1);
  assert.ok(errors.some((e) => e.id === 'gone'));
});

test('volumes: clamp, mute, applied to buses', async () => {
  const { ctx, am } = setup();
  await am.unlock();
  am.setVolumes({ music: 2, sfx: -1, muted: true });
  assert.deepEqual(am.getVolumes(), { music: 1, sfx: 0, muted: true });
  const [master, music, sfx] = ctx.gains;
  assert.equal(master.gain.value, 0); assert.equal(music.gain.value, 1); assert.equal(sfx.gain.value, 0);
  am.setVolumes({ muted: false, sfx: 0.4 });
  assert.equal(master.gain.value, 1); assert.equal(sfx.gain.value, 0.4);
});

test('ambience: diff-based start/stop, superseded loads ignored, dispose closes context', async () => {
  const { ctx, am } = setup();
  await am.unlock();
  await am.setAmbience(['wind'], 5);
  assert.equal(ctx.sources.filter((s) => s.loop && s.started).length, 1);
  await am.setAmbience(['wind'], 5); assert.equal(ctx.sources.filter((s) => s.loop).length, 1); // unchanged -> no restart
  await am.setAmbience([], 5); await sleep(80);
  assert.equal(ctx.sources.filter((s) => s.loop && s.connected).length, 0);
  am.dispose(); assert.equal(ctx.closed, true);
});

test('bus bindings route to manager; unsubscribe removes them', async () => {
  const { am, bus, els } = setup();
  await am.unlock();
  const off = am.bindBus({ playSfx: 'audio:play-sfx', setRegion: 'audio:set-region', combat: 'audio:combat', boss: 'audio:boss' });
  bus.emit('audio:set-region', { regionId: 'whispering_forest' });
  assert.equal(am.getCurrentMusicId(), 'm_forest');
  bus.emit('audio:boss', 'm_boss'); assert.equal(am.getCurrentMusicId(), 'm_boss');
  bus.emit('audio:boss', { id: null }); assert.equal(am.getCurrentMusicId(), 'm_forest');
  off(); bus.emit('audio:set-region', { regionId: 'ashen_village' });
  assert.equal(am.getCurrentMusicId(), 'm_forest'); void els;
});
