# ASHES OF CROWNS — Module 4: RPG Progression, Inventory & Crafting

Location: `src/modules/rpg/`. Pure TypeScript, **no Phaser/DOM dependency** (works in Phaser 3 + Vite + Android browsers, runs headless in Node for tests).
Touches no shared file. Does not touch `package.json`, the entry point or any other module.

## 1. Initialization
```ts
import { RpgModule } from '../rpg';
const rpg = new RpgModule({ bus: this.game.events /* optional */, snapshot: savedJsonOrUndefined });
// each frame, from the active scene:
rpg.update(delta);           // ticks buffs + cooldowns (ms)
// on save:   persistence.save('rpg', rpg.serialize());      // plain JSON
// on load:   rpg.load(json)   (or pass `snapshot` to the constructor)
```
Create **one** instance and share it. Without `snapshot` a new game starts (50 gold, Rusted Sword + Ragged Tunic equipped, 3 Minor Health Potions).
Dependencies: none at runtime. Dev: `tsc` + Node for tests. Imports use extensionless paths (Vite-style); only import from `src/modules/rpg/index.ts`.

## 2. Public API (all on the `rpg` instance)
| Area | Members |
|---|---|
| Stats | `getStats()`, `getPassives()`, `getRegenPerSecond()`, `stats.getBreakdown(stat)`, `getLevel()`, `getGold()`, `getShards()` |
| XP/levels | `progression.addXp(n, source)`, `.level/.xp/.skillPoints/.cap`, `.xpForNextLevel()`, `.progress()` |
| Skills | `skills.getTree(id)`, `.rankUp(id)`, `.respec()`, `.getHotbar()`, `.setHotbar(slot,id)`, `.tryUseAbility(id,{mana,stamina})`, `.getAbilityCost(id)`, `.buildEffect(id)`, `.cooldownRemaining(id)` |
| Combat math | `combat.calcDamage(input)`, `.calcAbilityDamage(effect,{behind,targetHpPct,targetDefense})`, `.calcDotPerSecond(effect)`, `.mitigateIncoming(raw)`, `.rollDodge()`, `.isInvulnerable()` |
| Inventory | `inventory.add/remove/removeUid/count/has/canAdd/get/list(query)/describe(inst)/sell(uid,qty)/sellJunk()` |
| Equipment | `equipment.equip(uid,slot?)`, `.unequip(slot)`, `.compare(uid)`, `.getEquipped()`, `.autoEquipBest()` |
| Consumables | `consumables.use(uid)`, `.useByDefId(id)` → returns `{heal,mana,stamina,xp,buffId}` |
| Crafting | `crafting.setStation('blacksmith'\|'alchemist'\|null)`, `.getRecipes()`, `.canCraft()`, `.craft(id,qty)`, `.learnRecipe(id)`, `.getUpgradePreview(uid)`, `.upgrade(uid)`, `.getBlacksmithView()` |
| Economy/shops | `economy.addGold/addShards/spend/canAfford`, `shops.listShops(region)`, `.getShop(id)`, `.buy(shop,item,qty)`, `.sell(shop,uid,qty)`, `.sellPriceFor()`, `.restock()` |
| Loot | `loot.rollEnemyDrops(info)`, `loot.grant(bundle,source)`, `loot.onEnemyKilled(info)` |
| Skins | `skins.list()`, `.equip(id)`, `.getEquipped()` |
| Achievements | `achievements.list()` |
| New Game+ | `ngPlus.canStart()`, `.start()`, `.getScaling()`, `.cycle` |
| Story hooks | `setStoryFlag(flag)`, `notifyQuestCompleted(id, rewards?)`, `notifyBossDefeated(id)`, `notifyEnding(endingId)` |

Every mutating call returns `{ ok: true, ... }` or `{ ok: false, reason, message }` (`ERROR_MESSAGES` maps codes to UI text).

## 3. Events
Emitted through `rpg.events.on(name, fn)` **and** forwarded to the external bus if one is connected (single payload argument):
`rpg:stats-changed`, `rpg:xp-gained`, `rpg:level-up` (`fullRestore: true` → player module should refill HP/mana/stamina), `rpg:inventory-changed`, `rpg:item-added`, `rpg:loot-overflow`, `rpg:equipment-changed`, `rpg:consumable-used` (**player module must apply `heal/mana/stamina`**), `rpg:gold-changed`, `rpg:shards-changed`, `rpg:purchase`, `rpg:sale`, `rpg:skill-ranked`, `rpg:skills-respec`, `rpg:hotbar-changed`, `rpg:ability-used` (**combat module must execute `effect`**), `rpg:buff-added`, `rpg:buff-expired`, `rpg:recipe-learned`, `rpg:craft-complete`, `rpg:item-upgraded`, `rpg:station-changed`, `rpg:skin-unlocked`, `rpg:skin-equipped` (`textureKey`), `rpg:achievement-unlocked`, `rpg:new-game-plus` (**world/quest modules must reset their own progress**), `rpg:reward-granted`.

Listened to on the external bus (after `connectBus`/`bus` option):
| Event | Payload |
|---|---|
| `enemy:killed` | `{ enemyId, tier: 'minion'\|'elite'\|'miniboss'\|'boss', level, region, isBoss? }` — grants XP/gold/shards/drops. Emit for **every** kill incl. bosses |
| `quest:completed` | `{ questId, rewards?: { xp, gold, shards, items:[{itemId,qty}], recipes } }` |
| `boss:defeated` | `{ bossId }` (progress only, no loot) |
| `story:flag` | `{ flag, value? }` |
| `ending:reached` | `{ endingId: 'true_king'\|'tyrant'\|'wanderer'\|'hidden_truth'\|'fallen_hero' }` |
| `shops:restock` | `{}` |
| `station:open` / `station:close` | `{ station }` / `{}` |

## 4. Integration by module
**Player** — Final stats: `getStats()` (`health/mana/stamina` are *maximums*; `speed` is a % baseline: multiply your base move speed by `speed/100`; `critChance` 0..1). Keep current HP/mana/stamina yourself; apply `getRegenPerSecond()`; apply `rpg:consumable-used` and `rpg:level-up`. Swap spritesheet on `rpg:skin-equipped` (`textureKey`). Dodge: `combat.rollDodge()`.
**Combat** — Basic attack: `combat.calcDamage({ multiplier: 1, targetDefense })` → `{damage, crit, lifestealHeal}`. Abilities: `skills.tryUseAbility(id, {mana, stamina})`; deduct returned `manaCost/staminaCost`, then execute `use.effect` (`kind`, `radius`, `slowPct`, `dashDistance`, `invulnMs`, `healPct`, `dotMultiplierPerSec`, ...) and use `calcAbilityDamage` per target. Incoming: `combat.mitigateIncoming(raw)` (0 while Unbreakable/Shadow Step invulnerability). On every kill emit `enemy:killed`. In NG+ apply `ngPlus.getScaling()` (`enemyHealthMult`, `enemyDamageMult`) to enemies.
**World** — Emit the bus events above; call `crafting.setStation('blacksmith')` when the player opens Brann's forge (and `'alchemist'`, `null` on close) — crafting and upgrades refuse otherwise. Shops: ids `ashen_blacksmith, ashen_apothecary, forest_herbalist, desert_trader, highland_forgemaster, hollow_black_market, crownfall_quartermaster` (`shops.listShops(regionId)`). Listen to `rpg:loot-overflow` to spawn ground pickups; `rpg:new-game-plus` to reset the world.
**UI** — Everything needed is view-model shaped: `inventory.list(query)` + `inventory.describe(inst)` (`ItemView` with rarity colour, stat lines, sell price), `equipment.compare(uid)`, `skills.getTree(id)` (nodes with `rank`, `canRank`, `blockedReason`, `tier/col` layout), `crafting.getBlacksmithView()`, `shops.getShop(id)`, `skins.list()`, `achievements.list()`. Subscribe to `rpg:*` events to refresh.
**Persistence** — Store `rpg.serialize()` (plain JSON, versioned). Buffs/cooldowns/station are intentionally not saved. `load()` tolerates missing fields.

## 5. Data structures
Types are exported from `index.ts` (`RpgState`, `ItemDef`, `ItemInstance`, `StatMod`, `AbilityEffect`, `RewardBundle`, `NgPlusScaling`, ...). Content tables: `data/items.ts` (70 items: 13 weapons, 9 armor, 7 helmets, 6 rings, 6 amulets, 12 consumables, 11 materials, 6 quest items), `data/skills.ts` (3 trees × 8–9 nodes), `data/recipes.ts` (31), `data/shops.ts` (7), `data/skins.ts` (default + 5), `data/achievements.ts` (14), `data/loot.ts`, `data/config.ts` (all balance constants).

## 6. Rules summary
Stats = (base + 12 HP/2 ATK/1.2 DEF/4 mana/3 stamina per level + flat bonuses) × (1 + % bonuses), clamped. Level cap 30 (+10 per NG+ cycle, max 3). 1 skill point per level, +1 on levels divisible by 5 (35 by level 30; maxing a tree costs 27/30/32 points (Warrior/Arcane/Shadow), so builds must specialise). Upgrades: +1…+3/5/7/9/10 by rarity, +10% to flat HP/ATK/DEF/mana/stamina per level, cost scales by tier and needs Ancient Shards from +7. Sell = 40% of value (+25%/upgrade level). NG+ keeps everything except quest items/story flags/50% gold; +3 skill points; enemies ×(1+0.6c) HP, ×(1+0.4c) damage; XP/gold/shards/rarity bonuses; shop prices +15%/cycle.

## 7. Required assets (NOT delivered — no art was supplied and the existing art direction must be preserved)
Item icons `icon_<itemId>` (70), skill icons `skill_<skillId>` (26), player skin textures `player_skin_<skinId>` (6). The module only references these keys; UI should fall back gracefully if a texture is missing.

## 8. Running the tests
`sh src/modules/rpg/tests/run.sh` (needs `tsc` and Node). Last run: strict Vite-style type check clean (`strict`, `noUnused*`, `verbatimModuleSyntax`, `erasableSyntaxOnly`); **85 passed, 0 failed**.

## 9. Not done / known limitations
- Not run inside a real Phaser/Vite project, a browser, or on Android (no project was supplied) — only headless Node tests. Integration with the other modules is by contract only and **unverified**.
- No UI scenes, no art, no sound (UI/art belong to other modules/teams).
- No persistence backend (returns/accepts snapshots only).
- Missing nice-to-haves: shop buy-back, random affixes/item sets, gem sockets, per-item cooldown tuning, item destruction/lock flags, drag-and-drop ordering of bag slots.
- Stats are cached: mutating `rpg.ctx.state` directly (bypassing the API) requires calling `rpg.ctx.statsChanged()`.
- Balance is simulated, not playtested. Headless sim: ~1,200 kills to reach level 30 (kills/level 5–69). The sim auto-sells all gear, so its gold total (~46k) overstates real income; real-world tuning of `data/loot.ts` / `data/config.ts` will be needed.
- Quest/boss/story IDs used by skins (`q_ashen_forge_oath`, `boss_hollow_sentinel`, `story_crownfall_gates`, flags `ending_<id>`, `learned_*`) are my assumptions — the quest/world module must emit matching IDs or the table in `data/skins.ts`/`data/recipes.ts` must be edited.
