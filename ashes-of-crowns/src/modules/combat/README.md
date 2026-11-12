# ASHES OF CROWNS — Module 2: Combat

A standalone combat module designed against the actual contracts in the supplied Player, World, RPG, UI and Persistence module ZIPs. The public module path is `src/modules/combat/`.

## Included systems

- 18 enemy archetypes used by the World module, plus all six named bosses.
- Three-phase boss framework with phase thresholds at 65% and 30% health, telegraphs and phase/pattern events.
- Enemy AI profiles: melee, ranged, charger, flying, ambusher, support and boss.
- Level and elite scaling, patrol movement, aggro, wind-up attacks and ranged projectiles.
- Player hitbox collision, combo tracking, critical hits, defense/resistance, stun/knockback and one-hit-per-swing protection.
- Status effects: burn, poison, bleed, slow, stun, weaken and mark (tick/expiry framework; damage-over-time is wired for burn/poison/bleed payloads).
- RPG ability execution through `RpgModule.skills.tryUseAbility()` and `RpgModule.combat.calcAbilityDamage()`.
- Automatic RPG stat/hotbar synchronization to the supplied Player instance.
- Companion assist requests compatible with `WorldModule.requestAssist()` / `world:companion-assist-actions`.
- World hazard contact mapping for the hazard types used in World level data.
- Runtime-generated placeholder enemy/projectile textures; no external art asset is required to load the adapter.

## Dependencies

- TypeScript 5+
- Phaser 3.60+ (peer dependency, only for `CombatWorld`)
- Sibling project modules: `src/modules/player/` and `src/modules/rpg/`
- No third-party runtime dependency for the Phaser-free `CombatEngine` core.

## Basic integration

Create Player, RPG and World instances in the game bootstrap, then create the combat adapter in the gameplay Scene after the Player exists:

```ts
import { CombatWorld } from './modules/combat';
import { RpgModule } from './modules/rpg';
import { createWorldModule } from './modules/world';

const bus = this.game.events;
const rpg = new RpgModule({ bus });
const world = createWorldModule({ emitter: bus });
const player = new Player(this, { x: 120, y: 400, touch: true });

const runtime = world.getLevelRuntime('ashen_village_main');
const combat = new CombatWorld({
  scene: this,
  player,
  rpg,
  region: 'ashen_village',
  level: 1,
  spawns: runtime?.level.enemies ?? [],
  hazards: runtime?.level.hazards ?? [],
  ground: platformGroup,
});

// On a scene transition, destroy the old CombatWorld and create a new one
// with the next level's runtime data.
```

If `ground` is supplied in the constructor, it is retained and colliders are added as enemies spawn. Or call `combat.addGround(platformGroup)` after construction.

### RPG abilities

The adapter reads the RPG hotbar and unlocked abilities, maps them into the Player module's three skill slots, and listens to RPG stat/hotbar/skill events. It also synchronizes final RPG stats into Player, including maximum vitals and mana/stamina regeneration; health regeneration, mana-on-kill, lifesteal, damage-reduction, passive dodge and RPG invulnerability are bridged during combat. Pressing a Player skill slot starts the corresponding Player skill animation; the combat adapter then calls the RPG ability validator, spends the returned mana/stamina costs exactly once, and applies the effect to valid targets. Do not separately spend the same ability cost in the game bootstrap.

### Companion assists

`CombatWorld` requests companion assists while enemies are present (roughly every 1.2 seconds). The World module should be attached to the same game event bus. Its `world:companion-assist-actions` response is consumed by CombatWorld.

### World hazards

Pass `runtime.level.hazards` into `hazards`. The adapter checks player/hazard overlap and calls `Player.takeHit()`, with special handling for pits/void, fire/ember and avalanche; slow-zone details are emitted as `combat:hazard-effect` for the level environment controller. Hazard geometry is taken directly from the World module's level data.

## Event contracts

The adapter uses the shared `game.events` bus. Important emitted events:

| Event | Payload / consumer |
|---|---|
| `combat:enemy-spawned` | `{enemyId, enemyType, x, y, tier}` |
| `combat:enemy-defeated` | Ordinary enemy kill; World module updates kill counters |
| `combat:boss-defeated` | `{bossId, enemyId}`; World and Persistence modules |
| `enemy:killed` | `{enemyId, tier: minion\|elite\|boss, level, region, isBoss}`; RPG loot/reward system |
| `boss:defeated` | `{bossId}`; RPG boss progression |
| `combat:boss-phase` / `combat:boss-pattern` | Boss phase and pattern changes |
| `combat:player-hit` | Enemy hit result against Aren |
| `combat:combo` | Combo count and damage multiplier hint |
| `combat:assist-request` | Context for World companion abilities |
| `combat:hazard-hit` | Environmental damage result |
| `combat:ability-used` | Ability id, kind and target count |

**Important event compatibility detail:** the World module subscribes to `combat:enemy-defeated` for ordinary enemies and `combat:boss-defeated` for bosses. Combat emits one of those paths per defeated enemy to avoid double-counting boss kills. The RPG module separately receives `enemy:killed` and `boss:defeated`.

The Player module emits `player:death`; CombatWorld mirrors it as `player:died` because that is the event name currently listened to by the World module. The Player module remains authoritative for final defense, block, parry, hit-stun and death handling; CombatWorld applies RPG damage-reduction/dodge/invulnerability passives before forwarding the hit.

## Core-only tests

```bash
tsc -p tsconfig.core.json
node src/modules/combat/tests/run-tests.cjs
```

The core build intentionally excludes the Phaser adapter because this isolated delivery environment does not contain the project's Phaser package. In the full game repository, install/use the same Phaser 3 dependency as the Player module and run `tsc -p tsconfig.combat.json` or the project's main TypeScript configuration.

## Integration notes / not yet verified

- The pure TypeScript combat core is strict-typechecked and headless-tested in this delivery.
- `CombatWorld` is written against Phaser 3.60+ and the actual Player/RPG/World public APIs, but it has not been typechecked against an installed Phaser package or run inside the final game scene because the full game repository and Phaser dependency are not present in this workspace.
- Enemy silhouettes and projectiles are runtime-generated placeholders, not final production art.
- The module does not own level geometry, camera, player movement, saves, UI or the story; those remain owned by their respective modules.
- Full gameplay balance, boss arena reachability, mobile performance and browser/device integration require the final assembled game.
