import type { Runtime } from '../core/Runtime';
import type { HiddenPathDef, LevelDef, RegionDef, RegionId } from '../types';

export interface ExplorationStats {
  region: RegionId; collectibles: { found: number; total: number }; pois: { found: number; total: number };
  hiddenPaths: { found: number; total: number }; quests: { done: number; total: number }; percent: number;
}

export class WorldMap {
  constructor(private rt: Runtime) {}

  init(): void {
    for (const r of this.rt.content.regions.values()) if (r.startsUnlocked) this.rt.state.unlocked.add(r.id);
  }
  unlock(id: string): void {
    if (this.rt.state.unlocked.has(id)) return;
    this.rt.state.unlocked.add(id);
    const region = this.rt.content.regions.get(id as RegionId);
    this.rt.bus.emit('world:area-unlocked', { id, name: region?.name ?? id });
    if (region) this.rt.bus.emit('world:toast', { text: `New region: ${region.name}` });
  }
  discover(id: string): void {
    if (this.rt.state.discovered.has(id)) return;
    const poi = this.rt.content.pois.get(id); if (!poi) return;
    this.rt.state.discovered.add(id); this.rt.setFlag(`poi_${id}`);
    this.rt.bus.emit('world:poi-discovered', { id, name: poi.name, region: poi.region });
    this.rt.refresh();
  }
  isUnlocked(id: string): boolean { return this.rt.state.unlocked.has(id); }

  getRegion(id: RegionId): RegionDef { return this.rt.content.regions.get(id)!; }
  getMapView() {
    const regions = [...this.rt.content.regions.values()].sort((a, b) => a.chapter - b.chapter);
    return {
      nodes: regions.map(r => ({ id: r.id, name: r.name, chapter: r.chapter, tagline: r.tagline, pos: r.mapPos, unlocked: this.isUnlocked(r.id), stats: this.getExplorationStats(r.id) })),
      edges: regions.flatMap(r => r.connections.map(c => ({ from: r.id, to: c.to, open: this.isUnlocked(r.id) && this.isUnlocked(c.to) && this.rt.check(c.requires) }))),
      discoveredPois: [...this.rt.state.discovered].map(id => this.rt.content.pois.get(id)).filter(Boolean),
    };
  }
  canTravel(from: RegionId, to: RegionId): boolean {
    if (!this.isUnlocked(to)) return false;
    const a = this.getRegion(from).connections.find(c => c.to === to);
    const b = this.getRegion(to).connections.find(c => c.to === from);
    const edge = a ?? b;
    return !!edge && this.rt.check(edge.requires);
  }
  /** Request travel; the scene layer listens for 'world:level-requested'. */
  travel(from: RegionId, to: RegionId): boolean {
    if (!this.canTravel(from, to)) return false;
    const lvl = this.getRegion(to).entryLevel;
    this.rt.bus.emit('world:level-requested', { level: lvl, spawn: 'start', via: 'travel' });
    return true;
  }
  fastTravelTargets() {
    return [...this.rt.state.discovered].map(id => this.rt.content.pois.get(id)!).filter(p => p?.fastTravel && this.isUnlocked(p.region));
  }

  getLevel(id: string): LevelDef | undefined { return this.rt.content.levels.get(id); }
  /** NPCs to spawn in a level now (respects `when` conditions and dead/left companions). */
  getLevelNpcs(levelId: string) {
    const lvl = this.getLevel(levelId); if (!lvl) return [];
    return lvl.npcs.filter(p => this.rt.check(p.when) && !this.npcGone(p.npc));
  }
  private npcGone(npc: string): boolean {
    const def = this.rt.content.npcs.get(npc);
    if (!def?.companion) return false;
    return this.rt.state.compState(def.companion) !== 'unmet';
  }
  getLevelCollectibles(levelId: string) {
    return (this.getLevel(levelId)?.collectibles ?? []).filter(c => !this.rt.state.collected.has(c.id));
  }
  getHiddenPaths(levelId: string): (HiddenPathDef & { revealed: boolean })[] {
    return (this.getLevel(levelId)?.hiddenPaths ?? []).map(p => ({ ...p, revealed: this.rt.state.revealed.has(p.id) }));
  }
  /** Use a level exit. Returns whether it opened (and emits 'world:level-requested'). */
  useExit(levelId: string, exitId: string): { ok: boolean; reason?: string } {
    const ex = this.getLevel(levelId)?.exits.find(e => e.id === exitId);
    if (!ex) return { ok: false, reason: 'no such exit' };
    if (!this.rt.check(ex.requires)) return { ok: false, reason: ex.lockedText ?? 'The way is blocked.' };
    this.rt.bus.emit('world:level-requested', { level: ex.to.level, spawn: ex.to.spawn, via: 'exit' });
    return { ok: true };
  }

  /* ---- reports from the player/combat modules ---- */
  reportZone(zoneId: string): void {
    this.rt.setFlag(`zone_${zoneId}`); this.rt.bump(`zone:${zoneId}`);
    if (this.rt.content.pois.has(zoneId)) this.discover(zoneId);
    this.rt.story.onZone(zoneId); this.rt.refresh();
  }
  reportInteract(objectId: string): void { this.rt.setFlag(`int_${objectId}`); this.rt.bump(`int:${objectId}`); this.rt.refresh(); }
  reportKill(enemyId: string, bossId?: string): void {
    this.rt.bump(`kills:${enemyId}`); this.rt.bump('kills:total');
    if (bossId) { this.rt.bump(`kills:${bossId}`); this.rt.setFlag(`boss_${bossId}`); }
    this.rt.refresh();
  }
  collect(id: string): boolean {
    const def = this.rt.content.collectibles.get(id); const s = this.rt.state;
    if (!def || s.collected.has(id)) return false;
    s.collected.add(id); this.rt.setFlag(`col_${id}`);
    if (def.kind === 'testament') this.rt.setFlag(`frag_${id.replace(/^frag_?/, '')}`);
    this.rt.bus.emit('world:collectible-found', { id, name: def.name, kind: def.kind, text: def.text });
    this.rt.apply(def.effects); this.rt.refresh();
    return true;
  }
  /** Called from Runtime.refresh(): reveal hidden paths whose condition now holds. */
  refresh(): boolean {
    let changed = false;
    for (const lvl of this.rt.content.levels.values()) for (const p of lvl.hiddenPaths) {
      if (!this.rt.state.revealed.has(p.id) && this.rt.check(p.reveal)) {
        this.rt.state.revealed.add(p.id); this.rt.setFlag(`path_${p.id}`);
        this.rt.bus.emit('world:path-revealed', { id: p.id, level: p.level, rect: p.rect, hint: p.hint, leadsTo: p.leadsTo });
        this.rt.apply(p.effects); changed = true;
      }
    }
    return changed;
  }

  getExplorationStats(region: RegionId): ExplorationStats {
    const c = this.rt.content; const s = this.rt.state;
    const cols = [...c.collectibles.values()].filter(x => x.region === region);
    const pois = [...c.pois.values()].filter(x => x.region === region);
    const paths = [...c.levels.values()].filter(l => l.region === region).flatMap(l => l.hiddenPaths);
    const quests = [...c.quests.values()].filter(q => q.region === region);
    const r = {
      collectibles: { found: cols.filter(x => s.collected.has(x.id)).length, total: cols.length },
      pois: { found: pois.filter(x => s.discovered.has(x.id)).length, total: pois.length },
      hiddenPaths: { found: paths.filter(x => s.revealed.has(x.id)).length, total: paths.length },
      quests: { done: quests.filter(q => s.questStatus(q.id) === 'completed').length, total: quests.length },
    };
    const parts = [r.collectibles, r.pois, r.hiddenPaths, r.quests];
    const pct = parts.reduce((a, p: any) => a + (p.total ? ((p.found ?? p.done) / p.total) : 1), 0) / parts.length;
    return { region, ...r, percent: Math.round(pct * 100) };
  }
}
