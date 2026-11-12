# QA test plan and results — persistence module

Legend: **PASS-auto** = executed by a script in this repo; **NOT RUN** = not executed (no device/project available); **PARTIAL** = part executed.
Run everything with `sh src/modules/persistence/qa/run-all.sh`.

Environment actually used: Node 22, headless Chromium 1243 via Playwright (Linux desktop, localhost over HTTP). Nothing was run on an Android device, iOS, or inside an APK/WebView.

| # | Area | Test | Result |
|---|---|---|---|
| 1 | Startup | `init()` opens real IndexedDB, loads settings, no console errors | PASS-auto (browser) |
| 1b | Startup | IndexedDB unavailable -> degrades to memory + `persistence:degraded` | PASS-auto (node; browser private-mode not run) |
| 2 | Save/load | Round trip of every state section | PASS-auto (node) |
| 2b | Save/load | Survives page reload, checkpoint restored | PASS-auto (browser) |
| 2c | Save/load | Snapshot isolation, concurrent saves serialised, failed write keeps old save, quota error mapped | PASS-auto (node; concurrency also browser) |
| 3 | Slots | 3 manual + auto, independent, listSlots, last-slot "Continue", delete, bad slot id rejected | PASS-auto |
| 4 | Export/import | Round trip; real file download; real file-picker import; occupied slot; bad JSON/format/oversize/newer/tampered; `force` | PASS-auto (download/picker in Chromium) |
| 5 | Settings | Defaults, clamping, invalid values, language rules, persistence across reload, write failure retry, prototype-pollution patch | PASS-auto |
| 6 | Audio | Autoplay lock/unlock with a real click in Chromium (`--autoplay-policy=user-gesture-required`) | PASS-auto |
| 6b | Audio | Real decode, SFX voice limits/cooldown, load dedupe, missing file handled, music priority boss>combat>region, combat exit delay, ambience, bounded track cache, volume/mute buses | PASS-auto (mocked Web Audio in node + real Chromium for the main paths) |
| 6c | Audio | Actually *hearing* correct output / crossfade quality / clicks | NOT RUN (headless, no listener) |
| 7 | Invalid saves | null/string/array/wrong types, missing sections (repair), too incomplete (reject), prototype keys, newer schema, migrations (synthetic v0), corrupt primary -> backup, corrupt with no backup, checksum mismatch | PASS-auto (node + real IDB corruption in browser) |
| 8 | Mobile browsers | Android Chrome / Samsung Internet / Firefox / iOS Safari behaviour, touch unlock, tab-kill saves, low-memory, APK WebView | NOT RUN |
| 9 | Integration | Facade wiring with other modules via bus | PARTIAL: wiring tested with synthetic events only; other modules were not supplied, so real integration is NOT RUN |
| 10 | Autosave | Coalescing, unchanged-state skip, no-provider not an error, stop() removes listeners | PASS-auto (node); visibility/pagehide saves NOT RUN |

Counts at last run: typecheck clean; 38 node tests pass; 24 Chromium checks pass.

## Bugs found by the tests and fixed
1. Browser run: fresh saves with real `Date.now()` stone timestamps reported status `repaired` because the sanitizer clamped values above 1e12. Fixed; regression test added.
2. Browser run: `PersistenceModule.flush()` wrote an autosave even when autosave was disabled (made "Continue" load `auto`). Fixed.

## Performance review (measured vs. not measured)
Measured: ~0.8 ms average save latency (20 saves, small state, headless Chromium, real IDB). 300 combat-music toggles produced no extra music tracks (cache bounded to 3). No re-fetch of cached SFX. Counters report batches/reads per session via `getDiagnostics()`.
NOT measured: heap growth over long sessions (no heap profiling run), save time on low-end Android, large inventories.
Observations / recommendations:
- `listSlots()` fully validates all 4 slots (2 reads each); call it when opening the slot screen only, not per frame.
- State provider is deep-cloned per save: keep `collectState()` cheap and never call `saveToSlot` per frame. Autosave already skips unchanged state and coalesces bursts (min gap 5 s).
- Other modules: preload SFX per region (`audio.preload`) and `audio.unload` the previous region's ids; do not call `audio:set-region` repeatedly per frame (idempotent, but wasteful); remove your own bus listeners on scene shutdown.
- Do not also play the same music through Phaser's sound manager (duplicate decode/memory).
