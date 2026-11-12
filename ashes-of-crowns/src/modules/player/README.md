# Player module — ASHES OF CROWNS (Module 1)

Playable character **Aren**: movement, physics glue, actions, animation, mobile controls, camera, checkpoint respawn.
Everything lives in `src/modules/player/`. No shared file is modified.

## Layout
```
core/      Phaser-free logic (state machine, motor, stats, damage rules) — unit-tested
phaser/    Phaser 3 adapter: Player sprite, InputSystem, TouchControls, PlayerCamera, animations, procedural art
tests/     core.test.ts (headless simulation)
index.ts   public API
```

## Dependencies
Phaser 3.60+ (Arcade Physics enabled, gravity.y > 0). TypeScript strict. No other packages.
`tsconfig`: `"target": "ES2020"`, `"moduleResolution": "Bundler"`.

## Initialize
```ts
import { Player, PLAYER_OUT, PLAYER_IN } from '../modules/player';

// in the gameplay Scene.create():
this.physics.world.setBounds(0, 0, levelW, levelH);
const aren = new Player(this, {
  x: 120, y: 400,
  stats: { maxHealth: 120, attack: 14, defense: 6, speed: 105, maxMana: 60, maxStamina: 110 },
  camera: { bounds: { x: 0, y: 0, width: levelW, height: levelH } },
  touch: true,                 // joystick+buttons on touch devices; { forceVisible: true } for desktop testing
});
aren.addGround(groundLayerOrGroup);          // solid collisions (+ carries on moving platforms)
aren.addOneWayPlatforms(ledgeGroup);         // optional jump-through ledges
```
The Player hooks `scene.events.UPDATE` itself and cleans up on scene SHUTDOWN. No `update()` call needed.
Arcade game config must include `physics: { default: 'arcade', arcade: { gravity: { y: 1400 } } }` (1400 matches the tuning).
For multi-pointer touch set `input: { activePointers: 4 }` in the Phaser config (TouchControls also calls `input.addPointer(3)`).

## Public methods (`Player`)
| Method | Purpose |
|---|---|
| `applyStats(partial, refill?)` | RPG module pushes Health/Attack/Defense/Speed/Mana/Stamina (`maxHealth, attack, defense, speed, maxMana, maxStamina, staminaRegen, manaRegen`) |
| `takeHit(IncomingHit)` → `DamageResult` | Combat module damages the player (handles block, parry, dodge i-frames, defense, knockback, death) |
| `heal(n)`, `setSkills(SkillDef[])` | RPG hooks |
| `setCheckpoint(x,y)`, `respawn()` | Checkpoint integration |
| `lockInput(bool)`, `setInputProvider(fn)` | Cutscenes / dialogue / AI / replays |
| `getActiveHitbox()`, `getHitboxRect(ev)` | World-space attack rectangle for combat overlap tests |
| `addGround(target)`, `addOneWayPlatforms(target)` | Collision registration |
| `.controller`, `.stats`, `.facing`, `.playerState`, `.touch`, `.cameraRig` | Access to internals |

## Events
Emitted on the Player sprite (`aren.on('attackStart', …)`) **and** on `game.events` with prefix `player:` (see `PLAYER_OUT`):
`stateChanged{from,to}`, `jump{double}`, `land{fallSpeed,hard}`, `dodge{facing,airborne}`, `blockStart`, `blockEnd`, `parry{hit}`, `guardBreak`,
`attackStart|attackActive|attackEnd: AttackEvent` (kind normal/heavy/skill, comboIndex, damage, hitbox, activeFrom/activeFor, skillId),
`skillFailed{slot,reason}`, `damaged{result,hit,health}`, `death`, `deathComplete`, `respawn`, `respawned{x,y}`, `vitals{health,maxHealth,mana,maxMana,stamina,maxStamina}`, `ready(Player)`.

Listened to on `game.events` (see `PLAYER_IN`): `player:cmd:hit` (IncomingHit), `:heal` (number), `:stats` (Partial stats or `{stats, refill}`),
`:checkpoint` ({x,y}), `:skills` (SkillDef[]), `:lockInput` (bool), `:touchVisible` (bool), `:respawn`, `:kill`.

## Data structures
`IncomingHit { amount, knockbackDir: 1|-1, knockback?, piercing?, unblockable? }` — `knockbackDir` is the direction the player is pushed (away from the enemy).
`DamageResult { applied, blocked, dodged, died }`. `AttackEvent` as above; its `hitbox` is relative to the body centre and already mirrored by facing.
`SkillDef { slot 0..2, id, manaCost, duration, cooldown, damageMul?, width?, height?, activeFrom?, activeFor? }`.

## Assets
None required. Aren's sprite sheet (16 animations) is generated procedurally into texture `aren`.
To use hand-drawn art: load an atlas under any key and pass `textureKey`. Frame names `${anim}_${i}`, 64×64, feet at the bottom, facing right.
Frame counts are in `phaser/animations.ts` (`ANIM_DEFS`).

## Animation states
idle, walk, run, jump, doubleJump, fall, land, attack0-2 (combo), heavy, skill, dodge, block, hit, dead. Action animations are time-scaled to their state duration, so they always finish with the state.

## Default controls
Keyboard: ←/→ or A/D move (Ctrl = walk), Space/↑/W jump (hold = higher, again in air = double jump), Z/J attack, X/K heavy, C/L dodge, V/Shift block, 1/2/3 skills.
Touch: floating joystick (left half), JUMP / ATK / HVY / DODGE / BLOCK / S1-S3 buttons, multi-touch, skill cooldown + mana greying.

## Tests
`npx tsx --test src/modules/player/tests/core.test.ts` (32 tests, incl. 60k-frame randomized stuck-state fuzz).
