import type { I18n } from '../i18n';
import type { TypedEmitter } from './emitter';
import type { UIBackend, UIEvents, UISettings, Text, Result } from '../contracts';

export type ScreenId =
  | 'mainMenu' | 'newGame' | 'saveSelect' | 'settings' | 'pause'
  | 'inventory' | 'equipment' | 'character' | 'skills' | 'quests' | 'map'
  | 'crafting' | 'shop' | 'dialogue' | 'gameOver' | 'ending';

export type OpenMode = 'push' | 'replace' | 'root';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface ToastOptions { text: string; kind?: ToastKind; icon?: string; ms?: number }
export interface ConfirmOptions {
  title: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; icon?: string;
}
export interface QuantityOptions {
  title: string; max: number; unitPrice?: number; confirmLabel: string; icon?: string; initial?: number;
}

/** Everything a screen/component may use. Passed to every screen constructor. */
export interface UIContext {
  readonly root: HTMLElement;
  readonly i18n: I18n;
  readonly events: TypedEmitter<UIEvents>;
  readonly backend: UIBackend;
  readonly settings: Readonly<UISettings>;
  t: I18n['t'];
  text: I18n['text'];
  num: I18n['num'];

  open(id: ScreenId, params?: unknown, mode?: OpenMode): void;
  back(): void;
  closeAll(): void;
  isInGame(): boolean;
  /** Hide menus, show the HUD. Called automatically after game:new / game:continue / game:load unless disabled. */
  enterGame(): void;
  /** Hide HUD, show main menu. */
  exitToMenu(): void;
  /** Whether the UI should call enterGame()/exitToMenu() itself after emitting flow events. */
  readonly autoFlow: boolean;
  updateSettings(patch: Partial<UISettings>): void;
  resetSettings(): void;

  toast(o: ToastOptions): void;
  confirm(o: ConfirmOptions): Promise<boolean>;
  askQuantity(o: QuantityOptions): Promise<number | null>;
  /** Show a toast for a failed Result (uses its reason when present). */
  reportFailure(r: Result, fallbackKey?: 'common.actionFailed'): void;
  sfx(name: UIEvents['ui:sfx']['name']): void;
  haptic(ms?: number): void;
  resolve(t: Text | undefined): string;
}
