import type { CompanionDef, DialogueTree, NpcDef, QuestDef } from '../types';
import { AND, C, CH, COMP, END, F, K, N, OBJ, R, T, fl, reward, rl, vr, key } from './dsl';

/* ---------------------------------------------------------------- companions */
export const companions: CompanionDef[] = [
  {
    id: 'tamsin', name: 'Tamsin Reed', title: 'The Forgekeeper', role: 'guardian',
    personality: 'Blunt, stubborn and fiercely protective. Hides grief behind sarcasm and hard work.',
    backstory: 'Daughter of Hearthmere\'s master smith, who forged spear-tips for the very regiment that burned the village. She believes iron remembers who it was.',
    sprite: 'companion_tamsin', portrait: 'portrait_tamsin', baseStats: { hp: 140, attack: 12, speed: 150 }, startLoyalty: 25, leaveBelow: -30,
    reactions: { mercy: 3, loyal: 2, honest: 2, justice: 1, greed: -4, ruthless: -4, deceit: -3, ambition: -1 },
    barks: { greed: 'Coin again, Valcrest?', ruthless: 'That wasn\'t necessary.', mercy: 'That\'s the man I followed out of the ashes.', deceit: 'A lie, even a small one, leaves a scorch mark.' },
    abilities: [
      { id: 'shield_wall', name: 'Shield Wall', kind: 'shield', power: 20, cooldownMs: 12000, trigger: { type: 'player_hp_below', value: 0.4 }, targeting: 'player', vfx: 'vfx_shield_gold' },
      { id: 'hammer_slam', name: 'Hammer Slam', kind: 'damage', power: 14, cooldownMs: 8000, trigger: { type: 'enemies_at_least', value: 2 }, targeting: 'all_in_range', vfx: 'vfx_slam' },
      { id: 'forge_oath', name: 'Forge Oath', kind: 'buff', power: 1.3, cooldownMs: 45000, minLoyalty: 60, trigger: { type: 'boss' }, targeting: 'player', vfx: 'vfx_forge_glow' },
    ],
    personalQuest: 'c_tamsin',
    fates: [
      { when: COMP('tamsin', 'left'), text: 'Tamsin left long before the end and rebuilt Hearthmere alone, board by board, never saying your name.' },
      { when: COMP('tamsin', 'dead'), text: 'Tamsin fell in the siege. Hearthmere named its new bell for her.' },
      { when: END('fallen_hero'), text: 'Tamsin forged a plain iron sun for your grave. The bells of Hearthmere ring for you every dawn.' },
      { when: END('tyrant'), text: 'Tamsin refused the court post you offered and left for Hearthmere with a hammer and an unforgiving look.' },
      { when: END('true_king'), text: 'Tamsin made the plain iron crown you wear — and a bell for every family of Hearthmere.' },
      { when: F('tamsin_hope'), text: 'Tamsin rebuilt the forge and taught the village children to melt swords into ploughs.' },
      { text: 'Tamsin returned to the forge. Some mornings she hums.' },
    ],
  },
  {
    id: 'sylwen', name: 'Sylwen', title: 'Warden of the Hollow Oak', role: 'ranged',
    personality: 'Quiet, watchful, dry-humoured. Speaks of the dead as if they were in the room.',
    backstory: 'Last of eighty Greenwatch rangers. She memorises the kingdom\'s history because paper burns.',
    sprite: 'companion_sylwen', portrait: 'portrait_sylwen', baseStats: { hp: 90, attack: 16, speed: 190 }, startLoyalty: 20, leaveBelow: -30,
    reactions: { mercy: 3, honest: 2, justice: 1, ruthless: -5, greed: -4, ambition: -2, dominant: -3, trust: 2 },
    barks: { ruthless: 'The trees heard that.', greed: 'The forest takes no coin.', mercy: 'The Whisperers hum when you do that.', dominant: 'I am not your hound.' },
    abilities: [
      { id: 'arrow_volley', name: 'Arrow Volley', kind: 'damage', power: 10, cooldownMs: 3500, trigger: { type: 'interval' }, targeting: 'nearest', vfx: 'vfx_arrow' },
      { id: 'thorn_snare', name: 'Thorn Snare', kind: 'stun', power: 1.5, cooldownMs: 14000, trigger: { type: 'enemies_at_least', value: 3 }, targeting: 'all_in_range', vfx: 'vfx_thorns' },
      { id: 'heartwood_arrow', name: 'Heartwood Arrow', kind: 'damage', power: 40, cooldownMs: 25000, minLoyalty: 50, trigger: { type: 'boss' }, targeting: 'boss', vfx: 'vfx_heartwood' },
    ],
    personalQuest: 'c_sylwen',
    fates: [
      { when: COMP('sylwen', 'left'), text: 'Sylwen returned to the Hollow Oak and never answered a letter from the south.' },
      { when: COMP('sylwen', 'dead'), text: 'Sylwen fell defending the realm; the Whisperers still repeat her last arrow-song.' },
      { when: F('thornwarden_cleansed'), text: 'Sylwen turned the Hollow Oak into a school. The forest is green again. She has started to laugh in her sleep.' },
      { when: END('tyrant'), text: 'Sylwen vanished into the wood the night of your coronation. The Greenwatch is a rumour again.' },
      { text: 'Sylwen returned to the Oak and keeps its records, alone but unbent.' },
    ],
  },
  {
    id: 'idris', name: 'Idris Qamar', title: 'The Exiled Physician', role: 'support',
    personality: 'Gentle, evasive, self-punishing. Funny when comfortable, silent when not.',
    backstory: 'Court physician who mixed the draught that killed King Aldric under Morrow\'s orders, believing it a sleeping tonic. Hid in the desert, healing strangers as penance.',
    sprite: 'companion_idris', portrait: 'portrait_idris', baseStats: { hp: 80, attack: 6, speed: 160 }, startLoyalty: 15, leaveBelow: -25,
    reactions: { mercy: 2, pragmatic: 2, honest: 1, justice: 1, deceit: 1, ruthless: -3, bitter: -1, greed: -1 },
    barks: { ruthless: 'There are men I could not save. I would rather not add to them.', mercy: 'You remind me why I took the oath.', pragmatic: 'Cold sense. It heals more than warmth sometimes.' },
    abilities: [
      { id: 'tincture', name: 'Healing Tincture', kind: 'heal', power: 25, cooldownMs: 15000, trigger: { type: 'player_hp_below', value: 0.5 }, targeting: 'player', vfx: 'vfx_green_mist' },
      { id: 'smoke_vial', name: 'Smoke Vial', kind: 'stun', power: 2, cooldownMs: 20000, trigger: { type: 'enemies_at_least', value: 3 }, targeting: 'all_in_range', vfx: 'vfx_smoke' },
      { id: 'second_breath', name: 'Second Breath', kind: 'revive', power: 1, cooldownMs: 120000, minLoyalty: 70, trigger: { type: 'player_hp_below', value: 0.1 }, targeting: 'player', vfx: 'vfx_gold_light' },
    ],
    personalQuest: 'c_idris',
    fates: [
      { when: COMP('idris', 'left'), text: 'Idris left in the night. A note: "Some debts cannot be paid by standing near the person owed."' },
      { when: COMP('idris', 'dead'), text: 'Idris died tending Crownfall\'s wounded. The refugees buried him as a physician, not an exile.' },
      { when: F('idris_forgiven'), text: 'Idris opened a free clinic in the Lower Ward. He signs it with his real name.' },
      { when: F('idris_accountable'), text: 'Idris testified before the new council and accepted the sentence. He served it healing prisoners.' },
      { text: 'Idris returned to the desert and the dunes, and sent healing herbs to Crownfall each spring.' },
    ],
  },
  {
    id: 'brannoch', name: 'Brannoch "Grim"', title: 'Sergeant of the Northern Company', role: 'bruiser',
    personality: 'Gruff, loyal, dry. Keeps humour as a shield and guilt as a weight.',
    backstory: 'Saltmarch survivor who deserted when Darken sacrificed the Northern Company. He told Aren he was ordered to leave him; the truth is he fled.',
    sprite: 'companion_brannoch', portrait: 'portrait_brannoch', baseStats: { hp: 180, attack: 18, speed: 130 }, startLoyalty: 20, leaveBelow: -30,
    reactions: { loyal: 3, justice: 2, mercy: 1, ruthless: 1, greed: -2, deceit: -3, ambition: 0 },
    barks: { deceit: 'Lies cost soldiers lives, lad.', loyal: 'That\'s how you keep an army.', ruthless: 'Hard. But war is hard.' },
    abilities: [
      { id: 'cleave', name: 'Cleave', kind: 'damage', power: 18, cooldownMs: 6000, trigger: { type: 'enemies_at_least', value: 2 }, targeting: 'all_in_range', vfx: 'vfx_cleave' },
      { id: 'warcry', name: 'Northern War-Cry', kind: 'buff', power: 1.2, cooldownMs: 30000, trigger: { type: 'combo_at_least', value: 5 }, targeting: 'player', vfx: 'vfx_warcry' },
      { id: 'last_stand', name: 'Last Stand', kind: 'shield', power: 40, cooldownMs: 60000, minLoyalty: 40, trigger: { type: 'player_hp_below', value: 0.25 }, targeting: 'player', vfx: 'vfx_shield_steel' },
    ],
    personalQuest: 'c_brannoch',
    fates: [
      { when: COMP('brannoch', 'left'), text: 'Brannoch returned to the Highlands, a deserter twice over, and does not speak of Saltmarch.' },
      { when: COMP('brannoch', 'dead'), text: 'Brannoch held the Palace Gate to the last. The clans sing of the Northern Sergeant.' },
      { when: F('brannoch_absolved'), text: 'Brannoch raised a new Northern Company — and called its first muster "Haldor\'s Own".' },
      { when: END('tyrant'), text: 'Brannoch stood at your side until the first execution. Then he walked north, alone.' },
      { text: 'Brannoch returned to Stormhold and tells younger soldiers the true story of Saltmarch.' },
    ],
  },
];

/* ---------------------------------------------------------------- personal quests */
const recruited = (id: string) => COMP(id, 'recruited');
export const companionQuests: QuestDef[] = [
  {
    id: 'c_tamsin', title: 'The Cold Forge', type: 'companion', region: 'ashen_village', chapter: 3, requires: recruited('tamsin'), autoStart: AND(CH(3), R('tamsin', '>=', 20)),
    summary: 'Tamsin\'s father forged the spears that burned Hearthmere. She wants to know what to do with that.',
    objectives: [OBJ('listen', 'Hear Tamsin\'s story', F('tamsin_story')), OBJ('decide', 'Help Tamsin decide what to do with her father\'s legacy', F('tamsin_resolved'), { after: ['listen'] })],
    reward: { xp: 300 }, onComplete: [vr('trust', 1)],
  },
  {
    id: 'c_sylwen', title: 'The Last Grove', type: 'companion', region: 'whispering_forest', chapter: 3, requires: recruited('sylwen'), autoStart: AND(CH(3), R('sylwen', '>=', 20)),
    summary: 'Sylwen carries the oaths of eighty dead rangers and fears she will be the last to remember them.',
    objectives: [OBJ('listen', 'Listen to Sylwen\'s oaths', F('sylwen_story')), OBJ('decide', 'Help Sylwen choose what to keep', F('sylwen_resolved'), { after: ['listen'] })],
    reward: { xp: 300 }, onComplete: [vr('honor', 1)],
  },
  {
    id: 'c_idris', title: 'The Apothecary\'s Debt', type: 'companion', region: 'forgotten_desert', chapter: 4, requires: recruited('idris'), autoStart: AND(CH(4), R('idris', '>=', 20)),
    summary: 'Idris is ready to say aloud what he did the night of the Feast.',
    objectives: [OBJ('confess', 'Hear Idris\'s confession', F('idris_story')), OBJ('judge', 'Decide what Idris owes', F('idris_resolved'), { after: ['confess'] })],
    reward: { xp: 400 }, onComplete: [vr('mercy', 0)],
  },
  {
    id: 'c_brannoch', title: 'The Last Muster', type: 'companion', region: 'frozen_highlands', chapter: 4, requires: recruited('brannoch'), autoStart: AND(CH(4), R('brannoch', '>=', 20)),
    summary: 'Brannoch can no longer keep the truth of Saltmarch from you.',
    objectives: [OBJ('confess', 'Hear Brannoch out', F('brannoch_story')), OBJ('judge', 'Decide how to answer him', F('brannoch_resolved'), { after: ['confess'] })],
    reward: { xp: 400 },
  },
];

export const companionDialogues: DialogueTree[] = [
  T('d_tamsin_forge', 'tamsin', 'a', {
    a: N('tamsin', 'My father hammered those spear-tips for the very regiment that burned us. Every night I hear the anvil. I don\'t know whether to melt his work into something good or hate him for it.', { mood: 'raw', effects: [fl('tamsin_story')], choices: [
      C('"Melt it into a bell for Hearthmere."', 'hope', { tags: ['mercy'], effects: [vr('mercy', 1), fl('tamsin_hope'), fl('tamsin_resolved'), rl('tamsin', 12)] }),
      C('"Forge it into blades for the militia."', 'steel', { tags: ['pragmatic', 'ambition'], effects: [vr('ambition', 1), fl('tamsin_steel'), fl('tamsin_resolved'), rl('tamsin', 5)] }),
      C('"You don\'t owe the dead anything."', 'rest', { tags: ['honest'], effects: [fl('tamsin_resolved'), rl('tamsin', 4)] })] }),
    hope: N('tamsin', 'Every bell had a name. I\'ll give this one my father\'s.', { effects: [reward({ xp: 50 })] }),
    steel: N('tamsin', 'Steel remembers. Let it remember being useful.', { effects: [] }),
    rest: N('tamsin', 'Maybe. Maybe that\'s the kindest thing anyone has said.', { effects: [] }),
  }),
  T('d_sylwen_grove', 'sylwen', 'a', {
    a: N('sylwen', 'Eighty names in my head. I say them at night so they\'ll know somebody carries them. What if I forget one? What if I am the only one who remembers?', { mood: 'soft', effects: [fl('sylwen_story')], choices: [
      C('"Plant the Heartwood Seed in their honour."', 'plant', { when: K('heartwood_seed'), tags: ['mercy'], effects: [vr('mercy', 1), fl('grove_replanted'), fl('sylwen_resolved'), rl('sylwen', 12)] }),
      C('"Teach me the names. I\'ll carry some."', 'teach', { tags: ['honest', 'loyal'], effects: [vr('trust', 1), fl('sylwen_resolved'), fl('sylwen_taught'), rl('sylwen', 10)] }),
      C('"Names don\'t win wars."', 'cold', { tags: ['ruthless'], effects: [fl('sylwen_resolved'), rl('sylwen', -8)] })] }),
    plant: N('sylwen', 'Eighty oaks. Eighty names. The wood will say them for me.', { effects: [reward({ xp: 50 })] }),
    teach: N('sylwen', 'Ashdan. Brevil. Cormae... Say them back to me.', { effects: [] }),
    cold: N('sylwen', 'Then we will not speak of it again.', { mood: 'cold' }),
  }),
  T('d_idris_debt', 'idris', 'a', {
    a: N('idris', 'Morrow ordered a sleeping draught for the King. I mixed it. I did not ask why he wanted it odourless and tasteless. I did not ask why I was to serve it to the King myself. I have never forgiven myself. I won\'t ask you to.', { mood: 'raw', effects: [fl('idris_story')], choices: [
      C('"You were deceived. The guilt is Morrow\'s."', 'forgive', { tags: ['mercy'], effects: [vr('mercy', 1), fl('idris_forgiven'), fl('idris_resolved'), rl('idris', 15)] }),
      C('"You\'ll stand before the realm and say it."', 'account', { tags: ['justice'], effects: [vr('honor', 1), fl('idris_accountable'), fl('idris_resolved'), rl('idris', 3)] }),
      C('"You killed my King."', 'cold', { tags: ['bitter'], effects: [fl('idris_resolved'), rl('idris', -10)] })] }),
    forgive: N('idris', 'You are kinder than I deserve. I will try to be worth it.', { effects: [reward({ xp: 50 })] }),
    account: N('idris', 'That is just. Terrible, and just. I will do it.', { effects: [] }),
    cold: N('idris', 'Yes. I did.', { mood: 'cold' }),
  }),
  T('d_brannoch_muster', 'brannoch', 'a', {
    a: N('brannoch', 'I told you Darken ordered me to leave you. That was a lie. I ran. When the horns sounded and the Northern Company went under, I ran, and I called it orders. I\'ve been a deserter since.', { mood: 'raw', effects: [fl('brannoch_story')], choices: [
      C('"You were nineteen and terrified. I forgive you."', 'absolve', { tags: ['mercy', 'loyal'], effects: [vr('mercy', 1), fl('brannoch_absolved'), fl('brannoch_resolved'), rl('brannoch', 15)] }),
      C('"Then earn your muster. Stand with the clans."', 'earn', { tags: ['justice'], effects: [vr('honor', 1), fl('brannoch_earning'), fl('brannoch_resolved'), rl('brannoch', 6)] }),
      C('"A deserter is no soldier of mine."', 'cold', { tags: ['ruthless'], effects: [fl('brannoch_resolved'), rl('brannoch', -12)] })] }),
    absolve: N('brannoch', 'Lad... the weight\'s lighter. Not gone. Lighter.', { effects: [reward({ xp: 50 })] }),
    earn: N('brannoch', 'Aye. That, I can do.', {}),
    cold: N('brannoch', 'Right. Right, then.', { mood: 'cold' }),
  }),
];

/* ---------------------------------------------------------------- speaker-only NPCs (named speakers used in cutscenes) */
export const speakerNpcs: NpcDef[] = [
  { id: 'hobb', name: 'Sergeant Hobb', region: 'ashen_village', role: 'Boss', description: 'Crown Reclamation sergeant.', portrait: 'portrait_hobb', sprite: 'boss_hobb', dialogue: [] },
  { id: 'voss', name: 'Captain Voss', region: 'frozen_highlands', role: 'Boss', description: 'Chancellor Morrow\'s Ironwatch commander.', portrait: 'portrait_voss', sprite: 'boss_voss', dialogue: [] },
  { id: 'vesk', name: 'Hush-Mother Vesk', region: 'hollow_city', role: 'Boss', description: 'Jailer of the Hush Vaults.', portrait: 'portrait_vesk', sprite: 'boss_vesk', dialogue: [] },
  { id: 'morrow', name: 'Chancellor Veyl Morrow', region: 'crownfall', role: 'Final Boss', description: 'Regent, poisoner, and willing heart of the Ember Crown.', portrait: 'portrait_morrow', sprite: 'boss_morrow', dialogue: [] },
  { id: 'darken', name: 'Darken Holt', region: 'crownfall', role: 'Commander', description: 'Aren\'s oldest friend and betrayer.', portrait: 'portrait_darken', sprite: 'npc_darken', dialogue: [] },
];
void key;
