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
import { paintLayer, paintSky, paintPlatform, paintNpc, paintProp, paintShard, paintGlow, type PropKind } from '../art/world';
import { buildOverworld } from './Overworld';
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
  private pendingBossIntros = new Map<string, { id: string; name: string; title: string }>();
  private overworldSegments: Array<{ region: RegionId; levelId: string; offsetX: number; offsetY: number; width: number }> = [];
  private overworldExitSources: Record<string, { levelId: string; exitId: string }> = {};
  private overworldGates: Array<{ from: RegionId; to: RegionId; wall: Phaser.Physics.Arcade.Image; label: Phaser.GameObjects.Text }> = [];
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
  private parallax: Array<{ ts: Phaser.GameObjects.TileSprite; f: number }> = [];

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
    this.checkBossEncounter();
    this.updateParallax();
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

  /** Small shared textures (collectible shard, soft glow) created on first use. */
  private ensureSharedArt(): void {
    if (!this.textures.exists('aoc-shard')) this.textures.addCanvas('aoc-shard', paintShard());
    if (!this.textures.exists('aoc-glow')) this.textures.addCanvas('aoc-glow', paintGlow());
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
      const id = String(p.bossId); this.pendingBossIntros.set(id, { id, name: p.name ?? 'Warden', title: p.title ?? 'Prepare yourself' });
      this.currentBoss = null; this.checkBossEncounter();
    });
    on('combat:boss-phase', (p: any) => { if (this.currentBoss) this.currentBoss.phase = p.phase; });
    on('combat:boss-defeated', (p: any) => { if (this.currentBoss?.id === p?.bossId) this.currentBoss = null; this.pendingBossIntros.delete(String(p?.bossId ?? '')); });
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
    this.currentLevelId = requestedLevel === 'aoc_overworld' ? 'aoc_overworld' : this.services.world.getLevel(requestedLevel) ? requestedLevel : fallbackLevel;
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
    this.currentBoss = null; this.pendingBossIntros.clear(); this.destroyLevel();
    this.overworldSegments = []; this.overworldExitSources = {}; this.overworldGates = [];
    const requestedLevelId = levelId;
    const entryRegion = [...this.services.world.content.regions.values()].find(r => r.entryLevel === requestedLevelId);
    let runtime: any;
    if (requestedLevelId === 'aoc_overworld' || entryRegion) {
      runtime = buildOverworld(this.services.world); this.overworldSegments = runtime.segments; this.overworldExitSources = runtime.exitSources;
      if (entryRegion) spawnName = `${entryRegion.id}_${spawnName}`;
      levelId = 'aoc_overworld'; this.currentRegion = entryRegion?.id ?? this.currentRegion ?? 'ashen_village';
    } else { runtime = this.services.world.getLevelRuntime(levelId); this.currentRegion = runtime?.level.region ?? this.currentRegion; }
    if (!runtime) { this.ui?.toast({ text: `Missing level: ${requestedLevelId}`, kind: 'error' }); return; }
    this.levelRuntime = runtime; this.levelDef = runtime.level; this.currentLevelId = levelId;
    const level = runtime.level;
    const spawn = level.spawns[spawnName] ?? level.spawns.start;
    this.physics.world.setBounds(0, 0, level.size.w, level.size.h);
    this.cameras.main.setBounds(0, 0, level.size.w, level.size.h);
    this.cameras.main.setBackgroundColor(level.atmosphere.palette.sky);
    this.drawAtmosphere(level);

    this.platforms = this.physics.add.staticGroup();
    for (const [x, y, w, h, kind] of level.platforms) {
      const material = String(kind ?? 'ground');
      const texture = this.platformTexture(material, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      const block = this.platforms.create(x + w / 2, y + h / 2, texture) as Phaser.Physics.Arcade.Image;
      block.setData('material', material);
      block.setDisplaySize(w, h).setTint(0xffffff).setDepth(4).refreshBody();
      if (kind === 'oneway' && block.body) { block.body.checkCollision.down = false; block.body.checkCollision.left = false; block.body.checkCollision.right = false; }
      // Surface details are baked into the shared material texture to keep the object count low.

    }
    if (this.overworldSegments.length > 1) for (let i = 1; i < this.overworldSegments.length; i++) {
      const from = this.overworldSegments[i - 1].region, to = this.overworldSegments[i].region;
      if (this.services.world.canTravel(from, to)) continue;
      const wall = this.platforms.create(this.overworldSegments[i].offsetX, level.size.h / 2, 'aoc-pixel') as Phaser.Physics.Arcade.Image;
      wall.setDisplaySize(22, level.size.h).setTint(0x76564d).setAlpha(0.82).setDepth(7).refreshBody();
      const gateText = this.ui?.language === 'fa' ? 'مسیر بسته' : 'SEALED ROAD';
      const label = this.add.text(wall.x, 110, gateText, { fontFamily: 'monospace', fontSize: '11px', color: '#f1c98b', stroke: '#1b1212', strokeThickness: 4 }).setOrigin(0.5).setDepth(8);
      this.overworldGates.push({ from, to, wall, label });
    }
    this.drawHazards(level);
    this.drawLore(level);
    this.drawNpcs(runtime.npcs, level);
    this.drawInteractables(level);
    this.drawExitsAndPaths(runtime, level);
    this.drawCollectibles(runtime.collectibles);

    this.services.persistence.checkpoints.setDefaultSpawn({ regionId: this.currentRegion, x: spawn.x, y: spawn.y });
    const campPois = [...this.services.world.content.pois.values()].flatMap(p => { if (p.kind !== 'camp' && p.kind !== 'shrine') return []; const seg = this.overworldSegments.find(s => s.levelId === p.level); if (seg) return [{ ...p, x: p.x + seg.offsetX, y: p.y + seg.offsetY }]; return p.level === levelId ? [p] : []; });
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
      stats: { maxHealth: Math.max(1, Math.round(stats.health * classStats.health)), attack: Math.max(1, Math.round(stats.attack * classStats.attack)), defense: Math.max(0, Math.round(stats.defense * classStats.defense)), speed: Math.max(1, Math.round(stats.speed * classStats.speed)), maxMana: Math.max(1, Math.round(stats.mana * classStats.mana)), maxStamina: Math.max(1, Math.round(stats.stamina * classStats.stamina)), manaRegen: Math.max(2, regen.mana * classStats.manaRegen), staminaRegen: Math.max(22, regen.stamina * classStats.staminaRegen) },
      touch: false, autoRespawn: false, fallKillY: level.size.h + 260,
      camera: { bounds: { x: 0, y: 0, width: level.size.w, height: level.size.h }, lerpX: 0.12, lerpY: 0.1 },
      inputProvider: () => this.inputBridge.frame(),
    });
    if (savedPos && savedStats.health !== undefined) { this.aren.stats.health = Math.min(this.aren.stats.config.maxHealth, savedStats.health); this.aren.stats.mana = Math.min(this.aren.stats.config.maxMana, savedStats.mana ?? this.aren.stats.mana); this.aren.stats.stamina = Math.min(this.aren.stats.config.maxStamina, savedStats.stamina ?? this.aren.stats.stamina); }
    this.lastSaveState = null;
    this.aren.addGround(this.platforms);
    // Keep the hero above foreground dressing and reset the camera after the level is built.
    this.aren.setVisible(true).setAlpha(1).setDepth(20);
    this.aren.cameraRig?.snap();
    this.syncCompanions();
    this.aren.setCheckpoint(spawn.x, spawn.y);
    const respawnPoint = this.services.persistence.checkpoints.getRespawnPoint();
    if (respawnPoint.regionId === level.region) this.aren.setCheckpoint(respawnPoint.x, respawnPoint.y);
    this.physics.add.overlap(this.aren, this.collectGroup, (_p: any, item: any) => {
      const id = (item as Phaser.GameObjects.GameObject).getData('collectibleId');
      if (id && this.services.world.collect(id)) { const glow = (item as Phaser.GameObjects.GameObject).getData('glow') as Phaser.GameObjects.GameObject | undefined; glow?.destroy(); (item as Phaser.GameObjects.GameObject).destroy(); const def = this.services.world.content.collectibles.get(id); this.showCompactPickupGain(); }
    });

    this.currentBoss = null;
    this.combat = new CombatWorld({ scene: this, player: this.aren as any, rpg: this.services.rpg as any, region: level.region, level: this.services.rpg.getLevel(), spawns: level.enemies, hazards: level.hazards.map((h: any) => ({ type: h.type, rect: { x: h.rect.x, y: h.rect.y, width: h.rect.w, height: h.rect.h }, damage: h.damage })), ground: this.platforms });
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
    this.parallax = [];
    this.aren = undefined as any; this.combat = undefined as any;
    this.platforms = undefined as any; this.collectGroup = undefined as any; this.levelDef = undefined as any;
    this.createPixelTexture();
  }

  /** Pixel-art backdrop: a dithered sky plus three seamless parallax layers per region (see src/art/world.ts). */
  private drawAtmosphere(level: LevelDef): void {
    if (this.overworldSegments.length > 1) {
      this.parallax = [];
      for (const segment of this.overworldSegments) {
        const source = this.services.world.getLevel(segment.levelId); if (!source) continue;
        const a = source.atmosphere.palette, region = String(segment.region), sig = `${region}-${a.sky}-${a.mid}-${a.fore}`;
        const ensure = (key: string, make: () => HTMLCanvasElement): string => { if (!this.textures.exists(key)) this.textures.addCanvas(key, make()); return key; };
        this.add.tileSprite(segment.offsetX, 0, segment.width, level.size.h, ensure(`aoc-sky-${sig}`, () => paintSky(a, region))).setOrigin(0, 0).setDepth(-40);
        // Keep the six biome backdrops anchored to their world segments, but move each
        // texture at its own camera rate. This preserves region boundaries while adding
        // real parallax instead of leaving the entire overworld backdrop static.
        const layers: Array<[0 | 1 | 2, number, number]> = [[0, 0.1, -31], [1, 0.28, -24], [2, 0.6, 1]];
        for (const [d, factor, depth] of layers) {
          const key = ensure(`aoc-layer-${sig}-${d}`, () => paintLayer(a, region, d));
          const layer = this.add.tileSprite(segment.offsetX, 0, segment.width, level.size.h, key).setOrigin(0, 0).setDepth(depth);
          this.parallax.push({ ts: layer, f: factor });
        }
        // Small, biome-specific ambient motion makes each region feel alive without
        // introducing a full-screen particle emitter or a large mobile GPU workload.
        const weather = source.atmosphere.weather;
        const weatherStyle: Record<string, { color: number; rise: number; width: number; height: number; alpha: number }> = {
          ash: { color: 0xe58a4a, rise: -26, width: 3, height: 3, alpha: 0.62 },
          embers: { color: 0xffa04c, rise: -34, width: 3, height: 3, alpha: 0.78 },
          rain: { color: 0x9bbfd0, rise: 48, width: 2, height: 10, alpha: 0.42 },
          sandstorm: { color: 0xd7ad72, rise: 10, width: 3, height: 2, alpha: 0.5 },
          blizzard: { color: 0xd9eff5, rise: 32, width: 3, height: 3, alpha: 0.68 },
          spores: { color: 0xa5c878, rise: -18, width: 3, height: 3, alpha: 0.52 },
        };
        const style = weatherStyle[weather];
        if (style) for (let i = 0; i < 4; i++) {
          const x = segment.offsetX + segment.width * (i + 1) / 5;
          const y = segment.offsetY + 130 + (i * 83) % 340;
          const mote = this.add.rectangle(x, y, style.width, style.height, style.color, style.alpha).setDepth(3);
          this.tweens.add({ targets: mote, x: x + (weather === 'sandstorm' ? 34 : 12), y: y + style.rise, alpha: style.alpha * 0.28, duration: 2600 + i * 430, yoyo: true, repeat: -1, delay: i * 170, ease: 'Sine.InOut' });
        }
      }
      return;
    }
    const a = level.atmosphere.palette;
    const region = String(level.region);
    const sig = `${region}-${a.sky}-${a.mid}-${a.fore}`;
    const ensure = (key: string, make: () => HTMLCanvasElement): string => { if (!this.textures.exists(key)) this.textures.addCanvas(key, make()); return key; };
    this.parallax = [];
    this.add.image(0, 0, ensure(`aoc-sky-${sig}`, () => paintSky(a, region))).setOrigin(0, 0).setScrollFactor(0).setDepth(-40);
    const layers: Array<[0 | 1 | 2, number, number]> = [[0, 0.1, -31], [1, 0.28, -24], [2, 0.6, 1]];
    for (const [d, f, depth] of layers) {
      const ts = this.add.tileSprite(0, 0, 1280, 720, ensure(`aoc-layer-${sig}-${d}`, () => paintLayer(a, region, d))).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
      this.parallax.push({ ts, f });
    }
  }

  private updateParallax(): void {
    const cam = this.cameras.main;
    for (const p of this.parallax) p.ts.tilePositionX = Math.round(cam.scrollX * p.f);
  }

  /** One pixel-art texture per (material, size): painted to the exact collider size so pixels never stretch. */
  private platformTexture(kind: string, w: number, h: number): string {
    const key = `aoc-plat-${kind}-${w}x${h}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintPlatform(kind, w, h));
    return key;
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

  /** Pixel-art villager portrait, painted once per NPC id (src/art/world.ts). */
  private npcTexture(id: string, cloth: number): string {
    const key = `aoc-npc-${id}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintNpc(id, cloth));
    return key;
  }

  private supportY(x: number, y: number, level: LevelDef): number {
    const supports = level.platforms
      .filter(([px, py, width]) => x >= px - 18 && x <= px + width + 18 && py >= y - 12 && py - y <= 220)
      .sort((a, b) => a[1] - b[1]);
    return supports[0]?.[1] ?? y;
  }

  private drawNpcs(npcs: any[], level: LevelDef): void {
    const palette: Record<string, number> = { tamsin: 0x875447, kael: 0x526a7a, lyra: 0x667b55, brom: 0x9a7544, hobb: 0x805447, marta: 0x7d6250 };
    for (const spawn of npcs) {
      const def = this.services.world.content.npcs.get(spawn.npc);
      if (!def) continue;
      const x = spawn.x, y = this.supportY(spawn.x, spawn.y, level);
      const cloth = palette[spawn.npc] ?? 0x655044;
      const shadow = this.add.ellipse(x, y - 2, 31, 8, 0x000000, 0.46).setDepth(7);
      // NPCs were rendered at over twice Aren's visual height and looked detached
      // from the playable world. Keep their feet anchored and bring them to a shared scale.
      const actor = this.add.image(x, y, this.npcTexture(spawn.npc, cloth)).setOrigin(0.5, 0.94).setDepth(8).setScale(0.75);
      // Keep NPC feet on the same plane as Aren; the subtle cloth sway does not lift them.
      this.tweens.add({ targets: actor, scaleY: 0.755, angle: 0.28, duration: 2850 + (x % 5) * 110, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tweens.add({ targets: shadow, scaleX: 1.035, alpha: 0.39, duration: 2850 + (x % 5) * 110, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      const plaque = this.add.container(x, y - 52, [
        this.add.rectangle(0, 0, Math.min(190, Math.max(92, def.name.length * 9 + 34)), 23, 0x100d0b, 0.82).setStrokeStyle(1, 0x9a774b, 0.82),
        this.add.text(0, 0, def.name, { fontFamily: 'Georgia', fontSize: '12px', color: '#f0dfc3', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5),
        this.add.circle(-42, 0, 2, 0xe5bd79, 0.9),
      ]).setDepth(10);
      this.npcActors.push({ id: spawn.npc, x, y, label: plaque.list[1] as Phaser.GameObjects.Text });
    }
  }

  private drawInteractables(level: LevelDef): void {
    for (const item of level.interactables) {
      const footY = this.supportY(item.x, item.y, level);
      const g = this.add.container(item.x, footY).setDepth(7);
      const id = String(item.id).toLowerCase();
      const propKind: PropKind = id.includes('well') ? 'well' : (id.includes('forge') || id.includes('anvil')) ? 'forge' : (id.includes('chest') || id.includes('cache') || id.includes('crate')) ? 'chest' : (id.includes('shrine') || id.includes('memory') || id.includes('altar')) ? 'shrine' : 'generic';
      const propKey = `aoc-prop-${propKind}`;
      if (!this.textures.exists(propKey)) this.textures.addCanvas(propKey, paintProp(propKind));
      this.ensureSharedArt();
      g.add(this.add.ellipse(0, -2, 44, 9, 0x000000, 0.4));
      g.add(this.add.image(0, 0, propKey).setOrigin(0.5, 0.95).setScale(0.75));
      const labelBg = this.add.rectangle(item.label.length * 3.3, -75, Math.min(210, item.label.length * 7.5 + 24), 22, 0x100d0b, 0.76).setStrokeStyle(1, 0x806343, 0.8);
      const label = this.add.text(item.label.length * 3.3, -75, item.label, { fontFamily: 'Georgia', fontSize: '11px', color: '#e8d7ba', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5).setDepth(8);
      g.add([labelBg, label]);
      // Light-emitting props pulse: forge embers, shrine halo, chest glint.
      if (propKind === 'forge') {
        const glow = this.add.image(0, -10, 'aoc-glow').setTint(0xff8a3a).setAlpha(0.7).setBlendMode(Phaser.BlendModes.ADD);
        g.add(glow);
        this.tweens.add({ targets: glow, alpha: 0.32, scale: 0.8, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      } else if (propKind === 'shrine') {
        const glow = this.add.image(0, -30, 'aoc-glow').setTint(0x8fd4ee).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD);
        g.add(glow);
        this.tweens.add({ targets: glow, alpha: 0.3, scale: 1.25, duration: 1450, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      } else if (propKind === 'chest') {
        const glint = this.add.star(0, -34, 4, 2, 5, 0xf3d28b, 0.8).setDepth(8);
        g.add(glint);
        this.tweens.add({ targets: glint, alpha: 0.12, angle: 90, scale: 0.65, duration: 1150, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      }
      this.interactables.push({ id: item.id, x: item.x, y: footY, label: item.label });
    }
  }

  private drawExitsAndPaths(runtime: any, level: LevelDef): void {
    for (const exit of level.exits) {
      const r = exit.rect;
      this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x3a2522, 0.25).setStrokeStyle(3, 0xc99b5b, 0.8).setDepth(6);
      this.add.text(r.x + r.w / 2, r.y - 28, this.ui?.language === 'fa' ? 'مسیر پیش رو' : 'WAY FORWARD', { fontSize: '10px', color: '#f0c77f', stroke: '#171315', strokeThickness: 3, letterSpacing: 1 }).setOrigin(0.5).setDepth(8);
    }
    for (const path of runtime.hiddenPaths ?? []) if (path.revealed) {
      const r = path.rect;
      this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x75c6ad, 0.25).setStrokeStyle(2, 0x8fe4c9, 0.9).setDepth(6);
      this.add.text(r.x + r.w / 2, r.y - 22, this.ui?.language === 'fa' ? 'مسیر پنهان' : 'HIDDEN PATH', { fontSize: '9px', color: '#a7f0d5', stroke: '#171315', strokeThickness: 3 }).setOrigin(0.5).setDepth(8);
    }
  }

  private drawCollectibles(items: any[]): void {
    this.collectGroup = this.physics.add.staticGroup();
    for (const item of items) {
      this.ensureSharedArt();
      const orb = this.collectGroup.create(item.x, item.y, 'aoc-shard') as Phaser.Physics.Arcade.Image;
      orb.setCircle(10, 2, 2).setDepth(6).refreshBody();
      this.tweens.add({ targets: orb, y: item.y - 5, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      orb.setData('collectibleId', item.id);
      const glow = this.add.image(item.x, item.y, 'aoc-glow').setScale(0.7).setAlpha(0.55).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
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

  private updateOverworldRegion(x: number): void {
    if (this.overworldSegments.length < 2) return;
    const seg = this.overworldSegments.find(s => x >= s.offsetX && x < s.offsetX + s.width) ?? this.overworldSegments[this.overworldSegments.length - 1];
    if (seg.region === this.currentRegion) return;
    this.currentRegion = seg.region; this.combat?.engine.setRegion(seg.region);
    this.game.events.emit('world:region-changed', { regionId: seg.region }); this.game.events.emit('region:entered', { region: seg.region });
    const regionNamesFa: Record<string, string> = { ashen_village: 'روستای خاکستر', whispering_forest: 'جنگل نجواگر', forgotten_desert: 'بیابان فراموش‌شده', frozen_highlands: 'بلندای یخ‌زده', hollow_city: 'شهر توخالی', crownfall: 'سقوط تاج' };
    const region = this.services.world.content.regions.get(seg.region);
    this.ui?.toast({ text: this.ui?.language === 'fa' ? regionNamesFa[seg.region] ?? region?.name ?? seg.region : region?.name ?? seg.region, kind: 'info' });
  }

  private updateWorldTriggers(): void {
    const px = this.aren.x, py = this.aren.y;
    this.updateOverworldRegion(px);
    for (const gate of [...this.overworldGates]) if (this.services.world.canTravel(gate.from, gate.to)) { gate.wall.destroy(); gate.label.destroy(); this.overworldGates.splice(this.overworldGates.indexOf(gate), 1); }
    for (const zone of this.levelDef.zones) {
      const inside = px >= zone.rect.x && px <= zone.rect.x + zone.rect.w && py >= zone.rect.y && py <= zone.rect.y + zone.rect.h;
      if (inside && !this.activeZones.has(zone.id)) { this.activeZones.add(zone.id); if (!this.services.world.hasFlag(`zone_${zone.id}`)) this.services.world.reportZone(zone.id); }
      if (!inside) this.activeZones.delete(zone.id);
    }
    for (const poi of this.services.world.content.pois.values()) {
      const seg = this.overworldSegments.find(s => s.levelId === poi.level); if (!seg && poi.level !== this.currentLevelId) continue;
      const poiX = poi.x + (seg?.offsetX ?? 0), poiY = poi.y + (seg?.offsetY ?? 0);
      const near = Math.hypot(px - poiX, py - poiY) < 48;
      if (near && !this.activePois.has(poi.id)) {
        this.activePois.add(poi.id); if (!this.services.world.hasFlag(`zone_${poi.id}`)) this.services.world.reportZone(poi.id);
        if (poi.kind === 'camp' || poi.kind === 'shrine') {
          const newlyDiscovered = this.services.persistence.checkpoints.activate(`memory_${poi.id}`);
          this.aren.setCheckpoint(poiX, poiY);
          this.aren.stats.heal(this.aren.stats.config.maxHealth);
          this.aren.stats.restoreMana(this.aren.stats.config.maxMana);
          this.aren.stats.stamina = this.aren.stats.config.maxStamina;
          if (newlyDiscovered) this.showCheckpointFeedback(poiX, poiY);
        }
      } else if (!near) this.activePois.delete(poi.id);
    }
    for (const exit of this.levelDef.exits) {
      const r = exit.rect;
      if (px >= r.x && px <= r.x + r.w && py >= r.y - 20 && py <= r.y + r.h + 20) {
        const source = this.overworldExitSources[exit.id]; const result = this.services.world.useExit(source?.levelId ?? this.currentLevelId, source?.exitId ?? exit.id);
        if (!result.ok) { const now = this.time.now; if (now - (this.blockedExitAt.get(exit.id) ?? 0) > 2200) { this.blockedExitAt.set(exit.id, now); this.ui?.toast({ text: result.reason ?? 'The way is sealed.', kind: 'warning' }); } }
        else return;
      }
    }
  }

  /** Small one-shot checkpoint feedback, anchored near the stone instead of covering the HUD. */
  private showCheckpointFeedback(x: number, y: number): void {
    const label = this.add.text(x, y - 76, this.ui?.language === 'fa' ? 'نقطه ذخیره شد' : 'CHECKPOINT SAVED', {
      fontFamily: 'Georgia', fontSize: '11px', fontStyle: 'bold',
      color: '#b9e7a7', stroke: '#171315', strokeThickness: 3,
      backgroundColor: '#171315cc', padding: { x: 7, y: 4 },
    }).setOrigin(0.5).setDepth(30).setAlpha(0);
    this.tweens.add({
      targets: label, alpha: 1, y: label.y - 8, duration: 220, ease: 'Cubic.Out',
      hold: 950, yoyo: true, onComplete: () => label.destroy(),
    });
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

  private checkBossEncounter(): void {
    if (!this.aren || !this.combat) return;
    for (const [id, pending] of this.pendingBossIntros) {
      const enemy = this.combat.engine.getAlive().find(e => e.bossId === id);
      if (!enemy) { this.pendingBossIntros.delete(id); continue; }
      if (Math.hypot(this.aren.x - enemy.x, this.aren.y - enemy.y) > 820) continue;
      this.currentBoss = { id, name: pending.name, phase: enemy.bossPhase ?? 1 };
      this.pendingBossIntros.delete(id); this.ui?.banner(pending.name, pending.title, 'skull'); this.updateHud(); break;
    }
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
        .aoc-opening-cinematic .aoc-shot{position:absolute;inset:-3%;overflow:hidden;background:radial-gradient(ellipse at 50% 55%,#34201d 0%,#100e12 54%,#050507 100%);transform:scale(1.045);transition:transform 60s cubic-bezier(.16,.55,.25,1);contain:paint}
        .aoc-opening-cinematic.is-visible .aoc-shot{transform:scale(1)}
        .aoc-opening-cinematic .aoc-art{position:absolute;width:100%;height:100%;inset:0}
        .aoc-opening-cinematic .aoc-scene-world{opacity:0;transition:opacity 1.8s ease}
        .aoc-opening-cinematic .aoc-ashes-world{opacity:1;transition:opacity 1.8s ease}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-green-world,.aoc-opening-cinematic .aoc-shot.scene-trial .aoc-trial-world{opacity:1}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-ashes-world,.aoc-opening-cinematic .aoc-shot.scene-trial .aoc-ashes-world{opacity:0}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-haze{background:linear-gradient(180deg,transparent,rgba(113,175,91,.10),rgba(20,48,33,.34))}
        .aoc-opening-cinematic .aoc-shot.scene-trial .aoc-haze{background:linear-gradient(180deg,transparent,rgba(195,153,104,.12),rgba(18,13,17,.65))}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-embers{display:none}
        .aoc-opening-cinematic.is-visible .aoc-art{animation:aoc-camera-drift 60s cubic-bezier(.2,.55,.25,1) both}
        .aoc-opening-cinematic .aoc-shot:after{content:'';position:absolute;inset:-20%;pointer-events:none;background:linear-gradient(112deg,transparent 35%,rgba(255,194,137,.075) 48%,transparent 60%);transform:translateX(-65%);animation:aoc-light-sweep 8s ease-in-out 1.2s infinite}
        .aoc-opening-cinematic .aoc-haze{opacity:.82}
        @keyframes aoc-camera-drift{0%{transform:scale(1.02) translate3d(1.2%,.8%,0)}45%{transform:scale(1.11) translate3d(-1.4%,-.5%,0)}100%{transform:scale(1.12) translate3d(-1.5%,-.8%,0)}}
        /* Each story beat gets its own camera move, not one repeated zoom on a still. */
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-art{animation:aoc-green-pan 5.2s cubic-bezier(.2,.55,.25,1) both}
        .aoc-opening-cinematic .aoc-shot.scene-trial .aoc-art{animation:aoc-trial-dolly 8.5s cubic-bezier(.2,.55,.25,1) both}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-art{animation:aoc-ashes-reveal 60s cubic-bezier(.2,.55,.25,1) both}
        @keyframes aoc-green-pan{0%{transform:scale(1.12) translate3d(3.5%,1.2%,0)}100%{transform:scale(1.03) translate3d(-2.5%,-.6%,0)}}
        @keyframes aoc-trial-dolly{0%{transform:scale(1.04) translate3d(-1.8%,.4%,0)}55%{transform:scale(1.12) translate3d(1.2%,-.5%,0)}100%{transform:scale(1.08) translate3d(0,-.2%,0)}}
        @keyframes aoc-ashes-reveal{0%{transform:scale(1.18) translate3d(0,2.4%,0);filter:brightness(1.45)}12%{filter:brightness(.72)}42%{transform:scale(1.09) translate3d(-1.2%,-.3%,0);filter:brightness(.88)}100%{transform:scale(1.04) translate3d(1.4%,-.8%,0);filter:brightness(.78)}}
        .aoc-opening-cinematic .aoc-cine-figure{position:absolute;z-index:3;left:50%;bottom:12%;width:54px;height:150px;transform:translateX(-50%);transform-origin:50% 100%;filter:drop-shadow(0 12px 16px rgba(0,0,0,.55));transition:transform 1.2s ease,opacity 1s ease}
        .aoc-opening-cinematic .aoc-cine-figure .head{position:absolute;left:20px;top:2px;width:17px;height:22px;border-radius:48% 48% 42% 42%;background:linear-gradient(90deg,#171218,#393039 55%,#100e13)}
        .aoc-opening-cinematic .aoc-cine-figure .torso{position:absolute;left:12px;top:22px;width:34px;height:67px;background:linear-gradient(90deg,#100e13,#3a3030 48%,#151116);clip-path:polygon(22% 0,78% 0,100% 100%,0 100%);border-top:2px solid #94724e}
        .aoc-opening-cinematic .aoc-cine-figure .cape{position:absolute;left:7px;top:27px;width:42px;height:78px;background:linear-gradient(90deg,#0b0b10,#29212a 55%,#0c0b10);clip-path:polygon(25% 0,75% 0,100% 100%,0 86%)}
        .aoc-opening-cinematic .aoc-cine-figure .leg{position:absolute;top:82px;width:12px;height:57px;background:#111016;transform-origin:50% 5%}
        .aoc-opening-cinematic .aoc-cine-figure .leg.left{left:15px}.aoc-opening-cinematic .aoc-cine-figure .leg.right{right:14px}
        .aoc-opening-cinematic .aoc-cine-figure .arm{position:absolute;z-index:4;left:37px;top:43px;width:10px;height:49px;border-radius:7px;background:linear-gradient(90deg,#171116,#65503e 55%,#171116);transform:rotate(-24deg);transform-origin:50% 8%}
        .aoc-opening-cinematic .aoc-cine-figure .cape{transform-origin:50% 8%;animation:aoc-cape-wind 2.8s ease-in-out infinite alternate}
        .aoc-opening-cinematic .aoc-cine-figure .leg.left{animation:aoc-leg-idle 1.1s ease-in-out infinite alternate}
        .aoc-opening-cinematic .aoc-cine-figure .leg.right{animation:aoc-leg-idle 1.1s ease-in-out -0.55s infinite alternate}
        .aoc-opening-cinematic .aoc-cine-figure .arm{animation:aoc-arm-ready 3.6s ease-in-out infinite}
        .aoc-opening-cinematic .aoc-cine-figure .blade{position:absolute;right:-5px;top:44px;width:3px;height:72px;background:linear-gradient(#e3c99c,#70604f);transform:rotate(-28deg);transform-origin:50% 0;box-shadow:0 0 9px rgba(225,190,135,.35)}
        @keyframes aoc-cape-wind{0%{transform:skewX(-5deg) scaleX(.94)}100%{transform:skewX(7deg) scaleX(1.08)}}
        @keyframes aoc-leg-idle{0%{transform:rotate(-1deg)}100%{transform:rotate(1.8deg)}}
        @keyframes aoc-arm-ready{0%,72%,100%{transform:rotate(-24deg)}82%{transform:rotate(-58deg)}90%{transform:rotate(-18deg)}}
        .aoc-opening-cinematic .aoc-shot.scene-trial .aoc-cine-figure .blade{animation:aoc-blade-raise 2.1s ease-in-out both}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-cine-figure .cape{animation:aoc-cape-fall 2.4s ease-out both}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-cine-figure .leg.left{animation:aoc-kneel-left 1.3s ease-out both}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-cine-figure .leg.right{animation:aoc-kneel-right 1.3s ease-out both}
        @keyframes aoc-blade-raise{0%{transform:rotate(-28deg)}45%{transform:rotate(18deg)}100%{transform:rotate(-42deg)}}
        @keyframes aoc-cape-fall{0%{transform:skewX(9deg)}100%{transform:skewX(-8deg) scaleY(1.08)}}
        @keyframes aoc-kneel-left{to{transform:rotate(34deg) translateY(5px)}}
        @keyframes aoc-kneel-right{to{transform:rotate(-23deg) translateY(3px)}}
        .aoc-opening-cinematic .aoc-ground-mist{position:absolute;z-index:2;inset:auto -15% 7%;height:26%;pointer-events:none;background:radial-gradient(ellipse at 20% 80%,rgba(183,154,128,.2),transparent 55%),radial-gradient(ellipse at 76% 70%,rgba(174,111,81,.16),transparent 58%);animation:aoc-mist-travel 12s ease-in-out infinite alternate}
        @keyframes aoc-mist-travel{from{transform:translateX(-3%) scaleY(.92);opacity:.5}to{transform:translateX(4%) scaleY(1.12);opacity:.9}}
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
        .aoc-opening-cinematic .aoc-shot.scene-verdict{animation:aoc-verdict-shake .55s ease-out 1}
        .aoc-opening-cinematic .aoc-shot.scene-verdict:before{content:'';position:absolute;inset:0;z-index:4;background:radial-gradient(ellipse at 50% 58%,rgba(245,183,112,.42),transparent 58%);animation:aoc-verdict-glow 2.4s ease-in-out infinite alternate}
        .aoc-opening-cinematic .aoc-shot.scene-trial .aoc-trial-world{filter:contrast(1.12) saturate(.78)}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-ashes-world{animation:aoc-ruin-light 4s ease-in-out infinite alternate}
        .aoc-opening-cinematic .aoc-shot.scene-ashes .aoc-cine-figure{animation:aoc-figure-breathe 2.8s ease-in-out infinite}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-ground-mist{opacity:.45}
        .aoc-opening-cinematic .aoc-embers{mix-blend-mode:screen}
        .aoc-opening-cinematic .aoc-shot.scene-green .aoc-bird-flock{animation-duration:7s}
        @keyframes aoc-verdict-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-.5%)}40%{transform:translateX(.4%)}60%{transform:translateX(-.25%)}80%{transform:translateX(.15%)}}
        @keyframes aoc-verdict-glow{from{opacity:.15}to{opacity:.75}}
        @keyframes aoc-ruin-light{from{filter:brightness(.76) saturate(.82)}to{filter:brightness(1.08) saturate(1.08)}}
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
        <div class="aoc-cine-figure" aria-hidden="true"><i class="cape"></i><i class="head"></i><i class="torso"></i><i class="arm"></i><i class="leg left"></i><i class="leg right"></i><i class="blade"></i></div>
        <div class="aoc-ground-mist" aria-hidden="true"></div><div class="aoc-bird-flock" aria-hidden="true"></div><div class="aoc-smoke" aria-hidden="true"></div><div class="aoc-firelight" aria-hidden="true"></div>
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
    const browserTimers: number[] = [];
    const later = (delay: number, fn: () => void) => browserTimers.push(window.setTimeout(fn, delay));
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
      browserTimers.forEach(id => window.clearTimeout(id));
      window.removeEventListener('pointerdown', unlockScore);
      window.removeEventListener('keydown', unlockScore);
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

    // Original one-minute orchestral-style score: layered pads, low strings, a plucked
    // ostinato, a rising lead and restrained cinematic impacts. Audio starts on the first
    // real user gesture because mobile browsers prohibit autoplay.
    let scoreStarted = false;
    const unlockScore = () => {
      if (scoreStarted || !audioContext || finished) return;
      scoreStarted = true;
      void audioContext.resume().then(() => {
        if (!audioContext || finished) return;
        const ctx = audioContext, now = ctx.currentTime;
        const master = ctx.createGain(); master.gain.setValueAtTime(0.0001, now); master.gain.linearRampToValueAtTime(0.34, now + 2.8); master.connect(ctx.destination);
        const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 1800; low.connect(master);
        const chordBus = ctx.createGain(); chordBus.gain.value = 0.20; chordBus.connect(low);
        const progression = [[110,164.81,220,261.63],[87.31,130.81,174.61,220],[98,146.83,196,246.94],[73.42,110,146.83,196],[87.31,130.81,174.61,220],[65.41,98,130.81,164.81]];
        progression.forEach((chord, index) => {
          const at = now + index * 10;
          chord.forEach((hz, voice) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = voice === 0 ? 'triangle' : 'sine'; osc.frequency.value = hz;
            gain.gain.setValueAtTime(0.0001, at); gain.gain.linearRampToValueAtTime(voice === 0 ? 0.22 : 0.075, at + 1.8); gain.gain.setValueAtTime(voice === 0 ? 0.22 : 0.075, at + 8.8); gain.gain.linearRampToValueAtTime(0.0001, at + 10);
            osc.connect(gain); gain.connect(chordBus); osc.start(at); osc.stop(at + 10.1); audioNodes.push(osc);
          });
        });
        // Slow low-string pulses build tension beneath the harmony.
        for (let beat = 0; beat < 30; beat++) {
          const at = now + beat * 2;
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'triangle'; osc.frequency.value = [55,43.65,49,36.71,43.65,32.7][Math.floor(beat / 5)];
          gain.gain.setValueAtTime(0.0001, at); gain.gain.linearRampToValueAtTime(0.12, at + 0.12); gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.35);
          osc.connect(gain); gain.connect(master); osc.start(at); osc.stop(at + 1.4); audioNodes.push(osc);
        }
        // A delicate plucked motif evolves into a more urgent rising melody.
        const motif = [0,7,12,7,3,7,10,7,0,7,12,15,14,10,7,3,0,7,12,19,17,14,12,7,3,7,10,14,17,14,10,7];
        const root = [220,174.61,196,146.83,174.61,130.81];
        motif.forEach((step, index) => {
          const at = now + 1.5 + index * 1.72;
          const hz = root[Math.min(5, Math.floor(index / 6))] * Math.pow(2, step / 12);
          const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
          osc.type = 'triangle'; osc.frequency.value = hz; filter.type = 'lowpass'; filter.frequency.value = 2200;
          gain.gain.setValueAtTime(0.0001, at); gain.gain.linearRampToValueAtTime(index > 23 ? 0.12 : 0.075, at + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.65);
          osc.connect(filter); filter.connect(gain); gain.connect(master); osc.start(at); osc.stop(at + 0.7); audioNodes.push(osc);
        });
        // A warm, airy fifth enters for the oath/title passage.
        [392,587.33].forEach((hz, i) => { const osc=ctx.createOscillator(), gain=ctx.createGain(); osc.type='sine'; osc.frequency.value=hz; gain.gain.setValueAtTime(0.0001,now+42); gain.gain.linearRampToValueAtTime(i?0.025:0.04,now+47); gain.gain.setValueAtTime(i?0.025:0.04,now+56); gain.gain.linearRampToValueAtTime(0.0001,now+60); osc.connect(gain); gain.connect(master); osc.start(now+42); osc.stop(now+60.1); audioNodes.push(osc); });
        // Final crescendo and controlled cinematic hit.
        const hitAt = now + 54.5;
        const hit = ctx.createOscillator(), hitGain = ctx.createGain(); hit.type='sine'; hit.frequency.setValueAtTime(92,hitAt); hit.frequency.exponentialRampToValueAtTime(38,hitAt+1.2); hitGain.gain.setValueAtTime(0.0001,hitAt); hitGain.gain.linearRampToValueAtTime(0.2,hitAt+0.04); hitGain.gain.exponentialRampToValueAtTime(0.0001,hitAt+2.2); hit.connect(hitGain); hitGain.connect(master); hit.start(hitAt); hit.stop(hitAt+2.3); audioNodes.push(hit);
        master.gain.setValueAtTime(0.34, now + 57); master.gain.linearRampToValueAtTime(0.0001, now + 60);
      }).catch(() => { scoreStarted = false; });
    };
    window.addEventListener('pointerdown', unlockScore, { once: true });
    window.addEventListener('keydown', unlockScore, { once: true });

    const captions = fa ? [
      ['پیش از خاکستر', 'پادشاهی در آرامش نفس می‌کشید؛ رودها روشن بودند و ناقوس‌ها نوید فردایی امن می‌دادند.'],
      ['سوگندِ نگهبان', 'آرن وال‌کرست، شمشیرش را برای پاسداری از تاج و مردم بالا برد.'],
      ['خیانت در تالار', 'اما زمزمه‌ای در گوش پادشاه نشست؛ حقیقت، پیش از شنیده‌شدن محکوم شد.'],
      ['حکم پادشاه', 'درهای تالار بسته شد. نگهبانان راه را سد کردند و نام آرن به ننگ آلوده شد.'],
      ['شبِ آتش', 'شعله‌ها خانه را بلعیدند؛ آنچه از سرزمین ماند، خاکستر و سکوت بود.'],
      ['سوگندِ خاکستر', 'از دل ویرانی برمی‌خیزی؛ نه برای تاج، که برای آشکارکردن حقیقت.']
    ] : [
      ['BEFORE THE ASHES', 'The kingdom breathed in peace; rivers shone and bells promised a safer tomorrow.'],
      ['THE OATH OF A GUARDIAN', 'Aren Valcrest raised his blade to protect the crown and its people.'],
      ['BETRAYAL IN THE HALL', 'A whisper reached the king. The truth was condemned before it could be heard.'],
      ['THE KING’S DECREE', 'The hall doors closed. The guards blocked his way, and Aren’s name was stained.'],
      ['THE NIGHT OF FIRE', 'Flames consumed his home. Only ash and silence remained.'],
      ['AN OATH IN ASHES', 'From ruin, he rises—not for a crown, but to uncover the truth.']
    ];
    setScene('green'); setCaption(captions[0][0], captions[0][1]);
    schedule(10500, () => { setScene('trial'); setCaption(captions[1][0], captions[1][1]); });
    schedule(19000, () => { setCaption(captions[2][0], captions[2][1]); shot.classList.add('scene-verdict'); flash.classList.add('is-flashing'); });
    schedule(27500, () => { setCaption(captions[3][0], captions[3][1]); flash.classList.remove('is-flashing'); void flash.offsetWidth; flash.classList.add('is-flashing'); });
    schedule(36500, () => { setScene('ashes'); setCaption(captions[4][0], captions[4][1]); });
    schedule(45500, () => { setCaption(captions[5][0], captions[5][1]); flash.classList.remove('is-flashing'); void flash.offsetWidth; flash.classList.add('is-flashing'); });
    schedule(52500, () => {
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
    schedule(60000, finish);
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
