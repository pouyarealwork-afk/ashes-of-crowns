# ASHES OF CROWNS — Module 5: UI & Mobile UX (`src/modules/ui/`)

Complete menu / HUD / touch-control layer. Plain TypeScript + DOM + CSS (no framework, no new dependencies).
The UI is an overlay `<div>` above the game canvas. It never imports another module: everything it shows
comes from **provider interfaces** you pass in (see `contracts.ts`), and everything it does is reported as
**events**. If a provider is missing, the matching screen says "not connected" instead of inventing data.

## 1. Initialize

```ts
import { createUI } from './modules/ui';            // the only import you need

const ui = createUI({
  parent: document.getElementById('app')!,          // element covering the game viewport (default: document.body)
  backend: { player, inventory, skills, quests, world, crafting, shop, persistence }, // all optional
  // autoFlow: true       UI switches menu <-> gameplay itself after game:new/continue/load/retry/quitToMenu
  // storage: myKV        settings storage (default localStorage → memory fallback)
  // showMenu: true       show the main menu immediately
  // handleBackKey: true  Escape + Android Back button
});
```

Requirements: DOM + ES2020. No runtime dependency. Build tool must accept `import './x.css'` (Vite does).
TypeScript only needs `env.d.ts` (declared inside this module) for the CSS import.

## 2. Public API (`GameUI`)

| Method | Purpose |
|---|---|
| `on / once / off(type, fn)` | Subscribe to events below. `on` returns an unsubscribe function. |
| `setBackend(patch)` | Add/replace providers at any time (e.g. when another module finishes loading). Open screen refreshes. |
| `enterGame()` / `exitToMenu()` / `showMainMenu()` | Flow control (only needed with `autoFlow:false`, or after a cutscene). |
| `openPause()` / `togglePause()` | Pause menu (only while in game). Bind to your pause key. |
| `openMenu(tab)` | `'inventory' \| 'equipment' \| 'character' \| 'skills' \| 'quests' \| 'map'` (e.g. key `I`, `K`, `J`, `M`). |
| `openCrafting()` / `openShop(shopId)` / `openSaveMenu()` | Station / merchant / save-point interactions. |
| `startDialogue(tree): Promise<string[]>` | Runs a `DialogueTree`; resolves with the ids of the choices taken. |
| `showGameOver()` / `showEnding(id, stats?)` | Death screen / one of the 5 ending cinematics. |
| `updateHud(patch)` | Push HUD values. Cheap — call every frame with whatever changed (no-op updates cause zero DOM writes). |
| `showHud(bool)`, `toast({text,kind,icon})`, `banner(title,sub,icon)` | Misc feedback. |
| `refresh()` | Re-query providers for the open screen (after the game changed inventory etc.). |
| `isBlocking` / `isInGame` | `true` while a menu/dialogue/modal is open — stop reading gameplay input. |
| `settings`, `updateSettings(patch)`, `setLanguage('en'\|'fa')` | Read/change settings (persisted). |
| `closeTop()`, `closeAllScreens()`, `handleBack()`, `destroy()` | Navigation / teardown. |

## 3. Events (UI → everyone) — `UIEvents` in `contracts.ts`

| Event | Payload | Meaning / who should listen |
|---|---|---|
| `game:new` | `{slot}` | Player chose New Game → **persistence/world/rpg**: reset state, create slot. |
| `game:continue` / `game:load` | `{slot}` | Load that slot → **persistence**. |
| `game:retry` | – | After game over → reload last checkpoint. |
| `game:quitToMenu` | – | Tear down the running level. |
| `game:pause` / `game:resume` | `{reason}` / – | First blocking screen opened / last one closed **during gameplay** → pause/resume the Phaser scene. |
| `game:saved` | `{slot}` | UI just called `persistence.save`. |
| `input:axis` | `{x,y}` −1..1 | Touch joystick (released ⇒ 0,0) → **player**. |
| `input:action` | `{action,pressed}` | `attack jump dodge interact heavy block skill1 skill2 skill3` → **player/combat**. |
| `dialogue:choice` | `{dialogueId,nodeId,choiceId,meta}` | **rpg** updates hidden vars (Honor/Trust/Ambition/Mercy) from `meta`. The UI never shows or interprets `meta`. |
| `dialogue:end` | `{dialogueId,choices[]}` | Dialogue finished. |
| `ending:finished` | `{ending}` | Player pressed "Return to Main Menu" on the ending card. |
| `settings:changed` | `{settings,key}` | **audio** module: apply volumes; **player**: vibration etc. |
| `ui:sfx` | `{name}` | `click open close confirm error equip coin levelup` → hook up to audio. |
| `ui:screen` | `{id,open}` | Analytics / debugging. |

## 4. What the UI listens to
Nothing on a bus. Other modules talk to the UI only through **method calls** (`updateHud`, `openShop`,
`startDialogue`, `showEnding`, `showGameOver`, `setBackend`, …) and the **provider objects**.

## 5. Provider contracts (`UIBackend`) — what each module must implement

| Provider | Methods (★ = required when provider present) | Used by |
|---|---|---|
| `player` | ★`getPlayer(): PlayerSnapshot` | Character sheet, level checks |
| `inventory` | ★`getInventory()`, `equip(id,slot)`, `unequip(slot)`, `use(id)`, `drop(id,qty)` | Inventory, Equipment, Crafting, Shop (sell) |
| `skills` | ★`getSkillTrees()`, ★`getSkillPoints()`, `unlockSkill(id)`, `getHotbar()`, `setHotbar(i,id)` | Skill tree |
| `quests` | ★`getQuests()`, `setTracked(id,bool)` | Journal |
| `world` | ★`getMap()`, `fastTravel(region)` | World map |
| `crafting` | ★`getRecipes()`, ★`craft(id)` | Crafting |
| `shop` | ★`getShop(id)`, ★`buy(shop,item,qty)`, `sell(...)` | Shop (no `sell` ⇒ Sell tab hidden) |
| `persistence` | ★`listSlots()`, ★`save(slot)`, `deleteSlot(slot)` | Menu, Save/Load |

* Every method may be sync or return a Promise. Action methods return `{ok:true}` or `{ok:false, reason?}`;
  the `reason` (string or `{en,fa}`) is shown to the player as an error toast.
* Optional methods that are absent ⇒ the matching button is **hidden**, never shown dead.
* **Text from other modules** is `string | {en?: string, fa?: string}`. Plain strings are shown as-is.
  All dynamic text is inserted with `textContent` (HTML in names is shown literally, not executed).
* `PlayerSnapshot.stats` should be final stats (equipment included).
* Persisting the **game** is not the UI's job: `persistence.save(slot)` must snapshot the live game itself.
  "Load" emits `game:load`; the persistence module then restores state (the UI does not load data).

### HUD feed
```ts
ui.updateHud({ health, maxHealth, mana, maxMana, stamina, maxStamina, xp, xpToNext, level, gold,
  playerName: 'Aren',
  skills: [{ id:'slash', icon:'sword', manaCost:8, name:'Slash' }, null, null],   // first 3 slots
  objectives: [{ title:{en:'…',fa:'…'}, text:'…', current:2, target:5 }],          // up to 3 shown
  boss: { name:'Darken', health: 640, maxHealth: 1000, phase: 2 } /* or null */ });
```
Level increase while in game ⇒ automatic "Level up!" banner + `ui:sfx levelup`.

### Dialogue
```ts
const picked = await ui.startDialogue({ id:'darken_01', start:'a', nodes:{
  a:{ id:'a', speaker:{en:'Darken',fa:'دارکن'}, portrait:'crown', text:{…}, next:'b' },
  b:{ id:'b', text:{…}, choices:[{ id:'spare', text:{…}, next:'c', meta:{ mercy:1 } },
                                 { id:'locked', text:'…', disabled:true, hint:'Requires 500 gold' }] } } });
```

## 6. Assets

* **Icons**: 60+ original inline-SVG icons (`core/icons.ts`, one stroke style). Items/skills may use any built-in
  name (`ICON_NAMES`) **or an image URL** (any string containing `.` or `/`); broken URLs fall back to a default icon.
  No image files are required.
* **Fonts** — **NOT bundled** (no network in the build sandbox). See `assets/fonts/README.md`. Without them the UI
  uses `local()` + system fallbacks (Noto Naskh/Sans Arabic on Android) and stays correct. To ship Vazirmatn + Cinzel:
  put the two `.woff2` files in `assets/fonts/` and `import './modules/ui/styles/fonts.files.css'` once.
* No audio assets; the UI only emits `ui:sfx`.

## 7. Behaviour guarantees
* **Language switch** (`en`⇄`fa`, from Settings, main-menu button or `setLanguage`) re-renders every open screen from
  instance state: selected item/tab/filter, scroll positions, dialogue line, HUD values all survive. Direction (`dir`),
  `lang`, digits (Persian ۰-۹ optional), fonts and mirrored layout (logical CSS properties, mirrored bars/arrows) switch together.
  The world map and touch controls are intentionally *not* mirrored (geography / muscle memory).
* **Persian shaping**: letter-spacing and uppercase are force-disabled for `fa`; text is revealed by whole-string prefix
  in dialogue so letters still join.
* **Touch**: all controls ≥ 40 px (buttons 48 px), Pointer Events with capture ⇒ true multi-touch; inputs are released
  when a menu opens, the page blurs or the tab hides (no stuck input); safe-area insets respected; left-handed mode,
  control size/opacity, HUD size, text size, reduce-motion, vibration.
* **Android Back / Escape**: closes modal → screen → opens Pause (one history entry is kept while in game).
* **Pause**: `game:pause`/`game:resume` fire when the first blocking screen opens/last closes in game.

## 8. Required integration changes outside this module (not made by me)
1. **Game entry** (`main.ts`/scene): call `createUI(...)` once; listen to `game:*`, `input:*`, `settings:changed`.
   Make the Phaser canvas/parent `position:relative` so the fixed overlay lines up; set `touch-action:none` on the canvas.
2. **Player module**: consume `input:axis` / `input:action` (and stop reading its own touch code if it has any).
3. **Each backend module**: expose its provider object (`contracts.ts` types) — see table in §5.
4. **Audio module** (optional): map `ui:sfx` names to sounds; use `settings:changed` for volumes.
5. **HUD**: call `ui.updateHud()` from the game loop (≤ once per frame).
6. `index.html`: ensure `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`.
7. No change to `package.json` or global config is required.

## 9. Testing
`tests/run.sh` type-checks (`tsc --strict`), bundles `dev/` and runs `tests/e2e.mjs` in real Chromium
(touch + CDP multi-touch, EN/FA, 6 viewports). `dev/mockBackend.ts` is a **test fixture** implementing the contracts —
it is not part of the public API. `tests/shots.mjs` produces screenshots. See the test report delivered with this module.
