import type { RegionContent } from '../../types';
import { AND, ATM, C, CH, CNT, COL, COLL, COMP, CUT, F, INT, K, KILL, N, NOT, OBJ, OR, P, Q, R, T, TALKED, ZONE, chap, fl, key, qs, reward, rl, unlock, vr, rect } from '../dsl';

export const hollowCity: RegionContent = {
  region: {
    id: 'hollow_city', name: 'The Hollow City', chapter: 5, tagline: 'What the Crown drains, the dark keeps.',
    description: 'A royal city built under a mountain, drained of colour and warmth by the Ember Crown. The Hushed rule by whisper and mask.',
    entryLevel: 'hollow_city_main', mapPos: { x: 0.82, y: 0.52 },
    connections: [{ to: 'frozen_highlands' }, { to: 'crownfall', requires: Q('m5_heart') }],
  },

  levels: [
    {
      id: 'hollow_city_main', region: 'hollow_city', name: 'The Understreets', size: { w: 7000, h: 1200 },
      atmosphere: ATM({ palette: { sky: '#14121b', mid: '#2c2740', fore: '#08070d', accent: '#c4a3ff' }, weather: 'fog', light: 'night', music: 'hollow_city_theme', ambience: ['hum_deep', 'whisper_crowd', 'distant_bells_dull'], particles: 'pale_motes', notes: 'Colourless stone and violet lamplight. Silent crowds in masks. Drained trees, dead fountains.' }),
      spawns: { start: { x: 120, y: 1000 }, from_highlands: { x: 120, y: 1000 }, from_vaults: { x: 5200, y: 1000 }, from_crownfall: { x: 6800, y: 1000 } },
      platforms: [
        P(0, 1060, 1200, 140, 'stone'), P(1400, 1060, 1200, 140, 'stone'), P(2800, 1060, 1400, 140, 'stone'), P(4400, 1060, 1200, 140, 'stone'), P(5800, 1060, 1200, 140, 'stone'),
        P(350, 940, 240, 24, 'stone'), P(750, 820, 260, 24, 'oneway'), P(1150, 940, 200, 24, 'crumble'), P(1650, 900, 260, 24, 'stone'), P(2050, 780, 260, 24, 'oneway'),
        P(2450, 900, 240, 24, 'crumble'), P(3000, 880, 260, 24, 'stone'), P(3400, 760, 260, 24, 'oneway'), P(3800, 640, 260, 24, 'stone'), P(4300, 900, 220, 24, 'crumble'),
        P(4700, 820, 260, 24, 'stone'), P(5100, 700, 260, 24, 'oneway'), P(6100, 900, 260, 24, 'stone'), P(6500, 760, 260, 24, 'stone'),
      ],
      hazards: [
        { type: 'void_pit', rect: rect(1200, 1160, 200, 40), damage: 999 }, { type: 'void_pit', rect: rect(2600, 1160, 200, 40), damage: 999 },
        { type: 'hush_zone', rect: rect(3100, 600, 800, 460), damage: 2, note: 'disables player voice abilities; dimmer lighting' }, { type: 'spikes', rect: rect(4200, 1040, 200, 20), damage: 10 },
      ],
      enemies: [
        { type: 'hushed_guard', x: 900, y: 1020, patrol: [500, 1200] }, { type: 'hollow_shade', x: 2000, y: 1020, patrol: [1600, 2600] }, { type: 'hushed_guard', x: 3300, y: 1020, patrol: [2900, 3900] },
        { type: 'hollow_shade', x: 4800, y: 1020, patrol: [4500, 5400], elite: true }, { type: 'hushed_guard', x: 6200, y: 1020, patrol: [5900, 6800] },
      ],
      npcs: [{ npc: 'osk', x: 700, y: 1020 }, { npc: 'dov', x: 3100, y: 1020 }],
      collectibles: [
        { id: 'lamp_key', x: 3900, y: 600 }, { id: 'mask_1', x: 800, y: 780 }, { id: 'mask_2', x: 2100, y: 740 }, { id: 'mask_3', x: 5150, y: 660 },
        { id: 'name_1', x: 1700, y: 860 }, { id: 'name_2', x: 3500, y: 720 }, { id: 'name_3', x: 4750, y: 780 }, { id: 'name_4', x: 6550, y: 720 }, { id: 'queens_rite', x: 6900, y: 1000 },
      ],
      hiddenPaths: [{ id: 'queens_door', level: 'hollow_city_main', rect: rect(6850, 900, 150, 160), hint: 'Five dead lamps and a door that shows no seam.', reveal: AND(CNT('int_lamp_', 5), INT('queens_door_panel')) }],
      zones: [{ id: 'hollow_gate', rect: rect(500, 900, 500, 160) }, { id: 'lamplighters_market', rect: rect(2900, 900, 600, 160) }, { id: 'hush_square', rect: rect(3600, 900, 600, 160) }, { id: 'vault_gate', rect: rect(5100, 900, 300, 160) }],
      interactables: [
        { id: 'lamp_1', x: 1000, y: 1020, label: 'Dead lamp' }, { id: 'lamp_2', x: 2400, y: 1020, label: 'Dead lamp' }, { id: 'lamp_3', x: 3600, y: 1020, label: 'Dead lamp' }, { id: 'lamp_4', x: 4700, y: 780, label: 'Dead lamp' }, { id: 'lamp_5', x: 6300, y: 860, label: 'Dead lamp' },
        { id: 'queens_door_panel', x: 6880, y: 1000, label: 'Seamless door' }, { id: 'name_board', x: 2300, y: 1020, label: 'Board of lost names' },
      ],
      exits: [
        { id: 'to_highlands', rect: rect(0, 900, 80, 160), to: { level: 'frozen_highlands_main', spawn: 'from_hollow' } },
        { id: 'to_vaults', rect: rect(5300, 900, 80, 160), to: { level: 'hollow_city_vaults', spawn: 'start' }, requires: F('hollow_gate_passed'), lockedText: 'Hushed guards block the vault stair.' },
        { id: 'to_crownfall', rect: rect(6900, 900, 100, 160), to: { level: 'crownfall_main', spawn: 'from_hollow' }, requires: Q('m5_heart'), lockedText: 'The Chancellor still holds what you need to find below.' },
      ],
      lore: [
        { id: 'l5_remains', kind: 'remains', x: 1600, y: 1020, text: 'A stack of masks, each stamped with a number. The top one is a child\'s size.' },
        { id: 'l5_mural', kind: 'mural', x: 2700, y: 900, text: 'A great fresco of the Hollow City in colour. A single hand has scraped the paint off the lower half, as if hunger for light.' },
        { id: 'l5_sign', kind: 'sign', x: 4100, y: 1020, text: '"ALL SPEECH IS TAXED." Under it, someone has scratched "ALL SILENCE IS A DEBT."' },
      ],
    },
    {
      id: 'hollow_city_vaults', region: 'hollow_city', name: 'The Hush Vaults', size: { w: 4200, h: 1000 },
      atmosphere: ATM({ palette: { sky: '#0e0c14', mid: '#3a2f55', fore: '#050408', accent: '#ffd36a' }, weather: 'none', light: 'gloom', music: 'hush_vaults_boss', ambience: ['chains', 'whisper_sharp', 'heartbeat_slow'], particles: 'dust_motes', notes: 'Candlelit prison vaults, gilded chains, the Crown\'s faint ember glow in the walls.' }),
      spawns: { start: { x: 120, y: 820 }, from_boss: { x: 3500, y: 820 } },
      platforms: [P(0, 880, 1400, 120, 'stone'), P(1600, 880, 1000, 120, 'stone'), P(2800, 880, 1400, 120, 'stone'), P(400, 740, 240, 24, 'oneway'), P(900, 640, 260, 24, 'stone'), P(1450, 760, 140, 24, 'crumble'), P(1900, 720, 260, 24, 'oneway'), P(2650, 760, 140, 24, 'crumble'), P(3100, 700, 260, 24, 'stone')],
      hazards: [{ type: 'pit', rect: rect(1400, 980, 200, 20), damage: 999 }, { type: 'pit', rect: rect(2600, 980, 200, 20), damage: 999 }],
      enemies: [{ type: 'hushed_guard', x: 700, y: 840, patrol: [400, 1300] }, { type: 'hushed_guard', x: 2100, y: 840, patrol: [1700, 2500], elite: true }, { type: 'hush_mother_vesk', x: 3500, y: 820, boss: 'hushmother' }],
      npcs: [{ npc: 'elen', x: 3900, y: 840 }], collectibles: [{ id: 'frag_5', x: 4100, y: 840 }], hiddenPaths: [],
      zones: [{ id: 'elen_cell', rect: rect(3700, 700, 400, 180) }, { id: 'vesk_arena', rect: rect(3000, 700, 800, 180) }], interactables: [],
      exits: [{ id: 'out', rect: rect(0, 760, 80, 120), to: { level: 'hollow_city_main', spawn: 'from_vaults' } }],
      lore: [{ id: 'l5v_letter', kind: 'letter', x: 2100, y: 840, text: 'Letter in Darken\'s hand, never sent: "Elen — be brave. I will bring you home. If the Chancellor makes me choose, forgive the choice."' }],
    },
  ],

  npcs: [
    { id: 'osk', name: 'Osk the Gatekeeper', region: 'hollow_city', role: 'Gatekeeper', description: 'A Hushed warden who takes everything but never raises his voice.', portrait: 'portrait_osk', sprite: 'npc_osk', dialogue: [{ when: F('hollow_gate_passed'), tree: 'd_osk_after' }, { tree: 'd_osk' }] },
    { id: 'dov', name: 'Dov the Lamplighter', region: 'hollow_city', role: 'Information Broker', description: 'Lights lamps for the dead and sells whispers to the living.', portrait: 'portrait_dov', sprite: 'npc_dov', dialogue: [{ tree: 'd_dov' }] },
    { id: 'elen', name: 'Elen Holt', region: 'hollow_city', role: 'Darken\'s Daughter', description: 'Twelve, held by the Chancellor to guarantee Darken\'s obedience.', portrait: 'portrait_elen', sprite: 'npc_elen', dialogue: [{ when: F('elen_decided'), tree: 'd_elen_after' }, { tree: 'd_elen' }] },
  ],

  dialogues: [
    T('d_osk', 'osk', 'a', {
      a: N('osk', 'Names are taxed. Faces are taxed. Voices are taxed. State your tax.', { mood: 'flat', choices: [
        C('Show the Valcrest signet.', 'signet', { when: NOT(F('signet_sold')), tags: ['honest'], effects: [vr('honor', 1), fl('gate_signet'), fl('hollow_gate_passed')] }),
        C('"Jorin sold me your fee." (the signet was sold)', 'sold', { when: F('signet_sold'), tags: ['deceit'], effects: [vr('trust', -1), fl('gate_bribe'), fl('hollow_gate_passed')] }),
        C('"Rook says hello."', 'rook', { when: F('rook_spared'), tags: ['mercy'], effects: [fl('gate_rook'), fl('hollow_gate_passed'), vr('trust', 1)] }),
        C('Show Qasim\'s map of Darken\'s route.', 'route', { when: K('qasim_map'), tags: ['pragmatic'], effects: [fl('gate_route'), fl('hollow_gate_passed')] }),
        C('Pay the tax: 200 gold.', 'pay', { tags: ['greed'], effects: [fl('gate_bribe'), fl('hollow_gate_passed')] }),
        C('"I don\'t pay taxes. I take the door."', 'force', { tags: ['ruthless'], effects: [vr('mercy', -1), vr('ambition', 1), fl('gate_forced'), fl('hollow_gate_passed')] })] }),
      signet: N('osk', 'The Valcrest brand. Colour of a name the Crown tried to bury. Pass. Quietly.'),
      sold: N('osk', 'Jorin sells many things. Few of them are mine to honour. This once — pass.'),
      rook: N('osk', 'The Crownless pay their debts. So do I. Pass.'),
      route: N('osk', 'Darken\'s route. Stolen from Qasim\'s ledger. Interesting. Pass — before I change my mind.'),
      pay: N('osk', 'Two hundred. Accepted. Do not speak above a murmur.', { effects: [] }),
      force: N('osk', 'Then we will fight in silence.', { mood: 'cold' }),
    }),
    T('d_osk_after', 'osk', 'a', { a: N('osk', 'Quietly, Valcrest. Always quietly.') }),
    T('d_dov', 'dov', 'a', {
      a: N('dov', 'Lamps for the dead, whispers for the living. The Hushed took masks from the market; the refugees need them to hide. Three masks would let nine families out unseen.', { variants: [{ when: F('masks_resolved'), text: 'The families walk free thanks to you. Light on your path.' }], choices: [
        C('"I\'ll find the masks."', 'ok', { when: NOT(F('masks_resolved')), tags: ['mercy'], effects: [qs('s5_masks')] }), C('"Not now."', undefined, { when: NOT(F('masks_resolved')) })] }),
      ok: N('dov', 'Three masks in the Understreets. One above the guard stair, one in the bell-pit, one in the square.'),
      deliver: N('dov', 'Three masks! What will you do with them?', { choices: [
        C('"Give them to the families."', 'give', { tags: ['mercy'], effects: [vr('mercy', 2), vr('honor', 1), fl('masks_given'), fl('masks_resolved')] }),
        C('"Keep one for myself."', 'keep', { tags: ['pragmatic'], effects: [vr('ambition', 1), fl('masks_kept'), fl('masks_resolved'), key('hushed_mask')] }),
        C('"Sell them to Osk."', 'sell', { tags: ['greed'], effects: [vr('mercy', -2), vr('ambition', 2), fl('masks_sold'), fl('masks_resolved'), reward({ gold: 350 })] })] }),
      give: N('dov', 'Nine families breathe freely tonight. This will not be forgotten.', { effects: [reward({ xp: 140 }), rl('idris', 2)] }),
      keep: N('dov', 'Two for them; one for you. Fair.', { effects: [reward({ xp: 100 })] }),
      sell: N('dov', 'I will pretend I did not hear that.', { mood: 'cold', effects: [reward({ xp: 40 })] }),
      done: N('dov', 'Light on your path.'),
    }, { entries: [{ when: AND(Q('s5_masks', 'active'), CNT('col_mask_', 3), NOT(F('masks_resolved'))), node: 'deliver' }, { when: F('masks_resolved'), node: 'done' }] }),
    CUT('d_vesk_pre', 'a', {
      a: N('vesk', 'The hound\'s whelp. And the hound\'s old friend. How neat. The Chancellor said the Valcrest would come for Elen.', { mood: 'cold', effects: [fl('learned_morrow')], next: 'b' }),
      b: N('aren', 'Veyl Morrow. All of this is his?', { next: 'c' }),
      c: N('vesk', 'The Crown drains the land; the Chancellor drains the Crown. When the King refused him, he needed a hand to hold the knife. Darken\'s hands were convenient. Now — silence.', { mood: 'cruel' }),
    }),
    T('d_elen', 'elen', 'a', {
      a: N('elen', 'You\'re not a Hushed. You... you have the Valcrest sun on your sword. My father said you would come.', { mood: 'trembling', effects: [fl('found_elen')], next: 'b' }),
      b: N('elen', 'He told me everything in the letters. "Aren is not the enemy." Please... don\'t let him be the enemy.', { choices: [
        C('"I\'ll get you out. You\'re safe."', 'free', { tags: ['mercy', 'honest'], effects: [vr('mercy', 2), vr('honor', 2), fl('elen_freed'), fl('elen_decided'), rl('tamsin', 2), rl('sylwen', 2)] }),
        C('"Stay close. We end this together."', 'with', { tags: ['trust'], effects: [vr('trust', 2), fl('elen_with_us'), fl('elen_decided')] }),
        C('"Your father will meet me on my terms now."', 'leverage', { tags: ['ruthless'], effects: [vr('ambition', 2), vr('mercy', -3), vr('honor', -2), fl('elen_leverage'), fl('elen_decided'), rl('tamsin', -6), rl('sylwen', -6), rl('idris', -4), rl('brannoch', -4)] })] }),
      free: N('elen', 'Thank you. I\'ll tell him you came for me. I\'ll tell him...', { effects: [reward({ xp: 200 })] }),
      with: N('elen', 'I\'ll hold your hand. I\'m not afraid, if you aren\'t.', { effects: [reward({ xp: 200 })] }),
      leverage: N('elen', 'Oh. I see. You are very like him.', { mood: 'cold' }),
    }),
    T('d_elen_after', 'elen', 'a', { a: N('elen', 'Is my father alive?', { variants: [{ when: F('elen_leverage'), text: 'I do not speak to men who hold me by the chain.' }] }) }),
  ],

  quests: [
    {
      id: 'm5_heart', title: 'Heart of the Hollow', type: 'main', region: 'hollow_city', chapter: 5, requires: Q('m4_oath'), autoStart: CH(5),
      summary: 'Darken\'s daughter is held in the Hush Vaults. Reach her — and learn who truly holds the leash.',
      objectives: [
        OBJ('gate', 'Get past the Hollow Gate', F('hollow_gate_passed')),
        OBJ('vault', 'Descend to the Hush Vaults', ZONE('vesk_arena'), { after: ['gate'] }),
        OBJ('vesk', 'Defeat Hush-Mother Vesk', KILL('hushmother'), { after: ['vault'] }),
        OBJ('elen', 'Decide Elen\'s fate', F('elen_decided'), { after: ['vesk'] }),
        OBJ('ledger', 'Recover the royal ledger', COL('frag_5'), { after: ['elen'] }),
      ],
      reward: { xp: 800, gold: 200 }, onComplete: [unlock('crownfall'), chap(6), fl('ch5_done')],
    },
    {
      id: 's5_masks', title: 'Masks of the Hushed', type: 'side', region: 'hollow_city', chapter: 5,
      summary: 'Dov needs three Hushed masks to smuggle refugee families out.',
      objectives: [OBJ('masks', 'Find three masks', CNT('col_mask_', 3), { progress: { prefix: 'col_mask_', n: 3 } }), OBJ('give', 'Decide the masks\' fate', F('masks_resolved'), { after: ['masks'] })],
      reward: { xp: 100 },
    },
    {
      id: 's5_names', title: 'Market of Lost Names', type: 'side', region: 'hollow_city', chapter: 5, autoStart: CNT('col_name_', 1),
      summary: 'Name-tags of the vanished lie scattered about the Understreets. Pin them to the board.',
      objectives: [OBJ('tags', 'Collect the name-tags', CNT('col_name_', 4), { progress: { prefix: 'col_name_', n: 4 } }), OBJ('board', 'Pin them to the board of lost names', INT('name_board'), { after: ['tags'] })],
      reward: { xp: 150 }, onComplete: [vr('mercy', 1)],
    },
    {
      id: 'e5_lamps', title: 'Lamps of the Hollow', type: 'exploration', region: 'hollow_city', chapter: 5, autoStart: CNT('int_lamp_', 1),
      summary: 'Five dead lamps line the Understreets. Relight them.',
      objectives: [OBJ('lamps', 'Relight the lamps', CNT('int_lamp_', 5), { progress: { prefix: 'int_lamp_', n: 5 } })],
      reward: { xp: 180, items: [{ id: 'charm_lamp', n: 1 }], keys: [{ id: 'lamp_charm' }] },
    },
    {
      id: 'h5_queens', title: 'The Queen\'s Door', type: 'hidden', region: 'hollow_city', chapter: 5, hiddenUntilStarted: true, autoStart: INT('queens_door_panel'),
      summary: 'A door with no seam. Five lamps, one rhythm.',
      objectives: [OBJ('lamps', 'Relight all five lamps', CNT('int_lamp_', 5)), OBJ('door', 'Open the Queen\'s Door', F('path_queens_door'), { after: ['lamps'] }), OBJ('rite', 'Read the Queen\'s unbinding rite', COL('queens_rite'), { after: ['door'] })],
      reward: { xp: 300 },
    },
  ],

  collectibles: [
    ...[1, 2, 3].map(i => COLL(`mask_${i}`, 'hollow_city', 'resource', `Hushed Mask ${i}`, 'A numbered porcelain mask. Rattled in the wind like a coin.')),
    ...[1, 2, 3, 4].map(i => COLL(`name_${i}`, 'hollow_city', 'token', `Name-Tag ${i}`, ['"Maren, 9."', '"Corvin the cooper."', '"Old Henna."', '"Twin Tolly, both."'][i - 1])),
    COLL('lamp_key', 'hollow_city', 'key', 'Lamplighter\'s Key', 'Opens the oil cabinet under the square.'),
    COLL('queens_rite', 'hollow_city', 'lore', 'The Queen\'s Unbinding Rite', '"To unbind the Crown, wear it, and offer it a gift it cannot drink: a willing end to the wish for more."', [fl('learned_unbind_rite')]),
    COLL('frag_5', 'hollow_city', 'testament', 'Testament Fragment V', 'The Royal Ledger: "Chancellor Morrow, appointed regent in the event of my death. I strike this. He is the Crown\'s hunger made man."'),
  ],

  pois: [
    { id: 'hollow_gate', region: 'hollow_city', level: 'hollow_city_main', name: 'The Hollow Gate', kind: 'landmark', x: 750, y: 1000, description: 'A mountain-door guarded by silence.' },
    { id: 'lamplighters_market', region: 'hollow_city', level: 'hollow_city_main', name: 'Lamplighter\'s Market', kind: 'settlement', x: 3100, y: 1000, fastTravel: true, description: 'Stalls lit by violet flame.' },
    { id: 'hush_square', region: 'hollow_city', level: 'hollow_city_main', name: 'Hush Square', kind: 'landmark', x: 3900, y: 1000, description: 'No sound carries here.' },
    { id: 'vault_gate', region: 'hollow_city', level: 'hollow_city_main', name: 'The Vault Stair', kind: 'landmark', x: 5250, y: 1000, description: 'Stairs spiral into the Crown\'s prison.' },
  ],

  storyEvents: [{ id: 'ev_vesk_pre', zone: 'vesk_arena', dialogue: 'd_vesk_pre' }],
};
void OR; void R; void COMP; void TALKED; void CUT;
