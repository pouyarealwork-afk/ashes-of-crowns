// Usage: node tools/art-preview/run.mjs <mode> <out.png> [width height]
import { build } from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const [mode = 'aren', out = 'preview.png', W = '1600', H = '1200'] = process.argv.slice(2);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artprev-'));
await build({ entryPoints: [new URL('./main.ts', import.meta.url).pathname], bundle: true, outfile: path.join(dir, 'out.js'), format: 'iife', target: 'es2020', logLevel: 'error' });
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><body style="margin:0;background:#17121b"><div id="root"></div><script src="out.js"></script></body>');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.on('console', m => console.log('[console]', m.text())); page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('file://' + path.join(dir, 'index.html') + '?m=' + mode);
await page.waitForFunction('window.__ready === true', { timeout: 20000 });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('saved', out);
