import Phaser from 'phaser';
import { Player } from '../modules/player/phaser/Player';
import { CombatWorld } from '../modules/combat/phaser/CombatWorld';
import { RpgModule } from '../modules/rpg';
import { getItemDef } from '../modules/rpg/data/items';
import { createWorldModule } from '../modules/world';
import { PersistenceModule } from '../modules/persistence';
import { createUI, type GameUI } from '../modules/ui';
import type { InputFrame } from '../modules/player/core/types';
import type { LevelDef, RegionId } from '../modules/world/types';
import { InputBridge } from './InputBridge';
import { createUIBackend } from './backend';

export interface GameServices {
  rpg: RpgModule;
  world: ReturnType<typeof createWorldModule>;
  persistence: PersistenceModule;
}

type SceneStartData = { levelId?: string; spawn?: string; loadedState?: any };

/** Main runtime: owns the shared event bus and connects all six delivered modules. */
export class GameScene extends Phaser.Scene {
  services!: GameServices;
  ui!: GameUI;
  aren!: Player;
  combat!: CombatWorld;
  currentRegion: RegionId = 'ashen_village';
  currentLevelId = 'ashen_village_main';
  private currentClass: 'warrior' | 'assassin' | 'mage' = 'warrior';
  trackedQuest: string | null = null;

  private inputBridge = new InputBridge();
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private collectGroup!: Phaser.Physics.Arcade.StaticGroup;
  private npcActors: Array<{ id: string; x: number; y: number; label: Phaser.GameObjects.Text }> = [];
  private companionActors: Array<{ id: string; actor: Phaser.GameObjects.Container; offset: number }> = [];
  private syncedStoryFlags = new Set<string>();
  private interactables: Array<{ id: string; x: number; y: number; label: string }> = [];
  private activeZones = new Set<string>();
  private activePois = new Set<string>();
  private blockedExitAt = new Map<string, number>();
  private levelDef!: LevelDef;
  private levelRuntime: any;
  private started = false;
  private openingFinished = false;
  private dialogueRunning = false;
  private uiUtilityControls?: HTMLElement;
  private currentBoss: { id: string; name: string; phase: number } | null = null;
  private pendingEndingId: string | null = null;
  private pendingEndingSlides: string[] = [];
  activeSaveSlot = 'slot1';
  private playtimeMs = 0;
  private hudAccumulator = 0;
  private triggerAccumulator = 0;
  private lastSaveState: any = null;
  private pendingLevel: { levelId: string; spawn: string } | null = null;
  private audioUnlockAttached = false;
  private keyboard: Record<string, any> = {};
  private gameEventOffs: Array<() => void> = [];

  constructor() { super('GameScene'); }

  init(data: SceneStartData): void {
    if (data.levelId) { this.currentLevelId = data.levelId; this.pendingLevel = { levelId: data.levelId, spawn: data.spawn ?? 'start' }; }
    this.registry.set('nextSpawn', data.spawn ?? 'start');
    if (data.loadedState) this.lastSaveState = data.loadedState;
  }

  create(): void {
    this.createPixelTexture();
    this.keyboard = this.input.keyboard?.addKeys({
      left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D', shift: 'SHIFT',
      space: 'SPACE', up: 'UP', w: 'W', z: 'Z', j: 'J', x: 'X', c: 'C', e: 'E', v: 'V',
      one: 'ONE', two: 'TWO', three: 'THREE', esc: 'ESC', i: 'I', k: 'K', m: 'M', q: 'Q',
    }) ?? {};
    this.inputBridge.attach(this.keyboard);
    this.inputBridge.onInteract = () => this.interactNearby();

    if (!this.services) {
      const bus = this.game.events as any;
      this.services = {
        rpg: new RpgModule({ bus }),
        world: createWorldModule({ emitter: bus }),
        persistence: new PersistenceModule({
          gameVersion: '1.0.0', bus,
          autosave: { intervalMs: 90000, minGapMs: 12000 },
          audio: { manifest: {}, regionMusic: {}, combatMusicId: undefined },
        }),
      };
      this.wireSharedEvents();
    }

    void this.services.persistence.init().then(async () => {
      this.services.persistence.registerStateProvider(() => this.captureState());
      if (!this.audioUnlockAttached) { this.services.persistence.audio.attachUnlockListeners(); this.audioUnlockAttached = true; }
      if (!this.ui) this.createUI();
      if (this.pendingLevel) { const pending = this.pendingLevel; this.pendingLevel = null; this.startLevel(pending.levelId, pending.spawn); }
      else if (this.lastSaveState && !this.started) {
        this.restoreState(this.lastSaveState);
        this.startLevel(this.currentLevelId, 'start');
        this.ui.enterGame();
      }
    }).catch(err => this.showBootError(err));

    this.add.text(18, 18, 'ASHES OF CROWNS', { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#d6a36a', letterSpacing: 3 }).setScrollFactor(0).setDepth(1000).setAlpha(0.75);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  update(_time: number, delta: number): void {
    if (!this.started || !this.aren || !this.levelDef) return;
    this.playtimeMs += delta;
    this.services.rpg.update(delta);
    this.triggerAccumulator += delta;
    if (this.triggerAccumulator >= 80) { this.triggerAccumulator %= 80; this.updateWorldTriggers(); }
    this.updateCompanionPositions();
    this.hudAccumulator += delta;
    if (this.hudAccumulator >= 100) { this.hudAccumulator %= 100; this.updateHud(); }
    if (Phaser.Input.Keyboard.JustDown(this.keyboard.i)) this.ui?.openMenu('inventory');
    if (Phaser.Input.Keyboard.JustDown(this.keyboard.k)) this.ui?.openMenu('skills');
    if (Phaser.Input.Keyboard.JustDown(this.keyboard.m)) this.ui?.openMenu('map');
    if (Phaser.Input.Keyboard.JustDown(this.keyboard.q)) this.ui?.openMenu('quests');
  }

  public flushSaveBeforeExit(): void {
    if (!this.services || !this.started || !this.aren) return;
    void this.services.persistence.saves.save(this.activeSaveSlot, { kind: 'manual', label: 'Latest Progress', skipIfUnchanged: true }).catch(() => undefined);
    void this.services.persistence.flush();
  }

  private createPixelTexture(): void {
    if (this.textures.exists('aoc-pixel')) return;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 2, 2); g.generateTexture('aoc-pixel', 2, 2); g.destroy();
  }

  private createUI(): void {
    const storage = {
      getItem: (key: string) => { try { const value = localStorage.getItem(key); return value ?? (key === 'aoc.ui.settings.v1' ? JSON.stringify({ lang: 'fa', persianDigits: true }) : null); } catch { return key === 'aoc.ui.settings.v1' ? JSON.stringify({ lang: 'fa', persianDigits: true }) : null; } },
      setItem: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* UI settings fall back to memory if storage is blocked. */ } },
      removeItem: (key: string) => { try { localStorage.removeItem(key); } catch { /* ignored */ } },
    };
    this.ui = createUI({ parent: document.getElementById('app') ?? document.body, backend: createUIBackend(this), storage, autoFlow: false, showMenu: true, handleBackKey: true });
    this.ui.on('game:new', ({ slot, classId }) => this.startNewGame(slot, classId));
    this.ui.on('dialogue:cancel', () => this.services.world.endDialogue());
    this.ui.on('game:continue', ({ slot }) => void this.loadSlot(`slot${slot}`));
    this.ui.on('game:load', ({ slot }) => void this.loadSlot(`slot${slot}`));
    this.ui.on('game:pause', () => { if (this.started && this.scene.isActive()) this.scene.pause(); this.aren?.lockInput(true); });
    this.ui.on('game:resume', () => { this.aren?.lockInput(false); if (this.scene.isPaused()) this.scene.resume(); });
    this.ui.on('game:quitToMenu', () => { this.started = false; this.hideExtraControls(); this.destroyLevel(); this.ui.exitToMenu(); });
    this.ui.on('game:retry', () => { this.aren?.respawn(); this.ui.closeAllScreens(); this.ui.enterGame(); });
    this.ui.on('game:newGamePlus', ({ ending }) => this.startNewGamePlus(ending));
    this.ui.on('input:axis', p => this.inputBridge.axis(p.x));
    this.ui.on('input:action', p => this.inputBridge.action(p.action as any, p.pressed));
    this.ui.on('settings:changed', ({ settings }) => {
      this.updateExtraControlLabels(settings.lang);
        this.services.persistence.settings.update({
        audio: { music: settings.musicVolume * settings.masterVolume, sfx: settings.sfxVolume * settings.masterVolume, muted: settings.masterVolume <= 0 },
        language: settings.lang,
        controls: { touchLayout: settings.leftHanded ? 'left-handed' : 'default', touchOpacity: settings.controlOpacity, buttonScale: settings.controlScale, haptics: settings.vibration },
      } as any);
    });
    this.ui.on('ending:finished', () => { this.started = false; this.hideExtraControls(); this.destroyLevel(); this.ui.showMainMenu(); });
    this.ui.on('ui:sfx', ({ name }) => this.playUiTone(name));
    this.ui.setBackend(createUIBackend(this));
    this.addExtraTouchControls();
  }


  private addExtraTouchControls(): void {
    if (!this.ui || this.uiUtilityControls) return;
    const utility = document.createElement('div'); utility.className = 'aoc-utility-controls';
    const fa = this.ui.language === 'fa';
    const makeUtility = (label: string, action: 'shop' | 'craft') => {
      const b = document.createElement('button'); b.type = 'button'; b.className = `aoc-extra-control aoc-extra-${action}`; b.textContent = label;
      b.addEventListener('click', () => {
        if (!this.started) return;
        if (action === 'shop') this.openCurrentShop();
        else {
          const nearAlchemist = this.levelDef?.zones.some(z => z.id === 'village_square' && this.aren && this.aren.x >= z.rect.x - 100 && this.aren.x <= z.rect.x + z.rect.w + 100);
          const station = nearAlchemist ? 'alchemist' : 'blacksmith';
          this.services.rpg.crafting.setStation(station);
          this.services.persistence.bus.emit('station:open', { station });
          this.ui.openCrafting();
        }
      });
      utility.appendChild(b);
    };
    makeUtility(fa ? 'فروشگاه' : 'SHOP', 'shop'); makeUtility(fa ? 'ساخت' : 'CRAFT', 'craft');
    utility.style.display = 'none';
    this.ui.root.appendChild(utility); this.uiUtilityControls = utility;
  }

  private hideExtraControls(): void { if (this.uiUtilityControls) this.uiUtilityControls.style.display = 'none'; }
  private updateExtraControlLabels(lang: string): void {
    const fa = lang === 'fa';
    const labels: Record<string, string> = { 'aoc-extra-shop': fa ? 'فروشگاه' : 'SHOP', 'aoc-extra-craft': fa ? 'ساخت' : 'CRAFT' };
    for (const [cls, label] of Object.entries(labels)) { const el = this.ui?.root.querySelector(`.${cls}`); if (el) el.textContent = label; }
  }

  private wireSharedEvents(): void {
    const bus = this.game.events;
    const on = (name: string, fn: (p: any) => void) => { bus.on(name, fn); this.gameEventOffs.push(() => bus.off(name, fn)); };

    on('world:reward', (reward: any) => {
      if (reward?.xp) this.services.rpg.progression.addXp(reward.xp, reward.source ?? 'story');
      if (reward?.gold) this.services.rpg.economy.addGold(reward.gold);
      for (const item of reward?.items ?? []) {
        this.services.rpg.inventory.add(item.id, item.n ?? 1);
        try {
          const def = getItemDef(item.id);
          if (def.rarity !== 'common' || def.type === 'quest') {
            const name = this.ui?.language === 'fa' ? def.name : def.name;
            this.ui?.toast({ text: this.ui?.language === 'fa' ? `آیتم ویژه: ${name} ×${item.n ?? 1}` : `Special item: ${name} ×${item.n ?? 1}`, kind: 'success' });
          }
        } catch { /* Unknown content is still granted; never block a reward over its display name. */ }
      }
    });
    on('world:quest-completed', (p: any) => { bus.emit('quest:completed', { questId: p.id }); bus.emit('rpg:quest-completed', { questId: p.id }); queueMicrotask(() => this.syncStoryFlags()); });
    for (const ev of ['world:dialogue-node','world:dialogue-ended','world:story-event','world:companion-recruited','world:quest-started','world:quest-updated','world:collectible-found','world:path-revealed','world:area-unlocked','world:poi-discovered','world:chapter-changed','world:party-changed','world:relationship-changed']) on(ev, () => queueMicrotask(() => { this.syncStoryFlags(); if (ev === 'world:party-changed' || ev === 'world:companion-recruited') this.syncCompanions(); }));
    on('player:deathComplete', () => this.ui?.showGameOver());
    on('world:dialogue-started', (p: any) => { if (p?.treeId) queueMicrotask(() => void this.runWorldDialogue(p.treeId)); });
    on('world:toast', (p: any) => this.ui?.toast({ text: p?.text ?? 'Something changed', kind: 'info' }));
    on('world:path-revealed', (p: any) => { if (p?.level === this.currentLevelId && p.rect) { const r = p.rect; this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x75c6ad, 0.28).setStrokeStyle(3, 0x8fe4c9, 1).setDepth(7); this.add.text(r.x + r.w / 2, r.y - 22, 'HIDDEN PATH REVEALED', { fontSize: '9px', color: '#a7f0d5', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5).setDepth(9); } });
    on('world:ending', (p: any) => {
      const id = p?.ending?.id ?? p?.id ?? p?.endingId ?? 'wanderer';
      bus.emit('ending:reached', { endingId: id });
      this.pendingEndingId = id; this.pendingEndingSlides = Array.isArray(p?.slides) ? p.slides : [];
      if (!this.dialogueRunning) queueMicrotask(() => this.showPendingEnding());
      queueMicrotask(() => this.syncStoryFlags());
    });
    on('world:level-requested', (p: any) => {
      if (p?.level) {
        const next = this.services.world.getLevel(p.level);
        if (next && next.region !== this.currentRegion) { bus.emit('world:region-changed', { regionId: next.region }); bus.emit('region:entered', { region: next.region }); }
        this.scene.restart({ levelId: p.level, spawn: p.spawn ?? 'start' });
      }
    });
    on('combat:ability-used', (p: any) => {
      const id = String(p?.abilityId ?? '');
      this.services.persistence.audio.playSfx(id.startsWith('a_') ? 'magic' : id.startsWith('s_') ? 'dash' : 'sword');
    });
    on('combat:enemy-hit', (p: any) => this.services.persistence.audio.playSfx(p?.critical ? 'impact-critical' : 'hit', { volume: p?.critical ? 0.95 : 0.55 }));
    on('combat:boss-phase', () => this.services.persistence.audio.playSfx('boss_phase', { volume: 0.9 }));
    on('combat:boss-intro', (p: any) => {
      this.currentBoss = { id: p.bossId, name: p.name ?? 'Warden', phase: 1 };
      this.ui?.banner(p.name ?? 'A powerful foe approaches', p.title ?? 'Prepare yourself', 'skull');
    });
    on('combat:boss-phase', (p: any) => { if (this.currentBoss) this.currentBoss.phase = p.phase; });
    on('combat:boss-defeated', () => { this.currentBoss = null; });
    on('combat:enemy-defeated', (p: any) => { if (p?.bossId) this.ui?.toast({ text: this.ui?.language === 'fa' ? 'غول شکست خورد' : 'Boss defeated', kind: 'success' }); });
    on('persistence:saved', (p: any) => {
      if (p?.slotId === 'auto' && this.started && this.aren && this.activeSaveSlot !== 'auto') {
        void this.services.persistence.saves.save(this.activeSaveSlot, { kind: 'manual', label: 'Latest Progress', skipIfUnchanged: true }).catch(err => this.ui?.toast({ text: `Save mirror failed: ${(err as Error).message}`, kind: 'warning' }));
      }
    });
    on('persistence:degraded', () => this.ui?.toast({ text: 'Storage unavailable: saves will last only for this session.', kind: 'warning' }));
  }

  private startNewGame(slot = 1, classId: 'warrior' | 'assassin' | 'mage' = 'warrior'): void {
    this.currentClass = classId;
    this.activeSaveSlot = `slot${slot}`;
    this.services.rpg.newGame();
    const signatureAbility = classId === 'warrior' ? 'w_power_strike' : classId === 'assassin' ? 's_backstab' : 'a_arc_bolt';
    this.services.rpg.skills.grantStartingAbility(signatureAbility);
    this.services.world.newGame(); this.services.persistence.checkpoints.restore(undefined); this.lastSaveState = null; this.playtimeMs = 0; this.pendingEndingId = null; this.pendingEndingSlides = []; this.syncedStoryFlags.clear(); this.syncStoryFlags();
    this.currentRegion = 'ashen_village'; this.currentLevelId = 'ashen_village_main'; this.trackedQuest = null;
    // Paint the first cinematic frame before building the level behind it.
    // Level construction is synchronous and used to stall the very first intro frame on phones.
    this.started = false;
    this.openingFinished = false;
    this.ui.enterGame();
    this.playOpeningCinematic();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!this.scene.isActive()) return;
      this.startLevel(this.currentLevelId, 'start');
      this.cameras.main.fadeIn(1250, 7, 5, 7);
      this.aren.lockInput(!this.openingFinished);
      this.started = this.openingFinished;
      this.ui.toast({ text: this.ui.language === 'fa' ? 'راه از میان خاکسترهای خانه آغاز می‌شود.' : 'The road begins in the ashes of home.', kind: 'info' });
      void this.services.persistence.saveToSlot(this.activeSaveSlot, 'New Game').catch(err => this.ui?.toast({ text: `Initial save failed: ${(err as Error).message}`, kind: 'warning' }));
    }));
  }

  private startNewGamePlus(ending: string): void {
    const result = this.services.rpg.ngPlus.start();
    if (!result.ok) { this.ui?.toast({ text: `New Game+ unavailable: ${result.reason ?? 'not ready'}`, kind: 'warning' }); return; }
    this.activeSaveSlot = this.activeSaveSlot || 'slot1';
    this.services.world.newGame();
    this.services.persistence.checkpoints.restore(undefined);
    this.lastSaveState = null; this.playtimeMs = 0; this.pendingEndingId = null; this.pendingEndingSlides = [];
    this.currentRegion = 'ashen_village'; this.currentLevelId = 'ashen_village_main'; this.trackedQuest = null;
    this.syncedStoryFlags.clear(); this.syncStoryFlags();
    this.started = true;
    this.startLevel(this.currentLevelId, 'start');
    this.ui.enterGame();
    this.ui.toast({ text: `New Game+ Cycle ${result.cycle} · ${ending.replaceAll('_', ' ')}`, kind: 'success' });
    void this.services.persistence.saveToSlot(this.activeSaveSlot, `New Game+ ${result.cycle}`).catch(err => this.ui?.toast({ text: `New Game+ save failed: ${(err as Error).message}`, kind: 'warning' }));
  }

  private async loadSlot(slot: string): Promise<void> {
    const lastSlot = slot === 'auto' ? await this.services.persistence.saves.getLastSlot() : slot;
    this.activeSaveSlot = lastSlot && lastSlot !== 'auto' ? lastSlot : 'slot1';
    const result = slot === 'auto' ? await this.services.persistence.continueLast() : await this.services.persistence.loadSlot(this.activeSaveSlot);
    if (!result.ok) { this.ui.toast({ text: result.message, kind: 'warning' }); return; }
    this.restoreState(result.record.state);
    this.started = true;
    this.startLevel(this.currentLevelId, 'start');
    this.ui.enterGame();
    if (result.warnings?.length) this.ui.toast({ text: result.warnings.join(' · '), kind: 'warning' });
  }

  private restoreState(state: any): void {
    const flags = state?.progress?.flags ?? {};
    try { if (typeof flags.__rpg === 'string') this.services.rpg.load(JSON.parse(flags.__rpg)); else this.services.rpg.newGame(); } catch { this.services.rpg.newGame(); }
    try { if (typeof flags.__world === 'string') this.services.world.restore(JSON.parse(flags.__world)); else this.services.world.newGame(); } catch { this.services.world.newGame(); }
    this.syncedStoryFlags.clear(); this.syncStoryFlags();
    this.playtimeMs = Number(state?.progress?.playtimeMs ?? 0);
    this.trackedQuest = typeof flags.__trackedQuest === 'string' && flags.__trackedQuest ? flags.__trackedQuest : null;
    this.currentRegion = (state.currentRegion || 'ashen_village') as RegionId;
    const savedClass = flags.__class;
    this.currentClass = savedClass === 'assassin' || savedClass === 'mage' ? savedClass : 'warrior';
    const fallbackLevel = this.services.world.content.regions.get(this.currentRegion)?.entryLevel || 'ashen_village_main';
    const requestedLevel = String(flags.__level || fallbackLevel);
    this.currentLevelId = this.services.world.getLevel(requestedLevel) ? requestedLevel : fallbackLevel;
    this.lastSaveState = state;
  }

  private captureState(): any {
    if (!this.started || !this.aren) return null;
    const p = this.aren.stats;
    const worldData = JSON.stringify(this.services.world.serialize());
    const rpgData = JSON.stringify(this.services.rpg.serialize());
    const quests = this.services.world.getQuestLog().map((q: any) => ({ id: q.id, status: q.status, stage: q.objectives.filter((o: any) => o.done).length, objectives: Object.fromEntries(q.objectives.map((o: any) => [o.id, o.done ? 1 : 0])) }));
    const map = this.services.world.getMapView();
    return {
      player: { stats: { health: p.health, mana: p.mana, stamina: p.stamina, maxHealth: p.config.maxHealth, maxMana: p.config.maxMana, maxStamina: p.config.maxStamina }, level: this.services.rpg.getLevel(), xp: this.services.rpg.progression.xp, position: { x: this.aren.x, y: this.aren.y } },
      inventory: { gold: this.services.rpg.getGold(), items: this.services.rpg.inventory.list().map((i: any) => ({ id: i.defId, qty: i.qty, meta: { uid: i.uid, upgrade: i.upgrade } })) },
      equipment: Object.fromEntries(Object.entries(this.services.rpg.equipment.getEquipped()).map(([k, v]: any) => [k, v?.defId ?? null])),
      skills: { unlocked: Object.keys(this.services.rpg.serialize().skills), equipped: this.services.rpg.skills.getHotbar().filter(Boolean), points: this.services.rpg.progression.skillPoints, levels: this.services.rpg.serialize().skills },
      quests, decisions: { __world: worldData, __rpg: rpgData }, narrative: this.services.world.getHiddenVariables(), relationships: Object.fromEntries(['tamsin', 'kael', 'lyra', 'brom'].map(id => [id, this.services.world.getRelationship(id)])),
      difficulty: 'normal', currentRegion: this.currentRegion,
      unlockedSkins: this.services.rpg.serialize().skinsUnlocked,
      progress: { playtimeMs: this.playtimeMs, regionsUnlocked: map.nodes.filter((n: any) => n.unlocked).map((n: any) => n.id), regionsCompleted: map.nodes.filter((n: any) => n.stats.percent >= 100).map((n: any) => n.id), bossesDefeated: this.services.rpg.serialize().defeatedBosses, flags: { __world: worldData, __rpg: rpgData, __level: this.currentLevelId, __trackedQuest: this.trackedQuest ?? '', __class: this.currentClass }, endingsSeen: this.services.world.getEnding() ? [this.services.world.getEnding()] : [] },
    };
  }

  private startLevel(levelId: string, spawnName = 'start'): void {
    this.currentBoss = null;
    this.destroyLevel();
    const runtime = this.services.world.getLevelRuntime(levelId);
    if (!runtime) { this.ui?.toast({ text: `Missing level: ${levelId}`, kind: 'error' }); return; }
    this.levelRuntime = runtime; this.levelDef = runtime.level; this.currentLevelId = levelId; this.currentRegion = runtime.level.region;
    const level = runtime.level;
    const spawn = level.spawns[spawnName] ?? level.spawns.start;
    this.physics.world.setBounds(0, 0, level.size.w, level.size.h);
    this.cameras.main.setBounds(0, 0, level.size.w, level.size.h);
    this.cameras.main.setBackgroundColor(level.atmosphere.palette.sky);
    this.drawAtmosphere(level);

    this.platforms = this.physics.add.staticGroup();
    for (const [x, y, w, h, kind] of level.platforms) {
      const material = String(kind ?? 'ground');
      const texture = this.platformTexture(material);
      const block = this.platforms.create(x + w / 2, y + h / 2, texture) as Phaser.Physics.Arcade.Image;
      block.setData('material', material);
      block.setDisplaySize(w, h).setTint(0xffffff).setDepth(4).refreshBody();
      if (kind === 'oneway' && block.body) { block.body.checkCollision.down = false; block.body.checkCollision.left = false; block.body.checkCollision.right = false; }
      // Surface details are baked into the shared material texture to keep the object count low.

    }
    this.drawHazards(level);
    this.drawLore(level);
    this.drawNpcs(runtime.npcs, level);
    this.drawInteractables(level);
    this.drawExitsAndPaths(runtime, level);
    this.drawCollectibles(runtime.collectibles);

    this.services.persistence.checkpoints.setDefaultSpawn({ regionId: level.region, x: spawn.x, y: spawn.y });
    const campPois = [...this.services.world.content.pois.values()].filter(p => p.level === levelId && (p.kind === 'camp' || p.kind === 'shrine'));
    this.services.persistence.checkpoints.register(...campPois.map(p => ({ id: `memory_${p.id}`, regionId: p.region, x: p.x, y: p.y })));
    const savedLevelId = this.lastSaveState?.progress?.flags?.__level;
    const savedPos = savedLevelId === levelId ? this.lastSaveState?.player?.position : null;
    const x = savedPos ? savedPos.x : spawn.x;
    const y = savedPos ? savedPos.y : spawn.y;
    const savedStats = this.lastSaveState?.player?.stats ?? {};
    const stats = this.services.rpg.getStats();
    const classStats = this.currentClass === 'warrior'
      ? { health: 1.22, attack: 1.04, defense: 1.28, speed: 0.96, mana: 0.9, stamina: 1.12, manaRegen: 1, staminaRegen: 1.08 }
      : this.currentClass === 'assassin'
        ? { health: 0.92, attack: 1.18, defense: 0.92, speed: 1.18, mana: 0.92, stamina: 1.08, manaRegen: 1, staminaRegen: 1.12 }
        : { health: 0.94, attack: 0.94, defense: 0.92, speed: 1, mana: 1.5, stamina: 0.92, manaRegen: 1.55, staminaRegen: 0.95 };
    const regen = this.services.rpg.getRegenPerSecond();
    this.aren = new Player(this, {
      x, y,
      stats: { maxHealth: Math.round(stats.health * classStats.health), attack: Math.round(stats.attack * classStats.attack), defense: Math.round(stats.defense * classStats.defense), speed: Math.round(stats.speed * classStats.speed), maxMana: Math.round(stats.mana * classStats.mana), maxStamina: Math.round(stats.stamina * classStats.stamina), manaRegen: Math.max(2, regen.mana * classStats.manaRegen), staminaRegen: Math.max(22, regen.stamina * classStats.staminaRegen) },
      touch: false, autoRespawn: false, fallKillY: level.size.h + 160,
      camera: { bounds: { x: 0, y: 0, width: level.size.w, height: level.size.h }, lerpX: 0.12, lerpY: 0.1 },
      inputProvider: () => this.inputBridge.frame(),
    });
    if (savedPos && savedStats.health !== undefined) { this.aren.stats.health = Math.min(this.aren.stats.config.maxHealth, savedStats.health); this.aren.stats.mana = Math.min(this.aren.stats.config.maxMana, savedStats.mana ?? this.aren.stats.mana); this.aren.stats.stamina = Math.min(this.aren.stats.config.maxStamina, savedStats.stamina ?? this.aren.stats.stamina); }
    this.lastSaveState = null;
    this.aren.addGround(this.platforms);
    this.syncCompanions();
    this.aren.setCheckpoint(spawn.x, spawn.y);
    const respawnPoint = this.services.persistence.checkpoints.getRespawnPoint();
    if (respawnPoint.regionId === level.region) this.aren.setCheckpoint(respawnPoint.x, respawnPoint.y);
    this.physics.add.overlap(this.aren, this.collectGroup, (_p: any, item: any) => {
      const id = (item as Phaser.GameObjects.GameObject).getData('collectibleId');
      if (id && this.services.world.collect(id)) { const glow = (item as Phaser.GameObjects.GameObject).getData('glow') as Phaser.GameObjects.GameObject | undefined; glow?.destroy(); (item as Phaser.GameObjects.GameObject).destroy(); const def = this.services.world.content.collectibles.get(id); this.showCompactPickupGain(); }
    });

    this.currentBoss = null;
    this.combat = new CombatWorld({ scene: this, player: this.aren as any, rpg: this.services.rpg as any, region: level.region, level: this.services.rpg.getLevel(), spawns: level.enemies, hazards: level.hazards.map(h => ({ type: h.type, rect: { x: h.rect.x, y: h.rect.y, width: h.rect.w, height: h.rect.h }, damage: h.damage })), ground: this.platforms });
    const ngScale = this.services.rpg.ngPlus.getScaling();
    if (ngScale.cycle > 0) for (const enemy of this.combat.engine.getAlive()) {
      enemy.maxHealth = Math.round(enemy.maxHealth * ngScale.enemyHealthMult); enemy.health = enemy.maxHealth;
      enemy.baseDamage = (enemy.baseDamage ?? enemy.damage) * ngScale.enemyDamageMult; enemy.damage = enemy.baseDamage;
      enemy.xp = Math.round(enemy.xp * ngScale.xpMult); enemy.gold = Math.round(enemy.gold * ngScale.goldMult);
    }
    this.physics.world.resume();
    this.started = true;
    if (this.uiUtilityControls) this.uiUtilityControls.style.display = 'flex';
    this.activeZones.clear(); this.activePois.clear(); this.blockedExitAt.clear(); this.hudAccumulator = 0; this.triggerAccumulator = 0;
    this.ui?.setBackend(createUIBackend(this));
    this.ui?.showHud(true);
    this.updateHud();
    if (!this.currentBoss) this.ui?.banner(level.name, this.services.world.content.regions.get(level.region)?.tagline ?? 'The road continues', 'map');
  }

  private destroyLevel(): void {
    this.combat?.destroy();
    this.aren?.destroy();
    this.platforms?.clear(true, true);
    this.collectGroup?.clear(true, true);
    this.npcActors.forEach(n => n.label.destroy()); this.npcActors = [];
    this.companionActors = [];
    this.interactables = [];
    this.children.removeAll(true);
    this.aren = undefined as any; this.combat = undefined as any;
    this.platforms = undefined as any; this.collectGroup = undefined as any; this.levelDef = undefined as any;
    this.createPixelTexture();
  }

  /** Layered, region-aware dark-fantasy environment art built from lightweight Phaser primitives. */
  private drawAtmosphere(level: LevelDef): void {
    const palette = level.atmosphere.palette;
    const sky = Phaser.Display.Color.HexStringToColor(palette.sky).color;
    const mid = Phaser.Display.Color.HexStringToColor(palette.mid).color;
    const fore = Phaser.Display.Color.HexStringToColor(palette.fore).color;
    const w = level.size.w, h = level.size.h, horizon = h - 154;
    const region = String(level.region);
    const forest = region.includes('forest');
    const desert = region.includes('desert');
    const frost = region.includes('highland');
    const hollow = region.includes('hollow');
    const crown = region.includes('crownfall');
    const warm = desert || region.includes('ashen') || crown;
    const accent = frost ? 0x9bd9ef : forest ? 0x9fbd77 : hollow ? 0xb58be0 : 0xe6a66d;

    const skyLayer = this.add.graphics().setDepth(-40).setScrollFactor(0.035);
    skyLayer.fillGradientStyle(sky, sky, mid, mid, 1);
    skyLayer.fillRect(0, 0, w, h);
    skyLayer.fillStyle(accent, 0.055); skyLayer.fillCircle(w * 0.72, h * 0.27, Math.min(330, h * 0.42));
    skyLayer.fillStyle(0xf1d9b7, 0.075); skyLayer.fillCircle(w * 0.72, h * 0.27, Math.min(190, h * 0.25));
    // A moon with a soft halo and a subtle crescent shadow.
    const moonX = w * (desert ? 0.78 : 0.73), moonY = h * 0.2, moonR = frost ? 31 : 25;
    skyLayer.fillStyle(accent, 0.12); skyLayer.fillCircle(moonX, moonY, moonR * 2.8);
    skyLayer.fillStyle(0xf2e7d3, 0.82); skyLayer.fillCircle(moonX, moonY, moonR);
    skyLayer.fillStyle(sky, 0.72); skyLayer.fillCircle(moonX + moonR * 0.55, moonY - moonR * 0.24, moonR * 0.88);

    const stars = this.add.graphics().setDepth(-36).setScrollFactor(0.12);
    for (let i = 0; i < 126; i++) {
      const x = (i * 197 + (i % 7) * 31) % w;
      const y = 20 + ((i * 113) % Math.max(90, Math.floor(h * 0.58)));
      const bright = i % 13 === 0;
      stars.fillStyle(bright ? 0xffe1ad : 0xe0d8ce, bright ? 0.72 : 0.27);
      stars.fillCircle(x, y, bright ? 1.65 : 0.85);
      if (bright) {
        stars.lineStyle(1, 0xffe1ad, 0.28); stars.lineBetween(x - 5, y, x + 5, y); stars.lineBetween(x, y - 5, x, y + 5);
      }
    }

    // Three mountain and ridge layers create depth without image assets.
    const ridge = (depth: number, color: number, alpha: number, step: number, base: number, height: number, seed: number) => {
      const g = this.add.graphics().setDepth(depth).setScrollFactor(depth <= -30 ? 0.16 : depth <= -27 ? 0.28 : 0.42);
      g.fillStyle(color, alpha); g.beginPath(); g.moveTo(0, horizon + base);
      for (let x = 0; x <= w + step; x += step) {
        const variation = ((Math.floor(x / step) * 73 + seed * 41) % 100) / 100;
        g.lineTo(x, horizon - height * (0.34 + variation * 0.66) + base);
        g.lineTo(x + step * 0.48, horizon + base + 8);
      }
      g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillPath();
    };
    ridge(-31, Phaser.Display.Color.IntegerToColor(mid).darken(12).color, 0.48, 210, 5, frost ? 240 : 155, 2);
    ridge(-27, Phaser.Display.Color.IntegerToColor(fore).darken(18).color, 0.7, 285, 35, frost ? 185 : 112, 5);
    ridge(-23, Phaser.Display.Color.IntegerToColor(fore).darken(28).color, 0.82, 370, 52, 82, 8);

    // Architectural silhouettes vary by region: ruined hamlet, forest canopy, dunes, ice peaks or gothic city.
    const distant = this.add.graphics().setDepth(-18).setScrollFactor(0.58);
    const stone = Phaser.Display.Color.IntegerToColor(fore).darken(28).color;
    const stoneHi = Phaser.Display.Color.IntegerToColor(fore).darken(8).color;
    if (forest) {
      for (let i = 0; i < Math.ceil(w / 175); i++) {
        const x = i * 175 + 30, base = horizon + 55, th = 135 + (i * 47 % 105);
        distant.fillStyle(0x171e18, 0.9); distant.fillRoundedRect(x + 23, base - th * 0.46, 13, th * 0.54, 6);
        const canopy = i % 2 ? 0x263c2b : 0x30442f;
        distant.fillStyle(0x17251b, 0.9);
        distant.fillEllipse(x + 29, base - th * 0.56, 112, th * 0.58);
        distant.fillEllipse(x - 1, base - th * 0.38, 66, th * 0.4);
        distant.fillEllipse(x + 58, base - th * 0.4, 72, th * 0.43);
        distant.fillStyle(canopy, 0.94);
        distant.fillEllipse(x + 28, base - th * 0.59, 88, th * 0.48);
        distant.fillEllipse(x + 2, base - th * 0.4, 54, th * 0.32);
        distant.fillEllipse(x + 57, base - th * 0.42, 59, th * 0.34);
        distant.fillStyle(0x9fb87c, 0.16);
        distant.fillEllipse(x + 17, base - th * 0.72, 35, th * 0.16);
        distant.fillEllipse(x + 53, base - th * 0.51, 24, th * 0.13);
      }
    } else if (desert) {
      distant.fillStyle(0x9d7046, 0.2);
      for (let i = 0; i < Math.ceil(w / 520); i++) {
        const x = i * 520 - 100;
        distant.fillEllipse(x + 240, horizon + 52, 540, 118);
        distant.fillStyle(0x251c1a, 0.5); distant.fillRect(x + 230, horizon - 120, 18, 170);
        distant.fillTriangle(x + 239, horizon - 160, x + 202, horizon - 112, x + 276, horizon - 112);
        distant.fillStyle(0x9d7046, 0.2);
      }
    } else if (frost) {
      for (let i = 0; i < Math.ceil(w / 310); i++) {
        const x = i * 310 + 35, base = horizon + 55;
        distant.fillStyle(0x526b79, 0.72); distant.fillTriangle(x, base, x + 116, base - 230 - (i % 3) * 28, x + 242, base);
        distant.fillStyle(0xd5e8e9, 0.5); distant.fillTriangle(x + 116, base - 230 - (i % 3) * 28, x + 91, base - 112, x + 143, base - 112);
        distant.fillStyle(0x273c48, 0.72); distant.fillTriangle(x + 175, base, x + 218, base - 128, x + 267, base);
      }
    } else {
      for (let i = 0; i < Math.ceil(w / 430); i++) {
        const x = i * 430 + 48, base = horizon + 48;
        const towerH = 112 + ((i * 71) % 118), towerW = hollow ? 88 : 68;
        distant.fillStyle(stone, 0.93);
        distant.fillRect(x, base - towerH, towerW, towerH);
        distant.fillRect(x - 12, base - towerH - 10, towerW + 24, 13);
        // Broken crenellations and a narrow pointed roof.
        distant.fillRect(x + 9, base - towerH - 23, 12, 18); distant.fillRect(x + towerW - 21, base - towerH - 23, 12, 18);
        distant.fillTriangle(x + towerW / 2, base - towerH - (hollow ? 82 : 54), x + 8, base - towerH + 2, x + towerW - 8, base - towerH + 2);
        distant.fillStyle(0x151216, 0.86);
        distant.fillRoundedRect(x + towerW * 0.34, base - towerH + 38, towerW * 0.32, 48, 10);
        distant.fillStyle(stoneHi, 0.85);
        distant.fillRect(x + 105, base - 82, 142, 82);
        distant.fillRect(x + 124, base - 105, 18, 24); distant.fillRect(x + 202, base - 126, 18, 45);
        if (hollow || crown) {
          distant.lineStyle(5, stoneHi, 0.75);
          distant.beginPath(); distant.arc(x + 176, base - 2, 44, Math.PI, 0, false); distant.strokePath();
          distant.fillStyle(0x17131a, 0.88); distant.fillRect(x + 132, base - 3, 88, 50);
        }
        distant.fillStyle(accent, 0.42);
        distant.fillRect(x + towerW * 0.42, base - towerH + 58, 5, 13);
      }
    }

    // Foreground ridge and a broken stone/soil lip frame the playable plane.
    const ground = this.add.graphics().setDepth(2);
    ground.fillStyle(0x100d0d, 0.48); ground.fillRect(0, horizon + 36, w, h - horizon);
    ground.fillStyle(fore, 0.94); ground.beginPath(); ground.moveTo(0, horizon + 67);
    for (let x = 0; x <= w + 160; x += 160) ground.lineTo(x, horizon + 46 + ((x * 7) % 36));
    ground.lineTo(w, h); ground.lineTo(0, h); ground.closePath(); ground.fillPath();
    ground.fillStyle(0x171313, 0.58);
    for (let i = 0; i < Math.ceil(w / 235); i++) {
      const x = i * 235 + 26, y = horizon + 60 + (i % 3) * 7;
      ground.fillEllipse(x + 25, y + 2, 46, 17);
      ground.fillEllipse(x + 61, y + 4, 38, 13);
      ground.fillRoundedRect(x + 54, y - 8, 13, 12, 4);
      if (forest) {
        ground.lineStyle(2, 0x71844c, 0.8);
        ground.lineBetween(x + 92, y + 8, x + 84, y - 5); ground.lineBetween(x + 84, y - 5, x + 86, y - 18);
        ground.lineBetween(x + 92, y + 8, x + 105, y - 2); ground.lineBetween(x + 105, y - 2, x + 105, y - 12);
      }
    }

    // Small biome-specific ground dressing adds a readable foreground silhouette
    // while keeping all details baked into one graphics object.
    const dressingCount = Math.ceil(w / 210);
    for (let i = 0; i < dressingCount; i++) {
      const x = i * 210 + 36 + (i % 3) * 19;
      const y = horizon + 52 + (i % 4) * 8;
      if (forest) {
        ground.lineStyle(3, 0x334c2d, 0.9);
        ground.lineBetween(x, y + 12, x - 5, y - 3);
        ground.lineBetween(x - 5, y - 3, x - 13, y - 11);
        ground.lineBetween(x, y + 12, x + 8, y - 5);
        ground.lineBetween(x + 8, y - 5, x + 16, y - 12);
        ground.fillStyle(0x9bbd69, 0.82);
        ground.fillEllipse(x - 11, y - 11, 10, 5);
        ground.fillEllipse(x + 16, y - 12, 11, 5);
      } else if (desert) {
        ground.lineStyle(2, 0xd6ad73, 0.34);
        ground.lineBetween(x - 18, y + 4, x - 4, y - 1);
        ground.lineBetween(x - 4, y - 1, x + 5, y + 3);
        ground.lineBetween(x + 5, y + 3, x + 19, y - 2);
        ground.fillStyle(0x5b4934, 0.68);
        ground.fillTriangle(x, y + 5, x - 7, y - 13, x + 2, y - 7);
        ground.fillTriangle(x + 3, y + 5, x + 11, y - 10, x + 7, y + 5);
      } else if (frost) {
        ground.fillStyle(0x9bd9e8, 0.3);
        ground.fillTriangle(x, y + 5, x - 7, y - 16, x + 3, y - 7);
        ground.fillTriangle(x + 9, y + 5, x + 15, y - 12, x + 17, y + 5);
        ground.lineStyle(1, 0xe4f8ff, 0.38);
        ground.lineBetween(x - 3, y - 7, x + 1, y + 3);
      } else if (hollow) {
        ground.lineStyle(3, 0x665078, 0.72);
        ground.lineBetween(x - 8, y + 8, x - 3, y - 10);
        ground.lineBetween(x - 3, y - 10, x + 5, y - 17);
        ground.lineBetween(x - 3, y - 10, x + 8, y - 5);
        ground.fillStyle(0xb58be0, 0.48);
        ground.fillCircle(x + 8, y - 5, 3);
      } else {
        ground.fillStyle(0x2a1d1a, 0.78);
        ground.fillEllipse(x, y + 4, 22, 7);
        ground.fillStyle(0xc18a5d, 0.38);
        ground.fillTriangle(x - 5, y + 2, x + 1, y - 8, x + 6, y + 2);
        ground.lineStyle(1, 0x6b4639, 0.5);
        ground.lineBetween(x + 12, y + 4, x + 22, y - 2);
      }
    }
    ground.fillStyle(accent, warm ? 0.13 : 0.1); ground.fillEllipse(w * 0.48, horizon + 92, Math.min(640, w * 0.48), 54);

    // Low drifting mist gives the level a layered, cinematic silhouette.
    for (let i = 0; i < 2; i++) {
      const mist = this.add.ellipse(w * (0.28 + i * 0.42), horizon + 22 + i * 18, 360, 28, frost ? 0xc6e4ee : 0xb8a9a0, 0.035).setDepth(-5 + i);
      this.tweens.add({ targets: mist, x: mist.x + (i ? -55 : 55), alpha: 0.018, duration: 14000 + i * 2000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    // Weather particles are deterministic and deliberately sparse for mobile performance.
    const weather = String(level.atmosphere.weather);
    const particleColor = weather.includes('snow') || frost ? 0xd8eff7 : weather.includes('sand') || desert ? 0xe0b878 : accent;
    if (weather === 'ash' || weather === 'embers' || weather.includes('snow') || weather.includes('fog') || weather.includes('sand') || warm) {
      const count = frost || weather.includes('snow') ? 8 : 10;
      for (let i = 0; i < count; i++) {
        const x = (i * 191) % w, y = 42 + (i * 61) % Math.max(100, h - 100);
        const size = frost ? 1 + (i % 3) * 0.55 : 1 + i % 2;
        const particle = this.add.circle(x, y, size, particleColor, 0.22 + (i % 4) * 0.09).setDepth(1);
        this.tweens.add({ targets: particle, x: x + (frost ? 24 : -14) + (i % 3) * 5, y: y - (frost ? -24 : 16 + (i % 3) * 6), alpha: 0.05, duration: 5200 + (i % 4) * 900, delay: i * 120, repeat: -1, yoyo: true, ease: 'Sine.InOut' });
      }
    }
  }

  /** Material-specific hand-painted platform atlas, generated once and reused to avoid flat coloured rectangles. */
  private platformTexture(kind: string): string {
    const key = `aoc-platform-${kind}`;
    if (this.textures.exists(key)) return key;
    const g = this.add.graphics();
    const base: Record<string, number> = { ground: 0x51423d, stone: 0x71645c, wood: 0x76523d, ice: 0x9db5c2, sand: 0x92724d, crumble: 0x6d5146, oneway: 0x8a6a50, vine: 0x4e6947, metal: 0x59616a };
    const color = base[kind] ?? base.ground;
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(28).color;
    const light = Phaser.Display.Color.IntegerToColor(color).brighten(24).color;
    g.fillStyle(dark, 1); g.fillRect(0, 0, 320, 96);
    g.fillStyle(color, 1); g.fillRoundedRect(1, 1, 318, 91, 8);
    g.fillStyle(light, 0.72); g.fillRoundedRect(0, 0, 320, 8, 4);
    g.fillStyle(0x090808, 0.28); g.fillRect(0, 86, 320, 10);
    g.fillStyle(light, 0.2); g.fillRect(2, 9, 316, 2);
    if (kind === 'wood' || kind === 'oneway') {
      for (let y = 16; y < 92; y += 25) {
        g.fillStyle(dark, 0.52); g.fillRoundedRect(3, y, 314, 19, 5);
        g.lineStyle(2, light, 0.48); g.lineBetween(8, y + 3, 310, y + 3);
        for (let x = 28; x < 310; x += 78) { g.lineStyle(1, dark, 0.8); g.lineBetween(x, y + 5, x + 4, y + 16); g.fillStyle(0x2b1c16, 0.7); g.fillCircle(x + 13, y + 10, 2); }
      }
    } else if (kind === 'ice') {
      for (let x = 14; x < 320; x += 48) { g.fillStyle(0xe7fbff, 0.32); g.beginPath(); g.moveTo(x, 7); g.lineTo(x + 17, 18); g.lineTo(x + 8, 61); g.lineTo(x - 5, 40); g.closePath(); g.fillPath(); g.lineStyle(1, 0xf4ffff, 0.42); g.lineBetween(x + 4, 12, x + 7, 54); }
      g.fillStyle(0x284957, 0.24); g.fillRect(0, 72, 320, 20);
    } else if (kind === 'sand') {
      for (let y = 13; y < 96; y += 13) { g.lineStyle(2, y % 2 ? 0xd8b77e : dark, 0.3); g.beginPath(); g.moveTo(0, y); g.lineTo(72, y - 4); g.lineTo(156, y + 2); g.lineTo(238, y - 3); g.lineTo(320, y + 1); g.strokePath(); }
      for (let i = 0; i < 38; i++) { const x = (i * 83) % 320, y = 12 + (i * 29) % 75; g.fillStyle(light, 0.32); g.fillCircle(x, y, 1 + i % 2); }
    } else if (kind === 'vine') {
      for (let x = 10; x < 320; x += 36) { g.lineStyle(3, 0x263e28, 0.75); g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 8, 32); g.lineTo(x - 2, 57); g.lineTo(x + 10, 86); g.strokePath(); g.fillStyle(0x9bbd69, 0.9); g.fillEllipse(x + 7, 30, 14, 7); g.fillEllipse(x - 1, 58, 13, 6); }
    } else {
      // Uneven masonry: overlapping irregular stone faces, chipped highlights and hairline cracks.
      for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
        const x = col * 66 + (row ? -22 : 0), y = 12 + row * 40;
        const wobble = (col * 7 + row * 11) % 9;
        g.fillStyle(dark, 0.72); g.beginPath(); g.moveTo(x + 4, y + 2); g.lineTo(x + 52, y - wobble); g.lineTo(x + 63, y + 12); g.lineTo(x + 55, y + 31); g.lineTo(x + 8, y + 34); g.lineTo(x - 3, y + 17); g.closePath(); g.fillPath();
        g.fillStyle(color, 1); g.beginPath(); g.moveTo(x + 5, y + 3); g.lineTo(x + 49, y + 1 - wobble); g.lineTo(x + 59, y + 12); g.lineTo(x + 52, y + 27); g.lineTo(x + 9, y + 30); g.lineTo(x, y + 15); g.closePath(); g.fillPath();
        g.lineStyle(2, light, 0.38); g.lineBetween(x + 7, y + 5, x + 44, y + 3 - wobble);
        g.lineStyle(1, 0x211a18, 0.62); g.lineBetween(x + 28, y + 14, x + 34, y + 20); g.lineBetween(x + 34, y + 20, x + 31, y + 25);
      }
      if (kind === 'crumble') { g.fillStyle(0x2a211d, 0.7); for (let i = 0; i < 22; i++) g.fillCircle((i * 47) % 320, 12 + (i * 19) % 78, 2 + i % 3); }
      if (kind === 'metal') { g.lineStyle(2, 0xb5c0c8, 0.45); for (let x = 20; x < 320; x += 58) g.lineBetween(x, 8, x + 8, 88); g.fillStyle(0x171d22, 0.6); for (let x = 16; x < 320; x += 64) { g.fillCircle(x, 16, 2.5); g.fillCircle(x, 80, 2.5); } }
    }
    if (kind === 'ground') {
      // Mossy top seam, root threads and embedded pebbles distinguish natural earth from masonry.
      g.fillStyle(0x81915a, 0.9); g.fillRect(2, 1, 316, 5);
      g.fillStyle(0x263626, 0.8); g.fillRect(0, 7, 320, 4);
      for (let x = 12; x < 320; x += 37) {
        g.fillStyle(0xb0bf76, 0.72); g.fillTriangle(x, 5, x + 5, 15 + (x % 3), x + 9, 5);
        g.fillStyle(0x241c19, 0.55); g.fillEllipse(x + 17, 70 + (x % 13), 9, 4);
      }
    } else if (kind === 'stone') {
      // Chisel marks and chipped corners catch the light without extra scene objects.
      for (let x = 18; x < 320; x += 54) {
        g.lineStyle(2, light, 0.3); g.lineBetween(x, 18, x + 9, 14);
        g.lineStyle(1, 0x211a18, 0.62); g.lineBetween(x + 18, 48, x + 27, 55);
        g.fillStyle(0x171313, 0.42); g.fillTriangle(x + 38, 10, x + 47, 13, x + 42, 20);
      }
    } else if (kind === 'crumble') {
      g.lineStyle(2, 0x241a18, 0.78);
      for (let x = 22; x < 310; x += 61) {
        g.lineBetween(x, 18, x + 8, 33); g.lineBetween(x + 8, 33, x + 2, 47);
        g.lineBetween(x + 2, 47, x + 14, 63);
      }
      g.fillStyle(0xc18a5d, 0.42);
      for (let i = 0; i < 12; i++) g.fillTriangle((i * 53) % 310, 5, (i * 53) % 310 + 5, 14, (i * 53) % 310 + 10, 5);
    }
    g.generateTexture(key, 320, 96); g.destroy(); return key;
  }

  private platformColor(kind: string): number {
    const colors: Record<string, number> = { ground: 0x51423d, stone: 0x71645c, wood: 0x76523d, ice: 0x9db5c2, sand: 0x92724d, crumble: 0x6d5146, oneway: 0x8a6a50, vine: 0x4e6947, metal: 0x59616a };
    return colors[kind] ?? colors.ground;
  }

  private drawHazards(level: LevelDef): void {
    for (const h of level.hazards) {
      const g = this.add.graphics().setDepth(5);
      const cold = h.type.includes('ice') || h.type.includes('avalanche') || h.type.includes('frost');
      const tint = cold ? 0x9bd7e8 : h.type.includes('void') || h.type.includes('hush') ? 0x9c78d4 : 0xe65b2f;
      g.fillStyle(tint, 0.12); g.fillRoundedRect(h.rect.x - 5, h.rect.y - 5, h.rect.w + 10, h.rect.h + 10, 8);
      g.fillStyle(tint, 0.42); g.fillRoundedRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h, 5);
      g.lineStyle(2, cold ? 0xdaf7ff : 0xffbd78, 0.72).strokeRoundedRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h, 5);
      g.lineStyle(1, 0xffffff, 0.22);
      for (let k = 1; k < Math.max(2, Math.floor(h.rect.w / 24)); k++) {
        const px = h.rect.x + k * h.rect.w / Math.max(2, Math.floor(h.rect.w / 24));
        g.lineBetween(px, h.rect.y + 3, px + (cold ? 5 : -4), h.rect.y + h.rect.h - 3);
      }
      for (let k = 0; k < Math.min(3, Math.ceil(h.rect.w / 60)); k++) {
        const px = h.rect.x + 8 + k * 22;
        const mote = this.add.circle(px, h.rect.y + h.rect.h / 2, cold ? 2 : 2.5, cold ? 0xdaf7ff : 0xffc07a, 0.7).setDepth(6);
        this.tweens.add({ targets: mote, y: mote.y - (cold ? 8 : 15), alpha: 0.12, duration: 850 + k * 95, yoyo: true, repeat: -1 });
      }
    }
  }

  private drawLore(level: LevelDef): void {
    for (const item of level.lore) {
      const color = item.kind === 'letter' ? '#d9c9a8' : '#a58b70';
      this.add.text(item.x, item.y - 38, item.kind === 'grave' ? '†' : '✧', { fontFamily: 'Georgia', fontSize: '23px', color, stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5).setDepth(6);
    }
  }

  /** Pre-render each named villager once; one textured sprite replaces a stack of live vector objects. */
  private npcTexture(id: string, cloth: number): string {
    const key = `aoc-npc-${id}`;
    if (this.textures.exists(key)) return key;
    const texture = this.textures.createCanvas(key, 96, 128);
    if (!texture) throw new Error('Unable to create NPC canvas texture');
    const ctx = texture.getContext();
    const color = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
    const base = color(cloth);
    const dark = color(Phaser.Display.Color.IntegerToColor(cloth).darken(34).color);
    const light = color(Phaser.Display.Color.IntegerToColor(cloth).brighten(22).color);
    const trim = '#c9a66f';
    ctx.clearRect(0, 0, 96, 128);

    // Layered cloak and robe, shaped with curves rather than primitive silhouettes.
    const cloak = ctx.createLinearGradient(17, 38, 78, 116);
    cloak.addColorStop(0, '#17151a'); cloak.addColorStop(.48, dark); cloak.addColorStop(1, '#100e13');
    ctx.beginPath(); ctx.moveTo(31, 38); ctx.quadraticCurveTo(18, 42, 16, 63);
    ctx.lineTo(9, 112); ctx.quadraticCurveTo(48, 126, 87, 112);
    ctx.lineTo(79, 62); ctx.quadraticCurveTo(77, 42, 64, 38);
    ctx.quadraticCurveTo(48, 31, 31, 38); ctx.closePath();
    ctx.fillStyle = cloak; ctx.fill();
    ctx.strokeStyle = '#100d11'; ctx.lineWidth = 3; ctx.stroke();

    const robe = ctx.createLinearGradient(24, 42, 72, 112);
    robe.addColorStop(0, dark); robe.addColorStop(.42, base); robe.addColorStop(.72, light); robe.addColorStop(1, dark);
    ctx.beginPath(); ctx.moveTo(31, 42); ctx.quadraticCurveTo(48, 34, 65, 42);
    ctx.quadraticCurveTo(73, 60, 70, 83); ctx.lineTo(78, 112);
    ctx.quadraticCurveTo(48, 120, 18, 112); ctx.lineTo(26, 82);
    ctx.quadraticCurveTo(22, 59, 31, 42); ctx.closePath();
    ctx.fillStyle = robe; ctx.fill(); ctx.strokeStyle = trim; ctx.lineWidth = 1.8; ctx.stroke();

    // Sleeves and hands.
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(29, 47); ctx.quadraticCurveTo(16, 49, 19, 69); ctx.lineTo(28, 84); ctx.lineTo(36, 78); ctx.lineTo(33, 58); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(66, 47); ctx.quadraticCurveTo(80, 49, 77, 69); ctx.lineTo(68, 84); ctx.lineTo(60, 78); ctx.lineTo(63, 58); ctx.closePath(); ctx.fill();
    const skin = ctx.createLinearGradient(35, 0, 62, 0); skin.addColorStop(0, '#795746'); skin.addColorStop(.5, '#c99b79'); skin.addColorStop(1, '#8b604b');
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(30, 83, 5, 7, -.18, 0, Math.PI * 2); ctx.ellipse(66, 83, 5, 7, .18, 0, Math.PI * 2); ctx.fill();

    // Neck and face with a softly shaded profile.
    ctx.fillStyle = '#8b604b'; ctx.fillRect(42, 31, 12, 14);
    const face = ctx.createRadialGradient(42, 23, 2, 49, 25, 22);
    face.addColorStop(0, '#e0b28d'); face.addColorStop(.72, '#bd8969'); face.addColorStop(1, '#754c3d');
    ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(48, 24, 14, 19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#32231f'; ctx.beginPath(); ctx.moveTo(34, 22); ctx.quadraticCurveTo(31, 3, 48, 4); ctx.quadraticCurveTo(66, 4, 62, 23);
    ctx.quadraticCurveTo(56, 13, 48, 15); ctx.quadraticCurveTo(40, 14, 34, 22); ctx.fill();
    ctx.fillStyle = '#231a19'; ctx.beginPath(); ctx.ellipse(43, 25, 1.7, 1.1, 0, 0, Math.PI * 2); ctx.ellipse(53, 25, 1.7, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#704b3d'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(48, 27); ctx.lineTo(47, 31); ctx.stroke();
    ctx.strokeStyle = '#70453c'; ctx.beginPath(); ctx.moveTo(44, 35); ctx.quadraticCurveTo(48, 37, 52, 35); ctx.stroke();

    // Hood, mantle, stitching and worn metal details.
    ctx.fillStyle = cloak; ctx.beginPath(); ctx.moveTo(29, 23); ctx.quadraticCurveTo(28, 2, 48, 1); ctx.quadraticCurveTo(70, 2, 67, 24);
    ctx.quadraticCurveTo(61, 13, 56, 12); ctx.quadraticCurveTo(43, 9, 36, 18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(31, 42); ctx.quadraticCurveTo(48, 52, 65, 42); ctx.stroke();
    ctx.strokeStyle = 'rgba(242,218,175,.32)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28, 58); ctx.quadraticCurveTo(22, 83, 22, 105); ctx.moveTo(68, 58); ctx.quadraticCurveTo(75, 84, 73, 105); ctx.stroke();
    ctx.strokeStyle = 'rgba(18,12,12,.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(38, 58); ctx.quadraticCurveTo(34, 83, 38, 106); ctx.moveTo(57, 58); ctx.quadraticCurveTo(63, 83, 58, 106); ctx.stroke();
    ctx.fillStyle = '#3b2b25'; ctx.fillRect(27, 72, 42, 5);
    ctx.fillStyle = trim; ctx.fillRect(44, 70, 9, 9);
    ctx.fillStyle = '#ead3a2'; ctx.fillRect(47, 72, 3, 4);
    ctx.fillStyle = 'rgba(225,190,130,.72)'; ctx.beginPath(); ctx.arc(48, 47, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(9,7,9,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(17, 113); ctx.quadraticCurveTo(48, 121, 79, 113); ctx.stroke();
    texture.refresh();
    return key;
  }

  private drawNpcs(npcs: any[], _level: LevelDef): void {
    const palette: Record<string, number> = { tamsin: 0x875447, kael: 0x526a7a, lyra: 0x667b55, brom: 0x9a7544, hobb: 0x805447, marta: 0x7d6250 };
    for (const spawn of npcs) {
      const def = this.services.world.content.npcs.get(spawn.npc);
      if (!def) continue;
      const x = spawn.x, y = spawn.y;
      const cloth = palette[spawn.npc] ?? 0x655044;
      const shadow = this.add.ellipse(x, y - 2, 31, 8, 0x000000, 0.46).setDepth(7);
      // NPCs were rendered at over twice Aren's visual height and looked detached
      // from the playable world. Keep their feet anchored and bring them to a shared scale.
      const actor = this.add.image(x, y, this.npcTexture(spawn.npc, cloth)).setOrigin(0.5, 1).setDepth(8).setScale(0.66);
      // Restrained breathing and cloak sway pivot around the feet, never lifting the actor.
      this.tweens.add({ targets: actor, scaleY: 0.674, angle: 0.65, duration: 2450 + (x % 5) * 110, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tweens.add({ targets: shadow, scaleX: 1.06, alpha: 0.36, duration: 2450 + (x % 5) * 110, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      const plaque = this.add.container(x, y - 88, [
        this.add.rectangle(0, 0, Math.min(190, Math.max(92, def.name.length * 9 + 34)), 23, 0x100d0b, 0.82).setStrokeStyle(1, 0x9a774b, 0.82),
        this.add.text(0, 0, def.name, { fontFamily: 'Georgia', fontSize: '12px', color: '#f0dfc3', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5),
        this.add.circle(-42, 0, 2, 0xe5bd79, 0.9),
      ]).setDepth(10);
      this.npcActors.push({ id: spawn.npc, x, y, label: plaque.list[1] as Phaser.GameObjects.Text });
    }
  }

  private drawInteractables(level: LevelDef): void {
    for (const item of level.interactables) {
      const g = this.add.container(item.x, item.y).setDepth(7);
      const id = String(item.id).toLowerCase();
      if (id.includes('well')) {
        g.add(this.add.ellipse(0, -4, 52, 18, 0x171313).setStrokeStyle(4, 0x8c7968));
        g.add(this.add.rectangle(0, -20, 42, 31, 0x51463e).setStrokeStyle(2, 0x9e896e));
        g.add(this.add.ellipse(0, -36, 48, 14, 0x302721).setStrokeStyle(4, 0xb49a75));
        g.add(this.add.ellipse(0, -36, 31, 8, 0x101923, 0.96));
        g.add(this.add.line(0, -49, -17, 0, -17, 16, 0x8b6a45).setLineWidth(4));
        g.add(this.add.line(0, -49, 17, 0, 17, 16, 0x8b6a45).setLineWidth(4));
        g.add(this.add.line(0, -56, -19, 0, 19, 0, 0xc49b65).setLineWidth(3));
        g.add(this.add.line(0, -55, 0, 0, 0, 17, 0x9d8059).setLineWidth(2));
      } else if (id.includes('forge') || id.includes('anvil')) {
        g.add(this.add.rectangle(0, -17, 42, 25, 0x3b302b).setStrokeStyle(2, 0x9b7652));
        g.add(this.add.triangle(0, -38, -17, 0, 0, -12, 18, 0, 0x68717a).setStrokeStyle(2, 0xb7a38a));
        g.add(this.add.ellipse(0, -48, 26, 10, 0xff8c3b, 0.55));
        g.add(this.add.circle(0, -48, 6, 0xffd18a, 0.9));
      } else if (id.includes('chest') || id.includes('cache') || id.includes('crate')) {
        g.add(this.add.rectangle(0, -15, 38, 25, 0x68452e).setStrokeStyle(3, 0xc49a5c));
        g.add(this.add.rectangle(0, -29, 38, 10, 0x8b6039).setStrokeStyle(2, 0xd4ae6e));
        g.add(this.add.rectangle(0, -16, 6, 10, 0xd9b76d).setStrokeStyle(1, 0x47301e));
      } else if (id.includes('shrine') || id.includes('memory') || id.includes('altar')) {
        g.add(this.add.rectangle(0, -14, 32, 28, 0x51484a).setStrokeStyle(2, 0xa99a8c));
        g.add(this.add.triangle(0, -37, -17, 0, 0, -26, 17, 0, 0x77717d).setStrokeStyle(2, 0xc1b1a0));
        g.add(this.add.circle(0, -33, 7, 0x9bd5ed, 0.75));
        g.add(this.add.circle(0, -33, 15, 0x8acbe8, 0.1).setStrokeStyle(1, 0xb8eaff, 0.55));
      } else {
        g.add(this.add.rectangle(0, -19, 30, 36, 0x4a3830).setStrokeStyle(2, 0xc49b6b));
        g.add(this.add.rectangle(0, -37, 22, 5, 0x9c805d));
        g.add(this.add.circle(0, -20, 4, 0xe4c17c));
      }
      const labelBg = this.add.rectangle(item.label.length * 3.3, -75, Math.min(210, item.label.length * 7.5 + 24), 22, 0x100d0b, 0.76).setStrokeStyle(1, 0x806343, 0.8);
      const label = this.add.text(item.label.length * 3.3, -75, item.label, { fontFamily: 'Georgia', fontSize: '11px', color: '#e8d7ba', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5).setDepth(8);
      g.add([labelBg, label]);
      // Small looping prop animation adds life to the world without spawning particles.
      if (id.includes('forge') || id.includes('anvil')) {
        const flame = g.list[2] as Phaser.GameObjects.Ellipse;
        const core = g.list[3] as Phaser.GameObjects.Arc;
        if (flame) this.tweens.add({ targets: flame, alpha: 0.28, scaleX: 0.82, scaleY: 1.22, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        if (core) this.tweens.add({ targets: core, alpha: 0.55, scale: 0.82, duration: 340, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      } else if (id.includes('shrine') || id.includes('memory') || id.includes('altar')) {
        const glow = g.list[2] as Phaser.GameObjects.Arc;
        const halo = g.list[3] as Phaser.GameObjects.Arc;
        if (glow) this.tweens.add({ targets: glow, alpha: 0.98, scale: 1.16, duration: 1450, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        if (halo) this.tweens.add({ targets: halo, alpha: 0.22, scale: 1.12, duration: 1450, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      } else if (id.includes('chest') || id.includes('cache')) {
        const glint = this.add.star(0, -40, 4, 2, 5, 0xf3d28b, 0.8).setDepth(8);
        g.add(glint);
        this.tweens.add({ targets: glint, alpha: 0.12, angle: 90, scale: 0.65, duration: 1150, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      }
      this.interactables.push({ id: item.id, x: item.x, y: item.y, label: item.label });
    }
  }

  private drawExitsAndPaths(runtime: any, level: LevelDef): void {
    for (const exit of level.exits) {
      const r = exit.rect;
      this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x3a2522, 0.25).setStrokeStyle(3, 0xc99b5b, 0.8).setDepth(6);
      this.add.text(r.x + r.w / 2, r.y - 28, 'WAY FORWARD', { fontSize: '10px', color: '#f0c77f', stroke: '#171315', strokeThickness: 3, letterSpacing: 1 }).setOrigin(0.5).setDepth(8);
    }
    for (const path of runtime.hiddenPaths ?? []) if (path.revealed) {
      const r = path.rect;
      this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x75c6ad, 0.25).setStrokeStyle(2, 0x8fe4c9, 0.9).setDepth(6);
      this.add.text(r.x + r.w / 2, r.y - 22, 'HIDDEN PATH', { fontSize: '9px', color: '#a7f0d5', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5).setDepth(8);
    }
  }

  private drawCollectibles(items: any[]): void {
    this.collectGroup = this.physics.add.staticGroup();
    for (const item of items) {
      const orb = this.collectGroup.create(item.x, item.y, 'aoc-pixel') as Phaser.Physics.Arcade.Image;
      orb.setDisplaySize(20, 20).setTint(0xf4c36b).setCircle(10).refreshBody();
      orb.setData('collectibleId', item.id);
      const glow = this.add.circle(item.x, item.y, 18, 0xeeb85e, 0.12).setDepth(5);
      orb.setData('glow', glow);
    }
  }

  private syncStoryFlags(): void {
    if (!this.services) return;
    const saved = this.services.world.serialize() as any;
    for (const flag of saved.flags ?? []) if (typeof flag === 'string' && !this.syncedStoryFlags.has(flag)) {
      this.syncedStoryFlags.add(flag); this.services.rpg.setStoryFlag(flag, true);
    }
  }

  private syncCompanions(): void {
    if (!this.aren) return;
    const specs = this.services.world.getPartySpecs();
    const wanted = new Set(specs.map((s: any) => s.id));
    for (const old of this.companionActors) if (!wanted.has(old.id)) old.actor.destroy();
    this.companionActors = this.companionActors.filter(c => wanted.has(c.id));
    for (const spec of specs) {
      if (this.companionActors.some(c => c.id === spec.id)) continue;
      const color = spec.id === 'tamsin' ? 0x9b6852 : spec.id === 'sylwen' ? 0x668c66 : spec.id === 'idris' ? 0xc19b55 : 0x71869b;
      const shade = Phaser.Display.Color.IntegerToColor(color).darken(34).color;
      const shadow = this.add.ellipse(0, 5, 38, 11, 0x000000, 0.34);
      const cape = this.add.ellipse(-1, -25, 38, 50, shade).setStrokeStyle(1, 0x241a16);
      const body = this.add.ellipse(0, -25, 26, 43, color).setStrokeStyle(2, 0xd5bd94);
      const belt = this.add.rectangle(0, -30, 24, 4, 0x493126);
      const clasp = this.add.star(0, -43, 4, 2, 4, 0xd6b779);
      const neck = this.add.rectangle(0, -45, 8, 8, 0xa77f63);
      const head = this.add.ellipse(0, -55, 18, 21, 0xc9a27e).setStrokeStyle(2, 0x332622);
      const hair = this.add.arc(0, -59, 10, 190, 350, false, shade).setStrokeStyle(3, 0x241b18);
      const eyes = this.add.line(0, -54, -4, 0, 4, 0, 0x33231d, 0.85).setLineWidth(1.4);
      const label = this.add.text(0, -78, spec.name, { fontSize: '10px', color: '#e8d7ba', stroke: '#171315', strokeThickness: 4 }).setOrigin(0.5);
      const offset = 78 + this.companionActors.length * 46;
      const actor = this.add.container(this.aren.x - this.aren.facing * offset, this.aren.y, [shadow, cape, body, belt, clasp, neck, head, hair, eyes, label]).setDepth(8);
      this.companionActors.push({ id: spec.id, actor, offset });
    }
  }

  private updateCompanionPositions(): void {
    if (!this.aren) return;
    for (let i = 0; i < this.companionActors.length; i++) {
      const c = this.companionActors[i];
      // Keep companions on the same ground plane as Aren; no vertical bobbing that looks like hovering.
      const x = this.aren.x - this.aren.facing * c.offset, y = this.aren.y + i * 2;
      if (Math.abs(c.actor.x - x) > 0.5 || Math.abs(c.actor.y - y) > 0.5) c.actor.setPosition(x, y);
    }
  }

  private updateWorldTriggers(): void {
    const px = this.aren.x, py = this.aren.y;
    for (const zone of this.levelDef.zones) {
      const inside = px >= zone.rect.x && px <= zone.rect.x + zone.rect.w && py >= zone.rect.y && py <= zone.rect.y + zone.rect.h;
      if (inside && !this.activeZones.has(zone.id)) { this.activeZones.add(zone.id); if (!this.services.world.hasFlag(`zone_${zone.id}`)) this.services.world.reportZone(zone.id); }
      if (!inside) this.activeZones.delete(zone.id);
    }
    for (const poi of this.services.world.content.pois.values()) {
      if (poi.level !== this.currentLevelId) continue;
      const near = Math.hypot(px - poi.x, py - poi.y) < 48;
      if (near && !this.activePois.has(poi.id)) {
        this.activePois.add(poi.id); if (!this.services.world.hasFlag(`zone_${poi.id}`)) this.services.world.reportZone(poi.id);
        if (poi.kind === 'camp' || poi.kind === 'shrine') {
          this.services.persistence.checkpoints.activate(`memory_${poi.id}`);
          this.aren.setCheckpoint(poi.x, poi.y);
          this.aren.stats.heal(this.aren.stats.config.maxHealth);
          this.aren.stats.restoreMana(this.aren.stats.config.maxMana);
          this.aren.stats.stamina = this.aren.stats.config.maxStamina;
          this.ui?.toast({ text: 'Memory Stone: checkpoint set and vitality restored.', kind: 'success', icon: 'save' });
        }
      } else if (!near) this.activePois.delete(poi.id);
    }
    for (const exit of this.levelDef.exits) {
      const r = exit.rect;
      if (px >= r.x && px <= r.x + r.w && py >= r.y - 20 && py <= r.y + r.h + 20) {
        const result = this.services.world.useExit(this.currentLevelId, exit.id);
        if (!result.ok) { const now = this.time.now; if (now - (this.blockedExitAt.get(exit.id) ?? 0) > 2200) { this.blockedExitAt.set(exit.id, now); this.ui?.toast({ text: result.reason ?? 'The way is sealed.', kind: 'warning' }); } }
        else return;
      }
    }
  }

  private interactNearby(): void {
    if (!this.started || !this.aren || this.ui?.isBlocking) return;
    const p = this.aren;
    const npc = this.npcActors.find(n => Math.hypot(p.x - n.x, p.y - n.y) < 110);
    if (npc) { this.services.world.talkTo(npc.id); return; }
    const object = this.interactables.find(o => Math.hypot(p.x - o.x, p.y - o.y) < 115);
    if (object) {
      this.services.world.reportInteract(object.id);
      this.ui?.toast({ text: object.label, kind: 'info' });
      if (object.id === 'old_well') this.ui?.toast({ text: 'The stones shift. Something is hidden below.', kind: 'success' });
      return;
    }
    const zone = this.levelDef.zones.find(z => p.x >= z.rect.x - 80 && p.x <= z.rect.x + z.rect.w + 80 && p.y >= z.rect.y - 80 && p.y <= z.rect.y + z.rect.h + 80);
    if (zone?.id === 'forge_yard') { this.ui?.openShop('ashen_blacksmith'); return; }
    if (zone?.id === 'village_square') { this.ui?.openShop('ashen_apothecary'); return; }
    const lore = this.levelDef.lore.find(l => Math.hypot(p.x - l.x, p.y - l.y) < 90);
    if (lore) this.ui?.toast({ text: lore.text, kind: 'info' });
    else this.ui?.toast({ text: 'Nothing to interact with nearby.', kind: 'info' });
  }

  /** Compact pickup feedback anchored to the currency HUD instead of a screen-sized toast. */
  private showCompactPickupGain(): void {
    const root = this.ui?.root;
    if (!root) return;
    const anchor = root.querySelector<HTMLElement>('.hud__gold') ?? root.querySelector<HTMLElement>('.hud__corner');
    if (!anchor) return;
    anchor.style.position = 'relative';
    let style = root.querySelector<HTMLStyleElement>('#aoc-pickup-fx-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'aoc-pickup-fx-style';
      style.textContent = `
        .aoc-pickup-gain{position:absolute;inset-inline-end:0;top:-25px;z-index:30;pointer-events:none;white-space:nowrap;
          color:#b9f1d0;font:800 15px/1.2 system-ui,sans-serif;text-shadow:0 2px 7px #07110b,0 0 12px rgba(112,226,164,.6);
          animation:aoc-pickup-rise 950ms cubic-bezier(.16,.7,.25,1) forwards}
        @keyframes aoc-pickup-rise{0%{opacity:0;transform:translateY(10px) scale(.72)}18%{opacity:1;transform:translateY(0) scale(1.12)}72%{opacity:1;transform:translateY(-9px) scale(1)}100%{opacity:0;transform:translateY(-18px) scale(.94)}}
      `;
      root.appendChild(style);
    }
    const gain = document.createElement('span');
    gain.className = 'aoc-pickup-gain';
    gain.textContent = '+1 ✧';
    gain.setAttribute('aria-label', this.ui?.language === 'fa' ? 'یک یادگار به دست آمد' : 'One token collected');
    anchor.appendChild(gain);
    window.setTimeout(() => gain.remove(), 1050);
    this.services.persistence.audio.playSfx('coin', { volume: 0.48, rate: 1.12 });
  }

  private openCurrentShop(): void {
    const shops: Record<string, string> = {
      ashen_village: 'ashen_blacksmith', whispering_forest: 'forest_herbalist', forgotten_desert: 'desert_trader',
      frozen_highlands: 'highland_forgemaster', hollow_city: 'hollow_black_market', crownfall: 'crownfall_quartermaster',
    };
    this.ui?.openShop(shops[this.currentRegion] ?? 'ashen_blacksmith');
  }

  private async runWorldDialogue(treeId: string): Promise<void> {
    if (this.dialogueRunning || !this.ui) return;
    this.dialogueRunning = true;
    // Keep utility actions out of the dialogue layer so they cannot cover its exit control.
    this.hideExtraControls();
    // Freeze movement and clear residual momentum before the dialogue UI opens.
    this.aren?.lockInput(true);
    const playerBody = this.aren?.body as Phaser.Physics.Arcade.Body | undefined;
    playerBody?.setVelocity(0, 0);
    try {
      while (this.services.world.isInDialogue()) {
        const view = this.services.world.getDialogue();
        if (!view) break;
        const tree = {
          id: `${treeId}_${view.nodeId}_${Date.now()}`,
          start: 'current',
          nodes: {
            current: {
              id: 'current', speaker: view.speakerName || 'Narrator', portrait: view.speaker === 'narrator' ? 'book' : 'user', text: view.text,
              choices: view.choices.map(c => ({ id: String(c.index), text: c.text })),
            },
          },
        };
        const selected = await this.ui.startDialogue(tree);
        if (!this.services.world.isInDialogue()) break;
        if (selected.length) this.services.world.choose(Number(selected[0]));
        else this.services.world.advance();
      }
    } catch (err) { this.ui?.toast({ text: `Dialogue error: ${(err as Error).message}`, kind: 'error' }); }
    finally {
      this.dialogueRunning = false;
      if (this.started && !this.ui?.isBlocking && this.uiUtilityControls) this.uiUtilityControls.style.display = 'flex';
      else this.hideExtraControls();
      const body = this.aren?.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setVelocity(0, 0);
      if (this.started && !this.ui?.isBlocking) this.aren?.lockInput(false);
      this.showPendingEnding();
    }
  }

  private showPendingEnding(): void {
    if (!this.pendingEndingId || !this.ui) return;
    const id = this.pendingEndingId; const slides = this.pendingEndingSlides; this.pendingEndingId = null; this.pendingEndingSlides = [];
    this.ui.showEnding(id as any, [], slides, this.services.rpg.ngPlus.canStart().ok);
  }

  private updateHud(): void {
    if (!this.ui || !this.aren) return;
    const p = this.aren.stats, rpg = this.services.rpg;
    const hotbar = rpg.skills.getHotbar();
    const questLog = this.services.world.getQuestLog();
    const selectedQuest = questLog.find((q: any) => q.id === this.trackedQuest && q.status === 'active') ?? questLog.find((q: any) => q.type === 'main' && q.status === 'active');
    const objective = selectedQuest?.objectives.find((o: any) => !o.done); 
    const abilities = rpg.skills.getUnlockedAbilities();
    this.ui.updateHud({
      playerName: 'Aren', health: p.health, maxHealth: p.config.maxHealth, mana: p.mana, maxMana: p.config.maxMana,
      stamina: p.stamina, maxStamina: p.config.maxStamina, level: rpg.getLevel(), xp: rpg.progression.xp,
      xpToNext: rpg.progression.xpForNextLevel(), gold: rpg.getGold(),
      skills: hotbar.slice(0, 3).map((id: string | null) => id ? ({ id, name: abilities.find((a: any) => a.id === id)?.id ?? id, manaCost: abilities.find((a: any) => a.id === id)?.manaCost ?? 0, icon: 'sparkles' }) : null),
      objectives: objective && selectedQuest ? [{ title: selectedQuest.title, text: objective.text }] : [],
      boss: this.currentBoss ? { name: this.currentBoss.name, health: this.combat?.engine.getAlive().find(e => e.bossId === this.currentBoss?.id)?.health ?? 0, maxHealth: this.combat?.engine.getAlive().find(e => e.bossId === this.currentBoss?.id)?.maxHealth ?? 1, phase: this.currentBoss.phase } : null,
    });
  }

  /** A skippable, multi-shot opening sequence shown only when starting a new game. */
  private playOpeningCinematic(): void {
    const fa = this.ui?.language === 'fa';
    const overlay = document.createElement('section');
    overlay.className = 'aoc-opening-cinematic';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', fa ? 'میان‌پرده آغاز داستان' : 'Opening cinematic');
    overlay.innerHTML = `
      <style>
        .aoc-opening-cinematic{position:fixed;inset:0;z-index:100000;overflow:hidden;background:#050507;color:#ead9c1;display:grid;place-items:center;opacity:0;transition:opacity 1.1s ease;font-family:Georgia,'Times New Roman',serif;isolation:isolate}
        .aoc-opening-cinematic *{box-sizing:border-box}
        .aoc-opening-cinematic.is-visible{opacity:1}
        .aoc-opening-cinematic .aoc-shot{position:absolute;inset:-3%;overflow:hidden;background:radial-gradient(ellipse at 50% 55%,#34201d 0%,#100e12 54%,#050507 100%);transform:scale(1.045);transition:transform 12s cubic-bezier(.16,.55,.25,1);contain:paint}
        .aoc-opening-cinematic.is-visible .aoc-shot{transform:scale(1)}
        .aoc-opening-cinematic .aoc-art{position:absolute;width:100%;height:100%;inset:0}\n        .aoc-opening-cinematic .aoc-scene-world{opacity:0;transition:opacity 1.8s ease}\n        .aoc-opening-cinematic .aoc-ashes-world{opacity:1;transition:opacity 1.8s ease}\n        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-green-world,.aoc-opening-cinematic .aoc-shot.scene-trial .aoc-trial-world{opacity:1}\n        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-ashes-world,.aoc-opening-cinematic .aoc-shot.scene-trial .aoc-ashes-world{opacity:0}\n        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-haze{background:linear-gradient(180deg,transparent,rgba(113,175,91,.10),rgba(20,48,33,.34))}\n        .aoc-opening-cinematic .aoc-shot.scene-trial .aoc-haze{background:linear-gradient(180deg,transparent,rgba(195,153,104,.12),rgba(18,13,17,.65))}\n        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-embers{display:none}
        .aoc-opening-cinematic.is-visible .aoc-art{animation:aoc-camera-drift 25s cubic-bezier(.2,.55,.25,1) both}
        .aoc-opening-cinematic .aoc-shot:after{content:'';position:absolute;inset:-20%;pointer-events:none;background:linear-gradient(112deg,transparent 35%,rgba(255,194,137,.075) 48%,transparent 60%);transform:translateX(-65%);animation:aoc-light-sweep 8s ease-in-out 1.2s infinite}
        .aoc-opening-cinematic .aoc-haze{opacity:.82}
        @keyframes aoc-camera-drift{0%{transform:scale(1.02) translate3d(1.2%,.8%,0)}45%{transform:scale(1.11) translate3d(-1.4%,-.5%,0)}100%{transform:scale(1.12) translate3d(-1.5%,-.8%,0)}}
        /* Each story beat gets its own camera move, not one repeated zoom on a still. */
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-art{animation:aoc-green-pan 5.2s cubic-bezier(.2,.55,.25,1) both}
        .aoc-opening-cinematic .aoc-shot.scene-trial .aoc-art{animation:aoc-trial-dolly 8.5s cubic-bezier(.2,.55,.25,1) both}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-art{animation:aoc-ashes-reveal 12s cubic-bezier(.2,.55,.25,1) both}
        @keyframes aoc-green-pan{0%{transform:scale(1.12) translate3d(3.5%,1.2%,0)}100%{transform:scale(1.03) translate3d(-2.5%,-.6%,0)}}
        @keyframes aoc-trial-dolly{0%{transform:scale(1.04) translate3d(-1.8%,.4%,0)}55%{transform:scale(1.12) translate3d(1.2%,-.5%,0)}100%{transform:scale(1.08) translate3d(0,-.2%,0)}}
        @keyframes aoc-ashes-reveal{0%{transform:scale(1.18) translate3d(0,2.4%,0);filter:brightness(1.45)}12%{filter:brightness(.72)}42%{transform:scale(1.09) translate3d(-1.2%,-.3%,0);filter:brightness(.88)}100%{transform:scale(1.04) translate3d(1.4%,-.8%,0);filter:brightness(.78)}}
        .aoc-opening-cinematic .aoc-cine-figure{position:absolute;z-index:3;left:50%;bottom:12%;width:54px;height:150px;transform:translateX(-50%);transform-origin:50% 100%;filter:drop-shadow(0 12px 16px rgba(0,0,0,.55));transition:transform 1.2s ease,opacity 1s ease}
        .aoc-opening-cinematic .aoc-cine-figure .head{position:absolute;left:20px;top:2px;width:17px;height:22px;border-radius:48% 48% 42% 42%;background:linear-gradient(90deg,#171218,#393039 55%,#100e13)}
        .aoc-opening-cinematic .aoc-cine-figure .torso{position:absolute;left:12px;top:22px;width:34px;height:67px;background:linear-gradient(90deg,#100e13,#3a3030 48%,#151116);clip-path:polygon(22% 0,78% 0,100% 100%,0 100%);border-top:2px solid #94724e}
        .aoc-opening-cinematic .aoc-cine-figure .cape{position:absolute;left:7px;top:27px;width:42px;height:78px;background:linear-gradient(90deg,#0b0b10,#29212a 55%,#0c0b10);clip-path:polygon(25% 0,75% 0,100% 100%,0 86%)}
        .aoc-opening-cinematic .aoc-cine-figure .leg{position:absolute;top:82px;width:12px;height:57px;background:#111016;transform-origin:50% 5%}
        .aoc-opening-cinematic .aoc-cine-figure .leg.left{left:15px}.aoc-opening-cinematic .aoc-cine-figure .leg.right{right:14px}
        .aoc-opening-cinematic .aoc-cine-figure .blade{position:absolute;right:-5px;top:44px;width:3px;height:72px;background:linear-gradient(#e3c99c,#70604f);transform:rotate(-28deg);transform-origin:50% 0;box-shadow:0 0 9px rgba(225,190,135,.35)}
        .aoc-opening-cinematic.is-visible .aoc-cine-figure{animation:aoc-figure-breathe 3.8s ease-in-out infinite}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-cine-figure{transform:translateX(-50%) scale(.9) translateY(0)}
        .aoc-opening-cinematic .aoc-shot.scene-trial .aoc-cine-figure{transform:translateX(-50%) scale(1.12) translateY(-3%);filter:drop-shadow(0 0 22px rgba(205,170,120,.24))}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-cine-figure{transform:translateX(-50%) scale(1.08) translateY(4%) rotate(-5deg)}
        .aoc-opening-cinematic .aoc-bird-flock{position:absolute;z-index:3;top:25%;left:-12%;width:90px;height:30px;opacity:.65;animation:aoc-bird-cross 9s linear 1s infinite}
        .aoc-opening-cinematic .aoc-bird-flock:before,.aoc-opening-cinematic .aoc-bird-flock:after{content:'';position:absolute;width:22px;height:9px;border-top:2px solid #e7dfca;border-radius:50%;transform:rotate(18deg)}
        .aoc-opening-cinematic .aoc-bird-flock:after{left:30px;top:10px;transform:rotate(-12deg)}
        .aoc-opening-cinematic .aoc-smoke{position:absolute;z-index:2;bottom:24%;left:62%;width:70px;height:170px;background:radial-gradient(ellipse at 50% 80%,rgba(34,28,31,.62),transparent 70%);filter:blur(7px);opacity:0;animation:aoc-smoke-rise 5s ease-out 13.2s infinite}
        .aoc-opening-cinematic .aoc-firelight{position:absolute;z-index:2;bottom:17%;left:22%;width:18px;height:55px;background:linear-gradient(0deg,#7d291b,#e77b39 55%,#ffd28a 80%,transparent);clip-path:polygon(50% 0,72% 38%,100% 70%,70% 100%,25% 100%,0 70%,32% 38%);filter:drop-shadow(0 0 15px #e36e32);opacity:0;animation:aoc-fire-flicker .48s ease-in-out 13.7s infinite alternate}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-cine-figure{opacity:1}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-firelight,.aoc-opening-cinematic .aoc-shot.scene-trial .aoc-firelight{opacity:0}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-firelight,.aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-smoke{opacity:1}
        @keyframes aoc-figure-breathe{0%,100%{margin-bottom:0}50%{margin-bottom:2px}}
        @keyframes aoc-bird-cross{0%{transform:translateX(0) translateY(0)}50%{transform:translateX(58vw) translateY(-22px)}100%{transform:translateX(120vw) translateY(8px)}}
        @keyframes aoc-smoke-rise{0%{transform:translateY(25px) scale(.65);opacity:0}25%{opacity:.7}100%{transform:translateY(-110px) scale(1.8);opacity:0}}
        @keyframes aoc-fire-flicker{from{transform:scale(.82) skewX(-5deg);opacity:.72}to{transform:scale(1.12) skewX(6deg);opacity:1}}
        @keyframes aoc-light-sweep{0%,22%{transform:translateX(-65%);opacity:0}38%{opacity:1}62%,100%{transform:translateX(65%);opacity:0}}

        .aoc-opening-cinematic .aoc-haze{position:absolute;inset:35% -20% 0;background:linear-gradient(180deg,transparent,rgba(190,115,73,.12),rgba(5,5,8,.8));filter:none;animation:aoc-haze-drift 9s ease-in-out infinite alternate}
        .aoc-opening-cinematic .aoc-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 25%,rgba(0,0,0,.25) 68%,rgba(0,0,0,.9) 130%)}
        .aoc-opening-cinematic .aoc-grain{position:absolute;inset:0;opacity:.055;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.11) 3px 4px);pointer-events:none}
        .aoc-opening-cinematic .aoc-bars:before,.aoc-opening-cinematic .aoc-bars:after{content:'';position:absolute;left:0;right:0;height:8.5vh;background:#030305;z-index:5;transition:height 1.1s cubic-bezier(.7,0,.2,1)}
        .aoc-opening-cinematic .aoc-bars:before{top:0}.aoc-opening-cinematic .aoc-bars:after{bottom:0}
        .aoc-opening-cinematic .aoc-copy{position:absolute;z-index:7;left:8%;right:8%;top:50%;transform:translateY(-42%);text-align:center;opacity:0;transition:opacity 1s ease,transform 1.2s ease;pointer-events:none;text-shadow:0 3px 22px #000}
        .aoc-opening-cinematic .aoc-copy.is-active{opacity:1;transform:translateY(-50%)}
        .aoc-opening-cinematic .aoc-kicker{font:600 10px/1.8 system-ui,sans-serif;letter-spacing:.42em;color:#c99a6d;margin-bottom:20px}
        .aoc-opening-cinematic .aoc-line{font-size:clamp(19px,3.1vw,36px);line-height:1.85;font-weight:400;color:#f0dfc8;margin:0 auto;max-width:980px}
        .aoc-opening-cinematic[dir=rtl] .aoc-line{font-family:Georgia,'Noto Naskh Arabic',serif}
        .aoc-opening-cinematic .aoc-title{font-size:clamp(35px,7vw,86px);letter-spacing:.12em;color:#e5bd87;text-shadow:0 0 28px rgba(207,125,68,.5),0 4px 30px #000}
        .aoc-opening-cinematic .aoc-subtitle{margin-top:18px;font:500 10px/2 system-ui,sans-serif;letter-spacing:.38em;color:#c7a47f}
        .aoc-opening-cinematic .aoc-skip{position:absolute;z-index:12;bottom:12vh;right:5vw;border:1px solid rgba(219,184,143,.45);background:rgba(10,8,9,.55);color:#e8d5bd;padding:10px 16px;border-radius:2px;font:600 11px system-ui,sans-serif;letter-spacing:.08em;cursor:pointer;backdrop-filter:blur(8px)}
        .aoc-opening-cinematic[dir=rtl] .aoc-skip{right:auto;left:5vw}
        .aoc-opening-cinematic .aoc-skip:active{background:rgba(112,63,40,.8)}
        .aoc-opening-cinematic .aoc-rule{width:clamp(70px,12vw,150px);height:1px;background:linear-gradient(90deg,transparent,#c18a5d,transparent);margin:20px auto}
        .aoc-opening-cinematic .aoc-embers{position:absolute;inset:0;z-index:4;pointer-events:none}
        .aoc-opening-cinematic .aoc-ember{position:absolute;bottom:-5%;width:3px;height:3px;border-radius:50%;background:#ffbd78;box-shadow:0 0 12px 3px rgba(237,135,69,.6);animation:aoc-ember-rise var(--dur) linear var(--delay) infinite}
        .aoc-opening-cinematic .aoc-flash{position:absolute;inset:0;background:#f1c18b;opacity:0;z-index:6;pointer-events:none}
        .aoc-opening-cinematic .aoc-flash.is-flashing{animation:aoc-flash .7s ease-out}
        @keyframes aoc-ember-rise{0%{transform:translate3d(0,0,0) scale(.4);opacity:0}15%{opacity:.8}100%{transform:translate3d(var(--drift),-115vh,0) scale(1.5);opacity:0}}
        @keyframes aoc-haze-drift{from{transform:translateX(-3%) scale(1)}to{transform:translateX(4%) scale(1.12)}}
        @keyframes aoc-grain-shift{0%{transform:translate(0,0)}25%{transform:translate(2%,-1%)}50%{transform:translate(-1%,2%)}75%{transform:translate(1%,1%)}100%{transform:translate(-2%,-1%)}}
        @keyframes aoc-flash{0%{opacity:0}12%{opacity:.55}100%{opacity:0}}
        @media(prefers-reduced-motion:reduce){.aoc-opening-cinematic *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
      </style>
      <div class="aoc-shot">
        <svg class="aoc-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="aoc-sky" x2="0" y2="1"><stop stop-color="#080a12"/><stop offset=".55" stop-color="#382323"/><stop offset="1" stop-color="#120e13"/></linearGradient>
            <radialGradient id="aoc-moon"><stop stop-color="#f6d9ad" stop-opacity=".95"/><stop offset=".35" stop-color="#d7a77b" stop-opacity=".35"/><stop offset="1" stop-color="#d7a77b" stop-opacity="0"/></radialGradient>
            <linearGradient id="aoc-fire" x2="0" y2="1"><stop stop-color="#ffc17b"/><stop offset="1" stop-color="#8e3e27" stop-opacity="0"/></linearGradient>
            
          </defs>
          <g class="aoc-scene-world aoc-green-world">
            <defs><linearGradient id="aoc-green-sky" x2="0" y2="1"><stop stop-color="#78b9c2"/><stop offset=".55" stop-color="#c7d9ad"/><stop offset="1" stop-color="#e7d9ad"/></linearGradient><linearGradient id="aoc-green-hill" x2="0" y2="1"><stop stop-color="#71965c"/><stop offset="1" stop-color="#284b38"/></linearGradient></defs>
            <rect width="1600" height="900" fill="url(#aoc-green-sky)"/><circle cx="1240" cy="170" r="104" fill="#fff0c1" opacity=".76"/><circle cx="1240" cy="170" r="175" fill="#fff0c1" opacity=".14"/>
            <path d="M0 470Q230 300 460 455T930 420T1600 390V900H0Z" fill="#9bb58a"/><path d="M0 560Q240 400 500 560T1030 510T1600 480V900H0Z" fill="#648c62"/>
            <path d="M0 655Q260 505 520 650T1060 615T1600 590V900H0Z" fill="url(#aoc-green-hill)"/>
            <path d="M0 790Q250 665 540 760T1050 755T1600 700V900H0Z" fill="#294b38"/>
            <path d="M620 900Q710 780 830 735Q970 685 1070 900Z" fill="#7eb7b0" opacity=".9"><animate attributeName="opacity" values=".72;.94;.72" dur="5s" repeatCount="indefinite"/></path>
            <path d="M650 900Q760 790 860 760Q940 735 1030 900" fill="none" stroke="#d8e7c0" stroke-width="12" opacity=".45"/>
            <g fill="#365c42"><path d="M160 650q-65-120 0-230q72 110 0 230z"/><path d="M260 680q-82-145 0-275q88 130 0 275z"/><path d="M1360 635q-80-155 0-295q92 145 0 295z"/><path d="M1470 675q-68-130 0-245q78 118 0 245z"/></g>
            <g fill="#507b4b"><circle cx="160" cy="480" r="88"/><circle cx="250" cy="450" r="100"/><circle cx="1370" cy="390" r="112"/><circle cx="1470" cy="470" r="92"/></g>
            <g fill="#e9d9a6" opacity=".95"><circle cx="210" cy="435" r="8"/><circle cx="294" cy="490" r="6"/><circle cx="1328" cy="360" r="7"/><circle cx="1424" cy="420" r="8"/></g>
            <g transform="translate(730 490)"><path d="M-150 170V-20h50v-80h45v80h55v190z" fill="#d6c7a1" stroke="#756b53" stroke-width="8"/><path d="M-75-100v-60h35v60" fill="#c7b58b"/><path d="M-120 170v-80h35v80m45 0v-80h35v80" fill="#5c5949"/><path d="M-145 0h145" stroke="#eee0bd" stroke-width="8"/></g>
            <g fill="#f6f0d8"><path d="M430 210q28-25 56 0q-28-12-56 0z"><animateTransform attributeName="transform" type="translate" values="0 0;80 -18;170 4" dur="8s" repeatCount="indefinite"/></path><path d="M520 250q24-22 48 0q-24-10-48 0z"><animateTransform attributeName="transform" type="translate" values="0 0;65 -12;140 0" dur="9s" repeatCount="indefinite"/></path></g>
            <g fill="#d7e7ba" opacity=".65"><circle cx="560" cy="580" r="5"><animate attributeName="cy" values="580;560;580" dur="4s" repeatCount="indefinite"/></circle><circle cx="1120" cy="620" r="4"><animate attributeName="cy" values="620;596;620" dur="3.4s" repeatCount="indefinite"/></circle></g>
          </g>
          <g class="aoc-scene-world aoc-trial-world">
            <defs><linearGradient id="aoc-hall" x2="0" y2="1"><stop stop-color="#302b38"/><stop offset=".55" stop-color="#17151d"/><stop offset="1" stop-color="#08090e"/></linearGradient></defs>
            <rect width="1600" height="900" fill="url(#aoc-hall)"/>
            <path d="M130 900V230Q800-120 1470 230V900Z" fill="#24202a" stroke="#70604f" stroke-width="16"/><path d="M245 900V300Q800-30 1355 300V900" fill="none" stroke="#9c8060" stroke-width="7" opacity=".55"/>
            <g stroke="#8d7893" stroke-width="9" fill="#40344b"><path d="M390 110h180v340H390z"/><path d="M710 70h180v380H710z"/><path d="M1030 110h180v340h-180z"/></g>
            <g stroke="#d5b47a" stroke-width="5" opacity=".8"><path d="M480 110v340m-90-170h180M800 70v380m-90-190h180M1120 110v340m-90-170h180"/></g>
            <path d="M0 760H1600V900H0Z" fill="#17141b"/><path d="M480 740H1120L1050 650H550Z" fill="#5b4a3e" stroke="#b08c5d" stroke-width="8"/><path d="M610 650H990V590H610Z" fill="#8a6c4e" stroke="#d0b17c" stroke-width="6"/>
            <g fill="#211a1b" stroke="#9d805c" stroke-width="5"><path d="M720 590V440h160v150z"/><path d="M740 440l60-90 60 90z"/><path d="M760 490h80v100h-80z"/></g>
            <g fill="#d78b50"><path d="M280 670q-35-75 0-120q34 48 0 120z"><animate attributeName="opacity" values=".6;1;.55" dur="1.2s" repeatCount="indefinite"/></path><path d="M1320 670q-35-75 0-120q34 48 0 120z"><animate attributeName="opacity" values=".55;1;.6" dur="1.5s" repeatCount="indefinite"/></path></g>
            <g fill="#0a0b10"><path d="M180 770v-210q50-70 100 0v210z"/><path d="M1320 770v-210q50-70 100 0v210z"/><path d="M500 800q-18-80 20-115q45 5 52 115z"/><path d="M1060 800q-18-80 20-115q45 5 52 115z"/></g>
            <g transform="translate(800 700)" fill="#08090e"><path d="M-34 0q-32-35-12-72q28-30 54 0q18 34-4 72z"/><path d="M-30-54l-22-40 32 18 22-18-6 42z"/><path d="M-26 0l-32 110h24l34-75 22 75h24L18 0z"/><path d="M-24 4l-70 28 6 16 72-12 72 12 6-16L18 4z"/></g>
            <g fill="#c7a56f"><path d="M340 340l-22 110h44z"/><path d="M1260 340l-22 110h44z"/></g>
            <path d="M0 845Q400 815 800 845T1600 830" fill="none" stroke="#ad8b62" stroke-width="5" opacity=".35"/>
          </g>
          <g class="aoc-ashes-world">
          <rect width="1600" height="900" fill="url(#aoc-sky)"/>
          <circle cx="1160" cy="245" r="220" fill="url(#aoc-moon)"/>
          <circle cx="1160" cy="245" r="68" fill="#e8c8a1" opacity=".72"/>
          <path d="M0 440 Q240 330 480 435 T960 410 T1600 420 V900 H0Z" fill="#1a1720"/>
          <path d="M0 540 L130 470 220 520 340 390 420 515 550 445 690 520 810 410 930 505 1070 420 1200 510 1370 390 1600 510 V900 H0Z" fill="#100f17"/>
          <g fill="#0a0b10" stroke="#5b3d34" stroke-width="5" stroke-opacity=".45">
            <path d="M720 550V320H790V265H830V320H900V550Z"/><path d="M770 265V225H790V190H815V225H838V265Z"/>
            <path d="M900 550V355H970V290H1000V355H1060V550Z"/><path d="M1060 550V390H1110V330H1140V390H1200V550Z"/>
            <path d="M720 350L690 350V330H720M900 385L875 385V365H900M1060 420L1035 420V400H1060"/>
          </g>
          <g fill="#e28d55" opacity=".9"><path d="M782 360h14v28h-14z"><animate attributeName="opacity" values=".35;1;.55;1;.35" dur="2.7s" repeatCount="indefinite"/></path><path d="M942 398h13v25h-13z"><animate attributeName="opacity" values=".5;1;.4;.9;.5" dur="3.4s" repeatCount="indefinite"/></path><path d="M1100 430h12v22h-12z"><animate attributeName="opacity" values=".3;1;.6;1;.3" dur="2.2s" repeatCount="indefinite"/></path></g>
          <g fill="#090a0e"><path d="M0 650Q180 560 360 650T730 640T1100 650T1600 620V900H0Z"/><path d="M80 710l40-130 35 130zm90 0l30-95 30 95zm1110-40l45-170 40 170zm100 20l35-120 42 120z"/></g>
          <g opacity=".12" fill="#c16c45"><ellipse cx="350" cy="720" rx="250" ry="45"/><ellipse cx="1260" cy="680" rx="260" ry="55"/></g>
          <g fill="#08090d">
            <path d="M0 790Q210 710 430 790T850 780T1250 790T1600 760V900H0Z"/>
            <path d="M570 900l60-185 45 185zm70 0l50-145 35 145zm-250 0l45-120 40 120z"/>
            <path d="M1240 900l65-210 50 210zm85 0l48-150 42 150z"/>
          </g>
          <g transform="translate(780 610)" fill="#050609"><animateTransform attributeName="transform" type="translate" values="780 610;780 606;780 610" dur="2.6s" repeatCount="indefinite"/>
            <path d="M-24 0q-25-30-8-57q22-24 42 0q18 25-2 57z"/><path d="M-20-47l-15-20 24 10 18-12-4 25z"/>
            <path d="M-18 0l-25 100h20l25-70 18 70h20L12 0z"/>
            <path d="M-20 5l-55 42 8 12 62-30 50 25 8-13L10 5z"/>
            <path d="M-2-25q80-20 105 32l-10 10q-35-34-93-17z"/>
            <path d="M95 30l24-70 8 3-13 77z"/>
          </g>
          <g fill="#d77e4a" opacity=".8"><circle cx="760" cy="580" r="5"/><circle cx="810" cy="560" r="3"/><circle cx="830" cy="620" r="4"/></g>
          <path d="M0 870Q260 820 520 870T1050 865T1600 850" fill="none" stroke="#6b4639" stroke-opacity=".35" stroke-width="3"/>
          </g>
        </svg>
        <div class="aoc-cine-figure" aria-hidden="true"><i class="cape"></i><i class="head"></i><i class="torso"></i><i class="leg left"></i><i class="leg right"></i><i class="blade"></i></div>
        <div class="aoc-bird-flock" aria-hidden="true"></div><div class="aoc-smoke" aria-hidden="true"></div><div class="aoc-firelight" aria-hidden="true"></div>
        <div class="aoc-haze"></div><div class="aoc-vignette"></div><div class="aoc-grain"></div>
      </div>
      <div class="aoc-embers"></div><div class="aoc-flash"></div><div class="aoc-bars"></div>
      <div class="aoc-copy" data-shot="0"><div class="aoc-kicker"></div><p class="aoc-line"></p><div class="aoc-rule"></div></div>
      <button class="aoc-skip" type="button"></button>
    `;
    // On compact/mobile viewports, remove SVG SMIL loops; retain the camera drift and ember layer.
    if (window.matchMedia('(max-width: 900px)').matches || (navigator.hardwareConcurrency || 8) <= 4) {
      overlay.classList.add('aoc-low-power');
      overlay.querySelectorAll('animate, animateTransform').forEach(node => node.remove());
    }
    overlay.dir = fa ? 'rtl' : 'ltr';
    const shot = overlay.querySelector<HTMLElement>('.aoc-shot')!;
    const copy = overlay.querySelector<HTMLElement>('.aoc-copy')!;
    const kicker = overlay.querySelector<HTMLElement>('.aoc-kicker')!;
    const line = overlay.querySelector<HTMLElement>('.aoc-line')!;
    const rule = overlay.querySelector<HTMLElement>('.aoc-rule')!;
    const skip = overlay.querySelector<HTMLButtonElement>('.aoc-skip')!;
    const embers = overlay.querySelector<HTMLElement>('.aoc-embers')!;
    const flash = overlay.querySelector<HTMLElement>('.aoc-flash')!;
    skip.textContent = fa ? 'رد کردن  ⏭' : 'SKIP  ⏭';

    for (let i = 0; i < 6; i++) {
      const ember = document.createElement('i');
      ember.className = 'aoc-ember';
      ember.style.left = ((i * 29) % 100) + '%';
      ember.style.setProperty('--dur', (4.5 + (i % 7) * 1.15) + 's');
      ember.style.setProperty('--delay', (-((i * 13) % 90) / 10) + 's');
      ember.style.setProperty('--drift', (((i * 17) % 100) - 50) + 'px');
      embers.appendChild(ember);
    }

    document.body.appendChild(overlay);
    let finished = false;
    let audioContext: AudioContext | undefined;
    let audioNodes: OscillatorNode[] = [];
    const timers: Phaser.Time.TimerEvent[] = [];
    const schedule = (delay: number, fn: () => void) => timers.push(this.time.delayedCall(delay, fn));
    const setScene = (scene: 'green' | 'trial' | 'ashes') => { shot.classList.remove('scene-green', 'scene-trial', 'scene-ashes'); shot.classList.add(`scene-${scene}`); };
    const setCaption = (eyebrow: string, text: string, title = false) => {
      copy.classList.remove('is-active');
      schedule(80, () => {
        kicker.textContent = eyebrow;
        line.textContent = text;
        line.classList.toggle('aoc-title', title);
        rule.style.opacity = title ? '0' : '1';
        copy.classList.add('is-active');
      });
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(timer => timer.remove(false));
      window.removeEventListener('keydown', onKeyDown);
      skip.removeEventListener('click', finish);
      overlay.style.opacity = '0';
      if (audioContext) {
        try { audioNodes.forEach(node => { node.stop(); node.disconnect(); }); } catch { /* already stopped */ }
        void audioContext.close().catch(() => undefined);
      }
      window.setTimeout(() => {
        overlay.remove();
        this.openingFinished = true;
        if (this.aren) this.aren.lockInput(false);
        this.started = true;
      }, 950);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' || event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        finish();
      }
    };
    skip.addEventListener('click', finish);
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));

    // A gentle, consonant fantasy score: warm sustained chords with a quiet, slow arpeggio.
    try {
      audioContext = new AudioContext();
      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.0001, audioContext.currentTime);
      master.gain.exponentialRampToValueAtTime(0.032, audioContext.currentTime + 3.2);
      master.connect(audioContext.destination);
      const pad = [130.81, 164.81, 196, 261.63];
      pad.forEach((frequency, index) => {
        const oscillator = audioContext!.createOscillator();
        const gain = audioContext!.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.value = [0.17, 0.11, 0.09, 0.045][index];
        oscillator.connect(gain); gain.connect(master); oscillator.start(); audioNodes.push(oscillator);
      });
      const melody = audioContext.createOscillator(); const melodyGain = audioContext.createGain();
      melody.type = 'sine'; melody.frequency.setValueAtTime(392, audioContext.currentTime + 1.2);
      [[1.2,392],[3.4,493.88],[5.6,587.33],[8.2,493.88],[10.5,440],[12.8,392],[15.4,349.23],[18,392],[20.5,440],[22.8,392]].forEach(([at, hz]) => melody.frequency.setValueAtTime(hz, audioContext!.currentTime + at));
      melodyGain.gain.setValueAtTime(0.0001, audioContext.currentTime); melodyGain.gain.linearRampToValueAtTime(0.035, audioContext.currentTime + 2); melodyGain.connect(master); melody.connect(melodyGain); melody.start(); audioNodes.push(melody);
    } catch { /* Audio may be unavailable; the visual sequence remains complete. */ }

    const captions = fa ? [
      ['پیش از خاکستر', 'این سرزمین روزگاری زیر نور آفتاب نفس می‌کشید؛ رودها زلال بودند و ناقوس‌ها برای جشن به صدا درمی‌آمدند.'],
      ['تالار پادشاه', 'اما در یک شب، نام آرن وال‌کرست را به خیانت گره زدند.'],
      ['محاکمه', 'در برابر تاج و شورا ایستادی؛ بی‌آن‌که فرصتی برای گفتن حقیقت داشته باشی.'],
      ['سقوط', 'حکم صادر شد. خانه‌ات سوخت و سرزمینت به خاکستر نشست.'],
      ['سوگند', 'اما حقیقت هنوز زنده است… و تو هنوز ایستاده‌ای.'],
    ] : [
      ['BEFORE THE ASHES', 'Once this land breathed beneath a golden sun. Rivers ran clear, and bells rang for celebration.'],
      ['THE KING\'S HALL', 'Then, in one night, Aren Valcrest was named a traitor.'],
      ['THE TRIAL', 'You stood before the crown and council, denied the chance to speak the truth.'],
      ['THE FALL', 'The sentence was passed. Your home burned, and the kingdom turned to ash.'],
      ['THE OATH', 'But the truth still lives… and so do you.'],
    ];
    setScene('green'); setCaption(captions[0][0], captions[0][1]);
    schedule(5200, () => { setScene('trial'); setCaption(captions[1][0], captions[1][1]); });
    schedule(9000, () => { setCaption(captions[2][0], captions[2][1]); });
    schedule(13700, () => { setScene('ashes'); setCaption(captions[3][0], captions[3][1]); flash.classList.add('is-flashing'); });
    schedule(18300, () => { setCaption(captions[4][0], captions[4][1]); flash.classList.remove('is-flashing'); void flash.offsetWidth; flash.classList.add('is-flashing'); });
    schedule(22000, () => {
      copy.classList.remove('is-active');
      schedule(450, () => {
        kicker.textContent = '';
        line.textContent = fa ? 'خاکسترِ تاج‌ها' : 'ASHES OF CROWNS';
        line.classList.add('aoc-title');
        rule.style.opacity = '0';
        const subtitle = document.createElement('div');
        subtitle.className = 'aoc-subtitle';
        subtitle.textContent = fa ? 'داستان آرن وال‌کرست' : 'THE STORY OF AREN VALCREST';
        copy.appendChild(subtitle);
        copy.classList.add('is-active');
      });
    });
    schedule(25800, finish);
  }

  private playUiTone(name: string): void {
    // A tiny synthesized UI cue keeps the game responsive without bundling third-party audio.
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
      const f = name === 'error' ? 150 : name === 'levelup' ? 720 : name === 'coin' ? 880 : 420;
      osc.frequency.value = f; osc.type = 'sine'; gain.gain.setValueAtTime(0.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.1); osc.onended = () => void ctx.close();
    } catch { /* Audio is optional and browsers may block it before a gesture. */ }
  }

  private showBootError(err: unknown): void {
    const el = document.createElement('div'); el.className = 'aoc-boot-error'; el.textContent = `Unable to initialize game storage: ${(err as Error).message}`; document.getElementById('app')?.appendChild(el);
  }

  private onShutdown(): void {
    // Phaser disposes display objects and Player/CombatWorld subscribe to SHUTDOWN themselves.
    // Clear only scene-owned references; shared module/event-bus instances survive level restarts.
    this.aren = undefined as any; this.combat = undefined as any;
    this.platforms = undefined as any; this.collectGroup = undefined as any; this.levelDef = undefined as any;
    this.npcActors = []; this.companionActors = []; this.interactables = []; this.activeZones.clear(); this.activePois.clear();
  }
}
