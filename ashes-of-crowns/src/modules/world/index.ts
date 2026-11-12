/**
 * ASHES OF CROWNS — Module 3: World, Story, Quests & Narrative.
 * Public API. See README.md for the integration contract.
 */
import { ContentBundle, ContentDB } from './core/ContentDB';
import { EventBus, ExternalEmitter, Listener } from './core/EventBus';
import { NarrativeState } from './core/NarrativeState';
import { Runtime } from './core/Runtime';
import { QuestSystem } from './systems/QuestSystem';
import { DialogueSystem } from './systems/DialogueSystem';
import { CompanionSystem, CombatContext } from './systems/CompanionSystem';
import { WorldMap } from './systems/WorldMap';
import { EndingSystem } from './systems/EndingSystem';
import { StoryDirector } from './systems/StoryDirector';
import { buildContent } from './data';
import type { EndingId, QuestStatus, RegionId, SaveData } from './types';

export * from './types';
export type { ExternalEmitter, ContentBundle };
export type { QuestView } from './systems/QuestSystem';
export type { CombatContext, AssistAction, PartyMemberSpec } from './systems/CompanionSystem';
export type { EndingResult, EndingEvaluation } from './systems/EndingSystem';
export type { ExplorationStats } from './systems/WorldMap';

export interface WorldModuleOptions {
  /** Phaser scene/game EventEmitter (or any {emit,on}). Every 'world:*' event is mirrored to it. */
  emitter?: ExternalEmitter;
  /** Restore from the persistence module's saved blob (otherwise a new game starts). */
  saveData?: SaveData;
  /** Override content (tests / mods). Defaults to the shipped campaign. */
  content?: ContentBundle;
}

export class WorldModule {
  readonly events: EventBus;
  readonly content: ContentDB;
  private rt: Runtime;
  private detachers: (() => void)[] = [];

  constructor(opts: WorldModuleOptions = {}) {
    this.events = new EventBus(opts.emitter);
    this.content = new ContentDB(opts.content ?? buildContent());
    this.rt = new Runtime(new NarrativeState(), this.content, this.events);
    this.wire();
    if (opts.saveData) this.restore(opts.saveData); else this.newGame();
    if (opts.emitter) this.attach(opts.emitter);
  }
  private wire(): void {
    const rt = this.rt;
    rt.quests = new QuestSystem(rt); rt.dialogue = new DialogueSystem(rt); rt.companions = new CompanionSystem(rt);
    rt.map = new WorldMap(rt); rt.endings = new EndingSystem(rt); rt.story = new StoryDirector(rt);
  }

  /* ---------- lifecycle & persistence ---------- */
  newGame(): void {
    this.rt.state = new NarrativeState();
    this.rt.map.init(); this.rt.companions.resetCooldowns();
    this.rt.refresh();
    this.events.emit('world:new-game', { chapter: 1 });
  }
  serialize(): SaveData { return this.rt.state.toJSON(); }
  restore(data: SaveData): void {
    this.rt.dialogue.end();
    this.rt.state = NarrativeState.fromJSON(data);
    this.rt.map.init(); this.rt.companions.resetCooldowns();
    this.events.emit('world:restored', { chapter: this.rt.state.chapter });
  }
  /** Subscribe to events from other modules (see README "Events listened to"). */
  attach(em: ExternalEmitter): void {
    this.detach();
    const bind = (name: string, fn: (p: any) => void) => {
      const h = (p: any) => fn(p ?? {});
      em.on(name, h);
      this.detachers.push(() => em.off?.(name, h));
    };
    bind('combat:enemy-defeated', p => this.reportKill(p.enemyId, p.bossId));
    bind('combat:boss-defeated', p => this.reportKill(p.enemyId ?? p.bossId, p.bossId));
    bind('player:entered-zone', p => this.reportZone(p.zoneId));
    bind('player:interact', p => this.reportInteract(p.objectId));
    bind('player:collect', p => this.collect(p.id));
    bind('player:npc-interact', p => this.talkTo(p.npcId));
    bind('player:died', () => { this.rt.bump('deaths'); this.rt.refresh(); });
    bind('ui:dialogue-choose', p => this.choose(p.index));
    bind('ui:dialogue-advance', () => this.advance());
    bind('combat:assist-request', (ctx: CombatContext) => this.events.emit('world:companion-assist-actions', this.requestAssist(ctx)));
  }
  detach(): void { this.detachers.forEach(d => d()); this.detachers = []; }
  on(event: string, fn: Listener): () => void { return this.events.on(event, fn); }

  /* ---------- reports from player / combat ---------- */
  reportZone(zoneId: string): void { this.rt.map.reportZone(zoneId); }
  reportInteract(objectId: string): void { this.rt.map.reportInteract(objectId); }
  reportKill(enemyId: string, bossId?: string): void { this.rt.map.reportKill(enemyId, bossId); }
  collect(collectibleId: string): boolean { return this.rt.map.collect(collectibleId); }

  /* ---------- dialogue ---------- */
  talkTo(npcId: string) { return this.rt.dialogue.startNpc(npcId); }
  startDialogue(treeId: string) { return this.rt.dialogue.start(treeId); }
  choose(index: number) { return this.rt.dialogue.choose(index); }
  advance() { return this.rt.dialogue.advance(); }
  endDialogue(): void { this.rt.dialogue.end(); }
  getDialogue() { return this.rt.dialogue.getCurrent(); }
  isInDialogue(): boolean { return this.rt.dialogue.isActive(); }

  /* ---------- quests ---------- */
  getQuestLog(filter?: QuestStatus) { return this.rt.quests.getLog(filter); }
  getQuest(id: string) { return this.rt.quests.view(id); }
  startQuest(id: string): boolean { return this.rt.quests.start(id); }
  getAvailableQuests(): string[] { return this.rt.quests.getAvailable(); }
  /** Convenience for HUD: next unfinished objective of the active main quest. */
  getMainObjective(): { quest: string; objective: string } | null {
    for (const q of this.rt.quests.getLog('active')) {
      if (q.type !== 'main') continue;
      const o = q.objectives.find(x => !x.done);
      if (o) return { quest: q.title, objective: o.text };
    }
    return null;
  }

  /* ---------- world / levels ---------- */
  getRegionIds(): RegionId[] { return [...this.content.regions.keys()]; }
  getMapView() { return this.rt.map.getMapView(); }
  getLevel(levelId: string) { return this.rt.map.getLevel(levelId); }
  /** Everything a scene needs to build a level *now*: geometry plus currently valid NPCs/collectibles/paths. */
  getLevelRuntime(levelId: string) {
    const level = this.rt.map.getLevel(levelId);
    if (!level) return null;
    return { level, npcs: this.rt.map.getLevelNpcs(levelId), collectibles: this.rt.map.getLevelCollectibles(levelId), hiddenPaths: this.rt.map.getHiddenPaths(levelId) };
  }
  getHiddenPaths(levelId: string) { return this.rt.map.getHiddenPaths(levelId); }
  useExit(levelId: string, exitId: string) { return this.rt.map.useExit(levelId, exitId); }
  canTravel(from: RegionId, to: RegionId): boolean { return this.rt.map.canTravel(from, to); }
  travel(from: RegionId, to: RegionId): boolean { return this.rt.map.travel(from, to); }
  getFastTravelTargets() { return this.rt.map.fastTravelTargets(); }
  getExploration(region: RegionId) { return this.rt.map.getExplorationStats(region); }
  getChapter(): number { return this.rt.state.chapter; }

  /* ---------- companions ---------- */
  getParty(): string[] { return this.rt.companions.getParty(); }
  setParty(ids: string[]): boolean { return this.rt.companions.setParty(ids); }
  getPartySpecs() { return this.rt.companions.getPartySpecs(); }
  requestAssist(ctx: CombatContext) { return this.rt.companions.requestAssist(ctx); }
  getCompanionStatus(id: string) {
    const d = this.content.companions.get(id); if (!d) return null;
    return { id, name: d.name, title: d.title, role: d.role, state: this.rt.state.compState(id), inParty: this.rt.state.companions[id]?.inParty ?? false, loyaltyTier: this.rt.companions.tier(id), personalQuest: d.personalQuest };
  }

  /* ---------- narrative / endings ---------- */
  hasFlag(flag: string): boolean { return this.rt.state.flags.has(flag); }
  setFlag(flag: string, value = true): void { this.rt.setFlag(flag, value); this.rt.refresh(); }
  /** Debug/QA only — hidden variables must NOT be shown to the player. */
  getHiddenVariables() { return { ...this.rt.state.vars }; }
  getRelationship(id: string): number { return this.rt.state.rel(id); }
  previewEndings() { return this.rt.endings.evaluate(); }
  resolveEnding() { return this.rt.endings.resolve(); }
  getEnding(): EndingId | null { return this.rt.state.ending; }
}

export function createWorldModule(opts?: WorldModuleOptions): WorldModule { return new WorldModule(opts); }
