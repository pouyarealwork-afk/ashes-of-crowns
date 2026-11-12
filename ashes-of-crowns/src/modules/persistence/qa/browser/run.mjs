import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, 'www');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'audio/wav' }); r.end(fs.readFileSync(f)); });
await new Promise((r) => srv.listen(0, r)); const url = `http://localhost:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
const results = []; const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const ctx = await browser.newContext(); const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(url);
const initJs = `
window.makeModule = async (opts={}) => {
  const P = window.Persistence;
  const m = new P.PersistenceModule({ gameVersion:'qa', autosave:{enabled:false}, dbName:'aoc-qa', ...opts,
    audio:{ manifest:{
      m_village:{url:'/audio/village.wav',category:'music'}, m_combat:{url:'/audio/combat.wav',category:'music'}, m_boss:{url:'/audio/boss.wav',category:'music'},
      hit:{url:'/audio/hit.wav',category:'sfx',maxVoices:2}, click:{url:'/audio/click.wav',category:'ui'}, wind:{url:'/audio/wind.wav',category:'env'}, gone:{url:'/audio/missing.wav',category:'sfx'} },
      regionMusic:{ashen_village:'m_village'}, combatMusicId:'m_combat', combatExitDelayMs:50 } });
  await m.init(); window.m = m; return m.getDiagnostics().backend;
};
window.state = (g=1) => { const s = window.Persistence.createDefaultGameState('hard','whispering_forest'); delete s.checkpoints; s.inventory.gold=g; s.player.level=9; s.player.stats={hp:5,maxHp:9}; return s; };
`;
await page.evaluate(initJs);
check('real IndexedDB backend selected', (await page.evaluate(() => makeModule())) === 'indexeddb');
await page.evaluate(() => { m.registerStateProvider(() => state(111)); m.checkpoints.register({id:'s1',regionId:'whispering_forest',x:5,y:6}); m.checkpoints.activate('s1'); return m.saveToSlot('slot1','one'); });
await page.evaluate(() => { m.registerStateProvider(() => state(222)); return m.saveToSlot('slot2'); });
const list = await page.evaluate(async () => (await m.saves.listSlots()).map((s) => s.slotId + ':' + s.state + ':' + (s.meta?.level ?? '')));
check('multi-slot list in real IDB', JSON.stringify(list) === JSON.stringify(['slot1:ok:9','slot2:ok:9','slot3:empty:','auto:empty:']), JSON.stringify(list));
await page.evaluate(() => { m.settings.update({ audio:{music:0.25,muted:true}, language:'es', controls:{buttonScale:1.3} }); return m.flush(); });
await page.evaluate(() => m.dispose());
// ---- page reload: persistence across sessions
await page.reload(); await page.evaluate(initJs);
check('IDB reopened after reload', (await page.evaluate(() => makeModule())) === 'indexeddb');
const s = await page.evaluate(() => m.settings.get());
check('settings persisted across reload', s.audio.music === 0.25 && s.audio.muted && s.language === 'es' && s.controls.buttonScale === 1.3);
check('settings applied to audio at init', await page.evaluate(() => { const v = m.audio.getVolumes(); return v.music === 0.25 && v.muted; }));
const ld = await page.evaluate(async () => { const r = await m.loadSlot('slot1'); return { ok: r.ok, gold: r.record?.state.inventory.gold, stone: m.checkpoints.getRespawnPoint().stoneId }; });
check('save survives reload; checkpoint restored', ld.ok && ld.gold === 111 && ld.stone === 's1', JSON.stringify(ld));
const cont = await page.evaluate(async () => { const r = await m.continueLast(); return r.ok && r.record.meta.slotId; });
check('continueLast picks most recent slot', cont === 'slot2', String(cont));
// ---- export / import via real file download + upload
await page.evaluate(() => { window.__exp = null; });
const exp = await page.evaluate(async () => { const e = await m.saves.exportSlot('slot1'); window.__exp = e.json; return { len: e.json.length, name: e.filename }; });
const dlP = page.waitForEvent('download');
await page.evaluate(() => window.Persistence.downloadTextFile('x.json', window.__exp));
const dl = await dlP; const p = await dl.path(); const body = fs.readFileSync(p, 'utf8');
check('export downloads as real file with identical JSON', body.length === exp.len && JSON.parse(body).format === 'ashes-of-crowns-save');
const fcP = page.waitForEvent('filechooser');
const pickP = page.evaluate(() => window.Persistence.pickTextFile());
await page.click('body', { position: { x: 1, y: 1 } }).catch(() => {});
let picked = null; try { const fc = await fcP; fs.writeFileSync('/tmp/imp.json', body); await fc.setFiles('/tmp/imp.json'); picked = await pickP; } catch (e) { picked = 'ERR ' + e.message; }
check('file picker import reads chosen file', picked === body, picked && picked.slice(0, 30));
const imp = await page.evaluate(async (j) => { await m.saves.importSlot(j, 'slot3'); const r = await m.saves.load('slot3'); return r.ok && r.record.state.inventory.gold; }, body);
check('import into slot3 works in real IDB', imp === 111, String(imp));
const bad = await page.evaluate(async () => { try { await m.saves.importSlot('{"format":"x"}', 'slot3', { overwrite: true }); return 'accepted'; } catch (e) { return e.code; } });
check('invalid import rejected', bad === 'invalid', bad);
// ---- corruption directly in IndexedDB
const corrupt = await page.evaluate(async () => {
  await (async () => { m.registerStateProvider(() => state(1)); await m.saveToSlot('slot1'); m.registerStateProvider(() => state(2)); await m.saveToSlot('slot1'); })();
  await new Promise((res, rej) => { const o = indexedDB.open('aoc-qa'); o.onsuccess = () => { const db = o.result; const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put({ junk: 1 }, 'slot1'); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); }; o.onerror = () => rej(o.error); });
  const r = await m.saves.load('slot1'); return { ok: r.ok, status: r.status, gold: r.record?.state.inventory.gold };
});
check('corrupt primary in real IDB recovers from backup', corrupt.ok && corrupt.status === 'restored-backup' && corrupt.gold === 1, JSON.stringify(corrupt));
const unwritable = await page.evaluate(async () => { await new Promise((res) => { const o = indexedDB.open('aoc-qa'); o.onsuccess = () => { const db = o.result; const tx = db.transaction(['saves','backups'], 'readwrite'); tx.objectStore('saves').put('###', 'slot2'); tx.objectStore('backups').delete('slot2'); tx.oncomplete = () => { db.close(); res(); }; }; }); const r = await m.saves.load('slot2'); const l = await m.saves.listSlots(); return { ok: r.ok, code: r.code, state: l[1].state }; });
check('corrupt slot with no backup reports error, listSlots=corrupt, no throw', !unwritable.ok && unwritable.state === 'corrupt', JSON.stringify(unwritable));
// ---- atomic batch & concurrency in real IDB
const conc = await page.evaluate(async () => { m.registerStateProvider(() => state(0)); await Promise.all([1,2,3,4,5,6].map((n) => m.saves.saveState('slot3', { ...state(n) }))); const r = await m.saves.load('slot3'); return r.record.state.inventory.gold; });
check('concurrent saves serialised in real IDB (last wins)', conc === 6, String(conc));
// ---- audio with real AudioContext
const pre = await page.evaluate(() => { m.audio.setRegion('ashen_village'); return { unlocked: m.audio.isUnlocked(), cur: m.audio.getCurrentMusicId() }; });
check('audio locked before gesture (autoplay policy)', !pre.unlocked);
await page.evaluate(() => { m.audio.attachUnlockListeners(document); window.__ul = 0; m.bus.on('audio:unlocked', () => window.__ul++); });
await page.mouse.click(100, 100);
await page.waitForFunction(() => window.__ul === 1, null, { timeout: 5000 }).catch(() => {});
const un = await page.evaluate(() => ({ u: m.audio.isUnlocked(), cur: m.audio.getCurrentMusicId() }));
check('real click unlocks AudioContext; pending region music selected', un.u && un.cur === 'm_village', JSON.stringify(un));
await page.waitForTimeout(600);
const playing = await page.evaluate(() => [...document.querySelectorAll('audio')].length);
const diag = await page.evaluate(() => m.getDiagnostics().audio);
check('music element created and cached', diag.cachedMusicTracks === 1, JSON.stringify(diag));
await page.evaluate(() => m.audio.preload(['hit','click','wind','gone']));
const sfx = await page.evaluate(() => { const a = m.audio.playSfx('hit'), b = m.audio.playSfx('hit'), c = m.audio.playSfx('hit'); return [a,b,c, m.audio.activeVoiceCount(), m.audio.loadedBufferCount(), m.audio.counters.errors]; });
check('real decode + SFX voice limit (2 of 3 play, 3 buffers loaded, 1 error for missing)', sfx[0] && sfx[1] && !sfx[2] && sfx[4] === 3 && sfx[5] >= 1, JSON.stringify(sfx));
await page.waitForTimeout(1300);
check('voices cleaned after sounds end', (await page.evaluate(() => m.audio.activeVoiceCount())) === 0);
await page.evaluate(() => m.audio.setAmbience(['wind'], 100));
await page.evaluate(() => { m.audio.setCombatActive(true); m.audio.setBossMusic('m_boss'); });
check('boss music overrides combat/region', (await page.evaluate(() => m.audio.getCurrentMusicId())) === 'm_boss');
await page.evaluate(() => { m.audio.setBossMusic(null); m.audio.setCombatActive(false); });
await page.waitForTimeout(300);
check('returns to region music after combat', (await page.evaluate(() => m.audio.getCurrentMusicId())) === 'm_village');
const fetches = await page.evaluate(() => m.audio.counters.fetches);
await page.evaluate(() => m.audio.preload(['hit','click','wind']));
check('no refetch of cached SFX', (await page.evaluate(() => m.audio.counters.fetches)) === fetches);
const mem0 = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
await page.evaluate(async () => { for (let i = 0; i < 300; i++) { m.audio.setCombatActive(true); m.audio.setCombatActive(false); } m.audio.setCombatActive(false); });
await page.waitForTimeout(200);
const after = await page.evaluate(() => ({ tracks: m.audio.cachedTrackCount(), els: 0 }));
check('300 combat toggles do not create extra tracks', after.tracks <= 3, JSON.stringify(after));
const rep = await page.evaluate(async () => { const t0 = performance.now(); for (let i = 0; i < 20; i++) await m.saves.saveState('slot1', state(i)); return (performance.now() - t0) / 20; });
console.log('INFO avg save latency (20 saves, headless chromium, real IDB): ' + rep.toFixed(1) + ' ms');
const st = await page.evaluate(() => m.getDiagnostics().storage); console.log('INFO storage op counters', JSON.stringify(st));
void playing; void mem0;
check('no uncaught page errors / console errors', errs.filter((e) => !/missing\.wav|404/.test(e)).length === 0, errs.join(' | ').slice(0, 300));
await browser.close(); srv.close();
const failed = results.filter((r) => !r.ok).length; console.log(`\n${results.length - failed}/${results.length} browser checks passed`); process.exit(failed ? 1 : 0);
