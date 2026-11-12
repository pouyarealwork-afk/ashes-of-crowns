# Module 6 — Persistence (saves, checkpoints, settings, audio, QA)

Location: `src/modules/persistence/`. Import only from `index.ts`. No dependency on Phaser or any other game module
(it talks over an event bus; Phaser's `EventEmitter` fits the `EventBus` interface directly).
Runtime dependencies: none. Dev/test: `typescript`, `tsx`, `esbuild`, `playwright` (+ Chromium).
No shared file (package.json, main entry, vite config) was touched.

## 1. Initialise

```ts
import { PersistenceModule } from './modules/persistence';

const persistence = new PersistenceModule({
  gameVersion: '0.1.0',
  bus: game.events,                         // optional; shared bus. A private one is created otherwise.
  audio: {
    manifest: {                             // YOU supply the asset files; ids are yours
      m_ashen_village: { url: '/audio/music/ashen_village.ogg', category: 'music' },
      m_combat:        { url: '/audio/music/combat.ogg',        category: 'music' },
      m_boss_darken:   { url: '/audio/music/boss_darken.ogg',   category: 'music' },
      ui_click:        { url: '/audio/ui/click.ogg',            category: 'ui', cooldownMs: 40 },
      hit_slash:       { url: '/audio/sfx/hit_slash.ogg',       category: 'sfx', maxVoices: 3 },
      wind_forest:     { url: '/audio/env/wind.ogg',            category: 'env', volume: 0.6 },
    },
    regionMusic: { ashen_village: 'm_ashen_village' /* ... */ },
    combatMusicId: 'm_combat',
  },
});
await persistence.init();                    // never rejects on storage problems (degrades to memory + emits persistence:degraded)
persistence.audio.attachUnlockListeners();   // once; audio starts after the first tap (mobile autoplay policy)
persistence.registerStateProvider(() => game.isPlaying ? collectState() : null);
```

`collectState()` must return `GameStateInput` (see §4). Checkpoints are owned by this module and merged in automatically.

## 2. Public API (`index.ts`)

| Object | Methods |
|---|---|
| `PersistenceModule` | `init()`, `registerStateProvider(fn)`, `saveToSlot(slotId,label?)`, `loadSlot(slotId)`, `continueLast()`, `flush()`, `getDiagnostics()`, `dispose()`; fields `saves`, `settings`, `checkpoints`, `audio`, `bus` |
| `SaveManager` (`.saves`) | `save(slot,opts)`, `saveState(slot,state,opts)`, `load(slot)`, `listSlots()`, `getLastSlot()`, `deleteSlot(slot)`, `exportSlot(slot)`, `importSlot(json,slot,{overwrite,force})` |
| `SettingsManager` (`.settings`) | `get()`, `update(partial)`, `reset()`, `flush()`, `resolvedQuality()` |
| `CheckpointManager` (`.checkpoints`) | `register(...defs)`, `unregisterRegion(id)`, `setDefaultSpawn(p)`, `activate(id)`, `getRespawnPoint()`, `respawn()`, `getDiscovered()`, `isDiscovered(id)`, `snapshot()`, `restore(s)` |
| `AudioManager` (`.audio`) | `attachUnlockListeners()`, `unlock()`, `setVolumes()`, `preload(ids)`, `unload(ids)`, `playSfx(id,opts)`, `stopSfx(id?)`, `setAmbience(ids)`, `setRegion(id)`, `setCombatActive(b)`, `setBossMusic(id\|null)`, `playMusic(id)`, `stopMusic()`, `bindBus()` |
| helpers | `createDefaultGameState()`, `sanitizeGameState()`, `downloadTextFile()`, `pickTextFile()`, `defaultSettings()`, `detectPerformanceTier()` |

Slots: `slot1`, `slot2`, `slot3` (configurable via `manualSlots`) plus `auto`. `loadSlot` returns
`{ok:true, record, status:'ok'|'repaired'|'restored-backup'|'checksum-mismatch', warnings[]}` or `{ok:false, code, message}`.
Show `warnings` to the player when status != `ok`.

Export/import (from the UI module, inside a tap handler):
```ts
const {json, filename} = await persistence.saves.exportSlot('slot1'); downloadTextFile(filename, json);
const text = await pickTextFile(); if (text) await persistence.saves.importSlot(text, 'slot2', {overwrite:false});
```
Errors are `PersistenceError` with `.code`: `empty-slot invalid newer-version no-migration checksum-mismatch too-large bad-slot slot-occupied quota storage-unavailable storage-failed no-state-provider nothing-to-save`.

## 3. Events

Emitted (constants in `PersistenceEvents`):
`persistence:ready {backend,degraded}` · `persistence:degraded {reason}` · `persistence:saved {slotId,kind,meta}` · `persistence:save-failed {slotId,kind,code,message}` ·
`persistence:state-loaded {slotId,state,meta,status,warnings}` · `persistence:load-failed {slotId,code,message}` · `persistence:slot-deleted {slotId}` · `persistence:imported {slotId,meta}` ·
`checkpoint:activated {stoneId,regionId,x,y,firstTime}` · `checkpoint:respawn {stoneId|null,regionId,x,y}` · `settings:changed {settings,changed[]}` ·
`audio:unlocked` · `audio:blocked {id}` · `audio:error {id,message}` · `audio:music-changed {id|null}`

Listened to (`ListenedEvents`):
`persistence:request-save {slotId?,label?}` · `persistence:request-autosave` · `checkpoint:request-activate {id}` · `checkpoint:request-respawn` ·
`audio:play-sfx {id,volume?,rate?,pan?}` · `audio:set-region {regionId}` · `audio:combat {active}` · `audio:boss {id|null}` ·
`world:region-changed {regionId}` · `rpg:quest-completed` · `rpg:level-up` · `combat:boss-defeated` (the last four trigger autosave; `world:region-changed` also switches region music).

**The `world:`/`rpg:`/`combat:` names are a proposal — the other modules were not supplied, so they are unconfirmed.** Remap with `autosave.triggers` and `eventMap` if the real names differ.

## 4. Data structures
See `types.ts`: `GameState` (player stats/level/xp/position, inventory, equipment, skills, quests, decisions, narrative{honor,trust,ambition,mercy}, relationships, difficulty, currentRegion, checkpoints, unlockedSkins, progress{playtimeMs, regionsUnlocked/Completed, bossesDefeated, flags, endingsSeen}), `SaveMeta`, `Settings`, `AudioManifest`.
Saves carry `schemaVersion` (currently 1) and an integrity checksum. Add a `Migration {from,to,migrate}` to `PersistenceOptions.migrations` when bumping `SAVE_SCHEMA_VERSION`.

## 5. Required assets
None are bundled for the game (none were supplied). You must provide audio files (OGG/MP3 recommended; WAV works) and list them in the manifest. Missing files do not crash: `audio:error` is emitted. Music is streamed via `<audio>`; keep SFX short (decoded to RAM).

## 6. How other modules communicate
- Player/RPG/World: supply state via `registerStateProvider`; apply slices on `persistence:state-loaded`.
- World: `checkpoints.register()` stones when a region loads; `checkpoints.activate(id)` on touch; `getRespawnPoint()`/`respawn()` on death (the player module performs the teleport and any penalty).
- Combat: emit `audio:play-sfx`, `audio:combat {active}`, `audio:boss {id}`.
- UI: slot list via `saves.listSlots()`, settings via `settings.update()`, export/import helpers above.

## 7. Known limitations (see qa/QA_REPORT.md for test status)
- Checksum detects accidental corruption only; it is NOT tamper-proof (saves are client-side and editable).
- `pagehide`/`visibilitychange` saves are fire-and-forget; a browser may kill the tab before IndexedDB commits.
- SFX are not queued while loading: preload what a region needs, or the first play is dropped.
- Muting keeps music running at zero volume (not paused).
- No save-slot UI, settings screen or audio assets: those belong to the UI module / art-audio pipeline.
- Phaser's own sound manager is not used; Phaser audio and this manager would play independently if both are used.
