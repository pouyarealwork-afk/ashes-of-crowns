import type { Result } from '../types';
import { fail } from '../types';
import type { RpgContext } from '../core/context';
import type { SkinDef, UnlockCondition } from '../data/skins';
import { SKINS, SKIN_LIST } from '../data/skins';

export interface SkinView { def: SkinDef; unlocked: boolean; equipped: boolean; hint: string }

/** Cosmetic skins. Unlocked automatically when quest / boss / story / achievement conditions are met. No stat effects. */
export class SkinSystem {
  private ctx: RpgContext;
  constructor(ctx: RpgContext) { this.ctx = ctx; }

  isMet(c: UnlockCondition): boolean {
    const s = this.ctx.state;
    switch (c.type) {
      case 'default': return true;
      case 'quest': return s.completedQuests.includes(c.questId);
      case 'boss': return s.defeatedBosses.includes(c.bossId);
      case 'story': return !!s.flags[c.flag];
      case 'achievement': return s.achievements.includes(c.achievementId);
      case 'all': return c.of.every((x) => this.isMet(x));
    }
  }
  /** Unlocks every skin whose condition is met. Returns newly unlocked ids. */
  evaluate(): string[] {
    const out: string[] = [];
    for (const d of SKIN_LIST) {
      if (this.ctx.state.skinsUnlocked.includes(d.id) || !this.isMet(d.unlock)) continue;
      this.ctx.state.skinsUnlocked.push(d.id); out.push(d.id);
      this.ctx.events.emit('rpg:skin-unlocked', { skinId: d.id, textureKey: d.textureKey });
    }
    return out;
  }
  list(): SkinView[] {
    return SKIN_LIST.map((d) => ({ def: d, unlocked: this.ctx.state.skinsUnlocked.includes(d.id), equipped: this.ctx.state.skinEquipped === d.id, hint: d.unlockHint }));
  }
  getEquipped(): SkinDef { return SKINS[this.ctx.state.skinEquipped] ?? SKINS['aren_default']!; }
  equip(skinId: string): Result<{ textureKey: string }> {
    const d = SKINS[skinId];
    if (!d) return fail('unknown_skin');
    if (!this.ctx.state.skinsUnlocked.includes(skinId)) return fail('skin_locked');
    this.ctx.state.skinEquipped = skinId;
    this.ctx.events.emit('rpg:skin-equipped', { skinId, textureKey: d.textureKey });
    return { ok: true, textureKey: d.textureKey };
  }
}
