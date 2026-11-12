import Phaser from 'phaser';
import { makeInput } from '../core/types';
import type { InputFrame } from '../core/types';
import type { TouchControls } from './TouchControls';

/** Keyboard bindings. Defaults: arrows/WASD move, Z/J attack, X/K heavy, C/L dodge, V/Shift block, Space/W jump, 1-3 skills. */
export class InputSystem {
  private keys: Record<string, Phaser.Input.Keyboard.Key[]> = {};
  private touch?: TouchControls;
  /** When true all input is ignored (cutscenes, menus, dialogs). */
  locked = false;

  constructor(scene: Phaser.Scene, touch?: TouchControls) {
    this.touch = touch;
    const kb = scene.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const add = (name: string, codes: number[]) => {
      this.keys[name] = codes.map((c) => kb.addKey(c, true));
    };
    add('left', [K.LEFT, K.A]);
    add('right', [K.RIGHT, K.D]);
    add('jump', [K.SPACE, K.UP, K.W]);
    add('attack', [K.Z, K.J]);
    add('heavy', [K.X, K.K]);
    add('dodge', [K.C, K.L]);
    add('block', [K.V, K.SHIFT]);
    add('run', [K.CTRL]);
    add('skill0', [K.ONE]);
    add('skill1', [K.TWO]);
    add('skill2', [K.THREE]);
  }

  private down(name: string): boolean {
    return (this.keys[name] ?? []).some((k) => k.isDown);
  }

  private pressed(name: string): boolean {
    return (this.keys[name] ?? []).some((k) => Phaser.Input.Keyboard.JustDown(k));
  }

  /** Sample once per frame. Edge flags are consumed by this call. */
  poll(): InputFrame {
    const t = this.touch?.poll();
    // Always consume keyboard edges even when locked so they do not fire after unlocking.
    const kbJump = this.pressed('jump');
    const kbAtk = this.pressed('attack');
    const kbHeavy = this.pressed('heavy');
    const kbDodge = this.pressed('dodge');
    const kbSkill: [boolean, boolean, boolean] = [this.pressed('skill0'), this.pressed('skill1'), this.pressed('skill2')];
    if (this.locked) return makeInput();

    const kbX = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    const moveX = kbX !== 0 ? kbX : t?.moveX ?? 0;
    const kbRun = kbX !== 0 && !this.down('run'); // keyboard defaults to running; hold Ctrl to walk
    return makeInput({
      moveX,
      run: kbX !== 0 ? kbRun : t?.run ?? false,
      jumpPressed: kbJump || !!t?.jumpPressed,
      jumpHeld: this.down('jump') || !!t?.jumpHeld,
      attackPressed: kbAtk || !!t?.attackPressed,
      heavyPressed: kbHeavy || !!t?.heavyPressed,
      dodgePressed: kbDodge || !!t?.dodgePressed,
      blockHeld: this.down('block') || !!t?.blockHeld,
      skillPressed: [kbSkill[0] || !!t?.skillPressed[0], kbSkill[1] || !!t?.skillPressed[1], kbSkill[2] || !!t?.skillPressed[2]],
    });
  }

  destroy(): void {
    this.keys = {};
  }
}
