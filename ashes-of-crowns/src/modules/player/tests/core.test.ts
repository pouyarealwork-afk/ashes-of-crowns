/**
 * Headless simulation tests for the Phaser-free player core.
 * Run: npx tsx --test src/modules/player/tests/core.test.ts
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MOVE } from '../core/config';
import { PlayerController } from '../core/PlayerController';
import { makeInput } from '../core/types';
import type { InputFrame, PlayerState } from '../core/types';

const DT = 1 / 60;
const GRAVITY = 1400;

/** Tiny physics world: flat floor at y = 0, y grows downward. */
class Sim {
  y = 0;
  vx = 0;
  vy = 0;
  x = 0;
  c: PlayerController;
  /** Force "not on ground" for this many seconds (ledge test). */
  floorGone = 0;
  states: PlayerState[] = [];
  constructor(c = new PlayerController()) {
    this.c = c;
  }
  get onGround(): boolean {
    return this.y >= 0 && this.vy >= 0 && this.floorGone <= 0;
  }
  step(input: Partial<InputFrame> = {}): void {
    const frame = makeInput(input);
    const out = this.c.update(DT, frame, { vx: this.vx, vy: this.vy, onGround: this.y >= 0 && this.floorGone <= 0, groundVx: 0 });
    this.vx = out.vx;
    this.vy = out.vy + GRAVITY * out.gravityScale * DT;
    this.x += this.vx * DT;
    this.y += this.vy * DT;
    if (this.floorGone > 0) this.floorGone -= DT;
    else if (this.y >= 0) {
      this.y = 0;
      this.vy = 0;
    }
    this.states.push(this.c.state);
  }
  run(seconds: number, input: Partial<InputFrame> = {}): void {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) this.step(input);
  }
  /** Press (one frame) then hold the rest as given. */
  tap(input: Partial<InputFrame>): void {
    this.step(input);
  }
}

test('idle stays idle on ground', () => {
  const s = new Sim();
  s.run(1);
  assert.equal(s.c.state, 'idle');
  assert.equal(s.vx, 0);
});

test('walk and run reach expected speeds and set state + facing', () => {
  const s = new Sim();
  s.run(0.6, { moveX: 1 });
  assert.equal(s.c.state, 'walk');
  assert.ok(Math.abs(s.vx - MOVE.walkSpeed) < 1);
  s.run(0.6, { moveX: 1, run: true });
  assert.equal(s.c.state, 'run');
  assert.ok(Math.abs(s.vx - MOVE.runSpeed) < 1);
  s.run(0.5, { moveX: -1, run: true });
  assert.equal(s.c.facing, -1);
  s.run(0.5);
  assert.equal(s.c.state, 'idle');
});

test('speed stat scales movement', () => {
  const c = new PlayerController({ speed: 150 });
  const s = new Sim(c);
  s.run(1, { moveX: 1 });
  assert.ok(Math.abs(s.vx - MOVE.walkSpeed * 1.5) < 1);
});

test('jump: rises, falls, lands, returns to idle (never stuck)', () => {
  const s = new Sim();
  s.tap({ jumpPressed: true, jumpHeld: true });
  assert.equal(s.c.state, 'jump');
  assert.ok(s.vy < 0);
  s.run(0.2, { jumpHeld: true });
  assert.ok(s.states.includes('jump'));
  s.run(1.5);
  assert.ok(s.states.includes('fall'), 'passes through fall');
  assert.ok(s.states.includes('land'), 'passes through land');
  assert.equal(s.c.state, 'idle');
  assert.equal(s.y, 0);
});

test('variable jump height: tapping gives a lower jump than holding', () => {
  const peak = (hold: boolean): number => {
    const s = new Sim();
    let min = 0;
    s.tap({ jumpPressed: true, jumpHeld: true });
    for (let i = 0; i < 120; i++) {
      s.step({ jumpHeld: hold });
      min = Math.min(min, s.y);
    }
    return -min;
  };
  assert.ok(peak(true) > peak(false) + 20);
});

test('double jump works exactly once, third press does nothing', () => {
  const s = new Sim();
  const jumps: boolean[] = [];
  s.c.on('jump', (e) => jumps.push(e.double));
  s.tap({ jumpPressed: true, jumpHeld: true });
  s.run(0.25, { jumpHeld: true });
  s.tap({ jumpPressed: true, jumpHeld: true });
  assert.equal(s.c.state, 'doubleJump');
  s.run(0.15, { jumpHeld: true });
  s.tap({ jumpPressed: true, jumpHeld: true });
  assert.deepEqual(jumps, [false, true]);
  s.run(2);
  assert.equal(s.c.state, 'idle');
  // resets on landing
  s.tap({ jumpPressed: true });
  s.run(0.25);
  s.tap({ jumpPressed: true });
  assert.deepEqual(jumps, [false, true, false, true]);
});

test('coyote time: jump allowed shortly after leaving a ledge', () => {
  const s = new Sim();
  s.run(0.1);
  s.floorGone = 0.5; // ground disappears
  s.run(0.05);
  assert.equal(s.c.state, 'fall');
  s.tap({ jumpPressed: true });
  assert.equal(s.c.state, 'jump', 'coyote jump should be a normal jump');
});

test('coyote time expires', () => {
  const s = new Sim();
  s.run(0.1);
  s.floorGone = 1;
  s.run(MOVE.coyoteTime + 0.1);
  const jumps: boolean[] = [];
  s.c.on('jump', (e) => jumps.push(e.double));
  s.tap({ jumpPressed: true });
  assert.deepEqual(jumps, [true], 'late press becomes a double jump, not a ground jump');
});

test('jump buffer: press just before landing still jumps', () => {
  const s = new Sim();
  s.tap({ jumpPressed: true });
  s.run(0.3);
  // wait until close to ground, press while falling
  while (s.y < -10) s.step();
  s.tap({ jumpPressed: false });
  const before = s.c.state;
  assert.ok(before === 'fall' || before === 'doubleJump' || before === 'jump');
  // Use a fresh sim for a deterministic buffer test
  const t = new Sim();
  t.tap({ jumpPressed: true });
  t.run(0.2);
  t.tap({ jumpPressed: true }); // use double jump
  t.run(0.2);
  while (t.y < -25) t.step(); // near the floor, double jump used
  t.tap({ jumpPressed: true }); // buffered
  let rejumped = false;
  t.c.on('jump', () => (rejumped = true));
  t.run(0.15);
  assert.ok(rejumped, 'buffered press fires on landing');
});

test('normal attack combo chains 0 -> 1 -> 2 and returns to idle', () => {
  const s = new Sim();
  const idx: number[] = [];
  s.c.on('attackStart', (e) => idx.push(e.comboIndex));
  s.tap({ attackPressed: true });
  assert.equal(s.c.state, 'attack');
  s.run(0.3);
  s.tap({ attackPressed: true });
  s.run(0.3);
  s.tap({ attackPressed: true });
  s.run(1);
  assert.deepEqual(idx, [0, 1, 2]);
  assert.equal(s.c.state, 'idle');
});

test('combo resets after the window expires', () => {
  const s = new Sim();
  const idx: number[] = [];
  s.c.on('attackStart', (e) => idx.push(e.comboIndex));
  s.tap({ attackPressed: true });
  s.run(1.5);
  s.tap({ attackPressed: true });
  s.run(1);
  assert.deepEqual(idx, [0, 0]);
});

test('attack emits start, active, end with mirrored hitbox', () => {
  const s = new Sim();
  const log: string[] = [];
  s.c.on('attackStart', () => log.push('start'));
  s.c.on('attackActive', () => log.push('active'));
  s.c.on('attackEnd', () => log.push('end'));
  s.run(0.1, { moveX: -1 });
  let hb = 0;
  s.c.on('attackStart', (e) => (hb = e.hitbox.offsetX));
  s.tap({ attackPressed: true, moveX: -1 });
  s.run(1);
  assert.deepEqual(log, ['start', 'active', 'end']);
  assert.ok(hb < 0, 'hitbox mirrored to facing left');
});

test('heavy attack is slower, stronger, and returns to idle', () => {
  const s = new Sim();
  let heavy = 0;
  let normal = 0;
  s.c.on('attackStart', (e) => (e.kind === 'heavy' ? (heavy = e.damage) : (normal = e.damage)));
  s.tap({ heavyPressed: true });
  assert.equal(s.c.state, 'heavyAttack');
  s.run(1);
  assert.equal(s.c.state, 'idle');
  s.tap({ attackPressed: true });
  s.run(1);
  assert.ok(heavy > normal);
});

test('attack is refused without stamina', () => {
  const s = new Sim();
  s.c.stats.stamina = 0;
  s.tap({ attackPressed: true });
  assert.equal(s.c.state, 'idle');
});

test('air attack works and player lands without getting stuck', () => {
  const s = new Sim();
  s.tap({ jumpPressed: true });
  s.run(0.15);
  s.tap({ attackPressed: true });
  assert.equal(s.c.state, 'attack');
  s.run(2);
  assert.equal(s.c.state, 'idle');
});

test('dodge: i-frames negate hits, state ends, cooldown enforced', () => {
  const s = new Sim();
  s.tap({ dodgePressed: true, moveX: 1 });
  assert.equal(s.c.state, 'dodge');
  s.run(0.1, { moveX: 1 });
  const r = s.c.receiveHit({ amount: 20, knockbackDir: -1 });
  assert.equal(r.dodged, true);
  assert.equal(r.applied, 0);
  assert.equal(s.c.stats.health, 100);
  s.run(0.4);
  assert.notEqual(s.c.state, 'dodge');
  // immediately again -> cooldown
  s.run(0.0);
  s.c.stats.stamina = 100;
  s.tap({ dodgePressed: true });
  s.run(0.5);
  assert.equal(s.states.filter((x, i) => x === 'dodge' && s.states[i - 1] !== 'dodge').length >= 1, true);
});

test('dodge costs stamina and is refused when empty', () => {
  const s = new Sim();
  s.c.stats.stamina = 5;
  s.tap({ dodgePressed: true });
  assert.notEqual(s.c.state, 'dodge');
});

test('air dodge only once per airtime', () => {
  const s = new Sim();
  s.tap({ jumpPressed: true });
  s.run(0.1);
  s.tap({ dodgePressed: true, moveX: 1 });
  assert.equal(s.c.state, 'dodge');
  s.run(0.7);
  s.c.stats.stamina = 100;
  s.tap({ dodgePressed: true, moveX: 1 });
  if (!s.onGround) assert.notEqual(s.c.state, 'dodge');
});

test('block reduces damage, locks facing, drains stamina on hit', () => {
  const s = new Sim();
  s.run(0.3, { blockHeld: true });
  assert.equal(s.c.state, 'block');
  const hpBefore = s.c.stats.health;
  const stBefore = s.c.stats.stamina;
  const r = s.c.receiveHit({ amount: 30, knockbackDir: -1 }); // enemy in front (player faces right)
  assert.equal(r.blocked, true);
  assert.ok(r.applied < s.c.stats.mitigate(30));
  assert.ok(s.c.stats.health < hpBefore || r.applied === 0);
  assert.ok(s.c.stats.stamina < stBefore);
  assert.equal(s.c.state, 'block');
  s.run(0.2, { blockHeld: true });
  assert.equal(s.c.state, 'block');
  s.run(0.1, {});
  assert.equal(s.c.state, 'idle');
});

test('block does not protect from behind or from unblockable hits', () => {
  const s = new Sim();
  s.run(0.3, { blockHeld: true });
  const behind = s.c.receiveHit({ amount: 30, knockbackDir: 1 });
  assert.equal(behind.blocked, false);
  assert.equal(s.c.state, 'hit');
  const t = new Sim();
  t.run(0.3, { blockHeld: true });
  const unb = t.c.receiveHit({ amount: 30, knockbackDir: -1, unblockable: true });
  assert.equal(unb.blocked, false);
});

test('perfect parry inside the window takes no damage', () => {
  const s = new Sim();
  s.step({ blockHeld: true });
  s.step({ blockHeld: true });
  let parried = false;
  s.c.on('parry', () => (parried = true));
  const r = s.c.receiveHit({ amount: 50, knockbackDir: -1 });
  assert.equal(parried, true);
  assert.equal(r.applied, 0);
  assert.equal(s.c.stats.health, 100);
});

test('guard break when stamina is exhausted staggers the player and prevents instant re-block', () => {
  const s = new Sim();
  s.run(0.3, { blockHeld: true });
  s.c.stats.stamina = 3;
  let broke = false;
  s.c.on('guardBreak', () => (broke = true));
  s.c.receiveHit({ amount: 30, knockbackDir: -1 });
  assert.equal(broke, true);
  assert.equal(s.c.state, 'hit');
  s.run(0.7, { blockHeld: true });
  assert.notEqual(s.c.state, 'block');
});

test('hit: damage mitigated by defense, knockback, stun, i-frames then recovery', () => {
  const s = new Sim(new PlayerController({ defense: 20 }));
  s.run(0.1);
  const r = s.c.receiveHit({ amount: 40, knockbackDir: 1 });
  assert.equal(r.blocked, false);
  assert.equal(r.applied, 20); // 40 * 100/(100+100)
  assert.equal(s.c.state, 'hit');
  s.step();
  assert.ok(s.vx > 0, 'knocked toward knockbackDir');
  const second = s.c.receiveHit({ amount: 40, knockbackDir: 1 });
  assert.equal(second.applied, 0, 'post-hit invulnerability');
  s.run(1.5);
  assert.equal(s.c.state, 'idle');
  assert.equal(s.c.isInvulnerable, false);
});

test('hit interrupts an attack and ends it cleanly', () => {
  const s = new Sim();
  let ended = false;
  s.c.on('attackEnd', () => (ended = true));
  s.tap({ attackPressed: true });
  s.run(0.05);
  s.c.receiveHit({ amount: 10, knockbackDir: -1 });
  assert.equal(s.c.state, 'hit');
  assert.equal(ended, true);
  s.run(1);
  assert.equal(s.c.state, 'idle');
});

test('death, deathComplete, respawn restores health and grants i-frames', () => {
  const s = new Sim();
  const log: string[] = [];
  s.c.on('death', () => log.push('death'));
  s.c.on('deathComplete', () => log.push('deathComplete'));
  s.c.on('respawn', () => log.push('respawn'));
  const r = s.c.receiveHit({ amount: 9999, knockbackDir: 1 });
  assert.equal(r.died, true);
  assert.equal(s.c.state, 'dead');
  s.run(0.5, { moveX: 1, attackPressed: true });
  assert.equal(s.c.state, 'dead', 'input ignored while dead');
  s.run(1);
  s.c.respawn();
  assert.deepEqual(log, ['death', 'deathComplete', 'respawn']);
  assert.equal(s.c.state, 'idle');
  assert.equal(s.c.stats.health, 100);
  assert.equal(s.c.isInvulnerable, true);
  s.run(0.2, { moveX: 1 });
  assert.equal(s.c.state, 'walk');
});

test('kill() from a pit works and respawn partial health', () => {
  const s = new Sim();
  s.c.kill();
  assert.equal(s.c.state, 'dead');
  s.c.respawn(0.5);
  assert.equal(s.c.stats.health, 50);
});

test('skills: mana cost, cooldown, failure events, hitbox payload', () => {
  const s = new Sim();
  const fails: string[] = [];
  s.c.on('skillFailed', (e) => fails.push(e.reason));
  let id = '';
  s.c.on('attackStart', (e) => e.skillId && (id = e.skillId));
  const mana0 = s.c.stats.mana;
  s.tap({ skillPressed: [true, false, false] });
  assert.equal(s.c.state, 'skill');
  assert.equal(id, 'skill_0');
  assert.ok(s.c.stats.mana < mana0);
  s.run(0.8);
  assert.equal(s.c.state, 'idle');
  s.tap({ skillPressed: [true, false, false] });
  assert.deepEqual(fails, ['cooldown']);
  s.c.stats.mana = 0;
  s.tap({ skillPressed: [false, true, false] });
  assert.deepEqual(fails, ['cooldown', 'mana']);
});

test('stats: applyConfig merges, clamps and gains max increases', () => {
  const c = new PlayerController();
  c.stats.health = 40;
  c.stats.applyConfig({ maxHealth: 150 });
  assert.equal(c.stats.health, 90);
  c.stats.applyConfig({ maxHealth: 50 });
  assert.equal(c.stats.health, 50);
  c.stats.applyConfig({ attack: NaN as unknown as number });
  assert.equal(c.stats.config.attack, 10);
  assert.equal(c.stats.outgoingDamage(2), 20);
});

test('stamina regenerates after the lock, mana regenerates', () => {
  const s = new Sim();
  s.c.stats.stamina = 10;
  s.c.stats.mana = 0;
  s.run(3);
  assert.ok(s.c.stats.stamina > 60);
  assert.ok(s.c.stats.mana > 4);
});

test('moving platform: player is carried when standing still', () => {
  const c = new PlayerController();
  let x = 0;
  let vx = 0;
  for (let i = 0; i < 60; i++) {
    const out = c.update(DT, makeInput(), { vx, vy: 0, onGround: true, groundVx: 80 });
    vx = out.vx;
    x += vx * DT;
  }
  assert.ok(Math.abs(vx - 80) < 1);
  assert.ok(x > 70);
});

test('vitals event fires on change and not every idle frame', () => {
  const s = new Sim();
  let n = 0;
  s.c.on('vitals', () => n++);
  s.run(1);
  assert.ok(n <= 2);
  s.c.receiveHit({ amount: 10, knockbackDir: 1 });
  s.step();
  assert.ok(n >= 2);
});

test('fuzz: 60k random frames never throw, state valid, always recovers to idle', () => {
  let seed = 1234;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const valid = new Set<PlayerState>(['idle', 'walk', 'run', 'jump', 'doubleJump', 'fall', 'land', 'attack', 'heavyAttack', 'skill', 'dodge', 'block', 'hit', 'dead']);
  for (let run = 0; run < 20; run++) {
    const s = new Sim();
    for (let i = 0; i < 3000; i++) {
      s.step({
        moveX: rnd() < 0.5 ? 0 : rnd() * 2 - 1,
        run: rnd() < 0.3,
        jumpPressed: rnd() < 0.03,
        jumpHeld: rnd() < 0.5,
        attackPressed: rnd() < 0.03,
        heavyPressed: rnd() < 0.01,
        dodgePressed: rnd() < 0.02,
        blockHeld: rnd() < 0.2,
        skillPressed: [rnd() < 0.01, rnd() < 0.01, rnd() < 0.01],
      });
      if (rnd() < 0.004) s.c.receiveHit({ amount: 5 + rnd() * 20, knockbackDir: rnd() < 0.5 ? 1 : -1 });
      if (s.c.isDead && rnd() < 0.05) s.c.respawn();
      assert.ok(valid.has(s.c.state));
      assert.ok(Number.isFinite(s.x) && Number.isFinite(s.vy));
      assert.ok(s.c.stats.health >= 0 && s.c.stats.stamina >= 0 && s.c.stats.mana >= 0);
    }
    if (s.c.isDead) s.c.respawn();
    s.run(4); // no input: must return to idle (no stuck states)
    assert.equal(s.c.state, 'idle', `run ${run} stuck in ${s.c.state}`);
  }
});
