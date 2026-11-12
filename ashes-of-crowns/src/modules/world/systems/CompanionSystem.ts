import type { Runtime } from '../core/Runtime';
import type { CompanionAbility, CompanionState } from '../types';

export const MAX_PARTY = 2;
export interface CombatContext { now: number; playerHpRatio: number; enemyCount: number; bossActive: boolean; comboCount?: number }
export interface AssistAction {
  companionId: string; abilityId: string; name: string; kind: CompanionAbility['kind'];
  power: number; targeting: CompanionAbility['targeting']; vfx: string;
}
export interface PartyMemberSpec {
  id: string; name: string; role: string; sprite: string; hp: number; attack: number; speed: number; loyalty: number; tier: string;
}

export class CompanionSystem {
  private cooldowns = new Map<string, number>();
  constructor(private rt: Runtime) {}

  tier(id: string): 'wary' | 'steady' | 'loyal' | 'devoted' {
    const l = this.rt.state.rel(id);
    return l < 20 ? 'wary' : l < 50 ? 'steady' : l < 80 ? 'loyal' : 'devoted';
  }
  recruit(id: string): void {
    const def = this.rt.content.companions.get(id); const s = this.rt.state;
    if (!def || s.compState(id) === 'recruited') return;
    const party = this.getParty().length;
    s.companions[id] = { status: 'recruited', inParty: party < MAX_PARTY };
    s.rels[id] = (s.rels[id] ?? 0) + def.startLoyalty;
    this.rt.setFlag(`recruited_${id}`);
    this.rt.bus.emit('world:companion-recruited', { id, name: def.name });
    this.rt.bus.emit('world:toast', { text: `${def.name} joins you.` });
  }
  setState(id: string, st: CompanionState): void {
    const s = this.rt.state; const def = this.rt.content.companions.get(id);
    if (!def) return;
    s.companions[id] = { status: st, inParty: false };
    this.rt.setFlag(`${st}_${id}`);
    this.rt.bus.emit(st === 'dead' ? 'world:companion-died' : 'world:companion-left', { id, name: def.name });
  }
  getParty(): string[] {
    return Object.keys(this.rt.state.companions).filter(id => this.rt.state.companions[id].inParty && this.rt.state.compState(id) === 'recruited');
  }
  setParty(ids: string[]): boolean {
    const valid = ids.filter(id => this.rt.state.compState(id) === 'recruited');
    if (valid.length !== ids.length || ids.length > MAX_PARTY) return false;
    for (const id of Object.keys(this.rt.state.companions)) this.rt.state.companions[id].inParty = ids.includes(id);
    this.rt.bus.emit('world:party-changed', { party: ids });
    return true;
  }
  /** Party members react to tagged player choices. */
  react(tags: string[]): { companion: string; line?: string; delta: number }[] {
    const out: { companion: string; line?: string; delta: number }[] = [];
    for (const id of this.getParty()) {
      const def = this.rt.content.companions.get(id)!; let delta = 0; let line: string | undefined;
      for (const t of tags) if (def.reactions[t]) { delta += def.reactions[t]; line = line ?? def.barks[t]; }
      if (delta) {
        this.rt.addRel(id, delta); out.push({ companion: id, line, delta });
        if (line) this.rt.bus.emit('world:companion-bark', { id, line });
      }
    }
    return out;
  }
  /** Companions whose loyalty collapses abandon the party. */
  refresh(): boolean {
    let changed = false;
    for (const id of Object.keys(this.rt.state.companions)) {
      const def = this.rt.content.companions.get(id);
      if (def && this.rt.state.compState(id) === 'recruited' && this.rt.state.rel(id) <= def.leaveBelow) { this.setState(id, 'left'); changed = true; }
    }
    return changed;
  }

  /** Data the combat module needs to spawn companion entities. */
  getPartySpecs(): PartyMemberSpec[] {
    return this.getParty().map(id => {
      const d = this.rt.content.companions.get(id)!; const l = this.rt.state.rel(id); const k = 1 + l / 250;
      return { id, name: d.name, role: d.role, sprite: d.sprite, hp: Math.round(d.baseStats.hp * k), attack: Math.round(d.baseStats.attack * k), speed: d.baseStats.speed, loyalty: l, tier: this.tier(id) };
    });
  }
  /** Combat integration: call periodically; returns the assists to perform now (cooldowns managed here). */
  requestAssist(ctx: CombatContext): AssistAction[] {
    const out: AssistAction[] = [];
    for (const id of this.getParty()) {
      const def = this.rt.content.companions.get(id)!; const l = this.rt.state.rel(id);
      for (const a of def.abilities) {
        if (a.minLoyalty !== undefined && l < a.minLoyalty) continue;
        const key = `${id}:${a.id}`;
        if ((this.cooldowns.get(key) ?? 0) > ctx.now) continue;
        const v = a.trigger.value ?? 0;
        const ok = a.trigger.type === 'interval' ? true
          : a.trigger.type === 'player_hp_below' ? ctx.playerHpRatio < v
          : a.trigger.type === 'enemies_at_least' ? ctx.enemyCount >= v
          : a.trigger.type === 'boss' ? ctx.bossActive
          : (ctx.comboCount ?? 0) >= v;
        if (!ok) continue;
        this.cooldowns.set(key, ctx.now + a.cooldownMs);
        const act: AssistAction = { companionId: id, abilityId: a.id, name: a.name, kind: a.kind, power: Math.round(a.power * (0.8 + l / 250) * 100) / 100, targeting: a.targeting, vfx: a.vfx };
        out.push(act); this.rt.bus.emit('world:companion-assist', act);
      }
    }
    return out;
  }
  resetCooldowns(): void { this.cooldowns.clear(); }

  getFates(): { id: string; name: string; text: string }[] {
    const out: { id: string; name: string; text: string }[] = [];
    for (const [id, def] of this.rt.content.companions) {
      if (this.rt.state.compState(id) === 'unmet') continue;
      const f = def.fates.find(x => this.rt.check(x.when));
      if (f) out.push({ id, name: def.name, text: f.text });
    }
    return out;
  }
}
