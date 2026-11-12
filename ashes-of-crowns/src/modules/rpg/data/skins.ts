export type UnlockCondition =
  | { type: 'default' }
  | { type: 'quest'; questId: string }
  | { type: 'boss'; bossId: string }
  | { type: 'story'; flag: string }
  | { type: 'achievement'; achievementId: string }
  | { type: 'all'; of: UnlockCondition[] };

export interface SkinDef {
  id: string; name: string; description: string;
  /** Phaser texture / spritesheet key the player module should swap to. Art must be supplied separately. */
  textureKey: string; unlock: UnlockCondition; unlockHint: string;
}

export const SKIN_LIST: SkinDef[] = [
  { id: 'aren_default', name: 'Aren, the Fallen', description: 'Aren’s plain traveler garb. All he has left.', textureKey: 'player_skin_aren_default', unlock: { type: 'default' }, unlockHint: 'Available from the start.' },
  { id: 'warrior_armor', name: 'Warrior Armor', description: 'Heavy plate reforged from Aren’s old battle gear.', textureKey: 'player_skin_warrior_armor', unlock: { type: 'quest', questId: 'q_ashen_forge_oath' }, unlockHint: 'Complete the quest “The Forge Oath” in Ashen Village.' },
  { id: 'shadow_knight', name: 'Shadow Knight', description: 'Black armor worn by the Hollow City’s sentinel.', textureKey: 'player_skin_shadow_knight', unlock: { type: 'boss', bossId: 'boss_hollow_sentinel' }, unlockHint: 'Defeat the Hollow Sentinel.' },
  { id: 'arcane_mage', name: 'Arcane Mage', description: 'Star-stitched robes of a master of the arcane.', textureKey: 'player_skin_arcane_mage', unlock: { type: 'achievement', achievementId: 'ach_arcane_mastery' }, unlockHint: 'Spend 12 skill points in the Arcane tree.' },
  { id: 'royal_guardian', name: 'Royal Guardian', description: 'The gilded regalia of the Crown’s sworn guard.', textureKey: 'player_skin_royal_guardian', unlock: { type: 'story', flag: 'story_crownfall_gates' }, unlockHint: 'Reach the gates of Crownfall.' },
  { id: 'legendary_king', name: 'Legendary King', description: 'The regalia of a true sovereign.', textureKey: 'player_skin_legendary_king',
    unlock: { type: 'all', of: [{ type: 'story', flag: 'ending_true_king' }, { type: 'achievement', achievementId: 'ach_legendary_collector' }] }, unlockHint: 'Earn “The True King” ending and own a Legendary item.' },
];
export const SKINS: Record<string, SkinDef> = Object.fromEntries(SKIN_LIST.map((s) => [s.id, s]));
