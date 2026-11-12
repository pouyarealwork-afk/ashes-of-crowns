# ASHES OF CROWNS — Module 3: World, Story, Quests & Narrative

Location: `src/modules/world/` · Pure TypeScript, **no Phaser / DOM dependency** (runs headless; Android-browser safe).
Only touches files inside this directory. No shared files were modified.

## 1. Initialise

```ts
import { createWorldModule } from '@/modules/world';          // or relative path
const world = createWorldModule({ emitter: this.game.events }); // emitter optional: any {emit,on,off?}
// load game:   createWorldModule({ emitter, saveData })   or   world.restore(saveData)
// save game:   const blob = world.serialize();            // JSON-safe, versioned (version: 1)
```
Required dependencies: none (TypeScript ≥ 5, target ES2020). `tsconfig.json` in the repo root of this delivery is for testing only.

## 2. Events

**Emitted** (on `world.on(name, fn)` and mirrored to `emitter`):
`world:dialogue-started|dialogue-node|dialogue-ended|story-event` · `world:quest-started|quest-updated|quest-completed|quest-failed` ·
`world:reward {xp,gold,items[],source}` (→ RPG module) · `world:key-item` · `world:collectible-found` · `world:poi-discovered` ·
`world:path-revealed {id,level,rect,hint,leadsTo}` · `world:area-unlocked` · `world:chapter-changed` · `world:level-requested {level,spawn,via}` (→ scene loader) ·
`world:companion-recruited|companion-left|companion-died|companion-bark|companion-assist|companion-assist-actions|party-changed` ·
`world:relationship-changed` · `world:toast {text}` · `world:ending {EndingResult}` · `world:finale-complete` · `world:new-game|restored` ·
`world:variable-changed` (**debug only; hidden variables must never be shown**).

**Listened to** (after `attach(emitter)`, automatic if `emitter` given):
| Event | Payload |
|---|---|
| `combat:enemy-defeated` | `{enemyId, bossId?}` — bossId for bosses: `hobb thornwarden colossus voss hushmother morrow` |
| `player:entered-zone` | `{zoneId}` |
| `player:interact` | `{objectId}` (level `interactables`) |
| `player:collect` | `{id}` (level `collectibles`) |
| `player:npc-interact` | `{npcId}` |
| `player:died` | – |
| `ui:dialogue-choose` / `ui:dialogue-advance` | `{index}` / – |
| `combat:assist-request` | `CombatContext` → answers with `world:companion-assist-actions` |

## 3. Public methods (`WorldModule`)
- Reports: `reportZone, reportInteract, reportKill(enemyId, bossId?), collect(id)`
- Dialogue: `talkTo(npcId), startDialogue(treeId), choose(i), advance(), endDialogue(), getDialogue(), isInDialogue()` → `DialogueView {speaker, speakerName, text, mood, choices[{index,text}], canAdvance, reactions[]}`
- Quests: `getQuestLog(status?), getQuest(id), startQuest(id), getAvailableQuests(), getMainObjective()`
- World: `getLevelRuntime(levelId)` (geometry + valid NPCs/collectibles/hidden paths), `getLevel, getHiddenPaths, useExit(levelId, exitId), getMapView(), canTravel, travel, getFastTravelTargets, getExploration(region), getChapter()`
- Companions: `getParty, setParty(ids≤2), getPartySpecs(), requestAssist(ctx), getCompanionStatus(id)`
- Narrative: `hasFlag, setFlag, getRelationship, previewEndings(), resolveEnding(), getEnding(), getHiddenVariables()` (QA only)
- Persistence: `serialize(), restore(data), newGame()`

**Combat module**: call `getPartySpecs()` to spawn companion entities, and each tick or via event `combat:assist-request {now, playerHpRatio, enemyCount, bossActive, comboCount}` / `requestAssist(ctx)`; it returns `AssistAction[] {companionId, abilityId, kind: damage|heal|shield|stun|buff|revive, power, targeting, vfx}` with cooldowns managed here. Power scales with loyalty.
**RPG module**: listen to `world:reward`. Reward item ids (`charm_hearthstone, charm_wisp, charm_glyph, charm_cairn, charm_lamp, charm_banner`) must exist in the item DB.
**Persistence module**: store `world.serialize()` under key `world`.
**UI module**: render `DialogueView`, `getQuestLog()`, `getMapView()`; send `ui:dialogue-choose/advance`.
**Player/scene module**: build levels from `getLevelRuntime()`; trigger zones/interactables/collectibles by id; on `world:level-requested` change scene and spawn at `{level, spawn}`.

## 4. Data structures
See `types.ts`: `LevelDef` (platforms as `[x,y,w,h,kind]`, hazards, enemy spawns, NPCs, collectibles, hidden paths, zones, interactables, exits, lore props, atmosphere), `QuestDef`, `DialogueTree`, `CompanionDef`, `EndingDef`, `SaveData`.

## 5. Required assets (other modules/art must supply; none are bundled)
Sprites `npc_*`, `companion_*`, `boss_*`, portraits `portrait_*`, VFX `vfx_*`, music keys and ambience keys referenced in each `atmosphere`, enemy archetype ids used by `enemies[].type` (`ash_wolf, crown_soldier, thornling, rook_bandit, sand_scorpion, dune_raider, glass_serpent, sand_wraith, frost_wolf, ice_wraith, crown_scout, ironwatch_guard, crossbow_sentry, hushed_guard, hollow_shade, royal_champion, cellar_rat_swarm, sickened_stag` + bosses `sergeant_hobb, thornwarden, sandglass_colossus, captain_voss, hush_mother_vesk, chancellor_morrow`). Hazard `type` strings are descriptive; combat/player map them.

## 6. Narrative logic
Hidden variables Honor/Trust/Ambition/Mercy (−10…10). Choices carry `tags` that make party members react (loyalty ±, barks). Flags/counters gate dialogue, quests, hidden paths, gate options, companion fates and epilogue slides.
Endings = hard **gate** + **score**; `wanderer` is the fallback when no other gate is open.
| Ending | Gate (all must hold) |
|---|---|
| True King | final_throne ∧ Honor≥4 ∧ Trust≥3 ∧ ≥2 companions loyalty≥50 ∧ Mercy≥0 ∧ ¬aren_fell |
| Tyrant | final_claim ∧ (Ambition≥4 ∨ Honor≤0) |
| Hidden Truth | final_reveal ∧ ≥4 of 5 testament fragments ∧ ¬aren_fell |
| Fallen Hero | (Darken killed ∧ Honor≤1) ∨ (Trust≤−2 ∧ no loyal companion) ∨ Crown broken without the Queen's rite ∨ (claimed Crown ∧ Ambition<4 ∧ Honor>0) |
| Wanderer | fallback; boosted by walking away or the rite-based unbinding |

## 7. Delivered content
6 regions · 13 levels · 24 NPCs (incl. 5 speaker-only) · 45 dialogue trees / 168 nodes / 119 choices · 33 quests (6 main, 11 side, 6 exploration, 6 hidden, 4 companion) · 53 collectibles (incl. 5 testament fragments) · 24 POIs · 4 companions with 3 abilities, personal quests, loyalty, fates · 5 endings with conditional epilogues.

## 8. Tests (actually run)
`tsc -p .` (strict, 0 errors) then `node build/modules/world/tests/run-tests.js` → **102 assertions passed, 0 failed**. Covers: content cross-reference validation, initial state, conditional dialogue and effects, hidden path reveal, companion assist and cooldowns, save/restore round-trip, event emission (internal and external emitter), six scripted full playthroughs (Ch1→Ch6) reaching all five endings, and the same final choice producing different endings by path.

## 9. NOT done / untested
- **Not tested in a browser, Phaser, or on Android** (module has no rendering; integration with real scenes is unverified).
- **No art, audio, or sprite assets**; atmosphere data is a spec for the art team. "Existing art direction" was not supplied, so palettes are my own proposal and may need alignment.
- Level geometry is hand-authored coordinates, **never played**; jump spacing, reachability and difficulty are untested.
- Enemy/hazard `type` strings must be mapped by combat/player; several hazards (frostwind, avalanche, hush_zone) need engine behaviour I did not implement.
- Gold costs ("pay 200 gold", Qasim's 500) are **not enforced** (gold belongs to RPG module); `ironwatch_weakened/warned` flags are produced but combat must read them.
- Not every branch walked: only the choice paths used by the six playthroughs and unit checks. Companion death is supported but no story event kills a companion yet. Companion `left` is triggered only by loyalty ≤ threshold.
- Dialogue is English only; no localisation layer. Voice/portrait expression names (`mood`) are free strings.
- Balance of ending thresholds is tuned only against my scripted profiles; real players need playtesting.

## 10. Completion
Honest estimate: **~80 %** of the assigned module (all systems and data implemented and headless-tested; remaining 20 % is integration, playtesting, balancing, hazard/enemy mapping and content polish).
