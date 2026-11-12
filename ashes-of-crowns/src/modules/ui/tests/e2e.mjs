// Browser tests for the UI module (real Chromium, touch emulation, EN + FA, several Android-like viewports).
// usage: node tests/e2e.mjs        (run `npm run build:test` equivalent first: see README "Testing")
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));

const VP = {
  'phone-360x740': { width: 360, height: 740, dpr: 2 },
  'phone-412x915': { width: 412, height: 915, dpr: 2.6 },
  'small-320x568': { width: 320, height: 568, dpr: 2 },
  'landscape-740x360': { width: 740, height: 360, dpr: 2 },
  'landscape-915x412': { width: 915, height: 412, dpr: 2.6 },
  'tablet-800x1280': { width: 800, height: 1280, dpr: 1.5 },
};

const want = (n) => !process.env.ONLY || process.env.ONLY.split(',').includes(String(n));
const results = [];
let current = '';
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
async function t(name, fn) {
  current = name;
  try { await fn(); results.push({ name, pass: true }); console.log('  ✓', name); }
  catch (e) { results.push({ name, pass: false, err: String(e.message ?? e) }); console.log('  ✗', name, '\n      ', String(e.message ?? e).split('\n')[0]); }
}

const { srv, url } = await serve(path.join(here, '../dev'));
const browser = await chromium.launch();

async function open(vpName, query = '', lang = 'en') {
  const { width, height, dpr } = VP[vpName] ?? VP['phone-360x740'];
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, locale: lang === 'fa' ? 'fa-IR' : 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`${url}/?lang=${lang}${query ? '&' + query : ''}`);
  await page.waitForSelector('.menu');
  return { page, ctx, errors };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const tap = (page, sel, nth = 0) => page.locator(sel).nth(nth).tap();
const settle = (page, ms = 330) => page.waitForTimeout(ms);
const logOf = (page, type) => ev(page, (ty) => window.__aoc.log.filter((l) => l.type === ty).map((l) => l.payload), type);
const calls = (page) => ev(page, () => window.__aoc.state.calls);
async function startGame(page) {
  await tap(page, '.menu__buttons .btn', 1);          // New Game
  await page.waitForSelector('.newgame__go .btn');
  await tap(page, '.slot-card__main', 2);             // empty slot 3
  await tap(page, '.newgame__go .btn');
  await page.waitForSelector('.hud:not([hidden])');
  await settle(page);
}
const cdpSessions = new WeakMap();
async function cdpTouch(page, type, pts) {
  let s = cdpSessions.get(page);                                   // touch state lives in the session: keep one per page
  if (!s) { s = await page.context().newCDPSession(page); cdpSessions.set(page, s); }
  await s.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
}
const center = async (page, sel) => ev(page, (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

/* ═══════════════════════════ 1. Menus & flow ═══════════════════════════ */
console.log('\n[1] Main menu, new game, continue, load, save');
if (want(1)) {
  const { page, ctx, errors } = await open('phone-360x740');
  await t('main menu renders title and 4 buttons; Continue shows latest save', async () => {
    eq(await page.locator('.menu__buttons .btn').count(), 4, 'button count');
    ok((await page.locator('.menu__buttons .btn').first().innerText()).includes('Whispering Forest'), 'continue hint');
    ok(!(await page.locator('.menu__buttons .btn').first().isDisabled()), 'continue enabled');
  });
  await t('Continue emits game:continue for latest slot (1) and enters gameplay', async () => {
    await tap(page, '.menu__buttons .btn', 0);
    await page.waitForSelector('.hud:not([hidden])');
    eq(await logOf(page, 'game:continue'), [{ slot: 1 }], 'event');
    ok(await ev(page, () => window.__aoc.ui.isInGame), 'inGame');
    eq(await page.locator('.screen:not(.is-leaving)').count(), 0, 'no screens left');
    ok(await page.locator('.touch:not([hidden])').count() === 1, 'touch controls visible');
  });
  await t('Escape/back opens pause, emits game:pause; Resume emits game:resume', async () => {
    await page.keyboard.press('Escape'); await settle(page);
    ok(await page.locator('.pause').count() === 1, 'pause open');
    ok(await page.locator('.touch[hidden]').count() === 1, 'touch hidden while paused');
    eq((await logOf(page, 'game:pause')).length, 1, 'pause events');
    await tap(page, '.pause__buttons .btn', 0); await settle(page, 400);
    eq((await logOf(page, 'game:resume')).length, 1, 'resume events');
    ok(await page.locator('.touch:not([hidden])').count() === 1, 'touch visible again');
  });
  await t('Pause → Save: overwrite confirm + backend save + toast + game:saved', async () => {
    await ev(page, () => window.__aoc.ui.openPause()); await settle(page);
    await tap(page, '.pause__buttons .btn', 2); await settle(page);
    await tap(page, '.slot-card__main', 0);                       // slot 1 is occupied → confirm
    await page.waitForSelector('.modal'); await tap(page, '.modal [data-focus=ok]'); await settle(page, 450);
    ok((await calls(page)).includes('save:1'), 'backend.save(1) called');
    eq((await logOf(page, 'game:saved')), [{ slot: 1 }], 'game:saved');
    ok(await page.locator('.toast--success').count() >= 1, 'success toast');
  });
  await t('Save cancel on overwrite does NOT call backend', async () => {
    const before = (await calls(page)).filter((c) => c.startsWith('save:')).length;
    await tap(page, '.slot-card__main', 1); await page.waitForSelector('.modal'); await tap(page, '.modal [data-focus=cancel]'); await settle(page, 300);
    eq((await calls(page)).filter((c) => c.startsWith('save:')).length, before, 'save calls');
  });
  await t('Delete slot: confirm → backend.deleteSlot → slot becomes empty', async () => {
    await tap(page, '.slot-card__actions .btn', 0);               // delete slot 1
    await page.waitForSelector('.modal'); await tap(page, '.modal [data-focus=ok]'); await settle(page, 450);
    ok((await calls(page)).includes('delete:1'), 'deleteSlot called');
    ok((await page.locator('.slot-card').first().getAttribute('class')).includes('is-empty'), 'slot empty');
  });
  await t('Quit to menu: confirm → game:quitToMenu → main menu, HUD hidden', async () => {
    await ev(page, () => { window.__aoc.ui.closeAllScreens(); window.__aoc.ui.openPause(); }); await settle(page);
    await tap(page, '.pause__buttons .btn', 5); await page.waitForSelector('.modal'); await tap(page, '.modal [data-focus=ok]'); await settle(page, 450);
    eq((await logOf(page, 'game:quitToMenu')).length, 1, 'event');
    ok(await page.locator('.menu').count() === 1, 'menu back');
    ok(!(await ev(page, () => window.__aoc.ui.isInGame)), 'not in game');
  });
  await t('New Game on occupied slot asks for confirmation; cancel emits nothing', async () => {
    await tap(page, '.menu__buttons .btn', 1); await page.waitForSelector('.newgame');
    await tap(page, '.slot-card__main', 1); await tap(page, '.newgame__go .btn');
    await page.waitForSelector('.modal'); await tap(page, '.modal [data-focus=cancel]'); await settle(page, 300);
    eq((await logOf(page, 'game:new')).length, 0, 'game:new count');
  });
  await t('New Game on empty slot emits game:new {slot:3}', async () => {
    await tap(page, '.slot-card__main', 2); await tap(page, '.newgame__go .btn'); await page.waitForSelector('.hud:not([hidden])');
    eq(await logOf(page, 'game:new'), [{ slot: 3 }], 'event');
  });
  eq(errors, [], 'no console/page errors in section 1');
  await ctx.close();
}

/* ═══════════════════════════ 2. Languages ═══════════════════════════ */
console.log('\n[2] Language switching (EN ⇄ FA), RTL, state preservation');
if (want(2)) {
  const { page, ctx, errors } = await open('phone-360x740');
  await t('Settings screen: tapping فارسی switches to RTL + Persian, persists via settings:changed', async () => {
    await tap(page, '.menu__buttons .btn', 3); await page.waitForSelector('.settings');
    await page.locator('.segmented__opt', { hasText: 'فارسی' }).tap(); await settle(page);
    eq(await ev(page, () => [document.querySelector('.aoc-ui').dir, document.querySelector('.aoc-ui').lang, document.documentElement.lang]), ['rtl', 'fa', 'fa'], 'dir/lang');
    ok((await page.locator('.frame__title').innerText()).includes('تنظیمات'), 'persian heading');
    const ch = await logOf(page, 'settings:changed');
    ok(ch.some((c) => c.key === 'lang' && c.settings.lang === 'fa'), 'settings:changed(lang)');
  });
  await t('Settings scroll position survives language switch', async () => {
    await ev(page, () => { document.querySelector('[data-scroll=settings]').scrollTop = 120; });
    await ev(page, () => window.__aoc.ui.setLanguage('en')); await settle(page);   // via API: tapping would auto-scroll the control into view
    ok(await ev(page, () => document.querySelector('[data-scroll=settings]').scrollTop) > 100, 'scrollTop kept');
    await ev(page, () => window.__aoc.ui.setLanguage('fa')); await settle(page);
  });
  await t('Digits are Persian (۰-۹) in FA, Latin in EN; toggle works', async () => {
    await tap(page, '.frame__head .btn'); await settle(page);
    ok(/[۰-۹]/.test(await page.locator('.menu__buttons .btn').first().innerText()), 'persian digits in continue hint');
    await ev(page, () => window.__aoc.ui.updateSettings({ persianDigits: false })); await settle(page);
    ok(!/[۰-۹]/.test(await page.locator('.menu__buttons .btn').first().innerText()), 'latin digits when disabled');
    await ev(page, () => window.__aoc.ui.updateSettings({ persianDigits: true })); await settle(page);
  });
  await startGame(page);
  await t('Switching language mid-game keeps HUD values, objectives and boss', async () => {
    await ev(page, () => window.__aoc.ui.updateHud({ boss: { name: { en: 'Darken', fa: 'دارکن' }, health: 500, maxHealth: 1000 }, objectives: [{ title: { en: 'Find truth', fa: 'حقیقت را بیاب' } }] }));
    await ev(page, () => window.__aoc.ui.setLanguage('en')); await settle(page);
    const txt = await page.locator('.hud').innerText();
    ok(/Lv 7/.test(txt) && txt.includes('Darken') && txt.includes('Find truth') && txt.includes('250'), 'english hud: ' + txt.replace(/\n/g, '|'));
    ok((await page.locator('.hud__vitals .bar--health').getAttribute('aria-valuenow')) === '72', 'hp preserved');
  });
  await t('Inventory: selected item, filter and scroll survive a live language switch', async () => {
    await ev(page, () => window.__aoc.ui.openMenu('inventory')); await settle(page);
    await tap(page, '.filter', 2);                                            // Armor filter
    await tap(page, '.grid-slots .slot.has-item', 0); await settle(page, 100);
    const before = await page.locator('.split__detail .detail-head__name').innerText();
    await ev(page, () => window.__aoc.ui.setLanguage('fa')); await settle(page);
    const after = await page.locator('.split__detail .detail-head__name').innerText();
    ok(before !== after, 'name localised'); ok(/[؀-ۿ]/.test(after), 'persian name');
    eq(await page.locator('.filter.is-on').count(), 1, 'filter still active');
    eq(await page.locator('.grid-slots .slot.is-selected').count(), 1, 'selection kept');
  });
  await t('Dialogue line index is kept across a language switch', async () => {
    await ev(page, () => { window.__aoc.ui.closeAllScreens(); window.__aoc.ui.startDialogue(window.__aoc.tree); }); await settle(page, 1600);
    await tap(page, '.dlg__box'); await settle(page, 200);
    await page.locator('.dlg').tap({ position: { x: 100, y: 120 } }); await settle(page, 1800);   // advance to node b
    ok(await page.locator('.dlg__choices .btn').count() === 3, 'on choice node');
    await ev(page, () => window.__aoc.ui.setLanguage('en')); await settle(page, 200);
    ok((await page.locator('.dlg__text').innerText()).includes('what did you come here to do'), 'same node, now English');
    eq(await page.locator('.dlg__choices .btn').count(), 3, 'choices still present');
  });
  await t('Persian typography rules: no letter-spacing / uppercase anywhere in FA', async () => {
    await ev(page, () => window.__aoc.ui.setLanguage('fa')); await settle(page, 200);
    const bad = await ev(page, () => [...document.querySelectorAll('.aoc-ui *')].filter((e) => { const s = getComputedStyle(e); return (s.letterSpacing !== 'normal' && s.letterSpacing !== '0px') || s.textTransform === 'uppercase'; }).length);
    eq(bad, 0, 'elements with letter-spacing/uppercase');
  });
  eq(errors, [], 'no console/page errors in section 2');
  await ctx.close();
}

/* ═══════════════════════════ 3. In-game screens ═══════════════════════════ */
console.log('\n[3] Inventory / equipment / skills / quests / map / crafting / shop / dialogue / endings');
if (want(3)) {
  const { page, ctx, errors } = await open('phone-360x740');
  await startGame(page);
  const openTab = async (tab) => { await ev(page, (x) => window.__aoc.ui.openMenu(x), tab); await settle(page); };
  await t('Inventory: equip calls backend.equip(id, slot) and refreshes', async () => {
    await openTab('inventory');
    await page.locator('.grid-slots .slot', { has: page.locator('svg') }).nth(1).tap();   // ironHelm
    await settle(page, 100);
    ok((await page.locator('.split__detail').innerText()).includes('Iron Helm'), 'selected helm');
    await page.locator('.detail__actions .btn', { hasText: 'Equip' }).tap(); await settle(page, 400);
    ok((await calls(page)).includes('equip:ironHelm:head'), 'equip call');
    ok(await page.locator('.toast--success').count() >= 1, 'toast');
  });
  await t('Inventory: level-gated item has Equip disabled and shows requirement', async () => {
    await ev(page, () => { window.__aoc.state.level = 5; }); await ev(page, () => window.__aoc.ui.refresh()); await settle(page, 300);
    const names = await page.locator('.grid-slots .slot.has-item').count();
    for (let i = 0; i < names; i++) { await page.locator('.grid-slots .slot.has-item').nth(i).tap(); await settle(page, 60); if ((await page.locator('.split__detail').innerText()).includes('Emberbrand')) break; }
    ok(await page.locator('.detail__actions .btn', { hasText: 'Equip' }).isDisabled(), 'equip disabled');
    ok((await page.locator('.split__detail').innerText()).includes('Requires level 8'), 'req text');
    await ev(page, () => { window.__aoc.state.level = 7; });
  });
  await t('Inventory: Use consumable; Drop stack asks quantity and passes it to backend', async () => {
    await page.locator('.filter').nth(3).tap(); await settle(page, 100);                        // potions
    await page.locator('.grid-slots .slot.has-item').first().tap(); await settle(page, 100);
    await page.locator('.detail__actions .btn', { hasText: 'Use' }).tap(); await settle(page, 300);
    ok((await calls(page)).includes('use:healthPotion'), 'use call');
    await page.locator('.detail__actions .btn', { hasText: 'Drop' }).tap(); await page.waitForSelector('.modal .qty');
    await page.locator('.modal .qty .btn').nth(1).tap(); await page.locator('.modal .qty .btn').nth(1).tap();   // 3
    await tap(page, '.modal [data-focus=ok]'); await settle(page, 400);
    ok((await calls(page)).includes('drop:healthPotion:3'), 'drop 3: ' + (await calls(page)).join());
  });
  await t('Inventory: quest items cannot be dropped (no Drop button)', async () => {
    await page.locator('.filter').nth(5).tap(); await settle(page, 100);
    await page.locator('.grid-slots .slot.has-item').first().tap(); await settle(page, 100);
    eq(await page.locator('.detail__actions .btn', { hasText: 'Drop' }).count(), 0, 'drop buttons');
  });
  await t('Equipment: slot panel lists candidates, unequip calls backend', async () => {
    await openTab('equipment');
    await page.locator('.doll .slot').first().tap(); await settle(page, 100);               // head slot (ironHelm equipped)
    await page.locator('.detail__actions .btn', { hasText: 'Unequip' }).tap(); await settle(page, 400);
    ok((await calls(page)).includes('unequip:head'), 'unequip');
  });
  await t('Character: shows level, 3 vitals, 8 attributes, extras', async () => {
    await openTab('character');
    const txt = await page.locator('.char').innerText();
    ok(/Aren/.test(txt) && /Lv 7/.test(txt) && /Enemies slain/.test(txt), 'identity/extras');
    eq(await page.locator('.vital').count(), 3, 'vitals'); eq(await page.locator('.attr').count(), 8, 'attrs');
  });
  await t('Skills: connectors drawn; learn spends points via backend; hotbar assign works', async () => {
    await openTab('skills');
    ok(await page.locator('.tree__links path').count() >= 4, 'connector paths: ' + await page.locator('.tree__links path').count());
    await page.locator('.node--available').first().tap(); await settle(page, 100);
    await page.locator('.detail__actions .btn', { hasText: /Learn/ }).tap(); await settle(page, 400);
    ok((await calls(page)).some((c) => c.startsWith('unlock:')), 'unlock call');
    ok((await page.locator('.chip--points').innerText()).includes('2'), 'points decreased: ' + await page.locator('.chip--points').innerText());
    await page.locator('.node[data-node=slash]').tap(); await settle(page, 100);
    await page.locator('.hotbar-pick .btn').nth(1).tap(); await settle(page, 300);
    ok((await calls(page)).includes('hotbar:1:slash'), 'hotbar call');
  });
  await t('Skills: locked skill shows reason and disabled button; multiple trees switchable', async () => {
    await page.locator('.node[data-node=wrath]').tap(); await settle(page, 100);
    ok(await page.locator('.detail__actions .btn').first().isDisabled(), 'disabled');
    await page.locator('.filters .filter').nth(1).tap(); await settle(page, 150);
    ok(await page.locator('.node[data-node=step]').count() === 1, 'second tree');
  });
  await t('Quests: tabs, objectives with progress, track toggle calls backend', async () => {
    await openTab('quests');
    eq(await page.locator('.quest-row').count(), 2, 'active quests');
    await page.locator('.quest-row').first().tap(); await settle(page, 100);
    ok((await page.locator('.split__detail').innerText()).includes('2/5'), 'progress 2/5');
    await page.locator('.detail__actions .btn').tap(); await settle(page, 300);
    ok((await calls(page)).includes('track:q1:false'), 'untrack');
    await page.locator('.filter').nth(1).tap(); await settle(page, 100);
    eq(await page.locator('.quest-row').count(), 1, 'completed list');
  });
  await t('Map: pins, locked regions hidden as ???, fast travel confirm → backend', async () => {
    await openTab('map');
    eq(await page.locator('.pin').count(), 6, 'pins');
    eq(await page.locator('.pin--locked .pin__label', { hasText: '???' }).count(), 3, 'locked labels');
    await page.locator('.pin').nth(2).tap(); await settle(page, 100);
    await page.locator('.detail__actions .btn').tap(); await page.waitForSelector('.modal'); await tap(page, '.modal [data-focus=ok]'); await settle(page, 400);
    ok((await calls(page)).includes('travel:forgotten_desert'), 'travel call');
  });
  await t('Crafting: craftable highlighted; unknown recipe locked; craft calls backend; insufficient disabled', async () => {
    await ev(page, () => { window.__aoc.ui.closeAllScreens(); window.__aoc.ui.openCrafting(); }); await settle(page);
    eq(await page.locator('.pick--button.is-unknown').count(), 1, 'unknown recipe');
    await page.locator('.pick--button').nth(1).tap(); await settle(page, 100);               // helm: needs 20 ore (have 12)
    ok(await page.locator('.detail__actions .btn').isDisabled(), 'disabled when missing');
    await page.locator('.pick--button').nth(0).tap(); await settle(page, 100);
    await page.locator('.detail__actions .btn').tap(); await settle(page, 400);
    ok((await calls(page)).includes('craft:r1'), 'craft call');
  });
  await t('Shop: buy with quantity modal deducts gold; unaffordable disabled; sell tab works', async () => {
    await ev(page, () => { window.__aoc.ui.closeAllScreens(); window.__aoc.ui.openShop('s1'); }); await settle(page);
    await page.locator('.pick--button').nth(0).tap(); await settle(page, 100);
    await page.locator('.detail__actions .btn').tap(); await page.waitForSelector('.modal .qty');
    await page.locator('.modal .qty .btn').nth(1).tap();                                      // qty 2
    await tap(page, '.modal [data-focus=ok]'); await settle(page, 450);
    ok((await calls(page)).includes('buy:healthPotion:2'), 'buy call');
    eq(await ev(page, () => window.__aoc.state.gold), 200, 'gold after');
    ok((await page.locator('.frame__tools .chip--gold').innerText()).includes('200'), 'gold chip refreshed');
    await page.locator('.pick--button').nth(3).tap(); await settle(page, 100);               // cuirass 320 > 200
    ok(await page.locator('.detail__actions .btn').isDisabled(), 'unaffordable disabled');
    await page.locator('.filter').nth(1).tap(); await settle(page, 150);                     // sell
    await page.locator('.pick--button').first().tap(); await settle(page, 100);
    await page.locator('.detail__actions .btn').tap(); await settle(page, 400);
    ok((await calls(page)).some((c) => c.startsWith('sell:')), 'sell call');
  });
  await t('Dialogue: typewriter, tap completes line, choices emit dialogue:choice with meta, end resolves promise', async () => {
    await ev(page, () => { window.__aoc.ui.closeAllScreens(); window.__aoc.p = window.__aoc.ui.startDialogue(window.__aoc.tree).then((c) => { window.__aoc.picked = c; }); }); await settle(page, 80);
    const early = (await page.locator('.dlg__text').innerText()).length;
    ok(early < 40, 'typing in progress (' + early + ' chars)');
    await page.locator('.dlg').tap({ position: { x: 100, y: 100 } }); await settle(page, 100);
    ok((await page.locator('.dlg__text').innerText()).includes('old friends'), 'tap completes line');
    await page.locator('.dlg').tap({ position: { x: 100, y: 100 } }); await settle(page, 1800);
    ok(await page.locator('.dlg__choices .btn:disabled').count() === 1, 'one disabled choice');
    ok((await page.locator('.dlg__choice-wrap').nth(2).innerText()).includes('500 gold'), 'hint shown');
    await page.locator('.dlg__choices .btn').nth(0).tap(); await settle(page, 1500);
    await page.locator('.dlg').tap({ position: { x: 100, y: 100 } }); await settle(page, 300);
    await page.locator('.dlg').tap({ position: { x: 100, y: 100 } }); await settle(page, 600);
    const ch = await logOf(page, 'dialogue:choice');
    eq(ch.map((c) => [c.choiceId, c.meta]), [['mercy', { mercy: 1 }]], 'choice event');
    eq((await logOf(page, 'dialogue:end')).map((e) => e.choices), [['mercy']], 'end event');
    eq(await ev(page, () => window.__aoc.picked), ['mercy'], 'promise result');
  });
  await t('Game over: Retry emits game:retry and returns to gameplay; Load only when saves exist', async () => {
    await ev(page, () => window.__aoc.ui.showGameOver()); await settle(page);
    ok(await page.locator('.over').count() === 1, 'over screen');
    await ev(page, () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await settle(page, 100);
    ok(await page.locator('.over').count() === 1, 'Escape cannot dismiss game over');
    await page.locator('.over__buttons .btn').first().tap(); await settle(page, 400);
    eq((await logOf(page, 'game:retry')).length, 1, 'retry event'); ok(await ev(page, () => window.__aoc.ui.isInGame), 'in game');
  });
  await t('All 5 endings render 3 beats + card with localized title; finish emits ending:finished', async () => {
    for (const e of ['true_king', 'tyrant', 'wanderer', 'hidden_truth', 'fallen_hero']) {
      await ev(page, (id) => window.__aoc.ui.showEnding(id), e); await settle(page, 200);
      for (let i = 0; i < 3; i++) { await page.locator('.ending').tap({ position: { x: 30, y: 30 } }); await settle(page, 80); }
      ok(await page.locator('.ending__card').count() === 1, e + ' card');
      ok((await page.locator('.ending__title').innerText()).length > 3, e + ' title');
      eq(await page.locator('.hud:not([hidden])').count(), 0, 'HUD hidden during ending');
      if (e !== 'fallen_hero') { await ev(page, () => window.__aoc.ui.showMainMenu()); await settle(page, 100); await ev(page, () => window.__aoc.ui.enterGame()); }
    }
    await page.locator('.ending__card .btn').tap(); await settle(page, 300);
    eq((await logOf(page, 'ending:finished')).map((x) => x.ending), ['fallen_hero'], 'finish event');
    ok(await page.locator('.menu').count() === 1, 'back at menu');
  });
  eq(errors, [], 'no console/page errors in section 3');
  await ctx.close();
}

/* ═══════════════════════════ 4. Touch input ═══════════════════════════ */
console.log('\n[4] Touch controls (real multi-touch via CDP) & HUD API');
if (want(4)) {
  const { page, ctx, errors } = await open('phone-360x740');
  await startGame(page);
  await t('Virtual joystick emits input:axis and releases to (0,0)', async () => {
    const c = await center(page, '.stick');
    await cdpTouch(page, 'touchStart', [{ x: c.x, y: c.y }]);
    await cdpTouch(page, 'touchMove', [{ x: c.x + 60, y: c.y }]); await settle(page, 50);
    const mid = (await logOf(page, 'input:axis')).at(-1);
    ok(mid.x > 0.9 && Math.abs(mid.y) < 0.1, 'full right: ' + JSON.stringify(mid));
    await cdpTouch(page, 'touchEnd', []); await settle(page, 80);
    eq((await logOf(page, 'input:axis')).at(-1), { x: 0, y: 0 }, 'released');
  });
  await t('Stick + attack + jump pressed simultaneously (3 fingers), each released independently', async () => {
    const s = await center(page, '.stick'), a = await center(page, '.abtn--attack'), j = await center(page, '.abtn--jump');
    await cdpTouch(page, 'touchStart', [{ x: s.x, y: s.y, id: 1 }, { x: a.x, y: a.y, id: 2 }, { x: j.x, y: j.y, id: 3 }]);
    await cdpTouch(page, 'touchMove', [{ x: s.x - 50, y: s.y, id: 1 }, { x: a.x, y: a.y, id: 2 }, { x: j.x, y: j.y, id: 3 }]); await settle(page, 50);
    const acts = (await logOf(page, 'input:action')).map((x) => `${x.action}:${x.pressed}`);
    ok(acts.includes('attack:true') && acts.includes('jump:true'), 'both pressed: ' + acts.join());
    ok((await logOf(page, 'input:axis')).at(-1).x < -0.8, 'stick left while holding buttons');
    await cdpTouch(page, 'touchEnd', [{ x: a.x, y: a.y, id: 2 }]); await settle(page, 50);
    const acts2 = (await logOf(page, 'input:action')).map((x) => `${x.action}:${x.pressed}`);
    ok(acts2.includes('attack:false') && !acts2.includes('jump:false'), 'only attack released');
    await cdpTouch(page, 'touchEnd', []); await settle(page, 50);
  });
  await t('Opening a menu while a button is held releases every input (no stuck keys)', async () => {
    const a = await center(page, '.abtn--attack');
    await ev(page, () => { window.__aoc.log.length = 0; });
    await cdpTouch(page, 'touchStart', [{ x: a.x, y: a.y, id: 1 }]); await settle(page, 30);
    await ev(page, () => window.__aoc.ui.openPause()); await settle(page, 200);
    const acts = (await logOf(page, 'input:action')).map((x) => `${x.action}:${x.pressed}`);
    ok(acts.includes('attack:true') && acts.includes('attack:false'), 'released on pause: ' + acts.join());
    await cdpTouch(page, 'touchEnd', []); await ev(page, () => window.__aoc.ui.closeTop()); await settle(page, 300);
  });
  await t('Left-handed mode mirrors layout; control scale/opacity settings apply', async () => {
    const before = await ev(page, () => document.querySelector('.stick').getBoundingClientRect().left);
    await ev(page, () => window.__aoc.ui.updateSettings({ leftHanded: true, controlScale: 1.4, controlOpacity: 0.5 })); await settle(page, 100);
    const after = await ev(page, () => ({ l: document.querySelector('.stick').getBoundingClientRect().left, w: document.querySelector('.stick').getBoundingClientRect().width, o: getComputedStyle(document.querySelector('.touch')).opacity }));
    ok(after.l > 100 && before < 60, `stick moved right (${before} → ${after.l})`);
    ok(after.w > 150 * 0.8 * 1.3, 'scaled: ' + after.w); eq(after.o, '0.5', 'opacity');
    await ev(page, () => window.__aoc.ui.updateSettings({ leftHanded: false, controlScale: 1, controlOpacity: 0.85 }));
  });
  await t('Touch controls can be disabled in settings', async () => {
    await ev(page, () => window.__aoc.ui.updateSettings({ touchControls: false })); await settle(page, 100);
    eq(await page.locator('.touch:not([hidden])').count(), 0, 'hidden');
    ok(await page.locator('.hud__skills').isVisible(), 'HUD skill bar takes over');
    await ev(page, () => window.__aoc.ui.updateSettings({ touchControls: true }));
  });
  await t('HUD: updateHud touches DOM only for changed values; low HP flag; XP/gold; level-up banner', async () => {
    await ev(page, () => window.__aoc.ui.updateHud({ health: 20 })); await settle(page, 60);
    ok((await page.locator('.hud .bar--health').getAttribute('class')).includes('is-low'), 'low hp class');
    await ev(page, () => window.__aoc.ui.updateHud({ gold: 12345 })); ok((await page.locator('.hud__gold').innerText()).includes('12,345'), 'gold format');
    await ev(page, () => window.__aoc.ui.updateHud({ level: 8 })); await settle(page, 100);
    ok(await page.locator('.banner').count() === 1, 'level-up banner');
    let mutations = await ev(page, async () => { let n = 0; const mo = new MutationObserver((m) => { n += m.length; }); mo.observe(document.querySelector('.hud'), { subtree: true, childList: true, attributes: true, characterData: true });
      for (let i = 0; i < 100; i++) window.__aoc.ui.updateHud({ health: 20, mana: 30, gold: 12345 }); await new Promise((r) => setTimeout(r, 30)); mo.disconnect(); return n; });
    eq(mutations, 0, '100 no-op updates cause DOM mutations');
  });
  await t('Boss bar appears/disappears; skills without enough mana are dimmed', async () => {
    await ev(page, () => window.__aoc.ui.updateHud({ boss: { name: 'Boss', health: 10, maxHealth: 10 } })); eq(await page.locator('.hud__boss:not([hidden])').count(), 1, 'boss shown');
    await ev(page, () => window.__aoc.ui.updateHud({ boss: null })); eq(await page.locator('.hud__boss:not([hidden])').count(), 0, 'boss hidden');
    ok(await page.locator('.abtn--skill.is-nomana').count() === 1, 'skill 2 dimmed (needs 40 mana, has 30)');
  });
  eq(errors, [], 'no console/page errors in section 4');
  await ctx.close();
}

/* ═══════════════════════════ 5. Robustness ═══════════════════════════ */
console.log('\n[5] Missing backends, empty data, corrupted storage, persistence');
if (want(5)) {
  const a = await open('phone-360x740', 'nobackend');
  await t('No backend at all: menu works, Continue/Load disabled, in-game tabs show "not connected" (no fake data)', async () => {
    ok(await a.page.locator('.menu__buttons .btn').nth(0).isDisabled(), 'continue disabled');
    ok(await a.page.locator('.menu__buttons .btn').nth(2).isDisabled(), 'load disabled');
    await tap(a.page, '.menu__buttons .btn', 1); await tap(a.page, '.newgame__go .btn'); await a.page.waitForSelector('.hud:not([hidden])');
    for (const tab of ['inventory', 'equipment', 'character', 'skills', 'quests', 'map']) {
      await ev(a.page, (x) => window.__aoc.ui.openMenu(x), tab); await settle(a.page, 280);
      ok((await a.page.locator('.frame__body').innerText()).includes('not connected'), tab + ' shows unavailable state');
    }
    await ev(a.page, () => { window.__aoc.ui.closeAllScreens(); window.__aoc.ui.openShop('x'); }); await settle(a.page, 280);
    ok((await a.page.locator('.frame__body').innerText()).includes('not connected'), 'shop unavailable');
    eq(a.errors, [], 'no errors');
  });
  await a.ctx.close();

  const b = await open('phone-360x740', 'empty');
  await t('Empty saves/inventory: Continue disabled, empty states shown', async () => {
    ok(await b.page.locator('.menu__buttons .btn').nth(0).isDisabled(), 'continue disabled');
    await tap(b.page, '.menu__buttons .btn', 1); await tap(b.page, '.newgame__go .btn'); await b.page.waitForSelector('.hud:not([hidden])');
    await ev(b.page, () => window.__aoc.ui.openMenu('inventory')); await settle(b.page, 300);
    ok((await b.page.locator('.frame__body').innerText()).includes('Your pack is empty'), 'inventory empty text');
    eq(b.errors, [], 'no errors');
  });
  await b.ctx.close();

  const c = await open('phone-360x740');
  await t('Backend that throws / rejects: error state with Retry, never a crash', async () => {
    await ev(c.page, () => { window.__fail = true; window.__aoc.ui.setBackend({ inventory: { getInventory() { if (window.__fail) throw new Error('boom'); return { items: [], capacity: 4, gold: 0, equipped: {} }; } } }); });
    await tap(c.page, '.menu__buttons .btn', 1); await tap(c.page, '.newgame__go .btn'); await c.page.waitForSelector('.hud:not([hidden])');
    await ev(c.page, () => window.__aoc.ui.openMenu('inventory')); await settle(c.page, 300);
    ok(await c.page.locator('.state-box--error').count() === 1, 'error box');
    await ev(c.page, () => { window.__fail = false; });
    await tap(c.page, '.state-box--error .btn--secondary'); await settle(c.page, 300);
    eq(await c.page.locator('.state-box--error').count(), 0, 'recovered after retry');
  });
  await t('Failed action (Result.ok=false) shows the backend reason as an error toast', async () => {
    await ev(c.page, () => window.__aoc.ui.setBackend({ inventory: { getInventory: () => ({ items: [{ item: { id: 'x', name: 'X', type: 'weapon', rarity: 'rare', slot: 'weapon' }, qty: 1 }], capacity: 4, gold: 0, equipped: {} }), equip: () => ({ ok: false, reason: 'Too heavy!' }) } }));
    await settle(c.page, 300);
    await c.page.locator('.grid-slots .slot.has-item').first().tap(); await settle(c.page, 100);
    await c.page.locator('.detail__actions .btn', { hasText: 'Equip' }).tap(); await settle(c.page, 250);
    ok((await c.page.locator('.toast--error').innerText()).includes('Too heavy!'), 'reason in toast');
  });
  await t('Hostile strings from other modules are rendered as text, not HTML (XSS-safe)', async () => {
    await ev(c.page, () => window.__aoc.ui.setBackend({ inventory: { getInventory: () => ({ items: [{ item: { id: 'xss', name: '<img src=x onerror="window.__pwned=1">', type: 'misc', rarity: 'common' }, qty: 1 }], capacity: 4, gold: 0, equipped: {} }) } }));
    await settle(c.page, 300); await c.page.locator('.grid-slots .slot.has-item').first().tap(); await settle(c.page, 150);
    eq(await ev(c.page, () => window.__pwned ?? null), null, 'script ran'); ok((await c.page.locator('.detail-head__name').innerText()).includes('<img'), 'shown literally');
  });
  await c.ctx.close();

  await t('Settings persist across reload; corrupted storage falls back to defaults without crashing', async () => {
    const { page, ctx } = await open('phone-360x740', 'persist', '');
    await ev(page, () => { localStorage.clear(); });
    await page.reload(); await page.waitForSelector('.menu');
    await ev(page, () => window.__aoc.ui.updateSettings({ lang: 'fa', masterVolume: 0.25, leftHanded: true, hudScale: 'large' }));
    await page.reload(); await page.waitForSelector('.menu');
    eq(await ev(page, () => { const s = window.__aoc.ui.settings; return [s.lang, s.masterVolume, s.leftHanded, s.hudScale]; }), ['fa', 0.25, true, 'large'], 'persisted');
    eq(await ev(page, () => document.querySelector('.aoc-ui').dir), 'rtl', 'rtl restored');
    await ev(page, () => localStorage.setItem('aoc.ui.settings.v1', '{"lang":"zz","masterVolume":99,"hudScale":"huge","leftHanded":"yes"'));
    await page.reload(); await page.waitForSelector('.menu');
    eq(await ev(page, () => window.__aoc.ui.settings.masterVolume), 0.8, 'corrupt JSON → defaults');
    await ev(page, () => localStorage.setItem('aoc.ui.settings.v1', '{"lang":"zz","masterVolume":99,"hudScale":"huge","leftHanded":"yes"}'));
    await page.reload(); await page.waitForSelector('.menu');
    eq(await ev(page, () => { const s = window.__aoc.ui.settings; return [s.masterVolume, s.hudScale, s.leftHanded]; }), [1, 'medium', false], 'invalid values clamped/repaired');
    await ctx.close();
  });
  await t('Reset settings restores defaults but keeps the current language', async () => {
    const { page, ctx } = await open('phone-360x740', '', 'fa');
    await ev(page, () => window.__aoc.ui.updateSettings({ masterVolume: 0.1, leftHanded: true }));
    await tap(page, '.menu__buttons .btn', 3); await page.waitForSelector('.settings');
    await page.locator('.settings__footer .btn').tap(); await page.waitForSelector('.modal'); await tap(page, '.modal [data-focus=ok]'); await settle(page, 300);
    eq(await ev(page, () => { const s = window.__aoc.ui.settings; return [s.masterVolume, s.leftHanded, s.lang]; }), [0.8, false, 'fa'], 'reset');
    await ctx.close();
  });
}

/* ═══════════════════════════ 6. Layout invariants ═══════════════════════════ */
console.log('\n[6] Layout invariants on every screen × viewport × language');
const VPS6 = (process.env.VPS || Object.keys(VP).join(',')).split(',');
const LAYOUT_JS = () => {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden]'); };
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${vw})`);
  // live screens (not covered / leaving)
  const screens = [...document.querySelectorAll('.screen')].filter((s) => s.dataset.covered !== 'true' && !s.classList.contains('is-leaving'));
  for (const s of screens) {
    const sr = s.getBoundingClientRect();
    if (sr.left < -1 || sr.right > vw + 1 || sr.top < -1 || sr.bottom > vh + 1) out.push(`screen ${s.dataset.screen} exceeds viewport`);
    for (const e of s.querySelectorAll('*')) {
      if (!vis(e) || e.closest('[data-scroll], .split__scroll, .tabs, .filters, .tree, .parchment, .ember, .menu__bg, .over__vignette, .ending__bg, .dlg__scrim, svg')) continue;
      if (e.closest('.screen') !== s) continue;
      const r = e.getBoundingClientRect();
      if (r.right > sr.right + 2 || r.left < sr.left - 2) out.push(`${e.className || e.tagName} overflows horizontally by ${Math.round(Math.max(r.right - sr.right, sr.left - r.left))}px in ${s.dataset.screen}`);
      // clipped text (single-line ellipsis excluded)
      if (e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX === 'visible' && !e.closest('[data-scroll]')) out.push(`text overflow: "${e.textContent.trim().slice(0, 30)}" in ${s.dataset.screen}`);
    }
    // touch targets
    for (const b of s.querySelectorAll('button, [role=tab], [role=radio], .toggle')) {
      if (!vis(b) || b.closest('.tabs, .filters') && false) continue;
      const r = b.getBoundingClientRect();
      const min = Math.min(r.width, r.height);
      if (min < 40 && !b.classList.contains('slot')) out.push(`small touch target ${Math.round(r.width)}x${Math.round(r.height)} ${b.className}`);
      if (b.classList.contains('slot') && min < 44) out.push(`small slot ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  // HUD overlap
  const hud = document.querySelector('.hud:not([hidden])');
  if (hud && !screens.length) {
    const parts = ['.hud__vitals', '.hud__corner', '.hud__boss', '.hud__objectives', '.stick', '.touch__skills', '.touch__cluster', '.hud__skills'];
    const rects = parts.map((p) => [p, document.querySelector(p)]).filter(([, e]) => e && vis(e)).map(([p, e]) => [p, e.getBoundingClientRect()]);
    for (const [p, r] of rects) if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) out.push(`${p} outside viewport (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i][1], b = rects[j][1];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`HUD overlap: ${rects[i][0]} × ${rects[j][0]}`);
    }
  }
  return out;
};

const SCREEN_SETUP = {
  menu: async () => {},
  newgame: async (p) => { await tap(p, '.menu__buttons .btn', 1); },
  settings: async (p) => { await tap(p, '.menu__buttons .btn', 3); },
  load: async (p) => { await tap(p, '.menu__buttons .btn', 2); },
  hud: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.updateHud({ boss: { name: { en: 'Commander Darken of the Hollow City', fa: 'فرمانده دارکن از شهر تهی' }, health: 600, maxHealth: 1000, phase: 2 }, objectives: [{ title: { en: 'Whispers of Betrayal', fa: 'نجواهای خیانت' }, text: { en: 'Defeat Darken’s scouts', fa: 'پیش‌قراولان دارکن را شکست بده' }, current: 2, target: 5 }, { title: { en: 'Bread for the Ashen', fa: 'نان برای خاکستری‌ها' }, text: { en: 'Deliver 3 loaves', fa: 'سه قرص نان برسان' } }, { title: 'Third', text: 'x' }] })); },
  pause: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openPause()); },
  inventory: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openMenu('inventory')); await settle(p, 300); await p.locator('.grid-slots .slot.has-item').nth(1).tap(); },
  equipment: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openMenu('equipment')); },
  character: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openMenu('character')); },
  skills: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openMenu('skills')); await settle(p, 300); await p.locator('.node').first().tap(); },
  quests: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openMenu('quests')); await settle(p, 300); await p.locator('.quest-row').first().tap(); },
  map: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openMenu('map')); await settle(p, 300); await p.locator('.pin').nth(2).tap(); },
  crafting: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openCrafting()); await settle(p, 300); await p.locator('.pick--button').first().tap(); },
  shop: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openShop('s1')); await settle(p, 300); await p.locator('.pick--button').first().tap(); },
  dialogue: async (p) => { await startGame(p); await ev(p, () => { window.__aoc.ui.startDialogue(window.__aoc.tree); }); await settle(p, 1700); await p.locator('.dlg').tap({ position: { x: 20, y: 20 } }); await settle(p, 1900); },
  gameover: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.showGameOver()); },
  ending: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.showEnding('hidden_truth', [{ label: 'Kills', value: 143 }])); await settle(p, 300); for (let i = 0; i < 3; i++) { await p.locator('.ending').tap({ position: { x: 30, y: 30 } }); await settle(p, 80); } },
  modal: async (p) => { await startGame(p); await ev(p, () => window.__aoc.ui.openMenu('inventory')); await settle(p, 300); await p.locator('.filter').nth(3).tap(); await p.locator('.grid-slots .slot.has-item').first().tap(); await p.locator('.detail__actions .btn--danger').tap(); await p.waitForSelector('.modal .qty'); },
};

const problems = [];
for (const vpName of (want(6) ? VPS6 : [])) for (const lang of ['en', 'fa']) {
  const { page, ctx, errors } = await open(vpName, '', lang);
  let sub = 0;
  for (const [name, setup] of Object.entries(SCREEN_SETUP)) {
    try {
      await ev(page, () => { try { window.__aoc.ui.closeAllScreens(); } catch {} }).catch(() => {});
      if (name !== 'menu' && !['newgame', 'settings', 'load'].includes(name)) { /* each setup (re)starts game from menu */ await ev(page, () => window.__aoc.ui.showMainMenu()); await settle(page, 280); }
      else await ev(page, () => window.__aoc.ui.showMainMenu());
      await settle(page, 300);
      await setup(page); await settle(page, 600);
      const issues = await ev(page, LAYOUT_JS);
      for (const i of issues) problems.push(`${vpName}/${lang}/${name}: ${i}`);
      sub++;
    } catch (e) { problems.push(`${vpName}/${lang}/${name}: SETUP FAILED ${String(e.message).split('\n')[0]}`); }
  }
  if (errors.length) problems.push(`${vpName}/${lang}: console errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
if (want(6)) await t(`no layout problems across ${VPS6.length} viewports × 2 languages × ${Object.keys(SCREEN_SETUP).length} screens`, async () => {
  if (problems.length) throw new Error(`${problems.length} problem(s):\n        ` + [...new Set(problems)].slice(0, 60).join('\n        '));
});

await browser.close(); srv.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('\nFAILURES:'); for (const f of failed) console.log(' ✗', f.name, '\n   ', f.err); process.exit(1); }
