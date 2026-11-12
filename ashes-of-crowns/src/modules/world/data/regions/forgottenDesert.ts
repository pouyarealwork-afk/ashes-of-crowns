import type { RegionContent } from '../../types';
import { AND, ATM, C, CH, CNT, COL, COLL, COMP, CUT, F, INT, K, KILL, N, NOT, OBJ, P, Q, R, T, TALKED, ZONE, chap, fl, key, qs, rec, reward, rl, unlock, vr, rect } from '../dsl';

export const forgottenDesert: RegionContent = {
  region: {
    id: 'forgotten_desert', name: 'Forgotten Desert', chapter: 3, tagline: 'Every crown begins as a promise buried in sand.',
    description: 'The Glass Dunes hide Kharazul, the first dynasty\'s drowned capital, where the Ember Crown was forged and bound.',
    entryLevel: 'forgotten_desert_main', mapPos: { x: 0.5, y: 0.7 },
    connections: [{ to: 'whispering_forest' }, { to: 'frozen_highlands', requires: Q('m3_bearer') }],
  },

  levels: [
    {
      id: 'forgotten_desert_main', region: 'forgotten_desert', name: 'The Glass Dunes', size: { w: 7600, h: 1000 },
      atmosphere: ATM({ palette: { sky: '#e7b46a', mid: '#b97a3d', fore: '#4a2a14', accent: '#4fd0c8' }, weather: 'sandstorm', light: 'noon', music: 'forgotten_desert_theme', ambience: ['wind_howl', 'sand_hiss', 'distant_bell'], particles: 'sand_streaks', notes: 'Bleached glass dunes, mirage shimmer, half-buried colossal statues. Teal only from oasis water and glyph light.' }),
      spawns: { start: { x: 120, y: 780 }, from_forest: { x: 120, y: 780 }, from_kharazul: { x: 5200, y: 780 }, from_highlands: { x: 7400, y: 780 } },
      platforms: [
        P(0, 840, 1300, 160, 'sand'), P(1500, 840, 1100, 160, 'sand'), P(2800, 840, 1200, 160, 'sand'), P(4200, 840, 1400, 160, 'sand'), P(5800, 840, 1800, 160, 'sand'),
        P(350, 720, 220, 24, 'stone'), P(760, 620, 240, 24, 'stone'), P(1330, 760, 160, 24, 'crumble'), P(1700, 700, 240, 24, 'stone'),
        P(2080, 600, 260, 24, 'oneway'), P(2620, 780, 160, 24, 'crumble'), P(3000, 700, 260, 24, 'stone'), P(3400, 580, 240, 24, 'stone'),
        P(4020, 780, 160, 24, 'crumble'), P(4500, 700, 300, 24, 'stone'), P(4950, 580, 240, 24, 'oneway'), P(6100, 700, 260, 24, 'stone'), P(6500, 560, 300, 24, 'stone'),
      ],
      hazards: [
        { type: 'quicksand', rect: rect(1300, 830, 200, 30), damage: 5, note: 'drags the player down; jump to escape' }, { type: 'quicksand', rect: rect(2600, 830, 200, 30), damage: 5 },
        { type: 'sandstorm_zone', rect: rect(3000, 300, 1000, 540), damage: 2, note: 'reduces visibility, pushes player' }, { type: 'spikes', rect: rect(4000, 820, 200, 20), damage: 10, note: 'rusted caravan spears' },
      ],
      enemies: [
        { type: 'sand_scorpion', x: 900, y: 800, patrol: [700, 1200] }, { type: 'dune_raider', x: 2000, y: 800, patrol: [1600, 2500] }, { type: 'sand_scorpion', x: 3300, y: 800, patrol: [2900, 3800] },
        { type: 'dune_raider', x: 4600, y: 800, patrol: [4300, 5100], elite: true }, { type: 'glass_serpent', x: 6300, y: 800, patrol: [5900, 6900] },
      ],
      npcs: [{ npc: 'nadira', x: 1750, y: 800 }, { npc: 'qasim', x: 3800, y: 800 }, { npc: 'idris', x: 4700, y: 800, when: COMP('idris', 'unmet') }],
      collectibles: [
        { id: 'glyph_1', x: 500, y: 680 }, { id: 'glyph_2', x: 1800, y: 660 }, { id: 'glyph_3', x: 3100, y: 660 }, { id: 'glyph_4', x: 4600, y: 660 }, { id: 'glyph_5', x: 6200, y: 660 }, { id: 'glyph_6', x: 6600, y: 520 },
        { id: 'cask_1', x: 900, y: 580 }, { id: 'cask_2', x: 2150, y: 560 }, { id: 'cask_3', x: 3500, y: 540 }, { id: 'sun_key', x: 6000, y: 800 }, { id: 'raider_ledger', x: 6700, y: 520 }, { id: 'frag_3', x: 7200, y: 800 },
      ],
      hiddenPaths: [{ id: 'sundial_vault', level: 'forgotten_desert_main', rect: rect(7100, 700, 200, 140), hint: 'Three sundials, three shadows. When all agree, the sand will part.',
        reveal: AND(INT('sundial_dawn'), INT('sundial_noon'), INT('sundial_dusk')) }],
      zones: [{ id: 'oasis_bazaar', rect: rect(3600, 640, 500, 200) }, { id: 'caravan_camp', rect: rect(1500, 640, 500, 200) }, { id: 'kharazul_gate', rect: rect(5100, 640, 300, 200) }, { id: 'sundial_vault_zone', rect: rect(7100, 700, 200, 140) }],
      interactables: [
        { id: 'sundial_dawn', x: 800, y: 580, label: 'Eastern sundial' }, { id: 'sundial_noon', x: 3450, y: 540, label: 'Central sundial' }, { id: 'sundial_dusk', x: 6550, y: 520, label: 'Western sundial' },
        { id: 'vault_chest', x: 7200, y: 820, label: 'Sealed vault chest' },
      ],
      exits: [
        { id: 'to_forest', rect: rect(0, 700, 80, 140), to: { level: 'whispering_forest_main', spawn: 'from_desert' } },
        { id: 'to_kharazul', rect: rect(5300, 700, 80, 140), to: { level: 'forgotten_desert_kharazul', spawn: 'start' }, requires: K('sun_key'), lockedText: 'The doors are sealed with a sun-shaped lock.' },
        { id: 'to_highlands', rect: rect(7500, 700, 100, 140), to: { level: 'frozen_highlands_main', spawn: 'from_desert' }, requires: Q('m3_bearer'), lockedText: 'Kharazul\'s secret still weighs on you.' },
      ],
      lore: [
        { id: 'l3_statue', kind: 'ruin', x: 1100, y: 800, text: 'A half-buried colossus holds a crown in both hands. The crown has been chiselled away, and a new one carved on top, smaller.' },
        { id: 'l3_remains', kind: 'remains', x: 2750, y: 800, text: 'A caravan, still lashed together. The water barrels are bone-dry and slashed.' },
        { id: 'l3_mural', kind: 'mural', x: 5000, y: 700, text: 'Fresco: a woman places a burning circlet on a king and walks into the sea of sand. The king smiles. His shadow does not.' },
      ],
    },
    {
      id: 'forgotten_desert_kharazul', region: 'forgotten_desert', name: 'Sunken Kharazul', size: { w: 4200, h: 1100 },
      atmosphere: ATM({ palette: { sky: '#102a30', mid: '#1f5560', fore: '#061418', accent: '#f2c46b' }, weather: 'none', light: 'gloom', music: 'kharazul_depths', ambience: ['drip_echo', 'sand_trickle', 'chant_faint'], particles: 'glyph_motes', notes: 'Flooded colonnades, shafts of gold light from the surface, glowing glyph walls.' }),
      spawns: { start: { x: 120, y: 900 }, from_boss: { x: 3600, y: 900 } },
      platforms: [P(0, 960, 1400, 140, 'stone'), P(1600, 960, 1000, 140, 'stone'), P(2800, 960, 1400, 140, 'stone'), P(400, 820, 220, 24, 'stone'), P(800, 720, 240, 24, 'oneway'), P(1300, 800, 200, 24, 'crumble'), P(1900, 800, 260, 24, 'stone'), P(2400, 700, 260, 24, 'oneway'), P(3000, 800, 260, 24, 'stone')],
      hazards: [{ type: 'flooded_pit', rect: rect(1400, 960, 200, 140), damage: 15 }, { type: 'flooded_pit', rect: rect(2600, 960, 200, 140), damage: 15 }],
      enemies: [{ type: 'sand_wraith', x: 700, y: 900, patrol: [500, 1300] }, { type: 'glass_serpent', x: 2000, y: 900, patrol: [1700, 2500] }, { type: 'sandglass_colossus', x: 3500, y: 880, boss: 'colossus' }],
      npcs: [], collectibles: [],
      hiddenPaths: [], zones: [{ id: 'first_bearer_hall', rect: rect(1700, 800, 700, 160) }, { id: 'colossus_arena', rect: rect(3000, 800, 1000, 160) }],
      interactables: [{ id: 'first_bearer_wall', x: 2100, y: 900, label: 'Inscription wall' }],
      exits: [{ id: 'out', rect: rect(0, 820, 80, 140), to: { level: 'forgotten_desert_main', spawn: 'from_kharazul' } }],
      lore: [{ id: 'l3k_wall', kind: 'mural', x: 2100, y: 900, text: '"The Crown pays for itself in the bearer\'s years. It asks nothing of the land — at first." Beneath, a later hand: "It lied."' }],
    },
  ],

  npcs: [
    { id: 'idris', name: 'Idris Qamar', region: 'forgotten_desert', role: 'Exiled Physician / Companion', description: 'Court physician, vanished on the night of the Feast. Brews cures and carries guilt.', portrait: 'portrait_idris', sprite: 'npc_idris', companion: 'idris',
      dialogue: [{ when: Q('c_idris', 'active'), tree: 'd_idris_debt' }, { when: COMP('idris', 'recruited'), tree: 'd_idris_camp' }, { tree: 'd_idris_meet' }] },
    { id: 'nadira', name: 'Nadira', region: 'forgotten_desert', role: 'Caravan Master', description: 'Leads the last water caravan across the Glass Dunes.', portrait: 'portrait_nadira', sprite: 'npc_nadira', dialogue: [{ tree: 'd_nadira' }] },
    { id: 'qasim', name: 'Qasim the Broker', region: 'forgotten_desert', role: 'Smuggler & Information Broker', description: 'Sells everything, including secrets he claims not to know.', portrait: 'portrait_qasim', sprite: 'npc_qasim', dialogue: [{ tree: 'd_qasim' }] },
  ],

  dialogues: [
    T('d_idris_meet', 'idris', 'a', {
      a: N('idris', 'You have the Valcrest jaw — and the Valcrest stubbornness, if the stories hold. I am Idris. I sat beside King Aldric on the night he died. I have been running ever since.', { mood: 'weary', choices: [
        C('"Then you can tell me what killed him."', 'b', { tags: ['direct'] }),
        C('"You ran. You left me to hang."', 'b', { tags: ['bitter'], effects: [rl('idris', -3)] })] }),
      b: N('idris', 'A tincture, in the wine. Slow, painless, undetectable by court physicians. I know because... never mind. Take me to the Archive. I will tell you the rest when I can say it aloud.', { effects: [fl('idris_hints_poison')], choices: [
        C('"Come with me. I need your knowledge."', 'c', { tags: ['loyal'], effects: [rl('idris', 5)] }),
        C('"You\'ll answer for it when this ends."', 'c', { tags: ['justice'], effects: [vr('honor', 1)] })] }),
      c: N('idris', 'Fair. I accept the debt — and I will pay it.', { effects: [rec('idris')] }),
    }),
    T('d_idris_camp', 'idris', 'a', {
      a: N('idris', 'Sand in every vial. I will never be clean of it.', { variants: [{ when: R('idris', '>=', 60), text: 'I have started to believe I might deserve a quiet life. Dangerous thought.' }], choices: [C('"What was the King like?"', 'b'), C('"Rest."')] }),
      b: N('idris', 'Tired. He joked that the Crown felt like a hot coal under his skin. I laughed. A physician should not laugh at that.', { effects: [rl('idris', 2)] }),
    }),
    T('d_nadira', 'nadira', 'a', {
      a: N('nadira', 'Raiders took our water last night. Forty people, two days of dry throat. If you can bring three casks from the old waystations, I\'ll owe you more than I can pay.', { variants: [{ when: F('water_resolved'), text: 'You made the crossing livable. Dune-wind at your back, Aren.' }], choices: [C('"Rely on me."', 'ok', { when: NOT(F('water_resolved')), tags: ['mercy'], effects: [qs('s3_water')] }), C('"Not my problem."', undefined, { when: NOT(F('water_resolved')), effects: [vr('mercy', -1)] })] }),
      ok: N('nadira', 'Three waystations: the dune-top, the cracked well, the tower. Be quick.'),
      deliver: N('nadira', 'You have them! Three casks! What do you want in return?', { choices: [
        C('"Nothing. Share it fairly."', 'gift', { tags: ['mercy', 'honest'], effects: [vr('mercy', 2), vr('honor', 1), fl('water_gift'), fl('water_resolved')] }),
        C('"A fair price, for my trouble."', 'fair', { tags: ['pragmatic'], effects: [vr('ambition', 1), fl('water_fair'), fl('water_resolved'), reward({ gold: 150 })] }),
        C('"Sell the casks to Qasim instead. He pays more."', 'qasim', { tags: ['greed'], effects: [vr('ambition', 2), vr('mercy', -2), fl('water_sold'), fl('water_resolved'), reward({ gold: 400 })] })] }),
      gift: N('nadira', 'Dune-wind and fair water. The caravan will sing of you.', { effects: [reward({ xp: 120 }), rl('idris', 3)] }),
      fair: N('nadira', 'Fair. Rare in this land.', { effects: [reward({ xp: 80 })] }),
      qasim: N('nadira', 'You... I will remember this. Go.', { mood: 'cold', effects: [reward({ xp: 40 })] }),
      done: N('nadira', 'Good winds, Aren.'),
    }, { entries: [{ when: AND(Q('s3_water', 'active'), CNT('col_cask_', 3), NOT(F('water_resolved'))), node: 'deliver' }, { when: F('water_resolved'), node: 'done' }] }),
    T('d_qasim', 'qasim', 'a', {
      a: N('qasim', 'Ah, the man with half a kingdom on his tail. Information is my trade. Darken Holt\'s supply route into the Hollow City: five hundred gold, or a favour.', { variants: [{ when: F('qasim_deal_done'), text: 'A pleasure, friend. Mind the second gate in the Hollow.' }],
        choices: [
          C('"Name the favour."', 'favour', { when: NOT(F('qasim_deal_done')), tags: ['pragmatic'], effects: [qs('s3_qasim')] }),
          C('"I\'ll pay." (500 gold)', 'pay', { when: NOT(F('qasim_deal_done')), tags: ['honest'], effects: [vr('honor', 1), fl('qasim_paid'), fl('qasim_deal_done'), fl('know_darken_route'), key('qasim_map')] }),
          C('"Walk away."', undefined)] }),
      favour: N('qasim', 'Raiders of the Red Flag stole my ledger. Get it from their camp on the dune-top. Skin their leader if you like, or just ask politely.', { effects: [] }),
      pay: N('qasim', 'Wise. Here is the map.', { effects: [] }),
      back: N('qasim', 'Ledger? Excellent.', { choices: [
        C('"Here. Our bargain is done."', 'bargain', { tags: ['honest'], effects: [vr('honor', 1), fl('qasim_deal_done'), fl('know_darken_route'), key('qasim_map')] }),
        C('"I\'ll keep the ledger. It\'s leverage."', 'leverage', { tags: ['ruthless'], effects: [vr('ambition', 2), vr('honor', -1), fl('qasim_blackmail'), fl('qasim_deal_done'), fl('know_darken_route'), key('qasim_map')] })] }),
      bargain: N('qasim', 'You keep your word. Rare as rain.', {}),
      leverage: N('qasim', 'Hm. A man of ambition. I\'ll remember to price you accordingly.', { mood: 'cold' }),
    }, { entries: [{ when: AND(Q('s3_qasim', 'active'), COL('raider_ledger')), node: 'back' }] }),
  ],

  quests: [
    {
      id: 'm3_bearer', title: 'The First Bearer', type: 'main', region: 'forgotten_desert', chapter: 3, requires: Q('m2_trees'), autoStart: CH(3),
      summary: 'The Ember Crown was forged in Kharazul. The archive there may say what it does to its bearers — and why the King was killed.',
      objectives: [
        OBJ('bazaar', 'Reach the oasis bazaar', ZONE('oasis_bazaar')),
        OBJ('idris', 'Find the exiled physician', TALKED('idris'), { after: ['bazaar'] }),
        OBJ('key', 'Obtain the Sun Key', COL('sun_key'), { after: ['idris'] }),
        OBJ('gate', 'Open the gates of Kharazul', ZONE('first_bearer_hall'), { after: ['key'] }),
        OBJ('wall', 'Read the First Bearer\'s inscription', INT('first_bearer_wall'), { after: ['gate'] }),
        OBJ('colossus', 'Defeat the Sandglass Colossus', KILL('colossus'), { after: ['wall'] }),
      ],
      reward: { xp: 600, gold: 120 }, onComplete: [unlock('frozen_highlands'), chap(4), fl('ch3_done'), fl('learned_crown_pact')],
    },
    {
      id: 's3_water', title: 'Water Debt', type: 'side', region: 'forgotten_desert', chapter: 3,
      summary: 'Nadira\'s caravan is dying of thirst. Find three casks at the old waystations.',
      objectives: [OBJ('casks', 'Find the water casks', CNT('col_cask_', 3), { progress: { prefix: 'col_cask_', n: 3 } }), OBJ('deliver', 'Bring the water to Nadira', F('water_resolved'), { after: ['casks'] })],
      reward: { xp: 100 },
    },
    {
      id: 's3_qasim', title: 'A Broker\'s Bargain', type: 'side', region: 'forgotten_desert', chapter: 3,
      summary: 'Qasim will trade Darken\'s route for a favour: recover his stolen ledger.',
      objectives: [OBJ('ledger', 'Recover Qasim\'s ledger from the raiders', COL('raider_ledger')), OBJ('return', 'Settle with Qasim', F('qasim_deal_done'), { after: ['ledger'] })],
      reward: { xp: 120 },
    },
    {
      id: 'e3_glyphs', title: 'Glyphs of the Sunken Dynasty', type: 'exploration', region: 'forgotten_desert', chapter: 3, autoStart: CNT('col_glyph_', 1),
      summary: 'Six glyph stones tell the story of the First Dynasty.',
      objectives: [OBJ('glyphs', 'Collect the glyph stones', CNT('col_glyph_', 6), { progress: { prefix: 'col_glyph_', n: 6 } })],
      reward: { xp: 200, keys: [{ id: 'glyph_reader' }], items: [{ id: 'charm_glyph', n: 1 }] }, onComplete: [fl('dynasty_story_known')],
    },
    {
      id: 'h3_vault', title: 'The Sundial Vault', type: 'hidden', region: 'forgotten_desert', chapter: 3, hiddenUntilStarted: true, autoStart: INT('sundial_dawn'),
      summary: 'Three sundials cast shadows that do not agree. Align them.',
      objectives: [OBJ('dials', 'Wake all three sundials', AND(INT('sundial_dawn'), INT('sundial_noon'), INT('sundial_dusk'))), OBJ('vault', 'Open the vault chest', INT('vault_chest'), { after: ['dials'] }), OBJ('fragment', 'Claim the vault\'s secret', COL('frag_3'), { after: ['vault'] })],
      reward: { xp: 250 },
    },
  ],

  collectibles: [
    ...[1, 2, 3, 4, 5, 6].map(i => COLL(`glyph_${i}`, 'forgotten_desert', 'lore', `Glyph Stone ${i}`, ['The First Queen swore: "No crown shall rule beyond its bearer\'s life."', 'The Crown drinks years. The bearer drinks light.', 'Seven kings lit the sky; the eighth lit nothing.', 'The Hollow was a city once, before it was hollowed.', 'A binder\'s rite: "To unbind, one must wear and be willing."', 'The last glyph is blank. The Queen wrote: "No one reads this far."'][i - 1])),
    ...[1, 2, 3].map(i => COLL(`cask_${i}`, 'forgotten_desert', 'resource', `Water Cask ${i}`, 'Still heavy. Somebody forgot to cut this one open.')),
    COLL('sun_key', 'forgotten_desert', 'key', 'Sun Key', 'A bronze disc warm from the day. It fits no lock you have seen — except the doors of Kharazul.', [key('sun_key')]),
    COLL('raider_ledger', 'forgotten_desert', 'key', 'Qasim\'s Ledger', 'A fat book of debts, smuggling routes and names that would end careers.'),
    COLL('frag_3', 'forgotten_desert', 'testament', 'Testament Fragment III', '"I send for Aren at dawn. If Morrow\'s men stop him, the courier knows where I have hidden the Crown\'s counter-rite."'),
  ],

  pois: [
    { id: 'caravan_camp', region: 'forgotten_desert', level: 'forgotten_desert_main', name: 'Nadira\'s Caravan', kind: 'camp', x: 1700, y: 780, fastTravel: true, description: 'Forty weary travellers and a patched tent.' },
    { id: 'oasis_bazaar', region: 'forgotten_desert', level: 'forgotten_desert_main', name: 'The Oasis Bazaar', kind: 'settlement', x: 3850, y: 780, fastTravel: true, description: 'A black-market oasis with more rumours than water.' },
    { id: 'kharazul_gate', region: 'forgotten_desert', level: 'forgotten_desert_main', name: 'Gates of Kharazul', kind: 'landmark', x: 5250, y: 780, description: 'Bronze doors the height of a cathedral.' },
    { id: 'sundial_vault_zone', region: 'forgotten_desert', level: 'forgotten_desert_main', name: 'The Aligned Vault', kind: 'secret', x: 7200, y: 780, description: 'A vault sealed by three shadows.', hiddenUntilDiscovered: true },
  ],

  storyEvents: [],
};
void COMP; void CUT; void TALKED;
