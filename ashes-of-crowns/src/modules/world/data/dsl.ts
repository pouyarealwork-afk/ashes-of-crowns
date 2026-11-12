import type {
  Cmp, CollectibleDef, Condition, DialogueChoice, DialogueNode, DialogueTree, Effect, EndingId, NarrativeVar,
  QuestObjective, QuestStatus, RewardSpec, Atmosphere, Platform,
} from '../types';

/* conditions */
export const V = (v: NarrativeVar, op: Cmp, n: number): Condition => ({ t: 'var', v, op, n });
export const F = (f: string, is = true): Condition => ({ t: 'flag', f, is });
export const Q = (q: string, is: QuestStatus = 'completed'): Condition => ({ t: 'quest', q, is });
export const R = (id: string, op: Cmp, n: number): Condition => ({ t: 'rel', id, op, n });
export const K = (id: string, min = 1): Condition => ({ t: 'key', id, min });
export const CTR = (k: string, n = 1, op: Cmp = '>='): Condition => ({ t: 'ctr', k, op, n });
export const CNT = (prefix: string, n: number, op: Cmp = '>='): Condition => ({ t: 'count', prefix, op, n });
export const COMP = (id: string, is: 'unmet' | 'recruited' | 'left' | 'dead' | 'party'): Condition => ({ t: 'comp', id, is });
export const CH = (n: number, op: Cmp = '>='): Condition => ({ t: 'chapter', op, n });
export const LOY = (min: number, above: number): Condition => ({ t: 'loyal', min, above });
export const END = (id: EndingId): Condition => ({ t: 'ending', id });
export const AND = (...c: Condition[]): Condition => ({ t: 'and', c });
export const OR = (...c: Condition[]): Condition => ({ t: 'or', c });
export const NOT = (c: Condition): Condition => ({ t: 'not', c });
export const TALKED = (npc: string, n = 1): Condition => CTR(`talk:${npc}`, n);
export const ZONE = (z: string): Condition => F(`zone_${z}`);
export const INT = (o: string): Condition => F(`int_${o}`);
export const COL = (c: string): Condition => F(`col_${c}`);
export const KILL = (e: string, n = 1): Condition => CTR(`kills:${e}`, n);

/* effects */
export const vr = (v: NarrativeVar, d: number): Effect => ({ t: 'var', v, d });
export const fl = (f: string, val = true): Effect => ({ t: 'flag', f, val });
export const rl = (id: string, d: number): Effect => ({ t: 'rel', id, d });
export const qs = (q: string): Effect => ({ t: 'quest.start', q });
export const qo = (q: string, o: string): Effect => ({ t: 'quest.obj', q, o });
export const qc = (q: string): Effect => ({ t: 'quest.complete', q });
export const qf = (q: string): Effect => ({ t: 'quest.fail', q });
export const key = (id: string, n = 1): Effect => ({ t: 'key', id, n });
export const reward = (r: RewardSpec): Effect => ({ t: 'reward', r });
export const rec = (id: string): Effect => ({ t: 'recruit', id });
export const unlock = (id: string): Effect => ({ t: 'unlock', id });
export const disc = (id: string): Effect => ({ t: 'discover', id });
export const chap = (n: number): Effect => ({ t: 'chapter', n });
export const emit = (event: string, data?: unknown): Effect => ({ t: 'emit', event, data });

/* quests */
export const OBJ = (id: string, text: string, done: Condition, o: Partial<QuestObjective> = {}): QuestObjective => ({ id, text, done, ...o });

/* dialogue */
export const N = (speaker: string, text: string, o: Partial<DialogueNode> = {}): DialogueNode => ({ speaker, text, ...o });
export const C = (text: string, next?: string, o: Partial<DialogueChoice> = {}): DialogueChoice => ({ text, next, ...o });
export const T = (id: string, npc: string | undefined, start: string, nodes: Record<string, DialogueNode>, o: Partial<DialogueTree> = {}): DialogueTree => ({ id, npc, start, nodes, ...o });
/** Cutscene = dialogue tree without choices, no npc. */
export const CUT = (id: string, start: string, nodes: Record<string, DialogueNode>, o: Partial<DialogueTree> = {}): DialogueTree => ({ id, kind: 'cutscene', start, nodes, ...o });

/* collectibles & levels */
export const COLL = (id: string, region: CollectibleDef['region'], kind: CollectibleDef['kind'], name: string, text: string, effects?: Effect[]): CollectibleDef => ({ id, region, kind, name, text, effects });
export const P = (x: number, y: number, w: number, h = 40, kind: Platform[4] = 'ground'): Platform => [x, y, w, h, kind];
export const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
export const ATM = (a: Atmosphere): Atmosphere => a;
