import type { CheckpointState, GameState, InventoryItem, Primitive, QuestRecord } from '../types';

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_ITEMS = 5000;
const MAX_KEYS = 5000;
const MAX_STR = 200;

export function createDefaultGameState(difficulty = 'normal', region = 'ashen_village'): GameState {
  return {
    player: { stats: {}, level: 1, xp: 0 },
    inventory: { gold: 0, items: [] },
    equipment: {},
    skills: { unlocked: [], equipped: [], points: 0, levels: {} },
    quests: [],
    decisions: {},
    narrative: { honor: 0, trust: 0, ambition: 0, mercy: 0 },
    relationships: {},
    difficulty,
    currentRegion: region,
    checkpoints: { lastStoneId: null, stones: {} },
    unlockedSkins: [],
    progress: {
      playtimeMs: 0,
      regionsUnlocked: [region],
      regionsCompleted: [],
      bossesDefeated: [],
      flags: {},
      endingsSeen: [],
    },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

class Ctx {
  repairs: string[] = [];
  missing = 0;
  fix(path: string, why: string): void {
    if (this.repairs.length < 200) this.repairs.push(`${path}: ${why}`);
  }
}

function num(c: Ctx, path: string, v: unknown, def: number, min = -1e12, max = 1e12, int = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    c.fix(path, v === undefined ? 'missing, default used' : 'invalid number, default used');
    return def;
  }
  let r = int ? Math.trunc(v) : v;
  r = Math.min(max, Math.max(min, r));
  if (r !== v) c.fix(path, 'out of range, clamped');
  return r;
}
function str(c: Ctx, path: string, v: unknown, def: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    c.fix(path, v === undefined ? 'missing, default used' : 'invalid string, default used');
    return def;
  }
  return v.length > MAX_STR ? (c.fix(path, 'too long, truncated'), v.slice(0, MAX_STR)) : v;
}
function strArr(c: Ctx, path: string, v: unknown): string[] {
  if (!Array.isArray(v)) {
    c.fix(path, v === undefined ? 'missing, empty used' : 'not an array, empty used');
    return [];
  }
  const out: string[] = [];
  for (const x of v.slice(0, MAX_ITEMS)) {
    if (typeof x === 'string' && x.length > 0 && x.length <= MAX_STR) out.push(x);
    else c.fix(path, 'dropped invalid entry');
  }
  return [...new Set(out)];
}
function numRecord(c: Ctx, path: string, v: unknown): Record<string, number> {
  const out: Record<string, number> = Object.create(null);
  if (!isObj(v)) {
    c.fix(path, v === undefined ? 'missing, empty used' : 'not an object, empty used');
    return {};
  }
  for (const k of Object.keys(v).slice(0, MAX_KEYS)) {
    if (BAD_KEYS.has(k)) {
      c.fix(`${path}.${k}`, 'forbidden key dropped');
      continue;
    }
    const x = v[k];
    if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
    else c.fix(`${path}.${k}`, 'non-numeric value dropped');
  }
  return { ...out };
}
function primRecord(c: Ctx, path: string, v: unknown): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  if (!isObj(v)) {
    c.fix(path, v === undefined ? 'missing, empty used' : 'not an object, empty used');
    return out;
  }
  for (const k of Object.keys(v).slice(0, MAX_KEYS)) {
    if (BAD_KEYS.has(k)) {
      c.fix(`${path}.${k}`, 'forbidden key dropped');
      continue;
    }
    const x = v[k];
    if (typeof x === 'string' || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x))) out[k] = x;
    else c.fix(`${path}.${k}`, 'invalid value dropped');
  }
  return out;
}
/** Deep copy restricted to JSON-safe values, bounded depth. */
function jsonSafe(v: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => jsonSafe(x, depth + 1));
  if (isObj(v)) {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).slice(0, 200)) if (!BAD_KEYS.has(k)) o[k] = jsonSafe(v[k], depth + 1);
    return o;
  }
  return undefined;
}

export interface SanitizeResult {
  state: GameState;
  repairs: string[];
  /** Number of the 13 top-level sections that were absent or the wrong type. */
  missingSections: number;
}
export const MAX_MISSING_SECTIONS = 6;

/**
 * Validates AND repairs an untrusted game state. Never throws.
 * Returns null only if the input is not an object at all. Callers decide whether `missingSections`
 * is too high to trust (SaveManager rejects when it exceeds MAX_MISSING_SECTIONS).
 */
export function sanitizeGameState(raw: unknown): SanitizeResult | null {
  if (!isObj(raw)) return null;
  const c = new Ctx();
  const sec = (k: string, ok: boolean): boolean => {
    if (!ok) c.missing++;
    return ok;
  };

  const rp = sec('player', isObj(raw.player)) ? (raw.player as Record<string, unknown>) : {};
  const pos = isObj(rp.position)
    ? { x: num(c, 'player.position.x', rp.position.x, 0), y: num(c, 'player.position.y', rp.position.y, 0) }
    : undefined;
  const player: GameState['player'] = {
    stats: numRecord(c, 'player.stats', rp.stats),
    level: num(c, 'player.level', rp.level, 1, 1, 9999, true),
    xp: num(c, 'player.xp', rp.xp, 0, 0, 1e12),
    ...(pos ? { position: pos } : {}),
  };

  const ri = sec('inventory', isObj(raw.inventory)) ? (raw.inventory as Record<string, unknown>) : {};
  const items: InventoryItem[] = [];
  if (Array.isArray(ri.items)) {
    for (const [i, it] of ri.items.slice(0, MAX_ITEMS).entries()) {
      if (!isObj(it) || typeof it.id !== 'string' || !it.id || it.id.length > MAX_STR) {
        c.fix(`inventory.items[${i}]`, 'invalid item dropped');
        continue;
      }
      const item: InventoryItem = { id: it.id, qty: num(c, `inventory.items[${i}].qty`, it.qty, 1, 1, 1e6, true) };
      if (it.durability !== undefined) item.durability = num(c, `inventory.items[${i}].durability`, it.durability, 0, 0, 1e6);
      if (isObj(it.meta)) item.meta = jsonSafe(it.meta) as Record<string, unknown>;
      items.push(item);
    }
  } else c.fix('inventory.items', 'missing or invalid, empty used');
  const inventory: GameState['inventory'] = { gold: num(c, 'inventory.gold', ri.gold, 0, 0, 1e12, true), items };
  if (ri.capacity !== undefined) inventory.capacity = num(c, 'inventory.capacity', ri.capacity, 0, 0, 1e6, true);

  const equipment: Record<string, string | null> = {};
  if (sec('equipment', isObj(raw.equipment))) {
    for (const k of Object.keys(raw.equipment as object).slice(0, 100)) {
      const v = (raw.equipment as Record<string, unknown>)[k];
      if (BAD_KEYS.has(k)) continue;
      if (v === null || (typeof v === 'string' && v.length <= MAX_STR)) equipment[k] = v as string | null;
      else c.fix(`equipment.${k}`, 'invalid value dropped');
    }
  }

  const rs = sec('skills', isObj(raw.skills)) ? (raw.skills as Record<string, unknown>) : {};
  const skills: GameState['skills'] = {
    unlocked: strArr(c, 'skills.unlocked', rs.unlocked),
    equipped: strArr(c, 'skills.equipped', rs.equipped),
    points: num(c, 'skills.points', rs.points, 0, 0, 1e6, true),
    levels: numRecord(c, 'skills.levels', rs.levels ?? {}),
  };

  const quests: QuestRecord[] = [];
  if (sec('quests', Array.isArray(raw.quests))) {
    const seen = new Set<string>();
    for (const [i, q] of (raw.quests as unknown[]).slice(0, MAX_ITEMS).entries()) {
      if (!isObj(q) || typeof q.id !== 'string' || !q.id || seen.has(q.id)) {
        c.fix(`quests[${i}]`, 'invalid or duplicate quest dropped');
        continue;
      }
      seen.add(q.id);
      const status = ['inactive', 'active', 'completed', 'failed'].includes(q.status as string)
        ? (q.status as QuestRecord['status'])
        : (c.fix(`quests[${i}].status`, 'invalid, set to inactive'), 'inactive');
      quests.push({
        id: q.id,
        status,
        stage: num(c, `quests[${i}].stage`, q.stage ?? 0, 0, 0, 1e6, true),
        objectives: numRecord(c, `quests[${i}].objectives`, q.objectives ?? {}),
      });
    }
  }

  const decisions = sec('decisions', isObj(raw.decisions)) ? primRecord(c, 'decisions', raw.decisions) : {};
  const rn = sec('narrative', isObj(raw.narrative)) ? (raw.narrative as Record<string, unknown>) : {};
  const narrative = {
    honor: num(c, 'narrative.honor', rn.honor, 0),
    trust: num(c, 'narrative.trust', rn.trust, 0),
    ambition: num(c, 'narrative.ambition', rn.ambition, 0),
    mercy: num(c, 'narrative.mercy', rn.mercy, 0),
  };
  const relationships = sec('relationships', isObj(raw.relationships)) ? numRecord(c, 'relationships', raw.relationships) : {};
  const difficulty = sec('difficulty', typeof raw.difficulty === 'string') ? str(c, 'difficulty', raw.difficulty, 'normal') : 'normal';
  const currentRegion = sec('currentRegion', typeof raw.currentRegion === 'string')
    ? str(c, 'currentRegion', raw.currentRegion, 'ashen_village')
    : 'ashen_village';

  const rc = sec('checkpoints', isObj(raw.checkpoints)) ? (raw.checkpoints as Record<string, unknown>) : {};
  const stones: CheckpointState['stones'] = {};
  if (isObj(rc.stones)) {
    for (const k of Object.keys(rc.stones).slice(0, 500)) {
      const s = rc.stones[k];
      if (BAD_KEYS.has(k) || !isObj(s)) {
        c.fix(`checkpoints.stones.${k}`, 'invalid stone dropped');
        continue;
      }
      stones[k] = {
        id: k,
        regionId: str(c, `checkpoints.stones.${k}.regionId`, s.regionId, currentRegion),
        x: num(c, `checkpoints.stones.${k}.x`, s.x, 0),
        y: num(c, `checkpoints.stones.${k}.y`, s.y, 0),
        discoveredAt: num(c, `checkpoints.stones.${k}.discoveredAt`, s.discoveredAt, 0, 0, 8.64e15),
      };
    }
  }
  let lastStoneId: string | null = typeof rc.lastStoneId === 'string' ? rc.lastStoneId : null;
  if (lastStoneId !== null && !stones[lastStoneId]) {
    c.fix('checkpoints.lastStoneId', 'refers to unknown stone, cleared');
    lastStoneId = null;
  }
  const checkpoints: CheckpointState = { lastStoneId, stones };

  const unlockedSkins = sec('unlockedSkins', Array.isArray(raw.unlockedSkins)) ? strArr(c, 'unlockedSkins', raw.unlockedSkins) : [];
  const rg = sec('progress', isObj(raw.progress)) ? (raw.progress as Record<string, unknown>) : {};
  const progress: GameState['progress'] = {
    playtimeMs: num(c, 'progress.playtimeMs', rg.playtimeMs, 0, 0),
    regionsUnlocked: strArr(c, 'progress.regionsUnlocked', rg.regionsUnlocked ?? []),
    regionsCompleted: strArr(c, 'progress.regionsCompleted', rg.regionsCompleted ?? []),
    bossesDefeated: strArr(c, 'progress.bossesDefeated', rg.bossesDefeated ?? []),
    flags: primRecord(c, 'progress.flags', rg.flags ?? {}),
    endingsSeen: strArr(c, 'progress.endingsSeen', rg.endingsSeen ?? []),
  };

  return {
    state: {
      player,
      inventory,
      equipment,
      skills,
      quests,
      decisions,
      narrative,
      relationships,
      difficulty,
      currentRegion,
      checkpoints,
      unlockedSkins,
      progress,
    },
    repairs: c.repairs,
    missingSections: c.missing,
  };
}
