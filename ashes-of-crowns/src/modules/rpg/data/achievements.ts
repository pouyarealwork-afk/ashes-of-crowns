import type { RewardBundle } from '../events';

/** Counters are advanced by the module. `mode: 'max'` counters keep the highest value seen, 'sum' counters accumulate. */
export interface AchievementDef { id: string; name: string; description: string; counter: string; target: number; reward?: Partial<RewardBundle> }

export const ACHIEVEMENT_LIST: AchievementDef[] = [
  { id: 'ach_first_blood', name: 'First Blood', description: 'Defeat your first enemy.', counter: 'kills', target: 1, reward: { gold: 20 } },
  { id: 'ach_slayer', name: 'Slayer', description: 'Defeat 150 enemies.', counter: 'kills', target: 150, reward: { gold: 400, shards: 2 } },
  { id: 'ach_boss_hunter', name: 'Boss Hunter', description: 'Defeat 3 bosses.', counter: 'bossKills', target: 3, reward: { gold: 600, shards: 4 } },
  { id: 'ach_wealthy', name: 'Fortune Rebuilt', description: 'Earn 5,000 gold in total.', counter: 'goldEarned', target: 5000, reward: { shards: 3 } },
  { id: 'ach_artisan', name: 'Artisan', description: 'Craft 10 items.', counter: 'itemsCrafted', target: 10, reward: { gold: 200 } },
  { id: 'ach_master_smith', name: 'Master Smith', description: 'Upgrade an item to +5.', counter: 'maxUpgrade', target: 5, reward: { shards: 3 } },
  { id: 'ach_level_10', name: 'Rising Hero', description: 'Reach level 10.', counter: 'maxLevel', target: 10, reward: { gold: 250 } },
  { id: 'ach_level_30', name: 'Hero Reborn', description: 'Reach level 30.', counter: 'maxLevel', target: 30, reward: { shards: 10 } },
  { id: 'ach_arcane_mastery', name: 'Arcane Mastery', description: 'Spend 12 skill points in the Arcane tree.', counter: 'points_arcane', target: 12 },
  { id: 'ach_warrior_mastery', name: 'Warrior’s Resolve', description: 'Spend 12 skill points in the Warrior tree.', counter: 'points_warrior', target: 12, reward: { shards: 2 } },
  { id: 'ach_shadow_mastery', name: 'Master of Shadows', description: 'Spend 12 skill points in the Shadow tree.', counter: 'points_shadow', target: 12, reward: { shards: 2 } },
  { id: 'ach_legendary_collector', name: 'Legendary Collector', description: 'Obtain a Legendary item.', counter: 'legendaryObtained', target: 1, reward: { shards: 5 } },
  { id: 'ach_questing', name: 'Oathkeeper', description: 'Complete 10 quests.', counter: 'questsCompleted', target: 10, reward: { gold: 500 } },
  { id: 'ach_new_game_plus', name: 'Cycle Unbroken', description: 'Begin New Game+.', counter: 'ngPlusCycle', target: 1, reward: { shards: 5 } },
];
export const ACHIEVEMENTS: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENT_LIST.map((a) => [a.id, a]));
/** Counters that use "highest value seen" semantics instead of accumulation. */
export const MAX_COUNTERS = new Set(['maxUpgrade', 'maxLevel', 'points_arcane', 'points_warrior', 'points_shadow', 'ngPlusCycle']);
