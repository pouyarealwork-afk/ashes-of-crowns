import type { ActiveBuff, EquipSlot, ItemInstance, PartialPassives, Passives, StatKey, StatMod, Stats } from '../types';
import { PASSIVE_KEYS, STAT_KEYS } from '../types';
import type { RpgContext } from '../core/context';
import { BASE_STATS, PASSIVE_CAPS, PER_LEVEL, STAT_LIMITS } from '../data/config';
import { getItemDef } from '../data/items';
import { SKILLS } from '../data/skills';
import { scaledMods } from './itemMath';

export type StatSource = 'base' | 'level' | 'equipment' | 'skills' | 'buffs';
export interface StatBreakdownEntry { source: StatSource; flat: number; pct: number }
export interface Computed { stats: Stats; passives: Passives; flags: string[]; breakdown: Record<StatKey, StatBreakdownEntry[]> }

const zeroPassives = (): Passives => Object.fromEntries(PASSIVE_KEYS.map((k) => [k, 0])) as Passives;
const round = (v: number, d = 0) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };

/** Computes final stats: (base + level growth + flat bonuses) * (1 + sum of percentage bonuses), then clamps. */
export class StatSystem {
  private ctx: RpgContext;
  private cache: Computed | null = null;
  constructor(ctx: RpgContext) { this.ctx = ctx; }

  invalidate(): void { this.cache = null; }
  getStats(): Stats { return { ...this.get().stats }; }
  getPassives(): Passives { return { ...this.get().passives }; }
  getFlags(): string[] { return [...this.get().flags]; }
  getBreakdown(stat: StatKey): StatBreakdownEntry[] { return this.get().breakdown[stat].map((e) => ({ ...e })); }
  hasFlag(flag: string): boolean { return this.get().flags.includes(flag); }
  private get(): Computed { if (!this.cache) this.cache = this.compute(); return this.cache; }

  /** Compute with an optional hypothetical equipment layout (used for item comparison). Does not touch the cache. */
  compute(equipmentOverride?: Record<EquipSlot, ItemInstance | null>): Computed {
    const { state, buffs } = this.ctx;
    const equipment = equipmentOverride ?? state.equipment;
    const passives = zeroPassives();
    const flags: string[] = [];
    const sources: { source: StatSource; mod: StatMod }[] = [];
    const addPassives = (p: PartialPassives | undefined, mult = 1) => { if (!p) return; for (const k of PASSIVE_KEYS) { const v = p[k]; if (v) passives[k] += v * mult; } };

    for (const inst of Object.values(equipment)) {
      if (!inst) continue;
      const def = getItemDef(inst.defId);
      for (const m of scaledMods(def, inst.upgrade)) sources.push({ source: 'equipment', mod: m });
      addPassives(def.passives);
    }
    for (const [id, rank] of Object.entries(state.skills)) {
      const node = SKILLS[id];
      if (!node || rank <= 0) continue;
      for (const m of node.statMods ?? []) {
        const mod: StatMod = { stat: m.stat };
        if (m.flat !== undefined) mod.flat = m.flat * rank;
        if (m.pct !== undefined) mod.pct = m.pct * rank;
        sources.push({ source: 'skills', mod });
      }
      addPassives(node.passives, rank);
    }
    for (const b of buffs as ActiveBuff[]) {
      for (const m of b.stats) sources.push({ source: 'buffs', mod: m });
      addPassives(b.passives);
      for (const f of b.flags) if (!flags.includes(f)) flags.push(f);
    }

    const stats = {} as Stats;
    const breakdown = {} as Record<StatKey, StatBreakdownEntry[]>;
    for (const k of STAT_KEYS) {
      const base = BASE_STATS[k]; const growth = PER_LEVEL[k] * (state.level - 1);
      let flat = base + growth; let pct = 0;
      const entries: StatBreakdownEntry[] = [{ source: 'base', flat: base, pct: 0 }, { source: 'level', flat: growth, pct: 0 }];
      for (const src of ['equipment', 'skills', 'buffs'] as const) {
        let f = 0; let p = 0;
        for (const s of sources) if (s.source === src && s.mod.stat === k) { f += s.mod.flat ?? 0; p += s.mod.pct ?? 0; }
        if (f || p) entries.push({ source: src, flat: f, pct: p });
        flat += f; pct += p;
      }
      let v = flat * (1 + pct);
      if (k === 'critChance') v = Math.min(STAT_LIMITS.critChance[1], Math.max(STAT_LIMITS.critChance[0], v));
      else if (k === 'critDamage') v = Math.min(STAT_LIMITS.critDamage[1], Math.max(STAT_LIMITS.critDamage[0], v));
      else if (k === 'speed') v = Math.min(STAT_LIMITS.speed[1], Math.max(STAT_LIMITS.speed[0], v));
      stats[k] = k === 'critChance' || k === 'critDamage' ? round(v, 4) : round(Math.max(1, v), 0);
      breakdown[k] = entries;
    }
    for (const k of Object.keys(PASSIVE_CAPS) as (keyof typeof PASSIVE_CAPS)[]) passives[k] = Math.min(PASSIVE_CAPS[k], passives[k]);
    for (const k of PASSIVE_KEYS) passives[k] = round(passives[k], 4);
    return { stats, passives, flags, breakdown };
  }
}
