// Visual walkthrough: screenshots of every screen at several viewports / languages.
// usage: node tests/shots.mjs <outDir> [viewportName...]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

export const VIEWPORTS = {
  phone: { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phoneL: { width: 740, height: 360, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { width: 800, height: 1280, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const only = process.argv.slice(3);
const { srv, url } = await serve(path.join(here, '../dev'));
const browser = await chromium.launch();
const SCREENS = [
  ['menu', async () => {}],
  ['newgame', async (p) => { await p.click('text=/New Game|بازی جدید/'); }],
  ['settings', async (p) => { await p.evaluate(() => __aoc.ui.closeAllScreens?.()); }],
];

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  if (only.length && !only.includes(vpName)) continue;
  for (const lang of ['en', 'fa']) {
    const { width, height, ...rest } = vp;
    const ctx = await browser.newContext({ ...rest, viewport: { width, height }, locale: lang === 'fa' ? 'fa-IR' : 'en-US' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${url}/?lang=${lang}`);
    await page.waitForSelector('.menu');
    const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(out, `${vpName}-${lang}-${name}.png`) }); };
    const api = (fn, ...a) => page.evaluate(([f, args]) => { const ui = window.__aoc.ui; return eval(f)(ui, window.__aoc, ...args); }, [fn.toString(), a]);

    await shot('01-menu');
    await page.click('.menu__buttons .btn:nth-child(2)'); await shot('02-newgame');
    await page.evaluate(() => __aoc.ui.closeTop());
    await page.click('.menu__buttons .btn:nth-child(3)'); await shot('03-load');
    await page.evaluate(() => __aoc.ui.closeTop());
    await page.click('.menu__buttons .btn:nth-child(4)'); await shot('04-settings');
    await page.evaluate(() => __aoc.ui.closeTop());

    // enter game with a boss + several objectives to stress HUD layout
    await page.click('.menu__buttons .btn:nth-child(2)');
    await page.click('.newgame__go .btn');
    await page.waitForSelector('.hud:not([hidden])');
    await page.evaluate(() => __aoc.ui.updateHud({
      boss: { name: { en: 'Commander Darken', fa: 'فرمانده دارکن' }, health: 640, maxHealth: 1000, phase: 2 },
      objectives: [
        { title: { en: 'Whispers of Betrayal', fa: 'نجواهای خیانت' }, text: { en: 'Defeat Darken’s scouts', fa: 'پیش‌قراولان دارکن را شکست بده' }, current: 2, target: 5 },
        { title: { en: 'Bread for the Ashen', fa: 'نان برای خاکستری‌ها' }, text: { en: 'Deliver 3 loaves', fa: 'سه قرص نان برسان' }, current: 0, target: 3 },
      ],
    }));
    await shot('05-hud');
    await page.evaluate(() => __aoc.ui.openPause()); await shot('06-pause');
    for (const tab of ['inventory', 'equipment', 'character', 'skills', 'quests', 'map']) {
      await page.evaluate((t) => __aoc.ui.openMenu(t), tab);
      await page.waitForTimeout(250);
      if (tab === 'inventory') { await page.click('.grid-slots .slot.has-item >> nth=1'); }
      if (tab === 'skills') { await page.click('.node >> nth=0'); }
      if (tab === 'quests') { await page.click('.quest-row >> nth=0'); }
      if (tab === 'map') { await page.click('.pin >> nth=1'); }
      await shot(`07-${tab}`);
    }
    await page.evaluate(() => __aoc.ui.openCrafting()); await page.click('.pick--button >> nth=0'); await shot('08-crafting');
    await page.evaluate(() => __aoc.ui.openShop('s1')); await page.click('.pick--button >> nth=0'); await shot('09-shop');
    await page.evaluate(() => { __aoc.ui.startDialogue(__aoc.tree); });
    await page.waitForTimeout(1500); await page.click('.dlg__box', { position: { x: 10, y: 10 } }).catch(() => {}); await shot('10-dialogue-line');
    await page.evaluate(() => __aoc.ui.showGameOver()); await shot('11-gameover');
    await page.evaluate(() => __aoc.ui.showEnding('true_king', [{ label: { en: 'Enemies slain', fa: 'دشمنان کشته‌شده' }, value: 143 }]));
    await shot('12-ending-beat');
    for (let i = 0; i < 3; i++) await page.click('.ending', { position: { x: 20, y: 20 } });
    await shot('13-ending-card');
    if (errors.length) console.log(`[${vpName}/${lang}] ERRORS:`, errors);
    await ctx.close();
  }
}
await browser.close(); srv.close();
console.log('done', out);
