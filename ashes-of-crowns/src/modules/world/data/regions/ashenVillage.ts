import type { RegionContent } from '../../types';
import { AND, C, CH, CNT, COL, COMP, CUT, F, INT, K, KILL, N, NOT, OBJ, P, Q, R, T, TALKED, ZONE, COLL, ATM, chap, fl, key, qs, rec, reward, rl, unlock, vr, rect } from '../dsl';

const ATMOS_MAIN = ATM({
  palette: { sky: '#2a2226', mid: '#4a3a36', fore: '#16110f', accent: '#e0722a' }, weather: 'ash', light: 'dusk',
  music: 'ashen_village_theme', ambience: ['wind_low', 'embers_crackle', 'distant_crow'], particles: 'falling_ash_slow',
  notes: 'Charred timber homes, a cold forge with one live ember, ash drifting like snow. Warm orange only from embers and the forge.',
});

export const ashenVillage: RegionContent = {
  region: {
    id: 'ashen_village', name: 'Ashen Village', chapter: 1, tagline: 'Home is what is left after the fire.',
    description: 'Aren\'s birthplace, burned by the Crown for sheltering the "Oathbreaker". Survivors cling to cellars and the cold forge.',
    entryLevel: 'ashen_village_main', mapPos: { x: 0.14, y: 0.78 }, startsUnlocked: true,
    connections: [{ to: 'whispering_forest', requires: Q('m1_embers') }],
  },

  levels: [
    {
      id: 'ashen_village_main', region: 'ashen_village', name: 'Cinderhollow Road', size: { w: 6400, h: 900 }, atmosphere: ATMOS_MAIN,
      spawns: { start: { x: 140, y: 700 }, from_cellar: { x: 3240, y: 700 }, from_forest: { x: 6200, y: 700 } },
      platforms: [
        P(0, 760, 1500, 140), P(1700, 760, 1300, 140), P(3150, 760, 1500, 140), P(4850, 760, 1550, 140),
        P(420, 640, 220, 24, 'wood'), P(760, 560, 200, 24, 'wood'), P(1180, 620, 240, 24, 'oneway'),
        P(1560, 700, 140, 24, 'crumble'), P(2100, 620, 260, 24, 'wood'), P(2480, 520, 220, 24, 'wood'),
        P(2800, 610, 160, 24, 'crumble'), P(3350, 600, 300, 24, 'wood'), P(3760, 500, 200, 24, 'wood'),
        P(4060, 420, 240, 24, 'stone'), P(4380, 560, 220, 24, 'wood'), P(5100, 600, 300, 24, 'oneway'), P(5560, 500, 260, 24, 'wood'),
      ],
      hazards: [
        { type: 'fire', rect: rect(1500, 740, 200, 20), damage: 8, note: 'burning rubble in the gap' },
        { type: 'spikes', rect: rect(3000, 740, 150, 20), damage: 10, note: 'broken palisade' },
        { type: 'fire', rect: rect(4650, 740, 200, 20), damage: 8 },
      ],
      enemies: [
        { type: 'ash_wolf', x: 900, y: 700, patrol: [700, 1200] }, { type: 'crown_soldier', x: 2300, y: 700, patrol: [2100, 2700] },
        { type: 'ash_wolf', x: 3500, y: 700, patrol: [3300, 3900] }, { type: 'crown_soldier', x: 4200, y: 700, patrol: [4000, 4500] },
        { type: 'sergeant_hobb', x: 5600, y: 700, boss: 'hobb' },
      ],
      npcs: [
        { npc: 'jorin', x: 980, y: 720 }, { npc: 'tamsin', x: 1850, y: 720, when: COMP('tamsin', 'unmet') },
        { npc: 'marta', x: 3480, y: 720 }, 
      ],
      collectibles: [
        { id: 'hearth_1', x: 560, y: 600 }, { id: 'hearth_2', x: 860, y: 520 }, { id: 'hearth_3', x: 2580, y: 480 },
        { id: 'hearth_4', x: 4160, y: 380 }, { id: 'hearth_5', x: 5680, y: 460 }, { id: 'valcrest_blade', x: 2400, y: 720 },
        { id: 'pantry_bread', x: 3430, y: 560 }, { id: 'well_key', x: 4460, y: 520 }, { id: 'child_drawing', x: 1300, y: 580 },
      ],
      hiddenPaths: [{ id: 'well_cellar', level: 'ashen_village_main', rect: rect(3180, 700, 60, 60), hint: 'The old well\'s stones are loose, and the rope is gone.',
        reveal: AND(COL('well_key'), INT('old_well')), leadsTo: { level: 'ashen_village_cellars', spawn: 'start' } }],
      zones: [
        { id: 'start_wake', rect: rect(60, 600, 200, 160) }, { id: 'village_square', rect: rect(1000, 600, 500, 160) },
        { id: 'forge_yard', rect: rect(1800, 600, 400, 160) }, { id: 'manor_ruins', rect: rect(2300, 600, 300, 160) },
        { id: 'hobb_arena', rect: rect(5300, 600, 900, 160) },
      ],
      interactables: [{ id: 'old_well', x: 3200, y: 720, label: 'Old well' }, { id: 'burn_order', x: 5900, y: 720, label: 'Nailed burn order' }],
      exits: [
        { id: 'to_cellars', rect: rect(3180, 700, 60, 60), to: { level: 'ashen_village_cellars', spawn: 'start' }, requires: F('path_well_cellar'), lockedText: 'The well is only a well.' },
        { id: 'to_forest', rect: rect(6300, 640, 100, 120), to: { level: 'whispering_forest_main', spawn: 'from_village' }, requires: Q('m1_embers'), lockedText: 'Not yet. Something here still holds you.' },
      ],
      lore: [
        { id: 'l1_sign', kind: 'sign', x: 300, y: 720, text: 'Hearthmere — "Where the Valcrests Keep Their Word." Someone has burned a line through "Word".' },
        { id: 'l1_grave', kind: 'grave', x: 1600, y: 720, text: 'A row of small stones. Each bears a bread-knife instead of a name.' },
        { id: 'l1_mural', kind: 'mural', x: 2650, y: 600, text: 'A children\'s mural of Aren with a sun-gold sword. Black handprints cover the face.' },
        { id: 'l1_remains', kind: 'remains', x: 4900, y: 720, text: 'A Crown courier horse, still saddled. Its dispatch bag is empty, slit open.' },
      ],
    },
    {
      id: 'ashen_village_cellars', region: 'ashen_village', name: 'The Well Cellars', size: { w: 2400, h: 700 },
      atmosphere: ATM({ palette: { sky: '#120e10', mid: '#2b2024', fore: '#0a0707', accent: '#c9a36a' }, weather: 'none', light: 'gloom', music: 'cellars_hush', ambience: ['drip', 'low_hum'], particles: 'dust_motes', notes: 'Candle-lit stone, a child\'s chalk marks. Intimate, claustrophobic.' }),
      spawns: { start: { x: 100, y: 540 } },
      platforms: [P(0, 600, 800, 100, 'stone'), P(950, 560, 300, 40, 'stone'), P(1350, 500, 260, 30, 'oneway'), P(1700, 600, 700, 100, 'stone')],
      hazards: [{ type: 'pit', rect: rect(800, 680, 150, 20), damage: 999 }],
      enemies: [{ type: 'cellar_rat_swarm', x: 1000, y: 520, patrol: [950, 1250] }],
      npcs: [], collectibles: [{ id: 'frag_1', x: 2200, y: 560 }],
      hiddenPaths: [], zones: [{ id: 'cellar_vault', rect: rect(2000, 500, 300, 100) }], interactables: [],
      exits: [{ id: 'up', rect: rect(40, 500, 80, 100), to: { level: 'ashen_village_main', spawn: 'from_cellar' } }],
      lore: [{ id: 'l1c_letter', kind: 'letter', x: 2100, y: 560, text: 'Mother of Aren, in a shaking hand: "Whatever they say of the feast, he never raised a blade at the King. Keep this where fire cannot reach."' }],
    },
  ],

  npcs: [
    { id: 'tamsin', name: 'Tamsin Reed', region: 'ashen_village', role: 'Forgekeeper / Companion', description: 'Blacksmith\'s daughter who tends a forge with no iron left.', portrait: 'portrait_tamsin', sprite: 'npc_tamsin', companion: 'tamsin',
      dialogue: [{ when: Q('c_tamsin', 'active'), tree: 'd_tamsin_forge' }, { when: COMP('tamsin', 'recruited'), tree: 'd_tamsin_camp' }, { tree: 'd_tamsin_meet' }] },
    { id: 'marta', name: 'Old Marta', region: 'ashen_village', role: 'Cellar Keeper', description: 'Hides eleven survivors under the well and counts every crumb.', portrait: 'portrait_marta', sprite: 'npc_marta', dialogue: [{ tree: 'd_marta' }] },
    { id: 'jorin', name: 'Jorin Pike', region: 'ashen_village', role: 'Debt Collector', description: 'A Crown-licensed scavenger buying relics from the ruined.', portrait: 'portrait_jorin', sprite: 'npc_jorin', dialogue: [{ tree: 'd_jorin' }] },
  ],

  dialogues: [
    CUT('d_opening', 'a', {
      a: N('narrator', 'Ash on the tongue. A cold hearthstone beneath your cheek. The village you once paid to rebuild is ruins.', { next: 'b' }),
      b: N('aren', 'Three days since the trial. They took the manor, the name, the sword. Darken stood there and said "guilty" like he was reading a grocery list.', { mood: 'grim', next: 'c' }),
      c: N('aren', 'Then I start where everything began. The forge.', { effects: [fl('opening_seen')] }),
    }),
    CUT('d_hobb_pre', 'a', {
      a: N('hobb', 'Valcrest! Sergeant Hobb, Crown Reclamation. There\'s forty silver on your head and eleven villagers who\'ll hang if you run.', { mood: 'cruel', next: 'b' }),
      b: N('aren', 'Those people are not yours to hang.', { choices: [
        C('"Stand down and walk away." (give him the chance)', 'c', { tags: ['mercy'], effects: [vr('mercy', 1)] }),
        C('"Then come and collect me."', 'c', { tags: ['ruthless'], effects: [vr('ambition', 1)] }) ] }),
      c: N('hobb', 'Boys. Burn the rest.', { mood: 'cruel' }),
    }),
    CUT('d_burn_order', 'a', {
      a: N('narrator', 'The order is nailed to a charred post: BURN HEARTHMERE. Sheltering a traitor. Under it, a wax seal pressed with a falcon and crossed spears.', { next: 'b' }),
      b: N('aren', 'Darken\'s seal. He signed the order to burn the village that raised us both.', { mood: 'cold', effects: [fl('saw_darken_seal'), vr('trust', -1)], next: 'c' }),
      c: N('aren', 'The forest folk kept the Crown\'s records. If anyone can prove what happened, it\'s the Greenwatch.'),
    }),
    CUT('d_tamsin_join', 'a', {
      a: N('tamsin', 'That falcon seal... my father forged the spear-tips for that regiment. He told me they\'d never be turned on Hearthmere. I\'m coming with you, Valcrest.', { mood: 'fierce', choices: [
        C('"I could use a shield. Welcome."', 'b', { tags: ['loyal'], effects: [rl('tamsin', 8), vr('trust', 1)] }),
        C('"It\'s too dangerous."', 'c', { tags: ['distance'], effects: [rl('tamsin', -4)] }) ] }),
      b: N('tamsin', 'You won\'t regret it. Or you will, and I\'ll say I told you so.', { effects: [rec('tamsin')] }),
      c: N('tamsin', 'Dangerous is staying here and waiting for the next torch. I\'m coming.', { effects: [rec('tamsin')] }),
    }),
    T('d_tamsin_meet', 'tamsin', 'a', {
      a: N('tamsin', 'Don\'t move. Let me see the face... By the Ember. Aren Valcrest. They said you hanged.', { mood: 'wary', choices: [
        C('"They tried. I need to reach the manor ruins and the sword."', 'b', { tags: ['honest'] }),
        C('"Keep your voice down, or Hobb will hear."', 'b') ] }),
      b: N('tamsin', 'The blade is in the manor rubble — I dragged it from the fire myself. Hobb\'s patrol keeps the road east. Take the forge yard, then the ruins. I\'ll be here.', { effects: [fl('tamsin_met')] }),
    }),
    T('d_tamsin_camp', 'tamsin', 'a', {
      a: N('tamsin', 'Still here, Valcrest. What do you need?', { variants: [
        { when: R('tamsin', '>=', 60), text: 'You know, I stopped counting the miles. Ask me anything.' },
        { when: R('tamsin', '<', 10), text: 'I follow you because I choose to. Don\'t make me regret it.' }],
        choices: [C('"Tell me about the village before the fire."', 'b'), C('"Nothing. Rest well."')] }),
      b: N('tamsin', 'Every bell had a name. Morning bell was Greta, the noon bell was my mother\'s. When they melted them for the war, my father said iron remembers who it was.', { effects: [rl('tamsin', 2)] }),
    }),
    T('d_marta', 'marta', 'a', {
      a: N('marta', 'Quiet. Eleven souls sleep under that well. If you\'re a soldier, leave. If you\'re Aren — hold out your hands. Anything in them?', { variants: [{ when: Q('s1_cellar', 'active'), text: 'Any bread yet? The little ones stopped asking. That\'s worse.' }],
        choices: [C('"I\'ll find food for the cellar."', 'ok', { effects: [qs('s1_cellar')], tags: ['mercy'] }), C('"I can\'t help. I\'m sorry."', undefined, { effects: [vr('mercy', -1)] })] }),
      ok: N('marta', 'The pantry of the old baker. Third beam, behind the oven. Soldiers missed it.'),
      deliver: N('marta', 'Bread. Real bread. Sweet saints. How much do you carry?', { choices: [
        C('"All of it. It\'s yours."', 'all', { tags: ['mercy', 'honest'], effects: [vr('mercy', 2), vr('honor', 1), fl('bread_all'), fl('bread_resolved'), fl('village_hope'), rl('tamsin', 3)] }),
        C('"Half. I have a road to walk."', 'half', { tags: ['pragmatic'], effects: [vr('ambition', 1), fl('bread_resolved')] }),
        C('"A loaf for the cellar. The rest is mine."', 'half', { tags: ['greed'], effects: [vr('mercy', -1), vr('ambition', 1), fl('bread_resolved'), rl('tamsin', -3)] })] }),
      all: N('marta', 'Hearthmere will remember. Mind the well, boy. There\'s more in it than water.', { effects: [reward({ xp: 120, gold: 20 })] }),
      half: N('marta', 'It will do. We\'ve survived on less.', { effects: [reward({ xp: 80, gold: 10 })] }),
      waiting: N('marta', 'Find the bread, Aren. The pantry beam.'),
      done: N('marta', 'The children play at being you now. A tall figure with a wooden sword. Go well.'),
    }, { entries: [{ when: AND(Q('s1_cellar', 'active'), COL('pantry_bread'), NOT(F('bread_resolved'))), node: 'deliver' }, { when: Q('s1_cellar', 'completed'), node: 'done' }, { when: Q('s1_cellar', 'active'), node: 'waiting' }] }),
    T('d_jorin', 'jorin', 'a', {
      a: N('jorin', 'The signet of Valcrest. A heavy, handsome thing. The Crown pays well for such trinkets — I pay better. Three hundred gold.', { effects: [qs('s1_debt')], choices: [
        C('"Take it. It\'s only metal now."', 'sell', { tags: ['greed'], effects: [vr('ambition', 2), vr('honor', -1), fl('signet_sold'), fl('jorin_resolved'), reward({ gold: 300 })] }),
        C('"This is the last of my name. It stays."', 'refuse', { tags: ['honest'], effects: [vr('honor', 1), fl('jorin_resolved')] }),
        C('"Walk away before I take your purse instead."', 'threat', { tags: ['ruthless'], effects: [vr('mercy', -1), vr('ambition', 1), fl('jorin_threatened'), fl('jorin_resolved')] })] }),
      sell: N('jorin', 'A pleasure. Should anyone ask, I never saw you.', { effects: [] }),
      refuse: N('jorin', 'Sentimental. Sentiment pays no debts. If you change your mind I\'ll be here — or in the Hollow City, if the coin runs.', {}),
      threat: N('jorin', 'Easy, easy. I\'ll find other fools. Remember: debts follow people.'),
      done: N('jorin', 'We\'ve done our business, Valcrest.'),
    }, { entries: [{ when: F('jorin_resolved'), node: 'done' }] }),
  ],

  quests: [
    {
      id: 'm1_embers', title: 'Embers of Home', type: 'main', region: 'ashen_village', chapter: 1, autoStart: CH(1),
      summary: 'Aren returns to the burned village. Recover your blade, break Hobb\'s patrol and find who signed the burn order.',
      objectives: [
        OBJ('forge', 'Reach the cold forge', ZONE('forge_yard')),
        OBJ('tamsin', 'Speak with the survivor at the forge', TALKED('tamsin'), { after: ['forge'] }),
        OBJ('blade', 'Recover your sword from the manor ruins', COL('valcrest_blade'), { after: ['tamsin'] }),
        OBJ('hobb', 'Defeat Sergeant Hobb', KILL('hobb'), { after: ['blade'] }),
        OBJ('order', 'Read the burn order', INT('burn_order'), { after: ['hobb'] }),
      ],
      reward: { xp: 400, gold: 50 }, onComplete: [unlock('whispering_forest'), chap(2), fl('ch1_done'), vr('honor', 0)],
    },
    {
      id: 's1_cellar', title: 'Bread for the Cellar', type: 'side', region: 'ashen_village', chapter: 1,
      summary: 'Old Marta shelters eleven survivors with nothing to eat. Find the baker\'s hidden pantry.',
      objectives: [OBJ('bread', 'Find the hidden pantry', COL('pantry_bread')), OBJ('give', 'Bring the bread to Marta', F('bread_resolved'), { after: ['bread'] })],
      reward: { xp: 60 }, onComplete: [rl('tamsin', 2)],
    },
    {
      id: 's1_debt', title: 'The Collector\'s Offer', type: 'side', region: 'ashen_village', chapter: 1,
      summary: 'Jorin Pike wants the Valcrest signet. What you do with your name will follow you.',
      objectives: [OBJ('decide', 'Decide what to do with the signet', F('jorin_resolved'))], reward: { xp: 50 },
    },
    {
      id: 'e1_memories', title: 'Ash Memories', type: 'exploration', region: 'ashen_village', chapter: 1, autoStart: CNT('col_hearth_', 1),
      summary: 'Hearth tokens hang in the ruins, one for every family of Hearthmere.',
      objectives: [OBJ('tokens', 'Collect the hearth tokens', CNT('col_hearth_', 5), { progress: { prefix: 'col_hearth_', n: 5 } })],
      reward: { xp: 150, keys: [{ id: 'hearthstone_charm' }], items: [{ id: 'charm_hearthstone', n: 1 }] }, onComplete: [fl('village_hope'), rl('tamsin', 4)],
    },
    {
      id: 'h1_well', title: 'What the Well Remembers', type: 'hidden', region: 'ashen_village', chapter: 1, hiddenUntilStarted: true, autoStart: COL('well_key'),
      summary: 'A rusted key, and a well that has no water. Aren\'s mother left something where fire cannot reach.',
      objectives: [OBJ('well', 'Examine the old well', INT('old_well')), OBJ('path', 'Open the way below', F('path_well_cellar'), { after: ['well'] }), OBJ('frag', 'Find the hidden cache', COL('frag_1'), { after: ['path'] })],
      reward: { xp: 250 }, onComplete: [fl('knows_king_innocence_hint')],
    },
  ],

  collectibles: [
    ...[1, 2, 3, 4, 5].map(i => COLL(`hearth_${i}`, 'ashen_village', 'token', `Hearth Token ${i}`, ['A carved bell.', 'A child\'s wooden horse.', 'A blackened wedding ring.', 'A strip of apron cloth.', 'A baker\'s mark.'][i - 1])),
    COLL('valcrest_blade', 'ashen_village', 'relic', 'Valcrest Blade', 'Your sword, scorched but sound. The pommel still bears the sun of your house.', [key('valcrest_blade')]),
    COLL('pantry_bread', 'ashen_village', 'key', 'Hidden Bread Sack', 'Twelve loaves, wrapped in cloth and honest hope.', [key('bread_sack')]),
    COLL('well_key', 'ashen_village', 'key', 'Rusted Well Key', 'Your mother\'s key, hung where the wind would not tarnish it.'),
    COLL('child_drawing', 'ashen_village', 'lore', 'Child\'s Drawing', 'A crayon knight beside a tall tree. Beneath: "Aren will come back."'),
    COLL('frag_1', 'ashen_village', 'testament', 'Testament Fragment I', 'A page in King Aldric\'s hand: "Should I die at the Feast, know it was not by Aren\'s hand. Trust the one I would not name."'),
  ],

  pois: [
    { id: 'village_square', region: 'ashen_village', level: 'ashen_village_main', name: 'Hearthmere Square', kind: 'camp', x: 1250, y: 700, fastTravel: true, description: 'A cracked fountain; survivors gather here after dark.' },
    { id: 'forge_yard', region: 'ashen_village', level: 'ashen_village_main', name: 'The Cold Forge', kind: 'landmark', x: 2000, y: 700, description: 'The only chimney left standing.' },
    { id: 'manor_ruins', region: 'ashen_village', level: 'ashen_village_main', name: 'Valcrest Manor Ruins', kind: 'landmark', x: 2450, y: 700, description: 'The house that was Aren\'s, now rafters against the sky.' },
    { id: 'cellar_vault', region: 'ashen_village', level: 'ashen_village_cellars', name: 'The Mother\'s Cache', kind: 'secret', x: 2150, y: 560, description: 'A hidden chamber below the old well.', hiddenUntilDiscovered: true },
  ],

  storyEvents: [
    { id: 'ev_opening', zone: 'start_wake', dialogue: 'd_opening' },
    { id: 'ev_hobb', zone: 'hobb_arena', dialogue: 'd_hobb_pre', when: Q('m1_embers', 'active') },
    { id: 'ev_burn_order', auto: INT('burn_order'), dialogue: 'd_burn_order' },
    { id: 'ev_tamsin_join', auto: AND(INT('burn_order'), COMP('tamsin', 'unmet')), dialogue: 'd_tamsin_join' },
  ],
};
// unused imports guard for strict builds
void K; void R;
