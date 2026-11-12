/** Dev/test harness entry. Exposes `window.__aoc` for the browser tests. Not part of the shipped module. */
import { createUI } from '../index';
import { createMock } from './mockBackend';
import type { DialogueTree } from '../contracts';

const params = new URLSearchParams(location.search);
const { backend, state } = createMock({ empty: params.has('empty') });
const memory = new Map<string, string>();
const storage = params.has('persist') ? undefined : {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

const log: { type: string; payload: unknown }[] = [];
const ui = createUI({
  parent: document.getElementById('app')!,
  backend: params.has('nobackend') ? {} : backend,
  storage,
  autoFlow: !params.has('manualflow'),
});
for (const t of ['game:new', 'game:continue', 'game:load', 'game:pause', 'game:resume', 'game:quitToMenu', 'game:retry', 'game:saved',
  'input:axis', 'input:action', 'dialogue:choice', 'dialogue:end', 'settings:changed', 'ending:finished'] as const) {
  ui.on(t, (p) => log.push({ type: t, payload: p }));
}
if (params.get('lang')) ui.setLanguage(params.get('lang') as 'en' | 'fa');

const tree: DialogueTree = {
  id: 'test', start: 'a',
  nodes: {
    a: { id: 'a', speaker: { en: 'Darken', fa: 'دارکن' }, portrait: 'crown', next: 'b',
      text: { en: 'You should not have come back, Aren. The crown has no place for old friends.', fa: 'نباید برمی‌گشتی، آرن. تاج برای دوستان قدیمی جایی ندارد.' } },
    b: { id: 'b', speaker: { en: 'Darken', fa: 'دارکن' }, portrait: 'crown',
      text: { en: 'Tell me — what did you come here to do?', fa: 'بگو — برای چه آمده‌ای؟' },
      choices: [
        { id: 'mercy', text: { en: 'Spare you.', fa: 'تو را ببخشم.' }, next: 'c', meta: { mercy: 1 } },
        { id: 'revenge', text: { en: 'End this.', fa: 'این را تمام کنم.' }, meta: { honor: -1 } },
        { id: 'locked', text: { en: 'Bribe the guard', fa: 'نگهبان را بخرم' }, disabled: true, hint: { en: 'Requires 500 gold', fa: 'نیازمند ۵۰۰ طلا' } },
      ] },
    c: { id: 'c', speaker: { en: 'Darken', fa: 'دارکن' }, text: { en: '…Then we are both fools.', fa: '…پس هر دو احمقیم.' } },
  },
};

(window as unknown as Record<string, unknown>).__aoc = { ui, state, log, tree };
ui.on('game:new', () => {
  ui.updateHud({
    health: 72, maxHealth: 120, mana: 30, maxMana: 60, stamina: 48, maxStamina: 80, xp: 340, xpToNext: 900, level: 7, gold: 250,
    playerName: { en: 'Aren', fa: 'آرن' },
    skills: [{ id: 'slash', icon: 'sword', manaCost: 8, name: 'Slash' }, { id: 'rend', icon: 'flame', manaCost: 40 }, null],
    objectives: [{ title: { en: 'Whispers of Betrayal', fa: 'نجواهای خیانت' }, text: { en: 'Defeat Darken’s scouts', fa: 'پیش‌قراولان دارکن را شکست بده' }, current: 2, target: 5 }],
  });
});
