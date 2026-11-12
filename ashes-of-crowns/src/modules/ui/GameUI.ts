import './styles/index.css';

import { TypedEmitter } from './core/emitter';
import { h } from './core/dom';
import { Overlays } from './core/overlays';
import { ScreenManager } from './core/ScreenManager';
import type { OpenMode, ScreenId, ToastOptions, UIContext, ConfirmOptions, QuantityOptions } from './core/context';
import { DEFAULT_SETTINGS, loadSettings, safeStorage, saveSettings, sanitizeSettings, type KV } from './core/settings';
import { I18n, LANG_META } from './i18n';
import type {
  DialogueTree, EndingId, HudState, Lang, Result, Text, UIBackend, UIEvents, UISettings,
} from './contracts';

import { MainMenuScreen } from './screens/MainMenu';
import { NewGameScreen } from './screens/NewGame';
import { SaveSelectScreen } from './screens/SaveSelect';
import { SettingsScreen } from './screens/Settings';
import { PauseScreen } from './screens/Pause';
import { InventoryScreen } from './screens/Inventory';
import { EquipmentScreen } from './screens/Equipment';
import { CharacterScreen } from './screens/Character';
import { SkillsScreen } from './screens/Skills';
import { QuestsScreen } from './screens/Quests';
import { WorldMapScreen } from './screens/WorldMap';
import { CraftingScreen } from './screens/Crafting';
import { ShopScreen } from './screens/Shop';
import { DialogueScreen } from './screens/Dialogue';
import { GameOverScreen } from './screens/GameOver';
import { EndingScreen } from './screens/Ending';
import { Hud } from './hud/Hud';
import { TouchControls } from './hud/TouchControls';

export interface CreateUIOptions {
  /** Element the UI mounts into. Default: document.body. It should cover the game viewport. */
  parent?: HTMLElement;
  backend?: UIBackend;
  /** Storage for settings (default localStorage, falling back to memory). */
  storage?: KV;
  /**
   * When true (default) the UI itself switches between menu and gameplay after emitting
   * game:new / game:continue / game:load / game:retry / game:quitToMenu.
   * Set false if the game controller wants to call enterGame() / exitToMenu() itself.
   */
  autoFlow?: boolean;
  /** Show the main menu immediately (default true). */
  showMenu?: boolean;
  /** Handle Escape and the Android back button (default true). */
  handleBackKey?: boolean;
}

/** Public facade of the UI module. Create exactly one per game. */
export class GameUI {
  readonly events = new TypedEmitter<UIEvents>();
  readonly i18n = new I18n();
  readonly root: HTMLElement;

  private backend: UIBackend;
  private store: KV;
  private _settings: UISettings;
  private inGame = false;
  private destroyed = false;
  private readonly _autoFlow: boolean;
  private readonly overlays: Overlays;
  private readonly screens: ScreenManager;
  private readonly hud: Hud;
  private readonly touch: TouchControls;
  private readonly ctx: UIContext;
  private disposers: (() => void)[] = [];
  private historyArmed = false;

  constructor(opts: CreateUIOptions = {}) {
    this.backend = { ...(opts.backend ?? {}) };
    this.store = safeStorage(opts.storage);
    this._settings = loadSettings(this.store);
    this._autoFlow = opts.autoFlow ?? true;
    this.i18n.setLang(this._settings.lang);
    this.i18n.persianDigits = this._settings.persianDigits;

    this.ctx = this.makeContext();
    this.overlays = new Overlays(() => this.ctx);
    this.screens = new ScreenManager(this.ctx);
    this.registerScreens();
    this.hud = new Hud(this.ctx, () => this.openPause());
    this.touch = new TouchControls(this.ctx);

    this.root = h('div', { class: 'aoc-ui', 'data-ui-root': '' },
      this.hud.el, this.touch.el, this.screens.layer, this.overlays.layer);
    (opts.parent ?? document.body).appendChild(this.root);
    this.applySettings();

    if (opts.handleBackKey !== false) this.installBackHandling();
    this.installLayoutWatch();
    if (opts.showMenu !== false) this.showMainMenu();
  }

  /* ================================================================ public API */

  /** Subscribe to a UI event. Returns an unsubscribe function. */
  on<K extends keyof UIEvents>(type: K, fn: (p: UIEvents[K]) => void): () => void { return this.events.on(type, fn); }
  once<K extends keyof UIEvents>(type: K, fn: (p: UIEvents[K]) => void): () => void { return this.events.once(type, fn); }
  off<K extends keyof UIEvents>(type: K, fn: (p: UIEvents[K]) => void): void { this.events.off(type, fn); }

  /** Register / replace backend providers. Open screens refresh automatically. */
  setBackend(patch: Partial<UIBackend>): void {
    this.backend = { ...this.backend, ...patch };
    (this.ctx as { backend: UIBackend }).backend = this.backend;
    void this.screens.top?.refresh();
  }

  get settings(): Readonly<UISettings> { return this._settings; }
  get language(): Lang { return this._settings.lang; }
  get isInGame(): boolean { return this.inGame; }
  /** True while any menu/dialogue/modal blocks gameplay input. */
  get isBlocking(): boolean { return this.screens.depth > 0 || this.overlays.hasModal; }

  setLanguage(lang: Lang): void { this.updateSettings({ lang }); }
  updateSettings(patch: Partial<UISettings>): void { this.ctx.updateSettings(patch); }

  showMainMenu(): void {
    this.setInGame(false);
    this.screens.open('mainMenu', undefined, 'root');
  }

  /** Switch to gameplay: closes menus, shows HUD + touch controls. */
  enterGame(): void { this.ctx.enterGame(); }
  /** Back to the main menu (hides HUD). */
  exitToMenu(): void { this.ctx.exitToMenu(); }

  /** Open the pause menu (no-op outside gameplay or if a screen is already open). */
  openPause(): void {
    if (!this.inGame || this.screens.depth > 0) return;
    this.screens.open('pause', undefined, 'root');
  }
  /** Toggle pause: closes the top screen if one is open, otherwise opens pause. */
  togglePause(): void {
    if (!this.inGame) return;
    if (this.screens.depth > 0) this.closeTop(); else this.openPause();
  }
  /** Open a tabbed menu screen directly (e.g. bind the "I" key to openMenu('inventory')). */
  openMenu(tab: 'inventory' | 'equipment' | 'character' | 'skills' | 'quests' | 'map' = 'inventory'): void {
    if (!this.inGame) return;
    this.screens.open(tab, undefined, this.screens.depth > 0 ? 'replace' : 'root');
  }
  openCrafting(): void { if (this.inGame) this.screens.open('crafting', undefined, 'root'); }
  openShop(shopId: string): void { if (this.inGame) this.screens.open('shop', { shopId }, 'root'); }
  openSaveMenu(): void { if (this.inGame) this.screens.open('saveSelect', { mode: 'save' }, 'root'); }
  /** Run a dialogue. Resolves with the ids of the choices taken once it ends. */
  startDialogue(tree: DialogueTree): Promise<string[]> {
    return new Promise((resolve) => {
      const off = this.events.on('dialogue:end', (e) => { if (e.dialogueId === tree.id) { off(); resolve(e.choices); } });
      this.screens.open('dialogue', { tree }, this.screens.depth > 0 ? 'push' : 'root');
    });
  }
  showGameOver(): void { this.touch.releaseAll(); this.screens.open('gameOver', undefined, 'root'); }
  showEnding(ending: EndingId, stats?: { label: Text; value: string | number }[], slides?: string[], canNewGamePlus?: boolean): void {
    this.touch.releaseAll();
    this.hud.show(false);
    this.touch.show(false);
    this.screens.open('ending', { ending, stats, slides, canNewGamePlus }, 'root');
  }
  closeTop(): boolean { return this.screens.back(); }
  closeAllScreens(): void { this.screens.closeAll(); }
  /** Refresh data-driven screens that are open (call after the game changed inventory etc.). */
  refresh(): void { void this.screens.top?.refresh(); }

  /** Push HUD values. Cheap; safe to call every frame with only the fields that changed. */
  updateHud(patch: Partial<HudState>): void {
    const prev = this.hud.snapshot.level;
    this.hud.update(patch);
    if (patch.level !== undefined && patch.level > prev && prev > 0 && this.inGame) {
      this.ctx.sfx('levelup');
      this.overlays.banner(this.i18n.t('hud.levelUp'), this.i18n.t('hud.levelUpSub', { n: patch.level }), 'star');
    }
    if (patch.skills || patch.mana !== undefined) this.touch.setSkills(this.hud.snapshot.skills, this.hud.snapshot.mana);
  }
  showHud(v: boolean): void { this.hud.show(v); }
  toast(o: ToastOptions): void { this.overlays.toast(o); }
  banner(title: string, sub?: string, icon?: string): void { this.overlays.banner(title, sub, icon); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.touch.destroy();
    this.screens.destroy();
    this.overlays.destroy();
    this.disposers.forEach((d) => d());
    this.events.clear();
    this.root.remove();
  }

  /* ============================================================ internal wiring */

  private makeContext(): UIContext {
    const self = this;
    const ctx: UIContext = {
      get root() { return self.root; },
      i18n: this.i18n,
      events: this.events,
      backend: this.backend,
      get settings() { return self._settings; },
      t: (k, p) => this.i18n.t(k, p),
      text: (v) => this.i18n.text(v),
      num: (n, o) => this.i18n.num(n, o),
      resolve: (v) => this.i18n.text(v),
      autoFlow: this._autoFlow,
      open: (id: ScreenId, params?: unknown, mode: OpenMode = 'push') => this.screens.open(id, params, mode),
      back: () => { this.screens.back(); },
      close: (id: ScreenId) => { this.screens.close(id); },
      closeAll: () => this.screens.closeAll(),
      isInGame: () => this.inGame,
      enterGame: () => {
        this.screens.closeAll();
        this.screens.resetPauseTracking();
        this.setInGame(true);
      },
      exitToMenu: () => this.showMainMenu(),
      updateSettings: (patch) => this.applyPatch(patch),
      resetSettings: () => this.applyPatch({ ...DEFAULT_SETTINGS, lang: this._settings.lang }),
      toast: (o) => this.overlays.toast(o),
      confirm: (o: ConfirmOptions) => this.overlays.confirm(o),
      askQuantity: (o: QuantityOptions) => this.overlays.askQuantity(o),
      reportFailure: (r: Result) => {
        const reason = !r.ok && r.reason ? this.i18n.text(r.reason) : this.i18n.t('common.actionFailed');
        this.overlays.toast({ text: reason, kind: 'error' });
      },
      sfx: (name) => this.events.emit('ui:sfx', { name }),
      haptic: (ms = 10) => {
        if (!this._settings.vibration) return;
        try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
      },
    };
    // `backend` must stay live after setBackend(); screens read ctx.backend each time.
    return ctx;
  }

  private registerScreens(): void {
    const m = this.screens;
    m.register('mainMenu', (c) => new MainMenuScreen(c));
    m.register('newGame', (c) => new NewGameScreen(c));
    m.register('saveSelect', (c) => new SaveSelectScreen(c));
    m.register('settings', (c) => new SettingsScreen(c));
    m.register('pause', (c) => new PauseScreen(c));
    m.register('inventory', (c) => new InventoryScreen(c));
    m.register('equipment', (c) => new EquipmentScreen(c));
    m.register('character', (c) => new CharacterScreen(c));
    m.register('skills', (c) => new SkillsScreen(c));
    m.register('quests', (c) => new QuestsScreen(c));
    m.register('map', (c) => new WorldMapScreen(c));
    m.register('crafting', (c) => new CraftingScreen(c));
    m.register('shop', (c) => new ShopScreen(c));
    m.register('dialogue', (c) => new DialogueScreen(c));
    m.register('gameOver', (c) => new GameOverScreen(c));
    m.register('ending', (c) => new EndingScreen(c));
  }

  private setInGame(v: boolean): void {
    this.inGame = v;
    this.hud.show(v);
    this.syncTouch();
    this.root.classList.toggle('is-ingame', v);
    this.armHistory(v);
  }

  /** Apply a settings patch: validate, persist, re-render, notify. */
  private applyPatch(patch: Partial<UISettings>): void {
    const before = this._settings;
    const next = sanitizeSettings({ ...before, ...patch }, before);
    const changed = (Object.keys(next) as (keyof UISettings)[]).filter((k) => next[k] !== before[k]);
    if (!changed.length) return;
    this._settings = next;
    saveSettings(this.store, next);
    this.applySettings();
    if (changed.includes('lang') || changed.includes('persianDigits')) {
      this.i18n.setLang(next.lang);
      this.i18n.persianDigits = next.persianDigits;
      this.relocalize();
    }
    for (const k of changed) this.events.emit('settings:changed', { settings: next, key: k });
  }

  /** Reflect settings in DOM attributes / CSS variables. */
  private applySettings(): void {
    const s = this._settings;
    const meta = LANG_META[s.lang];
    const r = this.root;
    r.dir = meta.dir;
    r.lang = meta.htmlLang;
    r.dataset.lang = s.lang;
    r.dataset.text = s.textScale;
    r.dataset.hud = s.hudScale;
    r.classList.toggle('reduce-motion', s.reduceMotion);
    r.classList.toggle('left-handed', s.leftHanded);
    r.style.setProperty('--ctl-scale', String(s.controlScale));
    r.style.setProperty('--ctl-opacity', String(s.controlOpacity));
    // The document language also drives font selection for any content the UI shares with the page.
    document.documentElement.lang = meta.htmlLang;
    this.syncTouch();
  }

  /** Touch controls are visible only during gameplay, when enabled, and while no menu blocks input. */
  private syncTouch(): void {
    const show = this.inGame && this._settings.touchControls && !this.isBlocking;
    this.touch.show(show);
    this.root.classList.toggle('touch-on', show);
  }

  /** Rebuild every localized part. No state is lost: screens keep their fields, HUD keeps its values. */
  private relocalize(): void {
    this.hud.build();
    this.touch.build();
    this.touch.setSkills(this.hud.snapshot.skills, this.hud.snapshot.mana);
    this.syncTouch();
    this.screens.rerenderAll();
  }

  private installLayoutWatch(): void {
    // Hide touch controls while a menu is open and show them again afterwards.
    const off = this.events.on('ui:screen', () => {
      queueMicrotask(() => this.syncTouch());
    });
    this.disposers.push(off);
    // Flow events carry the game state change for integrators that disable autoFlow.
    const offPause = this.events.on('game:pause', () => this.touch.releaseAll());
    this.disposers.push(offPause);
  }

  private installBackHandling(): void {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return;
      if (this.handleBack()) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    this.disposers.push(() => document.removeEventListener('keydown', onKey));

    const onPop = () => {
      if (!this.historyArmed) return;
      this.handleBack();
      try { history.pushState({ aoc: 1 }, ''); } catch { /* ignore */ }
    };
    window.addEventListener('popstate', onPop);
    this.disposers.push(() => window.removeEventListener('popstate', onPop));
  }

  /**
   * Android's hardware/gesture Back would otherwise leave the page. While in-game we keep one
   * extra history entry so Back closes menus or opens Pause instead.
   */
  private armHistory(inGame: boolean): void {
    if (inGame && !this.historyArmed) {
      try { history.pushState({ aoc: 1 }, ''); this.historyArmed = true; } catch { /* sandboxed iframe */ }
    } else if (!inGame) {
      this.historyArmed = false;
    }
  }

  /** Shared Escape / Back behaviour. Returns true if the UI consumed it. */
  handleBack(): boolean {
    if (this.overlays.dismissModal()) return true;
    if (this.screens.depth > 0) {
      if (this.screens.handleBack()) return true;
      return true; // non-dismissable root screens (main menu, game over) swallow Back
    }
    if (this.inGame) { this.openPause(); return true; }
    return false;
  }
}

/** Factory shortcut. */
export function createUI(opts?: CreateUIOptions): GameUI { return new GameUI(opts); }
