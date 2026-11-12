import type { RegionContent } from '../../types';
import { AND, ATM, C, CH, CNT, COL, COLL, CUT, F, INT, KILL, N, NOT, OBJ, OR, P, Q, T, ZONE, emit, fl, qs, reward, rl, vr, rect, V } from '../dsl';
import { REVEAL_REQ, TRUE_KING_REQ } from '../conditions';

export const crownfall: RegionContent = {
  region: {
    id: 'crownfall', name: 'Crownfall', chapter: 6, tagline: 'Every crown ends as ash. The question is whose.',
    description: 'The capital, besieged from within by the Chancellor\'s Hushed and burning from the Crown\'s unleashed hunger.',
    entryLevel: 'crownfall_main', mapPos: { x: 0.9, y: 0.2 }, connections: [{ to: 'hollow_city' }],
  },

  levels: [
    {
      id: 'crownfall_main', region: 'crownfall', name: 'The Burning Avenue', size: { w: 7000, h: 1200 },
      atmosphere: ATM({ palette: { sky: '#3a1712', mid: '#7a2c1c', fore: '#150605', accent: '#ffb347' }, weather: 'embers', light: 'dusk', music: 'crownfall_theme', ambience: ['fire_roar', 'distant_horns', 'collapse_far'], particles: 'embers_rising', notes: 'A cathedral skyline in flames, banners of every house torn and burning. Rich oranges and golds against soot.' }),
      spawns: { start: { x: 120, y: 1000 }, from_hollow: { x: 120, y: 1000 }, from_palace: { x: 6000, y: 1000 } },
      platforms: [
        P(0, 1060, 1300, 140, 'stone'), P(1500, 1060, 1100, 140, 'stone'), P(2800, 1060, 1300, 140, 'stone'), P(4300, 1060, 1300, 140, 'stone'), P(5800, 1060, 1200, 140, 'stone'),
        P(400, 940, 240, 24, 'wood'), P(800, 820, 260, 24, 'oneway'), P(1250, 960, 240, 24, 'crumble'), P(1700, 900, 260, 24, 'stone'), P(2100, 780, 260, 24, 'wood'),
        P(2600, 940, 240, 24, 'crumble'), P(3000, 880, 260, 24, 'stone'), P(3400, 740, 260, 24, 'oneway'), P(3800, 620, 260, 24, 'stone'), P(4200, 880, 240, 24, 'crumble'),
        P(4600, 800, 260, 24, 'wood'), P(5000, 680, 260, 24, 'oneway'), P(5500, 920, 240, 24, 'crumble'), P(6100, 820, 300, 24, 'stone'),
      ],
      hazards: [
        { type: 'fire', rect: rect(1300, 1040, 200, 20), damage: 10 }, { type: 'fire', rect: rect(2600, 1040, 200, 20), damage: 10 },
        { type: 'falling_masonry', rect: rect(3600, 300, 800, 760), damage: 15, note: 'timed drops' }, { type: 'fire', rect: rect(5600, 1040, 200, 20), damage: 10 },
      ],
      enemies: [
        { type: 'hushed_guard', x: 900, y: 1020, patrol: [500, 1300] }, { type: 'royal_champion', x: 2200, y: 1020, patrol: [1700, 2700], elite: true }, { type: 'hollow_shade', x: 3300, y: 1020, patrol: [2900, 4000] },
        { type: 'hushed_guard', x: 4700, y: 1020, patrol: [4400, 5400] }, { type: 'royal_champion', x: 5900, y: 1020, patrol: [5800, 6600], elite: true },
      ],
      npcs: [{ npc: 'ines', x: 800, y: 1020 }, { npc: 'alwen', x: 3000, y: 1020 }],
      collectibles: [
        { id: 'banner_1', x: 500, y: 900 }, { id: 'banner_2', x: 1800, y: 860 }, { id: 'banner_3', x: 3500, y: 700 }, { id: 'banner_4', x: 5050, y: 640 }, { id: 'banner_5', x: 6150, y: 780 },
        { id: 'regalia', x: 4700, y: 760 },
      ],
      hiddenPaths: [{ id: 'kings_room', level: 'crownfall_main', rect: rect(6700, 900, 200, 160), hint: 'Five torn banners, a portrait of the King, and a door behind the tapestry.', reveal: AND(CNT('col_banner_', 5), INT('king_portrait')), leadsTo: { level: 'crownfall_kings_room', spawn: 'start' } }],
      zones: [{ id: 'lower_ward', rect: rect(500, 900, 600, 160) }, { id: 'armory_yard', rect: rect(2900, 900, 400, 160) }, { id: 'palace_gate', rect: rect(6200, 900, 400, 160) }],
      interactables: [
        { id: 'evac_1', x: 1000, y: 1020, label: 'Evacuation gate' }, { id: 'evac_2', x: 1800, y: 1020, label: 'Evacuation gate' }, { id: 'evac_3', x: 2500, y: 1020, label: 'Evacuation gate' },
        { id: 'armory_chest', x: 3100, y: 1020, label: 'Royal armory chest' }, { id: 'king_portrait', x: 6750, y: 1000, label: 'Portrait of King Aldric' },
      ],
      exits: [
        { id: 'to_hollow', rect: rect(0, 900, 80, 160), to: { level: 'hollow_city_main', spawn: 'from_crownfall' } },
        { id: 'to_kings_room', rect: rect(6700, 900, 200, 160), to: { level: 'crownfall_kings_room', spawn: 'start' }, requires: F('path_kings_room'), lockedText: 'Only a tapestry.' },
        { id: 'to_palace', rect: rect(6900, 900, 100, 160), to: { level: 'crownfall_throne', spawn: 'start' }, requires: ZONE('palace_gate'), lockedText: 'The palace gate has not been reached.' },
      ],
      lore: [
        { id: 'l6_grave', kind: 'grave', x: 1500, y: 1020, text: 'Hastily dug graves with Crown-guard helmets and tradesmen\'s aprons side by side.' },
        { id: 'l6_sign', kind: 'sign', x: 3900, y: 1020, text: '"BY ORDER OF THE REGENT: THE KING IS WELL." The paper is two weeks old.' },
        { id: 'l6_mural', kind: 'mural', x: 5400, y: 900, text: 'A royal portrait: seven kings in a line. The eighth frame is cracked and empty, and someone has drawn a falcon in it.' },
      ],
    },
    {
      id: 'crownfall_throne', region: 'crownfall', name: 'The Hollow Throne', size: { w: 4200, h: 1100 },
      atmosphere: ATM({ palette: { sky: '#1a0a08', mid: '#51231a', fore: '#080303', accent: '#ffd36a' }, weather: 'embers', light: 'gloom', music: 'hollow_throne_boss', ambience: ['heartbeat_deep', 'crown_hum', 'crackle'], particles: 'embers_rising', notes: 'Cathedral throne hall, windows blown out, the Ember Crown floating over the throne with a molten heartbeat.' }),
      spawns: { start: { x: 120, y: 900 }, from_boss: { x: 3400, y: 900 } },
      platforms: [P(0, 960, 4200, 140, 'stone'), P(400, 820, 260, 24, 'oneway'), P(900, 700, 260, 24, 'stone'), P(1500, 820, 260, 24, 'oneway'), P(2000, 700, 260, 24, 'stone'), P(2500, 820, 260, 24, 'oneway'), P(3000, 700, 260, 24, 'stone')],
      hazards: [{ type: 'ember_burst', rect: rect(1200, 940, 300, 20), damage: 12, note: 'periodic from floor cracks' }],
      enemies: [{ type: 'royal_champion', x: 1000, y: 920, patrol: [500, 1500], elite: true }, { type: 'chancellor_morrow', x: 3400, y: 900, boss: 'morrow' }],
      npcs: [], collectibles: [], hiddenPaths: [],
      zones: [{ id: 'throne_hall', rect: rect(0, 800, 800, 160) }, { id: 'morrow_arena', rect: rect(2800, 800, 1300, 160) }], interactables: [],
      exits: [{ id: 'out', rect: rect(0, 820, 80, 140), to: { level: 'crownfall_main', spawn: 'from_palace' } }],
      lore: [{ id: 'l6t_letter', kind: 'letter', x: 2200, y: 920, text: 'Torn page: "...when the King\'s breath fails, the Crown seeks the nearest willing heart. I will be willing. —V.M."' }],
    },
    {
      id: 'crownfall_kings_room', region: 'crownfall', name: 'The King\'s Last Room', size: { w: 1800, h: 800 },
      atmosphere: ATM({ palette: { sky: '#241a14', mid: '#4a3524', fore: '#0e0906', accent: '#f3d9a0' }, weather: 'none', light: 'dusk', music: 'kings_last_room', ambience: ['clock_tick', 'candle'], particles: 'dust_motes', notes: 'A small, warm, hidden study: a king who wanted to be an ordinary man.' }),
      spawns: { start: { x: 100, y: 640 } }, platforms: [P(0, 700, 1800, 100, 'wood')], hazards: [], enemies: [], npcs: [],
      collectibles: [{ id: 'aldric_last_words', x: 1500, y: 660 }], hiddenPaths: [], zones: [], interactables: [],
      exits: [{ id: 'out', rect: rect(0, 600, 80, 100), to: { level: 'crownfall_main', spawn: 'from_palace' } }], lore: [],
    },
  ],

  npcs: [
    { id: 'ines', name: 'Mother Ines', region: 'crownfall', role: 'Refugee Elder', description: 'Leads the survivors of the Lower Ward.', portrait: 'portrait_ines', sprite: 'npc_ines', dialogue: [{ tree: 'd_ines' }] },
    { id: 'alwen', name: 'Ser Alwen', region: 'crownfall', role: 'Loyalist Captain', description: 'Last honest captain of the royal guard.', portrait: 'portrait_alwen', sprite: 'npc_alwen', dialogue: [{ tree: 'd_alwen' }] },
  ],

  dialogues: [
    T('d_ines', 'ines', 'a', {
      a: N('ines', 'The Hushed are burning the Lower Ward. Three evacuation gates on the avenue lead to the river. If you open them, my people live.', { variants: [{ when: F('evac_resolved'), text: 'The river took the sorrow with it. Thank you, King-who-was.' }], choices: [
        C('"I\'ll open them."', 'ok', { when: NOT(F('evac_resolved')), tags: ['mercy'], effects: [qs('s6_evac')] }), C('"The palace first."', undefined, { when: NOT(F('evac_resolved')) })] }),
      ok: N('ines', 'Quickly. The fire has a taste for the young.'),
      deliver: N('ines', 'They\'re open. Thousands will cross. But the guards at the river still hold. Will you escort us?', { choices: [
        C('"I\'ll see you to the river."', 'all', { tags: ['mercy', 'honest'], effects: [vr('mercy', 2), vr('honor', 1), vr('trust', 1), fl('evac_all'), fl('evac_resolved')] }),
        C('"Go. I must reach the palace before it\'s too late."', 'partial', { tags: ['pragmatic'], effects: [vr('ambition', 1), fl('evac_partial'), fl('evac_resolved')] })] }),
      all: N('ines', 'Every one of them will tell their grandchildren your name.', { effects: [reward({ xp: 200 }), rl('tamsin', 3), rl('sylwen', 3)] }),
      partial: N('ines', 'You are needed elsewhere. Go.', { effects: [reward({ xp: 100 })] }),
    }, { entries: [{ when: AND(Q('s6_evac', 'active'), CNT('int_evac_', 3), NOT(F('evac_resolved'))), node: 'deliver' }] }),
    T('d_alwen', 'alwen', 'a', {
      a: N('alwen', 'Valcrest. The King\'s armoury stands behind that gate. Chancellor Morrow\'s men don\'t have the key; I do.', { variants: [{ when: F('armory_resolved'), text: 'The militia is armed and ready. We will hold the Avenue.' }], choices: [
        C('"Arm the militia."', 'ok', { when: NOT(F('armory_resolved')), tags: ['loyal'], effects: [qs('s6_armory')] }), C('"Later."', undefined, { when: NOT(F('armory_resolved')) })] }),
      ok: N('alwen', 'The chest is in the yard. Open it and we will see who takes what.'),
      deliver: N('alwen', 'The chest is open. The royal regalia lies on top — circlet and scabbard. Who is it for?', { choices: [
        C('"The militia. Arm them with what you have."', 'militia', { tags: ['loyal', 'mercy'], effects: [vr('trust', 2), vr('honor', 1), fl('armory_militia'), fl('armory_resolved')] }),
        C('"I\'ll take the regalia. Every king needs symbols."', 'regalia', { tags: ['ambition'], effects: [vr('ambition', 2), vr('honor', -1), fl('took_regalia'), fl('armory_resolved')] })] }),
      militia: N('alwen', 'They will hold. For you, for the realm, for whatever comes.', { effects: [reward({ xp: 200 })] }),
      regalia: N('alwen', 'It looks well on you. I hope it does not feel too heavy.', { mood: 'wary', effects: [reward({ xp: 120 })] }),
    }, { entries: [{ when: AND(Q('s6_armory', 'active'), INT('armory_chest'), NOT(F('armory_resolved'))), node: 'deliver' }] }),
    CUT('d_morrow_pre', 'a', {
      a: N('morrow', 'Aren Valcrest. Dear boy. I counted on it: you would come, and the Crown would feel you coming. It likes a willing heart.', { mood: 'smooth', next: 'b' }),
      b: N('aren', 'You poisoned the King. You framed me. You held a child as a leash.', { next: 'c' }),
      c: N('morrow', 'I preserved a realm. The King was dying anyway; the Crown wanted a successor. Join me: I rule, you command the armies. No more running.', { mood: 'smooth', choices: [
        C('"Never."', 'd', { tags: ['honest'], effects: [vr('honor', 1)] }),
        C('"Perhaps. Show me the Crown."', 'e', { tags: ['deceit'], effects: [vr('ambition', 1), vr('trust', -1), fl('feigned_alliance')] })] }),
      d: N('morrow', 'Then you die as a legend. A pity.', { mood: 'cold' }),
      e: N('morrow', 'There\'s the man I hoped for. Come.', { mood: 'smug' }),
    }),
    CUT('d_darken_final', 'a', {
      a: N('narrator', 'Morrow\'s body is ash. Darken Holt kneels amid the embers, armour cracked, sword set aside.', { next: 'b' }),
      b: N('darken', 'Aren. I held the line for eight hundred men and sold them for your name. I held Elen\'s hand and let you hang. I do not ask forgiveness. Only that you hear.', { mood: 'broken',
        variants: [
          { when: F('elen_freed'), text: 'Elen is safe? Thank the Ember. Then you have given me my life back — and I do not deserve it. Hear me: I do not ask forgiveness.' },
          { when: F('elen_leverage'), text: 'You held her over me. You, Aren. I begged you never to become what I was. And here we are.' }],
        next: 'c' }),
      c: N('aren', 'Say it. All of it.', { effects: [fl('darken_faced')], next: 'fate' }),
      fate: N('darken', 'Whatever you decide, I will not resist.', { choices: [
        C('Run him through.', 'crown', { tags: ['ruthless'], effects: [vr('honor', -2), vr('mercy', -3), fl('darken_killed')] }),
        C('"You live. You will stand before the realm and testify."', 'crown', { tags: ['mercy', 'justice'], effects: [vr('mercy', 2), vr('honor', 1), fl('darken_spared')] }),
        C('"Your daughter is safe because of me. Stand at my side, and make it right."', 'crown', { when: OR(F('elen_freed'), F('elen_with_us')), tags: ['loyal'], effects: [vr('trust', 2), fl('darken_redeemed'), fl('darken_spared')] })] }),
      crown: N('narrator', 'The Ember Crown hangs above the throne, humming like a held breath. Whatever Aren does with it, the kingdom will remember.', { choices: [
        C('Take the Crown.', 'end', { tags: ['ambition'], effects: [vr('ambition', 3), fl('final_claim')] }),
        C('Accept the throne the people offer.', 'end', { when: TRUE_KING_REQ, tags: ['honor'], effects: [vr('honor', 1), fl('final_throne')] }),
        C('Break the Crown, using the Queen\'s rite.', 'end', { when: F('learned_unbind_rite'), tags: ['sacrifice'], effects: [vr('honor', 2), fl('final_destroy'), fl('unbind_clean')] }),
        C('Break the Crown by force.', 'end', { when: NOT(F('learned_unbind_rite')), tags: ['sacrifice'], effects: [vr('honor', 1), fl('final_destroy'), fl('aren_fell')] }),
        C('Show the realm the Testament and the truth.', 'end', { when: REVEAL_REQ, tags: ['honest'], effects: [vr('honor', 2), vr('trust', 1), fl('final_reveal')] }),
        C('Walk away.', 'end', { tags: ['distance'], effects: [fl('final_walk')] })] }),
      end: N('narrator', 'The Crown is decided. The story is now what others will say of it.', { effects: [fl('final_made'), { t: 'resolve_ending' }, emit('world:finale-complete')] }),
    }),
    CUT('d_kings_last_words', 'a', {
      a: N('narrator', 'A small study. A half-drunk cup. On the desk, in a failing hand: "Aren — if you read this, forgive my silence. I knew the Crown was killing me and the Chancellor was holding the cup. I chose to trust you rather than save myself. If you stand where I stood, remember it is not the Crown that rules. It is the heart beneath it."', { next: 'b' }),
      b: N('aren', 'You trusted me to the end.', { mood: 'soft', effects: [fl('aldric_blessing'), vr('honor', 1), vr('trust', 1)] }),
    }),
  ],

  quests: [
    {
      id: 'm6_crown', title: 'Ash and Crown', type: 'main', region: 'crownfall', chapter: 6, requires: Q('m5_heart'), autoStart: CH(6),
      summary: 'The Chancellor holds the Ember Crown. Fight through the burning capital, face Darken, and decide the fate of the realm.',
      objectives: [
        OBJ('gate', 'Reach the palace gate', ZONE('palace_gate')),
        OBJ('hall', 'Enter the throne hall', ZONE('throne_hall'), { after: ['gate'] }),
        OBJ('morrow', 'Defeat Chancellor Morrow', KILL('morrow'), { after: ['hall'] }),
        OBJ('darken', 'Face Darken Holt', F('darken_faced'), { after: ['morrow'] }),
        OBJ('crown', 'Decide the Crown\'s fate', F('final_made'), { after: ['darken'] }),
      ],
      reward: { xp: 1500 }, onComplete: [fl('ch6_done')],
    },
    {
      id: 's6_evac', title: 'Evacuate the Lower Ward', type: 'side', region: 'crownfall', chapter: 6,
      summary: 'Open the three evacuation gates for Mother Ines\' people.',
      objectives: [OBJ('gates', 'Open the evacuation gates', CNT('int_evac_', 3), { progress: { prefix: 'int_evac_', n: 3 } }), OBJ('report', 'Report to Mother Ines', F('evac_resolved'), { after: ['gates'] })],
      reward: { xp: 150 },
    },
    {
      id: 's6_armory', title: 'The Royal Armory', type: 'side', region: 'crownfall', chapter: 6,
      summary: 'Ser Alwen has the key to the royal armoury. Decide who will be armed.',
      objectives: [OBJ('chest', 'Open the armoury chest', INT('armory_chest')), OBJ('choose', 'Decide the regalia\'s fate', F('armory_resolved'), { after: ['chest'] })],
      reward: { xp: 150 },
    },
    {
      id: 'e6_banners', title: 'Banners of Crownfall', type: 'exploration', region: 'crownfall', chapter: 6, autoStart: CNT('col_banner_', 1),
      summary: 'Five banners of the old houses still hang in the Burning Avenue. Rescue them.',
      objectives: [OBJ('banners', 'Recover the banners', CNT('col_banner_', 5), { progress: { prefix: 'col_banner_', n: 5 } })],
      reward: { xp: 250, items: [{ id: 'charm_banner', n: 1 }] },
    },
    {
      id: 'h6_last_room', title: 'The King\'s Last Room', type: 'hidden', region: 'crownfall', chapter: 6, hiddenUntilStarted: true, autoStart: INT('king_portrait'),
      summary: 'The portrait hides a door. King Aldric left one more word for Aren.',
      objectives: [OBJ('door', 'Open the hidden door', F('path_kings_room')), OBJ('words', 'Read the King\'s last words', COL('aldric_last_words'), { after: ['door'] })],
      reward: { xp: 400 },
    },
  ],

  collectibles: [
    ...[1, 2, 3, 4, 5].map(i => COLL(`banner_${i}`, 'crownfall', 'token', `House Banner ${i}`, ['House Valcrest — the golden sun.', 'House Greenwatch — the oak leaf.', 'House Qamar — the crescent.', 'House Stormborn — the red axe.', 'House Aldric — the Ember Crown.'][i - 1])),
    COLL('regalia', 'crownfall', 'relic', 'Royal Regalia', 'Gilded circlet and scabbard, weighty with symbolism.'),
    COLL('aldric_last_words', 'crownfall', 'lore', 'King Aldric\'s Last Words', 'A letter blessing Aren in a failing hand.', []),
  ],

  pois: [
    { id: 'lower_ward', region: 'crownfall', level: 'crownfall_main', name: 'The Lower Ward', kind: 'settlement', x: 800, y: 1000, fastTravel: true, description: 'Refugees huddle among burned stalls.' },
    { id: 'armory_yard', region: 'crownfall', level: 'crownfall_main', name: 'The Armory Yard', kind: 'landmark', x: 3100, y: 1000, description: 'Where the royal guard once drilled.' },
    { id: 'palace_gate', region: 'crownfall', level: 'crownfall_main', name: 'The Palace Gate', kind: 'landmark', x: 6400, y: 1000, description: 'Bronze doors, scorched but standing.' },
    { id: 'throne_hall', region: 'crownfall', level: 'crownfall_throne', name: 'The Hollow Throne', kind: 'landmark', x: 400, y: 900, description: 'Where kings were crowned and chancellors made.' },
  ],

  storyEvents: [
    { id: 'ev_morrow_pre', zone: 'morrow_arena', dialogue: 'd_morrow_pre' },
    { id: 'ev_darken_final', auto: KILL('morrow'), dialogue: 'd_darken_final' },
    { id: 'ev_kings_words', auto: COL('aldric_last_words'), dialogue: 'd_kings_last_words' },
  ],
};
void V;
