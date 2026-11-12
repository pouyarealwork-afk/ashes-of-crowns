import Phaser from 'phaser';
import { Player } from '../modules/player/phaser/Player';
import { CombatWorld } from '../modules/combat/phaser/CombatWorld';
import { RpgModule } from '../modules/rpg';
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
  private dialogueRunning = false;
  private uiUtilityControls?: HTMLElement;
  private currentBoss: { id: string; name: string; phase: number } | null = null;
  private pendingEndingId: string | null = null;
  private pendingEndingSlides: string[] = [];
  activeSaveSlot = 'slot1';
  private playtimeMs = 0;
  private hudAccumulator = 0;
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
    this.updateWorldTriggers();
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
    this.ui.on('game:new', ({ slot }) => this.startNewGame(slot));
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
      for (const item of reward?.items ?? []) this.services.rpg.inventory.add(item.id, item.n ?? 1);
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
    on('combat:boss-intro', (p: any) => {
      this.currentBoss = { id: p.bossId, name: p.name ?? 'Warden', phase: 1 };
      this.ui?.banner(p.name ?? 'A powerful foe approaches', p.title ?? 'Prepare yourself', 'skull');
    });
    on('combat:boss-phase', (p: any) => { if (this.currentBoss) this.currentBoss.phase = p.phase; });
    on('combat:boss-defeated', () => { this.currentBoss = null; });
    on('combat:enemy-defeated', (p: any) => this.ui?.toast({ text: p?.bossId ? 'Boss defeated' : 'Enemy defeated', kind: 'success' }));
    on('persistence:saved', (p: any) => {
      if (p?.slotId === 'auto' && this.started && this.aren && this.activeSaveSlot !== 'auto') {
        void this.services.persistence.saves.save(this.activeSaveSlot, { kind: 'manual', label: 'Latest Progress', skipIfUnchanged: true }).catch(err => this.ui?.toast({ text: `Save mirror failed: ${(err as Error).message}`, kind: 'warning' }));
      }
    });
    on('persistence:degraded', () => this.ui?.toast({ text: 'Storage unavailable: saves will last only for this session.', kind: 'warning' }));
  }

  private startNewGame(slot = 1): void {
    this.activeSaveSlot = `slot${slot}`;
    this.services.rpg.newGame(); this.services.world.newGame(); this.services.persistence.checkpoints.restore(undefined); this.lastSaveState = null; this.playtimeMs = 0; this.pendingEndingId = null; this.pendingEndingSlides = []; this.syncedStoryFlags.clear(); this.syncStoryFlags();
    this.currentRegion = 'ashen_village'; this.currentLevelId = 'ashen_village_main'; this.trackedQuest = null;
    this.started = true;
    this.startLevel(this.currentLevelId, 'start');
    this.ui.enterGame(); this.ui.toast({ text: 'The road begins in the ashes of home.', kind: 'info' });
    void this.services.persistence.saveToSlot(this.activeSaveSlot, 'New Game').catch(err => this.ui?.toast({ text: `Initial save failed: ${(err as Error).message}`, kind: 'warning' }));
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
      progress: { playtimeMs: this.playtimeMs, regionsUnlocked: map.nodes.filter((n: any) => n.unlocked).map((n: any) => n.id), regionsCompleted: map.nodes.filter((n: any) => n.stats.percent >= 100).map((n: any) => n.id), bossesDefeated: this.services.rpg.serialize().defeatedBosses, flags: { __world: worldData, __rpg: rpgData, __level: this.currentLevelId, __trackedQuest: this.trackedQuest ?? '' }, endingsSeen: this.services.world.getEnding() ? [this.services.world.getEnding()] : [] },
    };
  }

  private startLevel(levelId: string, spawnName = 'start'): void {
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
      const block = this.platforms.create(x + w / 2, y + h / 2, 'aoc-pixel') as Phaser.Physics.Arcade.Image;
      block.setDisplaySize(w, h).setTint(this.platformColor(kind ?? 'ground')).refreshBody();
      if (kind === 'oneway' && block.body) { block.body.checkCollision.down = false; block.body.checkCollision.left = false; block.body.checkCollision.right = false; }
      this.add.rectangle(x + w / 2, y + h / 2 - h / 2 + 3, w, 5, 0x000000, 0.18).setDepth(3);
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
    this.aren = new Player(this, {
      x, y,
      stats: { maxHealth: stats.health, attack: stats.attack, defense: stats.defense, speed: stats.speed, maxMana: stats.mana, maxStamina: stats.stamina, manaRegen: this.services.rpg.getRegenPerSecond().mana, staminaRegen: this.services.rpg.getRegenPerSecond().stamina },
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
      if (id && this.services.world.collect(id)) { const glow = (item as Phaser.GameObjects.GameObject).getData('glow') as Phaser.GameObjects.GameObject | undefined; glow?.destroy(); (item as Phaser.GameObjects.GameObject).destroy(); const def = this.services.world.content.collectibles.get(id); this.ui?.toast({ text: `${def?.name ?? 'Item'} recovered`, kind: 'success', icon: 'gem' }); }
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
    this.activeZones.clear(); this.activePois.clear(); this.blockedExitAt.clear(); this.hudAccumulator = 0;
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

  private drawAtmosphere(level: LevelDef): void {
    const g = this.add.graphics().setDepth(-20);
    const sky = Phaser.Display.Color.HexStringToColor(level.atmosphere.palette.sky).color;
    const mid = Phaser.Display.Color.HexStringToColor(level.atmosphere.palette.mid).color;
    const fore = Phaser.Display.Color.HexStringToColor(level.atmosphere.palette.fore).color;
    g.fillGradientStyle(sky, sky, mid, mid, 1); g.fillRect(0, 0, level.size.w, level.size.h);
    const baseY = level.size.h - 140;
    g.fillStyle(mid, 0.62);
    for (let i = 0; i < level.size.w; i += 360) {
      const peak = Math.max(70, baseY - 260 - ((i * 17) % 190));
      g.fillTriangle(i, baseY, i + 190, peak, i + 390, baseY);
    }
    g.fillStyle(fore, 0.8);
    for (let i = 0; i < level.size.w; i += 220) {
      const height = 55 + ((i * 13) % 110);
      g.fillRect(i, baseY - height, 110 + (i % 80), height);
      g.fillRect(i + 25, baseY - height - 35, 10, 35);
    }
    g.fillStyle(0xffb35c, 0.12);
    for (let i = 0; i < 55; i++) g.fillCircle((i * 317) % level.size.w, 80 + (i * 83) % 570, 1 + (i % 3));
    if (level.atmosphere.weather === 'ash' || level.atmosphere.weather === 'embers') {
      for (let i = 0; i < 38; i++) this.add.circle((i * 191) % level.size.w, 80 + (i * 61) % 620, 1 + i % 2, 0xd7c1a5, 0.35).setDepth(-5);
    }
  }

  private platformColor(kind: string): number {
    const colors: Record<string, number> = { ground: 0x51423d, stone: 0x71645c, wood: 0x76523d, ice: 0x9db5c2, sand: 0x92724d, crumble: 0x6d5146, oneway: 0x8a6a50, vine: 0x4e6947, metal: 0x59616a };
    return colors[kind] ?? colors.ground;
  }

  private drawHazards(level: LevelDef): void {
    for (const h of level.hazards) {
      const g = this.add.graphics().setDepth(5);
      g.fillStyle(h.type.includes('ice') || h.type.includes('avalanche') ? 0x9bd7e8 : 0xe65b2f, 0.5);
      g.fillRoundedRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h, 5);
      g.lineStyle(2, 0xffbd78, 0.55).strokeRoundedRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h, 5);
    }
  }

  private drawLore(level: LevelDef): void {
    for (const item of level.lore) {
      const color = item.kind === 'letter' ? '#d9c9a8' : '#a58b70';
      this.add.text(item.x, item.y - 38, item.kind === 'grave' ? '†' : '✧', { fontFamily: 'Georgia', fontSize: '23px', color, stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5).setDepth(6);
    }
  }

  private drawNpcs(npcs: any[], level: LevelDef): void {
    for (const spawn of npcs) {
      const def = this.services.world.content.npcs.get(spawn.npc);
      if (!def) continue;
      const x = spawn.x, y = spawn.y;
      this.add.ellipse(x, y + 4, 38, 12, 0x000000, 0.35).setDepth(6);
      this.add.rectangle(x, y - 27, 25, 42, 0x4d3939).setStrokeStyle(2, 0xb48a62).setDepth(7);
      this.add.circle(x, y - 56, 12, 0xc69c7a).setStrokeStyle(2, 0x3b2926).setDepth(8);
      const label = this.add.text(x, y - 90, `${def.name}  ·  E`, { fontFamily: 'Georgia', fontSize: '13px', color: '#e8d8bb', stroke: '#171315', strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
      this.npcActors.push({ id: spawn.npc, x, y, label });
    }
  }

  private drawInteractables(level: LevelDef): void {
    for (const item of level.interactables) {
      this.add.rectangle(item.x, item.y - 16, 28, 36, 0x4a3830).setStrokeStyle(2, 0xc49b6b).setDepth(7);
      this.add.text(item.x, item.y - 55, item.label, { fontSize: '12px', color: '#d9c7a9', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5).setDepth(8);
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
      const shadow = this.add.ellipse(0, 6, 34, 10, 0x000000, 0.28);
      const body = this.add.rectangle(0, -20, 20, 36, color).setStrokeStyle(2, 0xd5bd94);
      const head = this.add.circle(0, -45, 10, 0xc9a27e).setStrokeStyle(2, 0x332622);
      const label = this.add.text(0, -68, spec.name, { fontSize: '10px', color: '#d8c8ad', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5);
      const actor = this.add.container(this.aren.x, this.aren.y, [shadow, body, head, label]).setDepth(8);
      this.companionActors.push({ id: spec.id, actor, offset: 66 + this.companionActors.length * 36 });
    }
  }

  private updateCompanionPositions(): void {
    if (!this.aren) return;
    const t = this.time.now;
    for (let i = 0; i < this.companionActors.length; i++) {
      const c = this.companionActors[i];
      c.actor.setPosition(this.aren.x - this.aren.facing * c.offset, this.aren.y + Math.sin(t / 260 + i * 1.7) * 3 + i * 2);

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
    finally { this.dialogueRunning = false; this.showPendingEnding(); }
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
