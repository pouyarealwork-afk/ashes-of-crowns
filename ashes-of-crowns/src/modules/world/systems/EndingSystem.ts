import type { Runtime } from '../core/Runtime';
import type { EndingId } from '../types';
import { NARRATIVE_VARS } from '../types';

export interface EndingEvaluation { id: EndingId; eligible: boolean; score: number }
export interface EndingResult {
  id: EndingId; title: string; tagline: string; slides: string[];
  companionFates: { id: string; name: string; text: string }[];
  evaluation: EndingEvaluation[];
}

/**
 * Endings are chosen by hard gates (conditions over hidden variables, flags, companions, collected truth)
 * and then scored; the final choice is only one input. 'wanderer' has an always-true gate and is the fallback.
 */
export class EndingSystem {
  constructor(private rt: Runtime) {}

  evaluate(): EndingEvaluation[] {
    return [...this.rt.content.endings.values()].map(e => {
      const eligible = this.rt.check(e.gate);
      let score = e.base;
      for (const v of NARRATIVE_VARS) score += (e.weights[v] ?? 0) * this.rt.state.vars[v];
      for (const b of e.bonus) if (this.rt.check(b.when)) score += b.add;
      return { id: e.id, eligible, score };
    });
  }

  resolve(): EndingResult {
    const evals = this.evaluate();
    // 'wanderer' is the fallback: it only wins when no other ending's gate is satisfied.
    const pool = evals.filter(e => e.eligible && e.id !== 'wanderer');
    pool.sort((a, b) => b.score - a.score || this.rt.content.endings.get(b.id)!.priority - this.rt.content.endings.get(a.id)!.priority);
    const chosen = (pool[0] ?? evals.find(e => e.id === 'wanderer')!).id;
    this.rt.state.ending = chosen;
    const def = this.rt.content.endings.get(chosen)!;
    const result: EndingResult = {
      id: chosen, title: def.title, tagline: def.tagline,
      slides: def.slides.filter(s => this.rt.check(s.when)).map(s => s.text),
      companionFates: this.rt.companions.getFates(), evaluation: evals,
    };
    this.rt.bus.emit('world:ending', result);
    return result;
  }
}
