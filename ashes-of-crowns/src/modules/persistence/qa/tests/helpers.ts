import { createDefaultGameState, GameStateInput } from '../../index';
export function sampleState(over: Partial<GameStateInput> = {}): GameStateInput {
  const s = createDefaultGameState('hard', 'whispering_forest');
  const { checkpoints: _c, ...rest } = s;
  void _c;
  return {
    ...rest,
    player: { stats: { hp: 80, maxHp: 100, attack: 12 }, level: 7, xp: 1234, position: { x: 10, y: 20 } },
    inventory: { gold: 345, items: [{ id: 'potion', qty: 3 }, { id: 'iron_sword', qty: 1, durability: 55, meta: { enchant: 'ember' } }] },
    equipment: { weapon: 'iron_sword', armor: null },
    skills: { unlocked: ['dash', 'slash'], equipped: ['slash'], points: 2, levels: { slash: 3 } },
    quests: [{ id: 'q1', status: 'active', stage: 2, objectives: { wolves: 3 } }],
    decisions: { spared_darken: true, oath: 'silent' },
    narrative: { honor: 5, trust: -2, ambition: 3, mercy: 8 },
    relationships: { mira: 40 },
    unlockedSkins: ['ember_cloak'],
    progress: { playtimeMs: 360000, regionsUnlocked: ['ashen_village', 'whispering_forest'], regionsCompleted: ['ashen_village'], bossesDefeated: ['warden'], flags: { intro: true }, endingsSeen: [] },
    ...over,
  };
}
