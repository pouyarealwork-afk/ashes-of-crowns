import type { RegionContent } from '../../types';
import { AND, ATM, C, CH, CNT, COL, COLL, COMP, CUT, F, INT, KILL, N, NOT, OBJ, P, Q, R, T, TALKED, ZONE, chap, fl, key, qs, rec, reward, rl, unlock, vr, rect } from '../dsl';

export const frozenHighlands: RegionContent = {
  region: {
    id: 'frozen_highlands', name: 'Frozen Highlands', chapter: 4, tagline: 'Oaths are all that do not freeze.',
    description: 'Clans of Stormhold guard the Howling Pass; Ironwatch, the old war-fort of Saltmarch, holds the road to the Hollow City.',
    entryLevel: 'frozen_highlands_main', mapPos: { x: 0.68, y: 0.3 },
    connections: [{ to: 'forgotten_desert' }, { to: 'hollow_city', requires: Q('m4_oath') }],
  },

  levels: [
    {
      id: 'frozen_highlands_main', region: 'frozen_highlands', name: 'The Howling Pass', size: { w: 7400, h: 1200 },
      atmosphere: ATM({ palette: { sky: '#b9d3e6', mid: '#6f8fae', fore: '#1e2c3d', accent: '#e8f4ff' }, weather: 'blizzard', light: 'dawn', music: 'frozen_highlands_theme', ambience: ['wind_howl_hard', 'ice_creak', 'distant_horn'], particles: 'snow_driven', notes: 'Pale blue and white, stark shadows, red clan banners as the only warm colour. Aurora at night.' }),
      spawns: { start: { x: 120, y: 980 }, from_desert: { x: 120, y: 980 }, from_ironwatch: { x: 5600, y: 980 }, from_hollow: { x: 7200, y: 980 } },
      platforms: [
        P(0, 1040, 1300, 160, 'ground'), P(1500, 1040, 1200, 160, 'ground'), P(2900, 1040, 1200, 160, 'ground'), P(4300, 1040, 1300, 160, 'ground'), P(5800, 1040, 1600, 160, 'ground'),
        P(400, 920, 240, 24, 'ice'), P(800, 800, 240, 24, 'ice'), P(1200, 700, 220, 24, 'oneway'), P(1700, 900, 260, 24, 'stone'), P(2100, 780, 240, 24, 'ice'),
        P(2450, 660, 260, 24, 'stone'), P(3100, 880, 240, 24, 'ice'), P(3500, 760, 240, 24, 'ice'), P(3900, 620, 260, 24, 'stone'), P(4500, 860, 260, 24, 'oneway'),
        P(4900, 720, 240, 24, 'ice'), P(5300, 600, 300, 24, 'stone'), P(6000, 880, 260, 24, 'ice'), P(6400, 740, 260, 24, 'ice'), P(6800, 620, 300, 24, 'stone'),
      ],
      hazards: [
        { type: 'frostwind', rect: rect(2700, 600, 200, 440), damage: 2, note: 'pushes player left; freezing meter' }, { type: 'crevasse', rect: rect(1300, 1160, 200, 40), damage: 999 },
        { type: 'crevasse', rect: rect(4100, 1160, 200, 40), damage: 999 }, { type: 'avalanche', rect: rect(3500, 300, 800, 740), damage: 20, note: 'triggers once bell_3 is not rung (see s4_bell)' },
      ],
      enemies: [
        { type: 'frost_wolf', x: 900, y: 1000, patrol: [600, 1200] }, { type: 'ice_wraith', x: 2000, y: 1000, patrol: [1600, 2600] }, { type: 'crown_scout', x: 3300, y: 1000, patrol: [3000, 3900] },
        { type: 'frost_wolf', x: 4600, y: 1000, patrol: [4400, 5300], elite: true }, { type: 'ironwatch_guard', x: 6200, y: 1000, patrol: [5900, 6900] },
      ],
      npcs: [
        { npc: 'brannoch', x: 700, y: 1000, when: COMP('brannoch', 'unmet') }, { npc: 'dagny', x: 2300, y: 1000 }, { npc: 'ketil', x: 3600, y: 1000 }, { npc: 'hallgerd', x: 5000, y: 1000 },
      ],
      collectibles: [
        { id: 'cairn_1', x: 1250, y: 660 }, { id: 'cairn_2', x: 2500, y: 620 }, { id: 'cairn_3', x: 3950, y: 580 }, { id: 'cairn_4', x: 5350, y: 560 }, { id: 'cairn_5', x: 6850, y: 580 },
        { id: 'ketil_rune', x: 3950, y: 580 }, { id: 'ration_crate', x: 2100, y: 740 }, { id: 'saltmarch_letters', x: 6900, y: 1000 },
      ],
      hiddenPaths: [{ id: 'saltmarch_cave', level: 'frozen_highlands_main', rect: rect(6850, 900, 200, 140), hint: 'The ice wall hums where Ketil\'s rune is held against it.', reveal: AND(COL('ketil_rune'), INT('ice_wall')) }],
      zones: [{ id: 'stormhold', rect: rect(4800, 800, 600, 240) }, { id: 'frozen_caravan', rect: rect(2100, 800, 500, 240) }, { id: 'bell_tower', rect: rect(3500, 560, 700, 480) }, { id: 'ironwatch_approach', rect: rect(5600, 800, 200, 240) }],
      interactables: [
        { id: 'bell_1', x: 1250, y: 660, label: 'Avalanche bell' }, { id: 'bell_2', x: 2500, y: 620, label: 'Avalanche bell' }, { id: 'bell_3', x: 3950, y: 580, label: 'Avalanche bell' }, { id: 'ice_wall', x: 6900, y: 1000, label: 'Whispering ice' },
      ],
      exits: [
        { id: 'to_desert', rect: rect(0, 900, 80, 140), to: { level: 'forgotten_desert_main', spawn: 'from_highlands' } },
        { id: 'to_ironwatch', rect: rect(5700, 900, 80, 140), to: { level: 'frozen_highlands_ironwatch', spawn: 'start' }, requires: F('highland_oath'), lockedText: 'Hallgerd\'s warriors bar the pass until the clans swear.' },
        { id: 'to_hollow', rect: rect(7300, 900, 100, 140), to: { level: 'hollow_city_main', spawn: 'from_highlands' }, requires: Q('m4_oath'), lockedText: 'Ironwatch still holds the road below.' },
      ],
      lore: [
        { id: 'l4_remains', kind: 'remains', x: 1500, y: 1000, text: 'A frozen warhorse, still saddled. A lancer\'s banner, snapped. Crown colours.' },
        { id: 'l4_mural', kind: 'mural', x: 3000, y: 900, text: 'Clan runes: "The Southern King took our sons for Saltmarch. He sent back medals."' },
        { id: 'l4_grave', kind: 'grave', x: 5100, y: 1000, text: 'A cairn for the Northern Company, 800 names. Someone has etched "BAITED" over the stone, then scraped it.' },
      ],
    },
    {
      id: 'frozen_highlands_ironwatch', region: 'frozen_highlands', name: 'Ironwatch Fortress', size: { w: 4400, h: 1000 },
      atmosphere: ATM({ palette: { sky: '#2b3445', mid: '#505e75', fore: '#10141c', accent: '#ff7d3a' }, weather: 'blizzard', light: 'dusk', music: 'ironwatch_siege', ambience: ['wind_howl', 'forge_far', 'chain_rattle'], particles: 'snow_driven', notes: 'Black iron ramparts, braziers, snow on the stone. Crown standards torn by wind.' }),
      spawns: { start: { x: 120, y: 820 }, from_boss: { x: 3900, y: 820 } },
      platforms: [P(0, 880, 1200, 120, 'metal'), P(1400, 880, 1100, 120, 'metal'), P(2700, 880, 1700, 120, 'metal'), P(300, 740, 260, 24, 'metal'), P(700, 620, 260, 24, 'oneway'), P(1200, 760, 160, 24, 'crumble'), P(1650, 720, 260, 24, 'metal'), P(2000, 580, 260, 24, 'oneway'), P(2550, 760, 160, 24, 'crumble'), P(3000, 700, 260, 24, 'metal')],
      hazards: [{ type: 'brazier_fire', rect: rect(900, 860, 100, 20), damage: 8 }, { type: 'pit', rect: rect(1200, 980, 200, 20), damage: 999 }, { type: 'pit', rect: rect(2500, 980, 200, 20), damage: 999 }],
      enemies: [{ type: 'ironwatch_guard', x: 700, y: 840, patrol: [400, 1100] }, { type: 'crossbow_sentry', x: 1900, y: 840, patrol: [1500, 2400] }, { type: 'ironwatch_guard', x: 2800, y: 840, patrol: [2700, 3300], elite: true }, { type: 'captain_voss', x: 3800, y: 820, boss: 'voss' }],
      npcs: [], collectibles: [{ id: 'frag_4', x: 4200, y: 840 }], hiddenPaths: [],
      zones: [{ id: 'ironwatch_gate', rect: rect(0, 700, 200, 180) }, { id: 'voss_arena', rect: rect(3300, 700, 1000, 180) }], interactables: [],
      exits: [{ id: 'out', rect: rect(0, 760, 80, 120), to: { level: 'frozen_highlands_main', spawn: 'from_ironwatch' } }],
      lore: [{ id: 'l4i_order', kind: 'letter', x: 1800, y: 840, text: 'Order to Captain Voss: "Hold the Pass. Allow no clan courier or royal rider south. —V.M." The ink is brown with age.' }],
    },
  ],

  npcs: [
    { id: 'brannoch', name: 'Brannoch "Grim"', region: 'frozen_highlands', role: 'Veteran / Companion', description: 'Saltmarch veteran. Aren thought him dead.', portrait: 'portrait_brannoch', sprite: 'npc_brannoch', companion: 'brannoch',
      dialogue: [{ when: Q('c_brannoch', 'active'), tree: 'd_brannoch_muster' }, { when: COMP('brannoch', 'recruited'), tree: 'd_brannoch_camp' }, { tree: 'd_brannoch_meet' }] },
    { id: 'hallgerd', name: 'Hallgerd Stormborn', region: 'frozen_highlands', role: 'Clan Chief', description: 'Wary chief who has not trusted a southerner since Saltmarch.', portrait: 'portrait_hallgerd', sprite: 'npc_hallgerd', dialogue: [{ when: F('highland_oath'), tree: 'd_hallgerd_after' }, { tree: 'd_hallgerd' }] },
    { id: 'ketil', name: 'Old Ketil', region: 'frozen_highlands', role: 'Skald & Bell-Warden', description: 'Keeps the avalanche bells and the old songs.', portrait: 'portrait_ketil', sprite: 'npc_ketil', dialogue: [{ tree: 'd_ketil' }] },
    { id: 'dagny', name: 'Dagny', region: 'frozen_highlands', role: 'Stranded Merchant', description: 'Her caravan froze at the pass. She keeps the last fire.', portrait: 'portrait_dagny', sprite: 'npc_dagny', dialogue: [{ tree: 'd_dagny' }] },
  ],

  dialogues: [
    T('d_brannoch_meet', 'brannoch', 'a', {
      a: N('brannoch', 'Valcrest. Ha! Ghosts don\'t hurt like that. I held the left at Saltmarch while you took the credit and the Southern King\'s kiss. Do you recall my name?', { mood: 'rough', choices: [
        C('"Brannoch. Sergeant of the Northern Company. You were the only man who told me to stay low."', 'b', { tags: ['honest', 'loyal'], effects: [rl('brannoch', 6)] }),
        C('"I remember the battle. Not every face."', 'b', { tags: ['distance'], effects: [rl('brannoch', -3)] })] }),
      b: N('brannoch', 'Darken ordered us to leave you. I... didn\'t. That\'s a lie I\'ve carried for years. Let me walk with you; I\'ll say the rest when I can.', { effects: [fl('brannoch_hides_saltmarch')], choices: [
        C('"Welcome back, sergeant."', 'c', { tags: ['loyal'], effects: [rl('brannoch', 4)] }),
        C('"Don\'t lie to me again."', 'c', { tags: ['justice'], effects: [vr('honor', 1)] })] }),
      c: N('brannoch', 'Heh. Aye, aye.', { effects: [rec('brannoch')] }),
    }),
    T('d_brannoch_camp', 'brannoch', 'a', {
      a: N('brannoch', 'Cold is just a rumour for men with warm hearts. What is it, lad?', { variants: [{ when: R('brannoch', '>=', 60), text: 'You\'re the nearest thing to family I\'ve got, you know.' }], choices: [C('"Tell me about the Northern Company."', 'b'), C('"Nothing. Rest."')] }),
      b: N('brannoch', 'Eight hundred men. Ate one pot of stew from one pot. When the horns went they were gone before the stew went cold.', { effects: [rl('brannoch', 2)] }),
    }),
    T('d_hallgerd', 'hallgerd', 'a', {
      a: N('hallgerd', 'A southern name, a Crown\'s brand and a pretty sword. Why should the clans open Stormhold to you?', { mood: 'hard', choices: [
        C('"Because the Crown did to my village what it did to your sons."', 'honor', { tags: ['honest'], effects: [vr('honor', 2), fl('oath_honor')] }),
        C('"When I\'m king, the Highlands will govern themselves." ', 'ambition', { tags: ['ambition'], effects: [vr('ambition', 2), fl('oath_ambition'), fl('promised_highlands')] }),
        C('"Free the Crown scouts you hold, unharmed. Let me show you what I am."', 'mercy', { tags: ['mercy'], effects: [vr('mercy', 2), fl('oath_mercy')] }),
        C('"The Greenwatch vouch for me."', 'forest', { when: F('forest_pact'), tags: ['trust'], effects: [vr('trust', 2), fl('oath_trust')] })] }),
      honor: N('hallgerd', 'Words. But true ones. The clans will watch you.', { effects: [fl('highland_oath'), reward({ xp: 200 })] }),
      ambition: N('hallgerd', 'Kings promise. Most break. I will hold you to it, southerner.', { effects: [fl('highland_oath'), reward({ xp: 200 })] }),
      mercy: N('hallgerd', 'Mercy is rare in the south. Very well.', { effects: [fl('highland_oath'), reward({ xp: 200 }), rl('brannoch', 2)] }),
      forest: N('hallgerd', 'The Greenwatch do not vouch lightly. Pass, Valcrest.', { effects: [fl('highland_oath'), reward({ xp: 200 })] }),
    }),
    T('d_hallgerd_after', 'hallgerd', 'a', { a: N('hallgerd', 'Ironwatch lies below. Voss will not yield. The Northern dead watch you.', { variants: [{ when: F('promised_highlands'), text: 'Remember what you promised, southerner. Mountains remember.' }] }) }),
    T('d_ketil', 'ketil', 'a', {
      a: N('ketil', 'Three bells hang along the pass. Ring them in order and the snow-shelves fall away from Stormhold. I am too old to climb.', { variants: [{ when: Q('s4_bell', 'completed'), text: 'The song of the bells is in your debt.' }], choices: [
        C('"I\'ll ring them."', 'ok', { when: NOT(F('bell_resolved')), tags: ['mercy'], effects: [qs('s4_bell')] }), C('"Not my fight."', undefined, { when: NOT(F('bell_resolved')) })] }),
      ok: N('ketil', 'Good. The third, at the tower\'s peak, will warn Ironwatch too. Choose well which of those bells you ring.'),
      third: N('ketil', 'All three? Then the question: the third bell warns Ironwatch\'s garrison of the avalanche. Did you ring it?', { choices: [
        C('"I rang it. Even the Crown\'s men deserve a warning."', 'warned', { tags: ['mercy'], effects: [vr('mercy', 2), vr('honor', 1), fl('bell_resolved'), fl('ironwatch_warned')] }),
        C('"I left it. Let the snow take Ironwatch\'s outer wall."', 'silent', { tags: ['ruthless'], effects: [vr('mercy', -2), vr('ambition', 1), fl('bell_resolved'), fl('ironwatch_weakened')] })] }),
      warned: N('ketil', 'Honour, even for those who don\'t keep it. The mountain will remember.', { effects: [reward({ xp: 140 })] }),
      silent: N('ketil', 'Hm. A hard choice. The bells will remember that too.', { mood: 'cold', effects: [reward({ xp: 100 })] }),
      done: N('ketil', 'Ring true, Valcrest.'),
    }, { entries: [{ when: AND(Q('s4_bell', 'active'), CNT('int_bell_', 3), NOT(F('bell_resolved'))), node: 'third' }, { when: F('bell_resolved'), node: 'done' }] }),
    T('d_dagny', 'dagny', 'a', {
      a: N('dagny', 'My caravan froze at the pass. We have one crate of rations left. The clans won\'t trade with southern merchants. Can you carry it to Stormhold?', { variants: [{ when: F('caravan_resolved'), text: 'Warmer already. Thank you.' }], choices: [
        C('"I\'ll take it."', 'ok', { when: NOT(F('caravan_resolved')), tags: ['mercy'], effects: [qs('s4_caravan')] }), C('"Sorry."', undefined, { when: NOT(F('caravan_resolved')) })] }),
      ok: N('dagny', 'It\'s in the sleigh beyond the second cairn. Please hurry.'),
      deliver: N('dagny', 'You have the crate! What now?', { choices: [
        C('"Share with your people. All of it."', 'share', { tags: ['mercy'], effects: [vr('mercy', 2), fl('caravan_shared'), fl('caravan_resolved'), rl('brannoch', 3)] }),
        C('"Trade the rations to Hallgerd for passage."', 'trade', { tags: ['pragmatic'], effects: [vr('ambition', 1), fl('caravan_traded'), fl('caravan_resolved')] }),
        C('"I\'ll keep half. The pass costs men supplies."', 'keep', { tags: ['greed'], effects: [vr('mercy', -1), vr('ambition', 1), fl('caravan_resolved')] })] }),
      share: N('dagny', 'We\'ll live. You are a better man than the songs said.', { effects: [reward({ xp: 120, gold: 40 })] }),
      trade: N('dagny', 'Cold math. I understand it.', { effects: [reward({ xp: 80, gold: 100 })] }),
      keep: N('dagny', 'Of course. Winters make saints of no one.', { effects: [reward({ xp: 40, gold: 20 })] }),
      done: N('dagny', 'Warmer already.'),
    }, { entries: [{ when: AND(Q('s4_caravan', 'active'), COL('ration_crate'), NOT(F('caravan_resolved'))), node: 'deliver' }, { when: F('caravan_resolved'), node: 'done' }] }),
    CUT('d_voss_pre', 'a', {
      a: N('voss', 'Aren Valcrest! The Chancellor said you\'d come. He said you\'d bring the clans, too. He is rarely wrong.', { mood: 'cold', effects: [fl('voss_named_chancellor')], next: 'b' }),
      b: N('aren', 'Chancellor Morrow, not Darken?', { next: 'c' }),
      c: N('voss', 'Darken is a hound. The Chancellor holds the leash. Guards — the traitor cannot pass.', { mood: 'cruel' }),
    }),
    CUT('d_saltmarch_truth', 'a', {
      a: N('narrator', 'A frozen satchel. Letters addressed from Darken to the old Crown Marshal: the Northern Company\'s withdrawal was ordered. "Aren shall hold the centre. The north is expendable. History will not ask where the glory was bought."', { next: 'b' }),
      b: N('aren', 'He gave me my legend and buried eight hundred men under it.', { mood: 'grim', effects: [fl('learned_saltmarch_truth'), vr('trust', -1)], choices: [
        C('"He was ordered. Maybe he hated it."', 'c', { tags: ['mercy'], effects: [vr('mercy', 1)] }),
        C('"Every cairn is his to answer for."', 'd', { tags: ['justice'], effects: [vr('honor', 1)] }),
        C('"Then I\'ll use this." (keep the letters as leverage)', 'e', { tags: ['ruthless'], effects: [vr('ambition', 1), fl('saltmarch_leverage')] })] }),
      c: N('aren', 'Maybe he hated it. I\'ll ask him when I find him.'),
      d: N('aren', 'No orders erase that.'),
      e: N('aren', 'Truth is a weapon. I intend to learn how to hold it.'),
    }),
  ],

  quests: [
    {
      id: 'm4_oath', title: 'Oath of the Pass', type: 'main', region: 'frozen_highlands', chapter: 4, requires: Q('m3_bearer'), autoStart: CH(4),
      summary: 'The Highland clans guard the Howling Pass. Win their oath, then break Ironwatch\'s hold and recover the royal courier ring.',
      objectives: [
        OBJ('stormhold', 'Reach Stormhold', ZONE('stormhold')),
        OBJ('oath', 'Win Hallgerd\'s oath', F('highland_oath'), { after: ['stormhold'] }),
        OBJ('gate', 'Approach Ironwatch', ZONE('ironwatch_gate'), { after: ['oath'] }),
        OBJ('voss', 'Defeat Captain Voss', KILL('voss'), { after: ['gate'] }),
        OBJ('ring', 'Recover the royal courier ring', COL('frag_4'), { after: ['voss'] }),
      ],
      reward: { xp: 700, gold: 150 }, onComplete: [unlock('hollow_city'), chap(5), fl('ch4_done')],
    },
    {
      id: 's4_caravan', title: 'The Frozen Caravan', type: 'side', region: 'frozen_highlands', chapter: 4,
      summary: 'Dagny\'s caravan needs rations carried to Stormhold.',
      objectives: [OBJ('crate', 'Recover the ration crate', COL('ration_crate')), OBJ('hand', 'Decide where the rations go', F('caravan_resolved'), { after: ['crate'] })],
      reward: { xp: 80 },
    },
    {
      id: 's4_bell', title: 'The Avalanche Bell', type: 'side', region: 'frozen_highlands', chapter: 4,
      summary: 'Ring the three avalanche bells along the pass for Ketil.',
      objectives: [OBJ('bells', 'Ring the avalanche bells', CNT('int_bell_', 3), { progress: { prefix: 'int_bell_', n: 3 } }), OBJ('report', 'Report to Ketil', F('bell_resolved'), { after: ['bells'] })],
      reward: { xp: 100 },
    },
    {
      id: 'e4_cairns', title: 'Aurora Cairns', type: 'exploration', region: 'frozen_highlands', chapter: 4, autoStart: CNT('col_cairn_', 1),
      summary: 'Five cairns mark the Northern Company\'s march. Honour each.',
      objectives: [OBJ('cairns', 'Honour the cairns', CNT('col_cairn_', 5), { progress: { prefix: 'col_cairn_', n: 5 } })],
      reward: { xp: 180, items: [{ id: 'charm_cairn', n: 1 }], keys: [{ id: 'northern_banner' }] }, onComplete: [rl('brannoch', 5), vr('honor', 1)],
    },
    {
      id: 'h4_saltmarch', title: 'The Saltmarch Letters', type: 'hidden', region: 'frozen_highlands', chapter: 4, hiddenUntilStarted: true, autoStart: COL('ketil_rune'),
      summary: 'Ketil\'s rune hums against the ice wall. Something is sealed inside.',
      objectives: [OBJ('wall', 'Touch the whispering ice', INT('ice_wall')), OBJ('cave', 'Open the ice cave', F('path_saltmarch_cave'), { after: ['wall'] }), OBJ('letters', 'Recover the letters', COL('saltmarch_letters'), { after: ['cave'] })],
      reward: { xp: 300 },
    },
  ],

  collectibles: [
    ...[1, 2, 3, 4, 5].map(i => COLL(`cairn_${i}`, 'frozen_highlands', 'token', `Cairn Stone ${i}`, ['A boot-heel, frozen in clay.', 'A pewter spoon.', 'A name scratched with a dagger: "Haldor".', 'A letter folded into a tiny square.', 'A child\'s wooden sword, left for a father.'][i - 1])),
    COLL('ketil_rune', 'frozen_highlands', 'key', 'Ketil\'s Rune', 'A bone rune that hums against old ice.'),
    COLL('ration_crate', 'frozen_highlands', 'resource', 'Ration Crate', 'Salt fish, dark bread and one jar of honey.'),
    COLL('saltmarch_letters', 'frozen_highlands', 'lore', 'The Saltmarch Letters', 'Orders, seals and one letter that Darken never sent.'),
    COLL('frag_4', 'frozen_highlands', 'testament', 'Testament Fragment IV', 'The royal courier ring, with a rolled message inside: "Morrow wants the Crown\'s heir bound before I die. I refuse. Find Elen — Darken\'s daughter — held below."'),
  ],

  pois: [
    { id: 'stormhold', region: 'frozen_highlands', level: 'frozen_highlands_main', name: 'Stormhold', kind: 'settlement', x: 5100, y: 980, fastTravel: true, description: 'A clan hall of black timber and warm firelight.' },
    { id: 'frozen_caravan', region: 'frozen_highlands', level: 'frozen_highlands_main', name: 'Frozen Caravan', kind: 'camp', x: 2300, y: 980, description: 'Wagons half-buried in snow.' },
    { id: 'bell_tower', region: 'frozen_highlands', level: 'frozen_highlands_main', name: 'The Bell Tower', kind: 'landmark', x: 3800, y: 980, description: 'A stone tower with three tolling bells.' },
    { id: 'ironwatch_approach', region: 'frozen_highlands', level: 'frozen_highlands_main', name: 'Ironwatch Approach', kind: 'landmark', x: 5700, y: 980, description: 'The black walls of Saltmarch\'s old fortress.' },
  ],

  storyEvents: [
    { id: 'ev_voss_pre', zone: 'voss_arena', dialogue: 'd_voss_pre' },
    { id: 'ev_saltmarch_truth', auto: COL('saltmarch_letters'), dialogue: 'd_saltmarch_truth' },
  ],
};
void TALKED; void CUT; void key;
