/* Headless test-suite (no framework, no Phaser). Run: tsc -p . && node build/modules/world/tests/run-tests.js */
import { WorldModule } from '../index';
import type { EndingId } from '../types';

declare const process: { exit(code: number): never };
let passed = 0; const failures: string[] = [];
function ok(cond: unknown, msg: string): void { if (cond) passed++; else { failures.push(msg); console.log('  FAIL:', msg); } }

/** Drain any active dialogue; choose by the first matching preference substring (else first choice). */
function drain(m: WorldModule, prefs: string[]): void {
  for (let guard = 0; guard < 300 && m.isInDialogue(); guard++) {
    const v = m.getDialogue();
    if (!v) break;
    if (v.choices.length) {
      let idx = 0;
      outer: for (const p of prefs) { for (const c of v.choices) if (c.text.includes(p)) { idx = c.index; break outer; } }
      m.choose(idx);
    } else m.advance();
  }
  if (m.isInDialogue()) throw new Error('dialogue did not terminate');
}
const talk = (m: WorldModule, npc: string, prefs: string[]) => { m.talkTo(npc); drain(m, prefs); };
const zone = (m: WorldModule, z: string, prefs: string[]) => { m.reportZone(z); drain(m, prefs); };
const touch = (m: WorldModule, o: string, prefs: string[]) => { m.reportInteract(o); drain(m, prefs); };
const kill = (m: WorldModule, e: string, b: string, prefs: string[]) => { m.reportKill(e, b); drain(m, prefs); };
const col = (m: WorldModule, ids: string[], prefs: string[] = []) => { ids.forEach(i => { m.collect(i); drain(m, prefs); }); };

interface Profile { name: string; expect: EndingId; prefs: string[]; skipRite?: boolean; fewFrags?: boolean }

function playthrough(p: Profile): WorldModule {
  const m = new WorldModule(); const P = p.prefs;
  /* Chapter 1 */
  zone(m, 'start_wake', P); zone(m, 'forge_yard', P); talk(m, 'tamsin', P);
  col(m, ['valcrest_blade', 'hearth_1', 'hearth_2', 'hearth_3', 'hearth_4', 'hearth_5', 'child_drawing'], P);
  talk(m, 'marta', P); col(m, ['pantry_bread'], P); talk(m, 'marta', P); talk(m, 'jorin', P);
  col(m, ['well_key'], P); touch(m, 'old_well', P); col(m, ['frag_1'], P);
  zone(m, 'hobb_arena', P); kill(m, 'sergeant_hobb', 'hobb', P); touch(m, 'burn_order', P);
  ok(m.getQuest('m1_embers').status === 'completed', `${p.name}: m1 completed`);
  ok(m.getChapter() === 2, `${p.name}: chapter 2`);
  ok(m.getParty().includes('tamsin'), `${p.name}: tamsin recruited`);
  /* Chapter 2 */
  zone(m, 'greenwatch_gate', P); talk(m, 'whisperer', P); talk(m, 'pell', P); talk(m, 'sylwen', P);
  zone(m, 'rook_camp', P); talk(m, 'rook', P); col(m, ['greenwatch_sigil'], P); touch(m, 'heartwood_roots', P); col(m, ['heartwood_seed'], P);
  [1, 2, 3, 4].forEach(i => touch(m, `wisp_${i}`, P)); col(m, ['whisper_leaf', 'pell_satchel'], P);
  zone(m, 'oak_arena', P); kill(m, 'thornwarden', 'thornwarden', P); col(m, ['frag_2'], P);
  ok(m.getQuest('m2_trees').status === 'completed', `${p.name}: m2 completed`);
  /* Chapter 3 */
  zone(m, 'oasis_bazaar', P); talk(m, 'idris', P); col(m, ['sun_key'], P); zone(m, 'first_bearer_hall', P); touch(m, 'first_bearer_wall', P); kill(m, 'sandglass_colossus', 'colossus', P);
  talk(m, 'nadira', P); col(m, ['cask_1', 'cask_2', 'cask_3'], P); talk(m, 'nadira', P);
  talk(m, 'qasim', P); col(m, ['raider_ledger'], P); talk(m, 'qasim', P);
  col(m, [1, 2, 3, 4, 5, 6].map(i => `glyph_${i}`), P); ['dawn', 'noon', 'dusk'].forEach(d => touch(m, `sundial_${d}`, P)); touch(m, 'vault_chest', P); col(m, ['frag_3'], P);
  ok(m.getQuest('m3_bearer').status === 'completed', `${p.name}: m3 completed`);
  /* personal quests start as loyalty rises; run the ones available */
  for (const [npc, flag] of [['tamsin', 'tamsin_resolved'], ['sylwen', 'sylwen_resolved']] as const) { if (m.getQuest(`c_${npc}`).status === 'active') { talk(m, npc, P); ok(m.hasFlag(flag), `${p.name}: ${npc} personal quest resolved`); } }
  /* Chapter 4 */
  zone(m, 'stormhold', P); talk(m, 'brannoch', P); talk(m, 'hallgerd', P);
  talk(m, 'ketil', P); [1, 2, 3].forEach(i => touch(m, `bell_${i}`, P)); talk(m, 'ketil', P);
  talk(m, 'dagny', P); col(m, ['ration_crate'], P); talk(m, 'dagny', P);
  col(m, [1, 2, 3, 4, 5].map(i => `cairn_${i}`), P); col(m, ['ketil_rune'], P); touch(m, 'ice_wall', P); col(m, ['saltmarch_letters'], P);
  zone(m, 'ironwatch_gate', P); zone(m, 'voss_arena', P); kill(m, 'captain_voss', 'voss', P); col(m, p.fewFrags ? [] : ['frag_4'], P);
  if (p.fewFrags) m.setFlag('voss_ring_skipped');
  for (const npc of ['idris', 'brannoch']) { if (m.getQuest(`c_${npc}`).status === 'active') talk(m, npc, P); }
  /* Chapter 5 */
  talk(m, 'osk', P); zone(m, 'vesk_arena', P); kill(m, 'hush_mother_vesk', 'hushmother', P); talk(m, 'elen', P); col(m, p.fewFrags ? [] : ['frag_5'], P);
  talk(m, 'dov', P); col(m, ['mask_1', 'mask_2', 'mask_3'], P); talk(m, 'dov', P);
  col(m, ['name_1', 'name_2', 'name_3', 'name_4'], P); touch(m, 'name_board', P); [1, 2, 3, 4, 5].forEach(i => touch(m, `lamp_${i}`, P));
  touch(m, 'queens_door_panel', P); if (!p.skipRite) col(m, ['queens_rite'], P);
  /* Chapter 6 */
  talk(m, 'ines', P); [1, 2, 3].forEach(i => touch(m, `evac_${i}`, P)); talk(m, 'ines', P);
  talk(m, 'alwen', P); touch(m, 'armory_chest', P); talk(m, 'alwen', P);
  col(m, [1, 2, 3, 4, 5].map(i => `banner_${i}`), P); touch(m, 'king_portrait', P); col(m, ['aldric_last_words'], P);
  zone(m, 'palace_gate', P); zone(m, 'throne_hall', P); zone(m, 'morrow_arena', P); kill(m, 'chancellor_morrow', 'morrow', P);
  return m;
}

function suite(): void {
  console.log('== Content validation');
  const m0 = new WorldModule();
  const errs = m0.content.validate();
  errs.forEach(e => console.log('  ', e));
  ok(errs.length === 0, `content has no broken references (${errs.length} problems)`);
  const c = m0.content;
  console.log(`   regions=${c.regions.size} levels=${c.levels.size} npcs=${c.npcs.size} dialogues=${c.dialogues.size} nodes=${[...c.dialogues.values()].reduce((a, t) => a + Object.keys(t.nodes).length, 0)} quests=${c.quests.size} collectibles=${c.collectibles.size} pois=${c.pois.size} companions=${c.companions.size}`);
  ok(c.regions.size === 6, 'six regions'); ok(c.endings.size === 5, 'five endings'); ok(c.companions.size >= 4, 'at least four companions');

  console.log('== Initial state');
  ok(m0.getChapter() === 1, 'starts in chapter 1');
  ok(m0.getQuest('m1_embers').status === 'active', 'main quest auto-starts');
  ok(m0.getMapView().nodes.filter(n => n.unlocked).length === 1, 'only Ashen Village unlocked at start');
  ok(!m0.useExit('ashen_village_main', 'to_forest').ok, 'forest exit locked at start');
  ok(m0.getLevelRuntime('ashen_village_main')!.npcs.some(n => n.npc === 'tamsin'), 'tamsin placed in village before recruitment');

  console.log('== Dialogue: conditional entry, effects, reactions');
  const m1 = new WorldModule();
  m1.talkTo('marta'); ok(!!m1.getDialogue(), 'marta starts dialogue');
  const idx = m1.getDialogue()!.choices.findIndex(x => x.text.includes('find food')); m1.choose(idx); drain(m1, []);
  ok(m1.getQuest('s1_cellar').status === 'active', 'dialogue effect starts side quest');
  m1.collect('pantry_bread'); m1.talkTo('marta');
  ok(m1.getDialogue()!.nodeId === 'deliver', 'conditional entry node chosen when bread collected');
  const before = m1.getHiddenVariables();
  drain(m1, ['All of it']); const after = m1.getHiddenVariables();
  ok(after.mercy > before.mercy && after.honor > before.honor, 'choice changed hidden variables (mercy, honor)');
  ok(m1.getQuest('s1_cellar').status === 'completed', 'side quest completed by choice');
  ok(m1.hasFlag('village_hope'), 'consequence flag set');

  console.log('== Hidden path + exploration');
  const m2 = new WorldModule();
  ok(!m2.getHiddenPaths('ashen_village_main').find(h => h.id === 'well_cellar')!.revealed, 'well path hidden initially');
  m2.collect('well_key'); ok(m2.getQuest('h1_well').status === 'active', 'hidden quest appears after key found');
  m2.reportInteract('old_well'); ok(m2.getHiddenPaths('ashen_village_main').find(h => h.id === 'well_cellar')!.revealed, 'well path revealed');
  ok(m2.useExit('ashen_village_main', 'to_cellars').ok, 'cellar exit now open');
  ok(m2.getExploration('ashen_village').collectibles.found === 1, 'exploration counter');

  console.log('== Companion combat support + reactions');
  const m3 = playthrough({ name: 'smoke', expect: 'wanderer', prefs: [] });
  const specs = m3.getPartySpecs(); ok(specs.length >= 1 && specs.length <= 2, 'party size within limit');
  const acts = m3.requestAssist({ now: 1000, playerHpRatio: 0.3, enemyCount: 4, bossActive: true, comboCount: 6 });
  ok(acts.length > 0, 'assist actions produced'); ok(m3.requestAssist({ now: 1001, playerHpRatio: 0.3, enemyCount: 4, bossActive: true, comboCount: 6 }).length < acts.length || acts.length === 0, 'cooldowns respected');

  console.log('== Save / restore round-trip');
  const saved = JSON.parse(JSON.stringify(m3.serialize()));
  const m4 = new WorldModule({ saveData: saved });
  ok(JSON.stringify(m4.serialize()) === JSON.stringify(saved), 'restore reproduces identical state');
  ok(m4.getChapter() === m3.getChapter(), 'chapter preserved');

  console.log('== Events');
  const evs: string[] = []; const m5 = new WorldModule(); m5.on('*', (e: any) => evs.push(e.event));
  m5.reportZone('start_wake'); m5.collect('hearth_1');
  ok(evs.includes('world:dialogue-started') && evs.includes('world:collectible-found') && evs.includes('world:quest-started'), 'expected events emitted');
  const ext: string[] = []; const fake = { _h: {} as any, emit(e: string) { ext.push(e); }, on(e: string, f: any) { (this._h[e] ??= []).push(f); }, off() {} };
  const m6 = new WorldModule({ emitter: fake }); fake._h['player:entered-zone'][0]({ zoneId: 'start_wake' });
  ok(ext.includes('world:dialogue-started'), 'external emitter receives world events and drives the module');

  console.log('== Endings (full scripted playthroughs)');
  const TK_PREFS = ['All of it', 'Refuse', 'This is the last', 'Show the Valcrest', 'Welcome', 'honoured', 'Hear him out', 'Stand down', 'Rely on me', 'Nothing. Share', 'Pay the tax', 'Name the favour', 'Give them to the families', 'I\'ll get you out', 'Share with', 'I rang it', 'swear', 'Honour', 'last of my name', 'Free the Crown scouts', 'Plant the Heartwood', 'Teach me', 'forgive', 'Deceived', 'I forgive', 'Arm the militia', 'see you to the river', 'Plant the Heartwood Seed', 'stand trial', 'Stand at my side', 'Accept the throne', 'The militia', 'The Greenwatch vouch', 'Melt it', 'Here. Our bargain', 'Hear him', 'I\'ll take it', 'I\'ll find', 'I\'ll open', 'I\'ll look', 'Welcome back', 'Not enough'] ;
  const profiles: Profile[] = [
    { name: 'true_king', expect: 'true_king', prefs: TK_PREFS },
    { name: 'tyrant', expect: 'tyrant', prefs: ['Take it', 'Walk away before', 'Half', 'keep half', 'Sell them', 'keep the rest', 'I don\'t pay taxes', 'finish', 'End him', 'Your men carry', 'Take the antler', 'Sell the casks', 'regalia', 'Take the Crown', 'Run him through', 'leverage', 'terms now', 'promise', 'self-govern', 'When I\'m king', 'Not my problem', 'I left it', 'Names don', 'You killed my King', 'deserter', 'Then I\'ll use this', 'Perhaps', 'Trade the rations', 'Go. I must'] },
    { name: 'wanderer', expect: 'wanderer', prefs: ['Take it', 'Walk away.', 'Stand down', 'All of it', 'Welcome', 'Hear him out', 'stand trial', 'Rely on me', 'Pay the tax', 'Name the favour'] },
    { name: 'hidden_truth', expect: 'hidden_truth', prefs: ['All of it', 'Refuse', 'This is the last', 'Welcome', 'Hear him out', 'Stand down', 'Rely on me', 'Nothing. Share', 'Pay the tax', 'Name the favour', 'Give them to the families', 'I\'ll get you out', 'I rang it', 'swear', 'Show the realm', 'stand trial', 'I\'ll find', 'Will you stand witness', 'Teach me'] },
    { name: 'fallen_hero_vengeance', expect: 'fallen_hero', prefs: ['Take it', 'Walk away before', 'Run him through', 'Your men carry', 'I don\'t pay taxes', 'terms now', 'Walk away.', 'Names don', 'I left it', 'Take the antler', 'Not my problem', 'None. I am', 'End him.', 'Perhaps', 'Stay hidden', 'Keep one for myself', 'Sell them', 'Go. I must', 'I don\'t remember', 'left me to hang', 'Not every face', 'too dangerous', 'Keep your voice', 'Sell the casks', 'When I\'m king', 'Take it.', 'Names'] },
    { name: 'fallen_hero_unbound', expect: 'fallen_hero', skipRite: true, prefs: ['All of it', 'Welcome', 'Hear him out', 'stand trial', 'Break the Crown by force', 'Rely on me', 'Pay the tax'] },
  ];
  const seen = new Set<EndingId>();
  for (const p of profiles) {
    const m = playthrough(p);
    const e = m.getEnding(); const vars = m.getHiddenVariables();
    const rel = ['tamsin', 'sylwen', 'idris', 'brannoch'].map(id => `${id}:${m.getRelationship(id)}`).join(' ');
    console.log(`   ${p.name.padEnd(24)} -> ${String(e).padEnd(13)} vars=${JSON.stringify(vars)} ${rel} party=${m.getParty().join(',')}`);
    console.log(`      eval: ${m.previewEndings().map(x => `${x.id}${x.eligible ? '*' : ''}=${x.score}`).join(' ')}`);
    ok(e === p.expect, `${p.name}: ending is ${p.expect} (got ${e})`);
    if (e) seen.add(e);
    ok(m.getQuest('m6_crown').status === 'completed', `${p.name}: final main quest completed`);
  }
  ok(seen.size === 5, `all five endings reachable (${[...seen].join(', ')})`);

  console.log('== Ending depends on more than the final choice');
  const alt = playthrough({ name: 'claim-but-honourable', expect: 'fallen_hero', prefs: ['Take the Crown', ...TK_PREFS.filter((x: string) => x !== 'Accept the throne')] });
  ok(alt.getEnding() === 'fallen_hero', 'honourable, unambitious Aren claiming the Crown is consumed by it (Fallen Hero), not Tyrant');
  const tyr = playthrough({ name: 'claim-ambitious', expect: 'tyrant', prefs: profiles[1].prefs });
  ok(tyr.getEnding() === 'tyrant', 'same final choice (claim) with an ambitious path yields Tyrant');
  console.log(`   same final choice (Take the Crown): honourable path -> ${alt.getEnding()}, ambitious path -> ${tyr.getEnding()}`);
}

suite();
console.log(`\n${passed} assertions passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
