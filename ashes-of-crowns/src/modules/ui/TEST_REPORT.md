# UI module — test report (what was actually run)

**Environment:** Chromium (Playwright) with mobile + touch emulation, `tsc --strict` (TypeScript 7), esbuild bundle.
Nothing was run on a physical Android device, in Firefox/Safari, or against the real game modules (they were not supplied).
The backend used in tests is `dev/mockBackend.ts`, a stateful fixture that implements the contracts.

## Results
| Check | Result |
|---|---|
| `tsc --strict --noUnusedLocals` on the module | clean. Persian dictionary is typed against English keys → a missing translation is a compile error |
| Functional/browser tests (`tests/e2e.mjs`, sections 1–5) | **45 / 45 pass** |
| Layout invariants, section 6 | **6 / 6 viewports pass**: 320×568, 360×740, 412×915, 740×360, 915×412, 800×1280 × EN+FA × 18 screen states (216 states). Checks: no horizontal page scroll, nothing outside its screen, no clipped text, touch targets ≥ 40 px (slots ≥ 44), no overlap between HUD parts / touch controls |

Covered functionally: continue / new game (+overwrite confirm) / load / save (+overwrite, delete) / quit; pause + Escape;
language switch (RTL, Persian digits, state/scroll/dialogue-line preserved, Persian typography rules); inventory
(equip, use, drop with quantity, level gate, quest items); equipment; character; skill tree (connectors, learn,
hotbar, locked); quests (tabs, tracking); map (locked regions, fast travel); crafting; shop (buy/sell/unaffordable);
dialogue (typewriter, choices, disabled choice, meta event, promise); game over; all 5 endings; real multi-touch
(joystick + attack + jump simultaneously via CDP); no stuck input on pause; left-handed/scale/opacity; HUD diffing
(100 no-op updates = 0 DOM mutations), boss bar, low HP, level-up banner; no backend / empty data / throwing backend /
failed action toast / hostile HTML strings / corrupted and invalid stored settings.

## Bugs found by the tests and fixed
1. Screen closed and reopened within 220 ms stayed invisible and untappable (`is-leaving` never cleared).
2. Switching language mid-dialogue (to a longer line) truncated the text and hid the choices.
3. Touch controls overflowed 360-px-wide screens (attack button clipped) → responsive control scaling.
4. Touch skill row overlapped the boss bar on landscape phones → skills moved to a column.
5. Objectives panel reached the touch controls on 320×568 → compact objectives on short screens.
6. Map edge label clipped; shop title truncated; tab bar did not fit; inventory action buttons hidden below the fold.
7. SVG connectors/map road were created in the wrong XML namespace (would not draw).

## NOT tested / known limitations (please read)
* **Fonts:** Vazirmatn and Cinzel are **not bundled** (no network). Persian was verified only with the sandbox's fallback
  fonts; the real Vazirmatn look/metrics are unverified. See `assets/fonts/README.md`.
* **Not verified on real devices:** Android Chrome behaviour, hardware/gesture Back (history trick implemented but only
  Escape is tested), vibration, fullscreen API, soft-keyboard, notch insets (`env(safe-area-*)` used, not observable here).
* **Integration:** never run against real Player/Combat/World/RPG/Persistence modules or Phaser. Contracts are
  documented in README §5; real data shapes may need small adapters.
* **Translations & copy:** Persian strings and the five ending texts were written by me and need review by a native
  speaker / the narrative owner.
* **Accessibility:** ARIA roles/labels and focus rings exist; no screen-reader or full keyboard-navigation test.
* Unused dictionary keys remain (`dlg.skip`, `hud.menu`, `set.on/off`, `dialog.sellQty`, …). Dialogue has no skip-all button.
* No audio (UI only emits `ui:sfx`). No character-name entry on New Game (name comes from the game).
* Performance was not profiled on low-end Android hardware.
