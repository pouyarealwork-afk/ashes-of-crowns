import { makeInput, type InputFrame } from '../modules/player/core/types';

type Action = 'attack' | 'jump' | 'dodge' | 'interact' | 'skill1' | 'skill2' | 'skill3' | 'heavy' | 'block';

/** Merges the UI's multi-touch events with keyboard input into one deterministic PlayerController frame. */
export class InputBridge {
  axisX = 0;
  private pressed = new Set<Action>();
  /** Number of active touch pointers holding each action (one finger may lift before another). */
  private held = new Map<Action, number>();
  private previous = new Set<string>();
  private keys: Record<string, { isDown: boolean }> = {};
  onInteract: () => void = () => {};

  attach(keys: Record<string, { isDown: boolean }>): void { this.keys = keys; }
  axis(x: number): void { this.axisX = Math.max(-1, Math.min(1, x)); }
  action(action: Action, down: boolean): void {
    const count = this.held.get(action) ?? 0;
    if (down) {
      this.held.set(action, count + 1);
      if (count === 0) this.pressed.add(action);
    } else if (count <= 1) {
      this.held.delete(action);
    } else {
      this.held.set(action, count - 1);
    }
  }
  private edge(key: string): boolean {
    const down = !!this.keys[key]?.isDown;
    const was = this.previous.has(key);
    if (down) this.previous.add(key); else this.previous.delete(key);
    return down && !was;
  }
  private consume(action: Action): boolean { const v = this.pressed.has(action); this.pressed.delete(action); return v; }

  frame(): InputFrame {
    const left = !!this.keys.left?.isDown || !!this.keys.a?.isDown;
    const right = !!this.keys.right?.isDown || !!this.keys.d?.isDown;
    const moveX = Math.abs(this.axisX) > 0.12 ? this.axisX : (right ? 1 : left ? -1 : 0);
    const jumpSpace = this.edge('space'), jumpUp = this.edge('up'), jumpW = this.edge('w');
    const attackZ = this.edge('z'), attackJ = this.edge('j');
    const jumpKey = jumpSpace || jumpUp || jumpW;
    const attackKey = attackZ || attackJ;
    const heavyKey = this.edge('x');
    const dodgeKey = this.edge('c');
    const interactKey = this.edge('e');
    const jumpPressed = this.consume('jump') || jumpKey;
    const attackPressed = this.consume('attack') || attackKey;
    const heavyPressed = this.consume('heavy') || heavyKey;
    const dodgePressed = this.consume('dodge') || dodgeKey;
    const interact = this.consume('interact') || interactKey;
    if (interact) this.onInteract();
    const skillPressed: [boolean, boolean, boolean] = [
      this.consume('skill1') || this.edge('one'),
      this.consume('skill2') || this.edge('two'),
      this.consume('skill3') || this.edge('three'),
    ];
    return makeInput({
      moveX,
      run: !!this.keys.shift?.isDown || Math.abs(moveX) > 0.82,
      jumpPressed,
      jumpHeld: !!this.keys.space?.isDown || (this.held.get('jump') ?? 0) > 0,
      attackPressed,
      heavyPressed,
      dodgePressed,
      blockHeld: !!this.keys.v?.isDown || (this.held.get('block') ?? 0) > 0,
      skillPressed,
    });
  }
}
