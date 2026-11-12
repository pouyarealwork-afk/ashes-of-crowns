import type {
  CollectibleDef, CompanionDef, Condition, DialogueTree, Effect, EndingDef, LevelDef, NpcDef, PoiDef,
  QuestDef, RegionContent, RegionDef, RegionId, StoryEventDef,
} from '../types';

export interface ContentBundle { regions: RegionContent[]; companions: CompanionDef[]; endings: EndingDef[] }

export class ContentDB {
  regions = new Map<RegionId, RegionDef>();
  levels = new Map<string, LevelDef>();
  npcs = new Map<string, NpcDef>();
  dialogues = new Map<string, DialogueTree>();
  quests = new Map<string, QuestDef>();
  collectibles = new Map<string, CollectibleDef>();
  pois = new Map<string, PoiDef>();
  storyEvents: StoryEventDef[] = [];
  companions = new Map<string, CompanionDef>();
  endings = new Map<string, EndingDef>();

  constructor(b: ContentBundle) {
    for (const r of b.regions) {
      this.regions.set(r.region.id, r.region);
      r.levels.forEach(x => this.levels.set(x.id, x));
      r.npcs.forEach(x => this.npcs.set(x.id, x));
      r.dialogues.forEach(x => this.dialogues.set(x.id, x));
      r.quests.forEach(x => this.quests.set(x.id, x));
      r.collectibles.forEach(x => this.collectibles.set(x.id, x));
      r.pois.forEach(x => this.pois.set(x.id, x));
      this.storyEvents.push(...r.storyEvents);
    }
    b.companions.forEach(c => this.companions.set(c.id, c));
    b.endings.forEach(e => this.endings.set(e.id, e));
  }

  /** Static integrity check of every cross-reference in the content. Returns a list of problems (empty = OK). */
  validate(): string[] {
    const err: string[] = [];
    const cond = (c: Condition | undefined, where: string): void => {
      if (!c) return;
      switch (c.t) {
        case 'quest': if (!this.quests.has(c.q)) err.push(`${where}: unknown quest ${c.q}`); break;
        case 'comp': case 'rel': if (c.t === 'comp' && !this.companions.has(c.id)) err.push(`${where}: unknown companion ${c.id}`); break;
        case 'and': case 'or': c.c.forEach(x => cond(x, where)); break;
        case 'not': cond(c.c, where); break;
      }
    };
    const eff = (list: Effect[] | undefined, where: string): void => {
      for (const e of list ?? []) {
        if ((e.t === 'quest.start' || e.t === 'quest.complete' || e.t === 'quest.fail' || e.t === 'quest.obj') && !this.quests.has(e.q)) err.push(`${where}: unknown quest ${e.q}`);
        if (e.t === 'quest.obj' && !this.quests.get(e.q)?.objectives.some(o => o.id === e.o)) err.push(`${where}: unknown objective ${e.q}/${e.o}`);
        if ((e.t === 'recruit' || e.t === 'leave' || e.t === 'die') && !this.companions.has(e.id)) err.push(`${where}: unknown companion ${e.id}`);
        if (e.t === 'discover' && !this.pois.has(e.id)) err.push(`${where}: unknown poi ${e.id}`);
        if (e.t === 'unlock' && !this.regions.has(e.id as RegionId) && !this.levels.has(e.id)) err.push(`${where}: unknown area ${e.id}`);
      }
    };
    for (const t of this.dialogues.values()) {
      if (!t.nodes[t.start]) err.push(`dialogue ${t.id}: missing start ${t.start}`);
      t.entries?.forEach(e => { if (!t.nodes[e.node]) err.push(`dialogue ${t.id}: bad entry ${e.node}`); cond(e.when, `dialogue ${t.id}`); });
      eff(t.onEnd, `dialogue ${t.id}.onEnd`);
      if (t.npc && !this.npcs.has(t.npc)) err.push(`dialogue ${t.id}: unknown npc ${t.npc}`);
      for (const [nid, n] of Object.entries(t.nodes)) {
        const w = `dialogue ${t.id}/${nid}`;
        if (n.next && !t.nodes[n.next]) err.push(`${w}: bad next ${n.next}`);
        if (n.choices && n.next) err.push(`${w}: has both choices and next`);
        eff(n.effects, w); n.variants?.forEach(v => cond(v.when, w));
        n.choices?.forEach((c, i) => { if (c.next && !t.nodes[c.next]) err.push(`${w}: choice ${i} bad next ${c.next}`); cond(c.when, w); eff(c.effects, w); });
      }
    }
    for (const n of this.npcs.values()) {
      n.dialogue.forEach(d => { if (!this.dialogues.has(d.tree)) err.push(`npc ${n.id}: unknown tree ${d.tree}`); cond(d.when, `npc ${n.id}`); });
      if (n.companion && !this.companions.has(n.companion)) err.push(`npc ${n.id}: unknown companion`);
    }
    for (const q of this.quests.values()) {
      const ids = new Set<string>();
      for (const o of q.objectives) {
        if (ids.has(o.id)) err.push(`quest ${q.id}: duplicate objective ${o.id}`);
        ids.add(o.id); cond(o.done, `quest ${q.id}/${o.id}`);
        o.after?.forEach(a => { if (!q.objectives.some(x => x.id === a)) err.push(`quest ${q.id}/${o.id}: bad after ${a}`); });
      }
      cond(q.requires, `quest ${q.id}`); cond(q.autoStart, `quest ${q.id}`); cond(q.failWhen, `quest ${q.id}`);
      eff(q.onStart, `quest ${q.id}`); eff(q.onComplete, `quest ${q.id}`); eff(q.onFail, `quest ${q.id}`);
      if (!this.regions.has(q.region)) err.push(`quest ${q.id}: unknown region`);
    }
    for (const l of this.levels.values()) {
      l.npcs.forEach(p => { if (!this.npcs.has(p.npc)) err.push(`level ${l.id}: unknown npc ${p.npc}`); cond(p.when, `level ${l.id}`); });
      l.collectibles.forEach(c => { if (!this.collectibles.has(c.id)) err.push(`level ${l.id}: unknown collectible ${c.id}`); });
      l.exits.forEach(e => { const t = this.levels.get(e.to.level); if (!t) err.push(`level ${l.id}: exit ${e.id} to unknown level`); else if (!t.spawns[e.to.spawn]) err.push(`level ${l.id}: exit ${e.id} bad spawn ${e.to.spawn}`); cond(e.requires, `level ${l.id}`); });
      l.hiddenPaths.forEach(h => { cond(h.reveal, `path ${h.id}`); eff(h.effects, `path ${h.id}`); });
      if (!l.spawns.start) err.push(`level ${l.id}: no 'start' spawn`);
    }
    for (const c of this.collectibles.values()) eff(c.effects, `collectible ${c.id}`);
    for (const p of this.pois.values()) if (!this.levels.has(p.level)) err.push(`poi ${p.id}: unknown level`);
    for (const r of this.regions.values()) {
      if (!this.levels.has(r.entryLevel)) err.push(`region ${r.id}: bad entry level`);
      r.connections.forEach(c => { if (!this.regions.has(c.to)) err.push(`region ${r.id}: bad connection ${c.to}`); cond(c.requires, `region ${r.id}`); });
    }
    for (const e of this.storyEvents) { if (!this.dialogues.has(e.dialogue)) err.push(`story event ${e.id}: unknown dialogue`); cond(e.when, e.id); cond(e.auto, e.id); }
    for (const c of this.companions.values()) {
      if (!this.quests.has(c.personalQuest)) err.push(`companion ${c.id}: unknown personal quest`);
      c.fates.forEach(f => cond(f.when, `companion ${c.id}`));
    }
    for (const e of this.endings.values()) { cond(e.gate, `ending ${e.id}`); e.slides.forEach(s => cond(s.when, `ending ${e.id}`)); }
    return err;
  }
}
