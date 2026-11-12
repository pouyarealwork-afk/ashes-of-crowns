import type { RegionContent } from '../../types';
import { AND, ATM, C, CH, CNT, COL, COLL, COMP, CUT, F, INT, KILL, N, NOT, OBJ, OR, P, Q, R, T, TALKED, ZONE, chap, fl, key, qs, rec, reward, rl, unlock, vr, rect } from '../dsl';

export const whisperingForest: RegionContent = {
  region: {
    id: 'whispering_forest', name: 'Whispering Forest', chapter: 2, tagline: 'The trees remember what men forget.',
    description: 'An ancient wood where the Greenwatch kept the kingdom\'s records and the Whisperers speak in the roots. Ash-sickness is creeping in.',
    entryLevel: 'whispering_forest_main', mapPos: { x: 0.3, y: 0.55 },
    connections: [{ to: 'ashen_village' }, { to: 'forgotten_desert', requires: Q('m2_trees') }],
  },

  levels: [
    {
      id: 'whispering_forest_main', region: 'whispering_forest', name: 'The Greenwatch Trail', size: { w: 7200, h: 1100 },
      atmosphere: ATM({ palette: { sky: '#10201c', mid: '#1f3a30', fore: '#07110e', accent: '#7ee6b0' }, weather: 'spores', light: 'gloom', music: 'whispering_forest_theme', ambience: ['leaf_rustle', 'owl', 'whispers_layered'], particles: 'glow_spores', notes: 'Cathedral canopy, bioluminescent moss, voices in the bark. Ash-sickened trees are grey and brittle.' }),
      spawns: { start: { x: 120, y: 880 }, from_village: { x: 120, y: 880 }, from_oak: { x: 5200, y: 880 }, from_desert: { x: 7000, y: 880 } },
      platforms: [
        P(0, 940, 1200, 160), P(1400, 940, 1100, 160), P(2700, 940, 1500, 160), P(4400, 940, 1000, 160), P(5600, 940, 1600, 160),
        P(300, 820, 220, 24, 'vine'), P(640, 720, 220, 24, 'vine'), P(1000, 620, 260, 24, 'wood'), P(1280, 860, 120, 24, 'crumble'),
        P(1650, 800, 240, 24, 'wood'), P(2000, 680, 240, 24, 'vine'), P(2350, 560, 260, 24, 'wood'), P(2900, 820, 220, 24, 'oneway'),
        P(3300, 700, 260, 24, 'wood'), P(3700, 580, 240, 24, 'vine'), P(4050, 760, 200, 24, 'crumble'), P(4500, 760, 260, 24, 'wood'),
        P(4900, 640, 240, 24, 'vine'), P(5800, 800, 260, 24, 'oneway'), P(6200, 680, 240, 24, 'wood'), P(6580, 560, 300, 24, 'stone'),
      ],
      hazards: [
        { type: 'thorns', rect: rect(1200, 920, 200, 20), damage: 8 }, { type: 'pit', rect: rect(2500, 1060, 200, 40), damage: 999 },
        { type: 'thorns', rect: rect(4200, 920, 200, 20), damage: 8 }, { type: 'ash_sickness_cloud', rect: rect(5400, 780, 200, 160), damage: 3, note: 'slow drain; cleared when Thornwarden is cleansed' },
      ],
      enemies: [
        { type: 'thornling', x: 700, y: 900, patrol: [500, 1100] }, { type: 'ash_wolf', x: 1800, y: 900, patrol: [1500, 2300] },
        { type: 'rook_bandit', x: 3000, y: 900, patrol: [2800, 3600] }, { type: 'rook_bandit', x: 3400, y: 900, patrol: [3000, 3900] },
        { type: 'thornling', x: 4600, y: 900, patrol: [4450, 5300], elite: true }, { type: 'sickened_stag', x: 6200, y: 900, patrol: [5900, 6700] },
      ],
      npcs: [
        { npc: 'sylwen', x: 2200, y: 900, when: COMP('sylwen', 'unmet') }, { npc: 'whisperer', x: 3000, y: 900 },
        { npc: 'pell', x: 1450, y: 900 }, { npc: 'rook', x: 3500, y: 900, when: NOT(F('rook_resolved')) },
      ],
      collectibles: [
        { id: 'greenwatch_sigil', x: 3650, y: 540 }, { id: 'heartwood_seed', x: 6900, y: 900 }, { id: 'pell_satchel', x: 1500, y: 900 },
        { id: 'whisper_leaf', x: 700, y: 680 },
      ],
      hiddenPaths: [{ id: 'heartwood', level: 'whispering_forest_main', rect: rect(6750, 760, 300, 180), hint: 'Roots arch in a pattern that matches the sigil\'s curve.', reveal: AND(COL('greenwatch_sigil'), INT('heartwood_roots')) }],
      zones: [{ id: 'greenwatch_gate', rect: rect(1900, 700, 300, 240) }, { id: 'rook_camp', rect: rect(3000, 700, 900, 240) }, { id: 'wisp_glade', rect: rect(4500, 600, 700, 340) }, { id: 'hollow_oak', rect: rect(5000, 700, 300, 240) }],
      interactables: [
        { id: 'wisp_1', x: 900, y: 580, label: 'Wisp shrine' }, { id: 'wisp_2', x: 2500, y: 520, label: 'Wisp shrine' }, { id: 'wisp_3', x: 3800, y: 540, label: 'Wisp shrine' },
        { id: 'wisp_4', x: 5000, y: 600, label: 'Wisp shrine' }, { id: 'heartwood_roots', x: 6800, y: 900, label: 'Tangled roots' },
      ],
      exits: [
        { id: 'to_village', rect: rect(0, 800, 80, 140), to: { level: 'ashen_village_main', spawn: 'from_forest' } },
        { id: 'to_oak', rect: rect(5300, 780, 80, 160), to: { level: 'whispering_forest_oak', spawn: 'start' }, requires: F('trial_passed'), lockedText: 'The Whisperers close the path: "Answer first."' },
        { id: 'to_desert', rect: rect(7100, 800, 100, 140), to: { level: 'forgotten_desert_main', spawn: 'from_forest' }, requires: Q('m2_trees'), lockedText: 'The archive still holds what you came for.' },
      ],
      lore: [
        { id: 'l2_sign', kind: 'sign', x: 600, y: 900, text: 'Greenwatch rule, carved: "Take no more than the forest gives. Remember all of it."' },
        { id: 'l2_remains', kind: 'remains', x: 2800, y: 900, text: 'Three Greenwatch rangers, felled by crossbow bolts with Crown fletching. Someone has laid moss over their eyes.' },
        { id: 'l2_mural', kind: 'mural', x: 4300, y: 800, text: 'Bark-carved ring of kings, each with a different crown. The newest is a blank patch scraped to the wood.' },
      ],
    },
    {
      id: 'whispering_forest_oak', region: 'whispering_forest', name: 'The Hollow Oak', size: { w: 3000, h: 900 },
      atmosphere: ATM({ palette: { sky: '#0c1a17', mid: '#274237', fore: '#050c0a', accent: '#b6f0c8' }, weather: 'spores', light: 'night', music: 'hollow_oak_boss', ambience: ['heartbeat_slow', 'whispers_distant'], particles: 'floating_pages', notes: 'Inside a vast living oak, shelves of root-bound ledgers, central arena ringed with ash-sick roots.' }),
      spawns: { start: { x: 100, y: 700 }, from_boss: { x: 2400, y: 700 } },
      platforms: [P(0, 760, 3000, 140, 'ground'), P(300, 600, 240, 24, 'vine'), P(700, 520, 240, 24, 'vine'), P(1100, 440, 280, 24, 'wood'), P(1500, 560, 240, 24, 'vine'), P(2500, 560, 300, 24, 'wood')],
      hazards: [{ type: 'ash_roots', rect: rect(1700, 740, 400, 20), damage: 6 }],
      enemies: [{ type: 'thornling', x: 600, y: 700, patrol: [400, 1000] }, { type: 'thornwarden', x: 1900, y: 700, boss: 'thornwarden' }],
      npcs: [], collectibles: [{ id: 'frag_2', x: 2700, y: 520 }], hiddenPaths: [],
      zones: [{ id: 'oak_arena', rect: rect(1400, 560, 1000, 200) }], interactables: [],
      exits: [{ id: 'out', rect: rect(0, 640, 80, 120), to: { level: 'whispering_forest_main', spawn: 'from_oak' } }],
      lore: [{ id: 'l2o_ledger', kind: 'letter', x: 2300, y: 700, text: 'Greenwatch entry: "Night of the Feast. Chancellor Morrow\'s riders took the courier road at midnight. The seal on their dispatch was Darken\'s. The rider\'s face was not."' }],
    },
  ],

  npcs: [
    { id: 'sylwen', name: 'Sylwen', region: 'whispering_forest', role: 'Greenwatch Warden / Companion', description: 'Last of the Greenwatch archers, bound by an oath to protect the Hollow Oak.', portrait: 'portrait_sylwen', sprite: 'npc_sylwen', companion: 'sylwen',
      dialogue: [{ when: Q('c_sylwen', 'active'), tree: 'd_sylwen_grove' }, { when: COMP('sylwen', 'recruited'), tree: 'd_sylwen_camp' }, { when: F('trial_passed'), tree: 'd_sylwen_join' }, { tree: 'd_sylwen_wary' }] },
    { id: 'whisperer', name: 'The Whisperers', region: 'whispering_forest', role: 'Spirit Voices', description: 'Voices in the ring-oaks that test every visitor.', portrait: 'portrait_whisper', sprite: 'npc_whisper', dialogue: [{ when: F('trial_passed'), tree: 'd_whisper_after' }, { tree: 'd_whisper_trial' }] },
    { id: 'pell', name: 'Courier Pell', region: 'whispering_forest', role: 'Witness', description: 'A royal courier hiding in the Greenwatch since the Feast.', portrait: 'portrait_pell', sprite: 'npc_pell', dialogue: [{ when: F('pell_told'), tree: 'd_pell_after' }, { tree: 'd_pell' }] },
    { id: 'rook', name: 'Rook', region: 'whispering_forest', role: 'Bandit Chief', description: 'Leader of the Crownless, who hold the trail for coin and spite.', portrait: 'portrait_rook', sprite: 'npc_rook', dialogue: [{ tree: 'd_rook' }] },
  ],

  dialogues: [
    T('d_sylwen_wary', 'sylwen', 'a', {
      a: N('sylwen', 'You walk like a soldier and smell of smoke. The Greenwatch does not open its gate to either. Speak to the Whisperers. If they pass you, I will listen.', { mood: 'cold' }),
    }),
    T('d_sylwen_join', 'sylwen', 'a', {
      a: N('sylwen', 'The Whisperers hum when you pass. They have not done that since the old king. I have no hall left to guard but the Oak — and it needs a blade that remembers. Let me walk with you.', { mood: 'soft', choices: [
        C('"I\'d be honoured."', 'ok', { tags: ['honest', 'loyal'], effects: [rl('sylwen', 6)] }),
        C('"You\'ll follow my orders, then."', 'ok', { tags: ['dominant'], effects: [rl('sylwen', -3), vr('ambition', 1)] })] }),
      ok: N('sylwen', 'The wood will watch you. So will I.', { effects: [rec('sylwen')] }),
    }),
    T('d_sylwen_camp', 'sylwen', 'a', {
      a: N('sylwen', 'The forest is quiet tonight. Strange, how loud quiet can be.', { variants: [{ when: R('sylwen', '>=', 60), text: 'You hum when you think I\'m asleep. I like it.' }], choices: [C('"What was the Greenwatch?"', 'b'), C('"Rest."')] }),
      b: N('sylwen', 'Eighty rangers. We memorised the kingdom\'s history because paper burns. Now I carry the oaths of the dead in my head and they don\'t always agree.', { effects: [rl('sylwen', 2)] }),
    }),
    T('d_whisper_trial', 'whisperer', 'a', {
      a: N('whisperer', 'WHO WALKS WITH ASH ON HIS HANDS? We have heard the oak-names: Valcrest, Oathbreaker, Hero. Which is true?', { mood: 'eerie', choices: [
        C('"All of them, at different times."', 'q2', { tags: ['honest'], effects: [vr('honor', 1)] }),
        C('"None. I am what they made."', 'q2', { tags: ['bitter'], effects: [vr('ambition', 1)] }),
        C('"I don\'t remember."', 'q2', { tags: ['deceit'], effects: [vr('trust', -1)] })] }),
      q2: N('whisperer', 'WHAT WILL YOU DO WITH DARKEN HOLT WHEN YOU STAND BEFORE HIM?', { choices: [
        C('"Hear him out. Then decide."', 'vision', { tags: ['mercy'], effects: [vr('mercy', 1), vr('honor', 1)] }),
        C('"Make him answer for it."', 'vision', { tags: ['justice'], effects: [vr('honor', 1)] }),
        C('"End him."', 'vision', { tags: ['ruthless'], effects: [vr('mercy', -1), vr('ambition', 1)] })] }),
      vision: N('whisperer', 'WE SHOW YOU THE FEAST. LOOK.', { effects: [fl('trial_passed'), fl('feast_vision'), reward({ xp: 150 })], next: 'v2' }),
      v2: N('narrator', 'Candles. A laughing hall. The King lifts his goblet, pales. Darken, across the table, lowers his eyes before anyone else lifts theirs. He is not surprised.', { mood: 'grim', next: 'v3' }),
      v3: N('aren', 'He knew. He knew and he said nothing.', { effects: [vr('trust', -1)] }),
    }),
    T('d_whisper_after', 'whisperer', 'a', { a: N('whisperer', 'YOU HAVE LOOKED. THE ROOTS ARE ILL. THE OAK NEEDS ITS WARDEN WHOLE.', { mood: 'eerie' }) }),
    T('d_pell', 'pell', 'a', {
      a: N('pell', 'Don\'t come closer! I... Valcrest? They said they\'d killed you. I... I carried the dispatch the night of the Feast. I wasn\'t supposed to read it.', { mood: 'frightened', choices: [
        C('"What did it say?"', 'b', { tags: ['direct'] }),
        C('"Here, take some coin. Then tell me."', 'b', { tags: ['mercy'], effects: [vr('mercy', 1), rl('pell', 2)] })] }),
      b: N('pell', 'The King was alive when I left the capital. He asked for you — twice. The Chancellor ordered the doors sealed. By dawn the order said you\'d poisoned him. Darken\'s seal, Morrow\'s ink.', { effects: [fl('pell_told'), fl('heard_chancellor_sealed'), fl('king_alive_after_feast')], choices: [
        C('"Will you stand witness before the Crown?"', 'c', { tags: ['honest'], effects: [vr('honor', 1), fl('pell_witness')] }),
        C('"Stay hidden. I\'ll finish this."', 'd', { tags: ['protective'], effects: [vr('trust', 1)] })] }),
      c: N('pell', 'If you\'re still breathing when the day comes, I\'ll say it in the open square.'),
      d: N('pell', 'I will. Bless you, Valcrest.'),
    }),
    T('d_pell_after', 'pell', 'a', { a: N('pell', 'I keep rehearsing the words. They get heavier each time.') }),
    CUT('d_rook_camp', 'a', {
      a: N('rook', 'Look at what the wind brought. Forty silver, walking. Boys, round him up.', { mood: 'smug', next: 'b' }),
      b: N('aren', 'You hold the trail, Rook. Not my head.', { next: 'c' }),
      c: N('rook', 'I hold what I can. The Crown stopped paying the Greenwatch\'s tolls — now it pays me. Business.', { mood: 'wry' }),
    }),
    T('d_rook', 'rook', 'a', {
      a: N('rook', 'So. Do we fight, or do we bargain?', { choices: [
        C('"Stand down. Take the road south and never come back."', 'spare', { tags: ['mercy'], effects: [vr('mercy', 2), fl('rook_spared'), fl('rook_resolved')] }),
        C('"I\'ll hand you to the Greenwatch. They can judge."', 'turn', { tags: ['justice'], effects: [vr('honor', 1), fl('rook_turned'), fl('rook_resolved')] }),
        C('"Your men carry Crown bolts. You\'ve earned nothing."', 'kill', { tags: ['ruthless'], effects: [vr('mercy', -2), vr('ambition', 1), fl('rook_killed'), fl('rook_resolved'), rl('sylwen', -3)] })] }),
      spare: N('rook', 'Hm. I owe you one then. In the Hollow City they say a debt is currency.', { effects: [rl('rook', 10)] }),
      turn: N('rook', 'Fair, I suppose. The wood has long memory.'),
      kill: N('narrator', 'Rook falls. The Crownless scatter. The forest goes quiet.', { effects: [reward({ xp: 80 })] }),
    }),
    CUT('d_thornwarden_end', 'a', {
      a: N('narrator', 'The Thornwarden sinks, antlers cracking like old timbers. Beneath the ash, a green heartbeat remains.', { mood: 'solemn', choices: [
        C('Plant the Heartwood Seed in its chest.', 'cleanse', { when: COL('heartwood_seed'), tags: ['mercy'], effects: [vr('mercy', 2), vr('honor', 1), fl('thornwarden_cleansed'), fl('forest_pact'), fl('thornwarden_resolved')] }),
        C('End its suffering.', 'end', { tags: ['pragmatic'], effects: [fl('thornwarden_slain'), fl('thornwarden_resolved')] }),
        C('Take the antler-heart for yourself.', 'take', { tags: ['greed'], effects: [vr('ambition', 2), vr('mercy', -1), fl('thornwarden_looted'), fl('thornwarden_resolved'), rl('sylwen', -6)] })] }),
      cleanse: N('narrator', 'The seed takes root. Green climbs through the grey. The Whisperers sing one clear note and the ash-clouds fall.', { effects: [reward({ xp: 200 })] }),
      end: N('narrator', 'It sighs and goes still. The forest remains sick, but the Oak is safe.'),
      take: N('narrator', 'The heart is warm in your hand. The trees hush, deliberately.'),
    }),
  ],

  quests: [
    {
      id: 'm2_trees', title: 'Where the Trees Remember', type: 'main', region: 'whispering_forest', chapter: 2, requires: Q('m1_embers'), autoStart: CH(2),
      summary: 'The Greenwatch kept every record of the Crown. Pass the Whisperers\' trial, meet the courier, and reach the Hollow Oak archive.',
      objectives: [
        OBJ('gate', 'Reach the Greenwatch gate', ZONE('greenwatch_gate')),
        OBJ('trial', 'Answer the Whisperers', F('trial_passed'), { after: ['gate'] }),
        OBJ('pell', 'Find Courier Pell', TALKED('pell'), { after: ['trial'] }),
        OBJ('oak', 'Enter the Hollow Oak', ZONE('oak_arena'), { after: ['pell'] }),
        OBJ('warden', 'Face the ash-sick Thornwarden', F('thornwarden_resolved'), { after: ['oak'] }),
        OBJ('ledger', 'Recover the Greenwatch ledger', COL('frag_2'), { after: ['warden'] }),
      ],
      reward: { xp: 500, gold: 80 }, onComplete: [unlock('forgotten_desert'), chap(3), fl('ch2_done')],
    },
    {
      id: 's2_rook', title: 'A Price on Your Head', type: 'side', region: 'whispering_forest', chapter: 2,
      summary: 'Rook\'s Crownless hold the trail. Decide what to do with their chief.',
      objectives: [OBJ('camp', 'Find Rook\'s camp', ZONE('rook_camp')), OBJ('fate', 'Decide Rook\'s fate', F('rook_resolved'), { after: ['camp'] })],
      reward: { xp: 100, gold: 60 }, autoStart: CH(2),
    },
    {
      id: 'e2_lanterns', title: 'Lanterns for the Lost', type: 'exploration', region: 'whispering_forest', chapter: 2, autoStart: CNT('int_wisp_', 1),
      summary: 'Four wisp shrines sleep along the trail. Light them.',
      objectives: [OBJ('shrines', 'Awaken the wisp shrines', CNT('int_wisp_', 4), { progress: { prefix: 'int_wisp_', n: 4 } })],
      reward: { xp: 150, items: [{ id: 'charm_wisp', n: 1 }], keys: [{ id: 'wisp_lantern' }] },
    },
    {
      id: 'h2_heartwood', title: 'The Heartwood Hollow', type: 'hidden', region: 'whispering_forest', chapter: 2, hiddenUntilStarted: true, autoStart: COL('greenwatch_sigil'),
      summary: 'A sigil hangs in the bandits\' camp. Its curve matches a tangle of roots.',
      objectives: [OBJ('roots', 'Study the tangled roots', INT('heartwood_roots')), OBJ('path', 'Open the hollow', F('path_heartwood'), { after: ['roots'] }), OBJ('seed', 'Take the Heartwood Seed', COL('heartwood_seed'), { after: ['path'] })],
      reward: { xp: 200 },
    },
  ],

  collectibles: [
    COLL('greenwatch_sigil', 'whispering_forest', 'relic', 'Greenwatch Sigil', 'A ranger\'s oak-leaf sigil, taken from a fallen warden by the Crownless.'),
    COLL('heartwood_seed', 'whispering_forest', 'key', 'Heartwood Seed', 'A seed that hums when held near ash-sick wood.', [key('heartwood_seed')]),
    COLL('pell_satchel', 'whispering_forest', 'lore', 'Pell\'s Satchel', 'Empty dispatch tubes and a half-finished letter to a daughter who may not remember him.'),
    COLL('whisper_leaf', 'whispering_forest', 'lore', 'Whispering Leaf', 'Hold it to your ear: a stranger repeats "Trust the one I would not name."'),
    COLL('frag_2', 'whispering_forest', 'testament', 'Testament Fragment II', 'Greenwatch copy of the King\'s private letter: "The Crown is eating the land and me. I will name the guilty at the Feast."'),
  ],

  pois: [
    { id: 'greenwatch_gate', region: 'whispering_forest', level: 'whispering_forest_main', name: 'Greenwatch Gate', kind: 'camp', x: 2050, y: 880, fastTravel: true, description: 'A gate of living branches.' },
    { id: 'rook_camp', region: 'whispering_forest', level: 'whispering_forest_main', name: 'The Crownless Camp', kind: 'landmark', x: 3400, y: 880, description: 'A bandit camp in a felled giant.' },
    { id: 'wisp_glade', region: 'whispering_forest', level: 'whispering_forest_main', name: 'Wisp Glade', kind: 'shrine', x: 4800, y: 820, description: 'Where the lost light themselves a path.' },
    { id: 'hollow_oak', region: 'whispering_forest', level: 'whispering_forest_main', name: 'The Hollow Oak', kind: 'landmark', x: 5150, y: 880, description: 'A thousand-year oak holding the Greenwatch archive.' },
  ],

  storyEvents: [
    { id: 'ev_rook_camp', zone: 'rook_camp', dialogue: 'd_rook_camp', when: NOT(F('rook_resolved')) },
    { id: 'ev_thornwarden_end', auto: KILL('thornwarden'), dialogue: 'd_thornwarden_end' },
  ],
};
void OR; void TALKED;
