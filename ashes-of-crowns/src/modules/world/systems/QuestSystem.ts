import type { Runtime } from '../core/Runtime';
import type { QuestDef, QuestStatus, QuestType } from '../types';

export interface QuestView {
  id: string; title: string; type: QuestType; region: string; chapter: number; summary: string; status: QuestStatus;
  objectives: { id: string; text: string; done: boolean; optional: boolean; progress?: { current: number; target: number } }[];
}

export class QuestSystem {
  constructor(private rt: Runtime) {}

  private def(id: string): QuestDef {
    const d = this.rt.content.quests.get(id);
    if (!d) throw new Error(`[world] unknown quest ${id}`);
    return d;
  }

  start(id: string): boolean {
    const d = this.def(id); const s = this.rt.state;
    if (s.questStatus(id) !== 'inactive' || !this.rt.check(d.requires)) return false;
    const done: Record<string, boolean> = {};
    d.objectives.forEach(o => (done[o.id] = false));
    s.quests[id] = { status: 'active', done };
    this.rt.bus.emit('world:quest-started', { id, title: d.title, type: d.type });
    this.rt.apply(d.onStart);
    return true;
  }

  forceObjective(q: string, o: string): void {
    const p = this.rt.state.quests[q];
    if (p?.status === 'active' && p.done[o] === false) { p.done[o] = true; this.emitUpdate(q, o); }
  }

  complete(id: string): boolean {
    const d = this.def(id); const s = this.rt.state;
    if (s.questStatus(id) !== 'active') return false;
    s.quests[id].status = 'completed';
    for (const o of d.objectives) if (!o.optional) s.quests[id].done[o.id] = true;
    this.rt.bus.emit('world:quest-completed', { id, title: d.title, type: d.type });
    if (d.reward) this.rt.giveReward(d.reward, `quest:${id}`);
    this.rt.apply(d.onComplete);
    return true;
  }

  fail(id: string): boolean {
    const d = this.def(id); const s = this.rt.state;
    if (s.questStatus(id) !== 'active') return false;
    s.quests[id].status = 'failed';
    this.rt.bus.emit('world:quest-failed', { id, title: d.title });
    this.rt.apply(d.onFail);
    return true;
  }

  private emitUpdate(id: string, objective: string): void {
    this.rt.bus.emit('world:quest-updated', { id, objective, view: this.view(id) });
  }

  /** Called by Runtime.refresh(). Returns true if anything changed. */
  refresh(): boolean {
    let changed = false; const s = this.rt.state;
    for (const d of this.rt.content.quests.values()) {
      const st = s.questStatus(d.id);
      if (st === 'inactive') {
        if (d.autoStart && this.rt.check(d.requires) && this.rt.check(d.autoStart) && this.start(d.id)) changed = true;
        continue;
      }
      if (st !== 'active') continue;
      const p = s.quests[d.id];
      for (const o of d.objectives) {
        if (p.done[o.id]) continue;
        if (o.after && !o.after.every(a => p.done[a])) continue;
        if (this.rt.check(o.done)) { p.done[o.id] = true; this.emitUpdate(d.id, o.id); changed = true; }
      }
      if (d.failWhen && this.rt.check(d.failWhen)) { if (this.fail(d.id)) changed = true; continue; }
      if (!d.manualComplete && d.objectives.filter(o => !o.optional).every(o => p.done[o.id])) {
        if (this.complete(d.id)) changed = true;
      }
    }
    return changed;
  }

  view(id: string): QuestView {
    const d = this.def(id); const p = this.rt.state.quests[id];
    const objectives = d.objectives
      .filter(o => !o.hidden || p?.done[o.id])
      .filter(o => !p || !o.after || o.after.every(a => p.done[a]) || p.done[o.id])
      .map(o => {
        let progress: { current: number; target: number } | undefined;
        if (o.progress) {
          const cur = o.progress.ctr ? this.rt.state.counters[o.progress.ctr] ?? 0 : this.rt.state.countFlags(o.progress.prefix ?? '');
          progress = { current: Math.min(cur, o.progress.n), target: o.progress.n };
        }
        return { id: o.id, text: o.text, done: !!p?.done[o.id], optional: !!o.optional, progress };
      });
    return { id, title: d.title, type: d.type, region: d.region, chapter: d.chapter, summary: d.summary, status: this.rt.state.questStatus(id), objectives };
  }

  /** Quest log: active/completed/failed quests. Hidden quests only appear once started. */
  getLog(filter?: QuestStatus): QuestView[] {
    const out: QuestView[] = [];
    for (const d of this.rt.content.quests.values()) {
      const st = this.rt.state.questStatus(d.id);
      if (st === 'inactive') continue;
      if (filter && st !== filter) continue;
      out.push(this.view(d.id));
    }
    return out;
  }
  /** Inactive quests whose prerequisites are met (for quest-giver markers). */
  getAvailable(): string[] {
    return [...this.rt.content.quests.values()].filter(d => this.rt.state.questStatus(d.id) === 'inactive' && this.rt.check(d.requires) && !d.hiddenUntilStarted).map(d => d.id);
  }
}
