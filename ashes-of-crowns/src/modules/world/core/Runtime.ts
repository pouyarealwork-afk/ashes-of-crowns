import { Cmp, Condition, Effect, NarrativeVar, RewardSpec } from '../types';
import { EventBus } from './EventBus';
import { NarrativeState } from './NarrativeState';
import type { ContentDB } from './ContentDB';
import type { QuestSystem } from '../systems/QuestSystem';
import type { CompanionSystem } from '../systems/CompanionSystem';
import type { WorldMap } from '../systems/WorldMap';
import type { DialogueSystem } from '../systems/DialogueSystem';
import type { EndingSystem } from '../systems/EndingSystem';
import type { StoryDirector } from '../systems/StoryDirector';

export function cmp(a: number, op: Cmp, b: number): boolean {
  switch (op) {
    case '>=': return a >= b; case '<=': return a <= b; case '>': return a > b;
    case '<': return a < b; case '==': return a === b; default: return a !== b;
  }
}

/** Shared context: state + content + bus + condition evaluator + effect interpreter. */
export class Runtime {
  quests!: QuestSystem; companions!: CompanionSystem; map!: WorldMap;
  dialogue!: DialogueSystem; endings!: EndingSystem; story!: StoryDirector;
  private refreshing = false; private dirty = false;
  constructor(public state: NarrativeState, public content: ContentDB, public bus: EventBus) {}

  check(c?: Condition): boolean {
    if (!c) return true;
    const s = this.state;
    switch (c.t) {
      case 'var': return cmp(s.vars[c.v], c.op, c.n);
      case 'flag': return s.flags.has(c.f) === (c.is ?? true);
      case 'quest': return s.questStatus(c.q) === c.is;
      case 'rel': return cmp(s.rel(c.id), c.op, c.n);
      case 'key': return s.keyCount(c.id) >= (c.min ?? 1);
      case 'comp': return c.is === 'party' ? !!s.companions[c.id]?.inParty && s.compState(c.id) === 'recruited' : s.compState(c.id) === c.is;
      case 'chapter': return cmp(s.chapter, c.op, c.n);
      case 'ctr': return cmp(s.counters[c.k] ?? 0, c.op, c.n);
      case 'count': return cmp(s.countFlags(c.prefix), c.op, c.n);
      case 'loyal': return Object.keys(s.companions).filter(id => s.compState(id) === 'recruited' && s.rel(id) >= c.above).length >= c.min;
      case 'ending': return s.ending === c.id;
      case 'and': return c.c.every(x => this.check(x));
      case 'or': return c.c.some(x => this.check(x));
      case 'not': return !this.check(c.c);
    }
  }

  addVar(v: NarrativeVar, d: number): void {
    const before = this.state.vars[v];
    this.state.vars[v] = this.state.clampVar(before + d);
    if (this.state.vars[v] !== before) this.bus.emit('world:variable-changed', { variable: v, value: this.state.vars[v], delta: d, hidden: true });
  }
  addRel(id: string, d: number): void {
    const cur = this.state.rel(id); const next = Math.max(-100, Math.min(100, cur + d));
    this.state.rels[id] = next;
    if (next !== cur) this.bus.emit('world:relationship-changed', { id, value: next, delta: next - cur });
  }
  setFlag(f: string, val = true): void { if (val) this.state.flags.add(f); else this.state.flags.delete(f); }
  bump(k: string, n = 1): void { this.state.counters[k] = (this.state.counters[k] ?? 0) + n; }

  apply(effects?: Effect[]): void {
    if (!effects?.length) return;
    for (const e of effects) this.applyOne(e);
    this.refresh();
  }
  private applyOne(e: Effect): void {
    const s = this.state;
    switch (e.t) {
      case 'var': this.addVar(e.v, e.d); break;
      case 'flag': this.setFlag(e.f, e.val ?? true); break;
      case 'rel': this.addRel(e.id, e.d); break;
      case 'quest.start': this.quests.start(e.q); break;
      case 'quest.obj': this.quests.forceObjective(e.q, e.o); break;
      case 'quest.complete': this.quests.complete(e.q); break;
      case 'quest.fail': this.quests.fail(e.q); break;
      case 'key': s.keys[e.id] = (s.keys[e.id] ?? 0) + (e.n ?? 1); this.bus.emit('world:key-item', { id: e.id, count: s.keys[e.id] }); break;
      case 'reward': this.giveReward(e.r, 'effect'); break;
      case 'recruit': this.companions.recruit(e.id); break;
      case 'leave': this.companions.setState(e.id, 'left'); break;
      case 'die': this.companions.setState(e.id, 'dead'); break;
      case 'unlock': this.map.unlock(e.id); break;
      case 'discover': this.map.discover(e.id); break;
      case 'chapter': if (e.n > s.chapter) { s.chapter = e.n; this.bus.emit('world:chapter-changed', { chapter: e.n }); } break;
      case 'emit': this.bus.emit(e.event, e.data); break;
      case 'resolve_ending': this.endings.resolve(); break;
    }
  }
  giveReward(r: RewardSpec, source: string): void {
    for (const k of r.keys ?? []) this.applyOne({ t: 'key', id: k.id, n: k.n });
    this.bus.emit('world:reward', { xp: r.xp ?? 0, gold: r.gold ?? 0, items: r.items ?? [], source });
  }
  /** Re-evaluate everything that depends on state until stable (quests, hidden paths, story events, companions). */
  refresh(): void {
    if (this.refreshing) { this.dirty = true; return; }
    this.refreshing = true;
    try {
      for (let i = 0; i < 50; i++) {
        this.dirty = false;
        const a = this.quests.refresh(); const b = this.map.refresh();
        const c = this.companions.refresh(); const d = this.story.refresh();
        if (!(a || b || c || d || this.dirty)) break;
      }
    } finally { this.refreshing = false; }
  }
}
