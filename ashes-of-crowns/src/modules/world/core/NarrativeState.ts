import { CompanionState, EndingId, NARRATIVE_VARS, NarrativeVar, QuestProgress, QuestStatus, SaveData, VAR_MAX, VAR_MIN } from '../types';

/** All mutable narrative data. JSON-serialisable via toJSON()/fromJSON() for the persistence module. */
export class NarrativeState {
  vars: Record<NarrativeVar, number> = { honor: 0, trust: 0, ambition: 0, mercy: 0 };
  flags = new Set<string>();
  counters: Record<string, number> = {};
  rels: Record<string, number> = {};
  keys: Record<string, number> = {};
  collected = new Set<string>();
  discovered = new Set<string>();
  unlocked = new Set<string>();
  revealed = new Set<string>();
  fired = new Set<string>();
  companions: Record<string, { status: CompanionState; inParty: boolean }> = {};
  quests: Record<string, QuestProgress> = {};
  chapter = 1;
  ending: EndingId | null = null;

  questStatus(id: string): QuestStatus { return this.quests[id]?.status ?? 'inactive'; }
  rel(id: string): number { return this.rels[id] ?? 0; }
  keyCount(id: string): number { return this.keys[id] ?? 0; }
  compState(id: string) { return this.companions[id]?.status ?? 'unmet'; }
  clampVar(n: number): number { return Math.max(VAR_MIN, Math.min(VAR_MAX, n)); }
  countFlags(prefix: string): number { let n = 0; this.flags.forEach(f => { if (f.startsWith(prefix)) n++; }); return n; }

  toJSON(): SaveData {
    return {
      version: 1, vars: { ...this.vars }, flags: [...this.flags], counters: { ...this.counters }, rels: { ...this.rels },
      keys: { ...this.keys }, collected: [...this.collected], discovered: [...this.discovered], unlocked: [...this.unlocked],
      revealed: [...this.revealed], fired: [...this.fired],
      companions: JSON.parse(JSON.stringify(this.companions)), quests: JSON.parse(JSON.stringify(this.quests)),
      chapter: this.chapter, ending: this.ending,
    };
  }
  static fromJSON(d: SaveData): NarrativeState {
    if (!d || d.version !== 1) throw new Error('[world] unsupported save version');
    const s = new NarrativeState();
    for (const v of NARRATIVE_VARS) s.vars[v] = s.clampVar(Number(d.vars?.[v] ?? 0));
    s.flags = new Set(d.flags ?? []); s.counters = { ...(d.counters ?? {}) }; s.rels = { ...(d.rels ?? {}) };
    s.keys = { ...(d.keys ?? {}) }; s.collected = new Set(d.collected ?? []); s.discovered = new Set(d.discovered ?? []);
    s.unlocked = new Set(d.unlocked ?? []); s.revealed = new Set(d.revealed ?? []); s.fired = new Set(d.fired ?? []);
    s.companions = JSON.parse(JSON.stringify(d.companions ?? {})); s.quests = JSON.parse(JSON.stringify(d.quests ?? {}));
    s.chapter = d.chapter ?? 1; s.ending = d.ending ?? null;
    return s;
  }
}
