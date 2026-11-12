import Phaser from 'phaser';

export interface TouchFrame {
  moveX: number;
  run: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attackPressed: boolean;
  heavyPressed: boolean;
  dodgePressed: boolean;
  blockHeld: boolean;
  skillPressed: [boolean, boolean, boolean];
}

type ButtonId = 'jump' | 'attack' | 'heavy' | 'dodge' | 'block' | 'skill0' | 'skill1' | 'skill2';

interface Button {
  id: ButtonId;
  x: number; // fractions of the viewport (0..1) for layout
  y: number;
  r: number; // radius in px at 720p reference
  label: string;
  color: number;
  hit: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  text: Phaser.GameObjects.Text;
  pointerId: number | null;
  pressedEdge: boolean;
}

export interface TouchControlsOptions {
  /** Show on desktop too (default: only when a touch device is detected). */
  forceVisible?: boolean;
  /** Display depth. */
  depth?: number;
  /** Joystick radius at reference size. */
  joystickRadius?: number;
}

/**
 * On-screen joystick + action buttons. Multi-touch safe: each control owns the pointer id that
 * pressed it. Uses the scene's input (needs `input.addPointer(3)` which this class does).
 * Rendered with scrollFactor 0 so it stays fixed; re-lays out on resize.
 */
export class TouchControls {
  private scene: Phaser.Scene;
  private buttons: Button[] = [];
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private stickZone!: Phaser.GameObjects.Zone;
  private stickPointer: number | null = null;
  private stickOrigin = new Phaser.Math.Vector2();
  private axis = 0;
  private visible: boolean;
  private opts: Required<TouchControlsOptions>;
  private container: Phaser.GameObjects.Container;
  private skillEnabled: [boolean, boolean, boolean] = [true, true, true];
  private cooldownOverlays: Phaser.GameObjects.Graphics[] = [];
  private cooldownFrac: [number, number, number] = [0, 0, 0];

  constructor(scene: Phaser.Scene, options: TouchControlsOptions = {}) {
    this.scene = scene;
    this.opts = { forceVisible: false, depth: 1000, joystickRadius: 70, ...options };
    const touch = scene.sys.game.device.input.touch;
    this.visible = this.opts.forceVisible || touch;
    scene.input.addPointer(3); // up to 5 simultaneous pointers
    this.container = scene.add.container(0, 0).setDepth(this.opts.depth).setScrollFactor(0);
    this.build();
    this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.releaseAll, this);
    this.container.setVisible(this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (!v) this.releaseAll();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Grey out a skill button (not enough mana, not unlocked). */
  setSkillEnabled(slot: 0 | 1 | 2, enabled: boolean): void {
    this.skillEnabled[slot] = enabled;
    const b = this.buttons.find((x) => x.id === (`skill${slot}` as ButtonId));
    if (b) b.ring.setAlpha(enabled ? 0.9 : 0.3);
  }

  /** 0..1 fraction of cooldown remaining, drawn as a clock overlay. */
  setSkillCooldown(slot: 0 | 1 | 2, fractionRemaining: number): void {
    this.cooldownFrac[slot] = Math.min(1, Math.max(0, fractionRemaining));
    this.drawCooldown(slot);
  }

  // ----------------------------------------------------------------- build / layout

  private build(): void {
    const s = this.scene;
    this.stickBase = s.add.circle(0, 0, this.opts.joystickRadius, 0x1b1410, 0.35).setStrokeStyle(3, 0xd9b26f, 0.6);
    this.stickKnob = s.add.circle(0, 0, this.opts.joystickRadius * 0.45, 0xd9b26f, 0.55).setStrokeStyle(2, 0xffe6b0, 0.8);
    this.stickZone = s.add.zone(0, 0, 10, 10).setOrigin(0, 0);
    this.container.add([this.stickBase, this.stickKnob]);

    const defs: Array<[ButtonId, number, number, number, string, number]> = [
      ['jump', 0.9, 0.78, 44, 'JUMP', 0x6fa8d9],
      ['attack', 0.78, 0.86, 40, 'ATK', 0xd96f6f],
      ['heavy', 0.84, 0.62, 34, 'HVY', 0xd9923f],
      ['dodge', 0.68, 0.9, 30, 'DODGE', 0x7fd98a],
      ['block', 0.1 + 0.2, 0.9, 30, 'BLOCK', 0xb7a0e0],
      ['skill0', 0.62, 0.18, 28, 'S1', 0xe0cf6f],
      ['skill1', 0.72, 0.14, 28, 'S2', 0xe0cf6f],
      ['skill2', 0.82, 0.18, 28, 'S3', 0xe0cf6f],
    ];
    for (const [id, x, y, r, label, color] of defs) {
      const hit = s.add.circle(0, 0, r, 0x1b1410, 0.45).setStrokeStyle(3, color, 0.9);
      const ring = s.add.circle(0, 0, r - 6, color, 0.18).setStrokeStyle(1, color, 0.9);
      const text = s.add
        .text(0, 0, label, { fontFamily: 'monospace', fontSize: '14px', color: '#f4e6c8', stroke: '#1b1410', strokeThickness: 3 })
        .setOrigin(0.5);
      this.container.add([hit, ring, text]);
      this.buttons.push({ id, x, y, r, label, color, hit, ring, text, pointerId: null, pressedEdge: false });
    }
    for (let i = 0; i < 3; i++) {
      const g = s.add.graphics();
      this.cooldownOverlays.push(g);
      this.container.add(g);
    }
  }

  private layout(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const k = Math.min(w, h) / 720; // scale controls with screen
    const sc = Math.max(0.7, Math.min(1.6, k));
    const jr = this.opts.joystickRadius * sc;
    // Joystick (fixed position at bottom-left, but floating origin is set on touch)
    this.stickOrigin.set(Math.max(jr + 24, w * 0.14), h - jr - 28);
    this.placeStick(this.stickOrigin.x, this.stickOrigin.y, 0, 0);
    this.stickBase.setRadius(jr);
    this.stickKnob.setRadius(jr * 0.45);
    // Left half of the screen is the joystick area.
    this.stickZone.setPosition(0, h * 0.25).setSize(w * 0.45, h * 0.75);

    for (const b of this.buttons) {
      let x = b.x * w;
      let y = b.y * h;
      // Keep inside screen with a margin.
      const r = b.r * sc;
      x = Math.min(w - r - 12, Math.max(r + 12, x));
      y = Math.min(h - r - 12, Math.max(r + 12, y));
      // Block sits just right of the joystick.
      if (b.id === 'block') {
        x = this.stickOrigin.x + jr + r + 30;
        y = h - r - 24;
      }
      b.hit.setPosition(x, y).setRadius(r);
      b.ring.setPosition(x, y).setRadius(r - 6 * sc);
      b.text.setPosition(x, y).setFontSize(Math.max(10, Math.round(14 * sc)));
    }
    for (let i = 0; i < 3; i++) this.drawCooldown(i as 0 | 1 | 2);
  }

  private placeStick(bx: number, by: number, dx: number, dy: number): void {
    this.stickBase.setPosition(bx, by);
    this.stickKnob.setPosition(bx + dx, by + dy);
  }

  private drawCooldown(slot: 0 | 1 | 2): void {
    const g = this.cooldownOverlays[slot];
    const b = this.buttons.find((x) => x.id === (`skill${slot}` as ButtonId));
    if (!g || !b) return;
    g.clear();
    const f = this.cooldownFrac[slot];
    if (f <= 0) return;
    g.fillStyle(0x000000, 0.55);
    g.slice(b.hit.x, b.hit.y, b.hit.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f, false);
    g.fillPath();
  }

  // ----------------------------------------------------------------- pointer handling

  private buttonAt(p: Phaser.Input.Pointer): Button | null {
    let best: Button | null = null;
    let bestD = Infinity;
    for (const b of this.buttons) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, b.hit.x, b.hit.y);
      // generous hit area: radius + 12px for fat fingers
      if (d <= b.hit.radius + 12 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.visible) return;
    const b = this.buttonAt(p);
    if (b && b.pointerId === null) {
      if (b.id.startsWith('skill')) {
        const slot = Number(b.id.slice(5));
        if (!this.skillEnabled[slot]) return;
      }
      b.pointerId = p.id;
      b.pressedEdge = true;
      b.hit.setFillStyle(b.color, 0.55);
      return;
    }
    // Joystick: any touch in the left zone that is not on a button.
    if (this.stickPointer === null && p.x < this.scene.scale.width * 0.45 && p.y > this.scene.scale.height * 0.25) {
      this.stickPointer = p.id;
      // floating joystick: base appears where the thumb lands, clamped to screen
      const jr = this.stickBase.radius;
      const ox = Phaser.Math.Clamp(p.x, jr + 10, this.scene.scale.width * 0.45);
      const oy = Phaser.Math.Clamp(p.y, jr + 10, this.scene.scale.height - jr - 10);
      this.stickOrigin.set(ox, oy);
      this.updateStick(p);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.visible) return;
    if (p.id === this.stickPointer) this.updateStick(p);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickPointer) {
      this.stickPointer = null;
      this.axis = 0;
      this.placeStick(this.stickOrigin.x, this.stickOrigin.y, 0, 0);
    }
    for (const b of this.buttons) {
      if (b.pointerId === p.id) {
        b.pointerId = null;
        b.hit.setFillStyle(0x1b1410, 0.45);
      }
    }
  }

  private updateStick(p: Phaser.Input.Pointer): void {
    const jr = this.stickBase.radius;
    let dx = p.x - this.stickOrigin.x;
    let dy = p.y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > jr) {
      dx = (dx / len) * jr;
      dy = (dy / len) * jr;
    }
    this.placeStick(this.stickOrigin.x, this.stickOrigin.y, dx, dy);
    const n = dx / jr; // -1..1
    const dead = 0.18;
    this.axis = Math.abs(n) < dead ? 0 : Math.sign(n) * Math.min(1, (Math.abs(n) - dead) / (1 - dead));
  }

  private releaseAll(): void {
    this.stickPointer = null;
    this.axis = 0;
    this.placeStick(this.stickOrigin.x, this.stickOrigin.y, 0, 0);
    for (const b of this.buttons) {
      b.pointerId = null;
      b.pressedEdge = false;
      b.hit.setFillStyle(0x1b1410, 0.45);
    }
  }

  // ----------------------------------------------------------------- polling

  /** Read state once per frame; edge flags are cleared by this call. */
  poll(): TouchFrame {
    const by = (id: ButtonId) => this.buttons.find((b) => b.id === id)!;
    const edge = (id: ButtonId): boolean => {
      const b = by(id);
      const e = b.pressedEdge;
      b.pressedEdge = false;
      return e;
    };
    const held = (id: ButtonId): boolean => by(id).pointerId !== null;
    return {
      moveX: this.axis,
      run: Math.abs(this.axis) > 0.75,
      jumpPressed: edge('jump'),
      jumpHeld: held('jump'),
      attackPressed: edge('attack'),
      heavyPressed: edge('heavy'),
      dodgePressed: edge('dodge'),
      blockHeld: held('block'),
      skillPressed: [edge('skill0'), edge('skill1'), edge('skill2')],
    };
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.releaseAll, this);
    this.stickZone.destroy();
    this.container.destroy(true);
    this.buttons = [];
  }
}
