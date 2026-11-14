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
    entryLevel: 'ashen_prison', mapPos: { x: 0.14, y: 0.78 }, startsUnlocked: true,
    connections: [{ to: 'whispering_forest', requires: Q('m1_embers') }],
  },

  levels: [
    {
      id: 'ashen_prison', region: 'ashen_village', name: 'The Blackwell Cells', size: { w: 2600, h: 900 },
      atmosphere: ATM({ palette: { sky: '#11141b', mid: '#292d35', fore: '#090b10', accent: '#b58b63' }, weather: 'none', light: 'gloom', music: 'cellars_hush', ambience: ['drip', 'low_hum'], particles: 'dust_motes', notes: 'A grounded underground prison: heavy stone, iron bars, damp floors and sparse wall torches.' }),
      spawns: { start: { x: 180, y: 740 } },
      platforms: [
        P(0, 780, 2600, 120, 'stone'), P(160, 620, 520, 28, 'stone'),
        P(900, 570, 340, 28, 'stone'), P(1510, 640, 330, 28, 'stone'),
        P(2020, 590, 420, 28, 'stone'),
      ],
      hazards: [],
      enemies: [{ type: 'cellar_rat_swarm', x: 1110, y: 720, patrol: [940, 1280] }],
      npcs: [], collectibles: [{ id: 'prison_mark', x: 480, y: 580 }],
      hiddenPaths: [], zones: [
        { id: 'prison_wake', rect: rect(60, 560, 420, 220) },
        { id: 'prison_gate', rect: rect(2070, 560, 430, 220) },
      ],
      interactables: [{ id: 'prison_latch', x: 2350, y: 740, label: 'Broken gate' }],
      exits: [{ id: 'escape_to_woods', rect: rect(2480, 640, 100, 140), to: { level: 'ashen_escape_woods', spawn: 'start' } }],
      lore: [{ id: 'l_prison_wall', kind: 'mural', x: 540, y: 740, text: 'A name scratched into the stone: VALCREST. Beneath it, someone has written: THE KING DID NOT DIE BY YOUR HAND.' }],
    },
    {
      id: 'ashen_escape_woods', region: 'ashen_village', name: 'The Green Verge', size: { w: 3800, h: 1000 },
      atmosphere: ATM({ palette: { sky: '#7cae9c', mid: '#50785a', fore: '#193a2b', accent: '#b5d78a' }, weather: 'spores', light: 'dawn', music: 'whispering_forest_theme', ambience: ['leaf_rustle', 'owl', 'birds_morning'], particles: 'glow_spores', notes: 'A bright, breathing green woodland after the prison: layered trees, moss, soft morning haze and a stream.' }),
      spawns: { start: { x: 120, y: 800 } },
      platforms: [
        P(0, 820, 3800, 180, 'ground'), P(420, 690, 200, 24, 'vine'),
        P(1120, 610, 240, 24, 'wood'), P(1940, 700, 260, 24, 'vine'),
        P(2800, 620, 220, 24, 'wood'),
      ],
      hazards: [{ type: 'thorns', rect: rect(1550, 800, 130, 20), damage: 5 }],
      enemies: [
        { type: 'thornling', x: 1050, y: 780, patrol: [900, 1360] },
        { type: 'ash_wolf', x: 2240, y: 780, patrol: [2050, 2530] },
      ],
      npcs: [{ npc: 'mira', x: 650, y: 800 }],
      collectibles: [{ id: 'green_seed', x: 1760, y: 660 }],
      hiddenPaths: [], zones: [
        { id: 'woods_first_breath', rect: rect(0, 620, 580, 200) },
        { id: 'mira_grove', rect: rect(500, 600, 420, 220) },
      ],
      interactables: [{ id: 'mira_herbs', x: 760, y: 800, label: 'Herb basket' }],
      exits: [{ id: 'to_village_after_escape', rect: rect(3680, 680, 100, 140), to: { level: 'ashen_village_main', spawn: 'from_escape' } }],
      lore: [
        { id: 'l_escape_stream', kind: 'ruin', x: 1580, y: 800, text: 'The stream runs clear here. The first clean water you have seen since the trial.' },
        { id: 'l_escape_stone', kind: 'sign', x: 3100, y: 800, text: 'Hearthmere lies east. The road is watched, but not closed.' },
      ],
    },
    {
      id: 'ashen_village_main', region: 'ashen_village', name: 'Cinderhollow Road', size: { w: 6400, h: 900 }, atmosphere: ATMOS_MAIN,
      spawns: { start: { x: 360, y: 700 }, from_cellar: { x: 3240, y: 700 }, from_forest: { x: 6200, y: 700 }, from_escape: { x: 120, y: 700 } },
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
        { type: 'ash_wolf', x: 1480, y: 700, patrol: [1380, 1720] }, { type: 'crown_soldier', x: 2300, y: 700, patrol: [2100, 2700] },
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
    { id: 'mira', name: 'Mira Vale', region: 'ashen_village', role: 'Forest Herbalist', description: 'A young herbalist who tends the green verge and shelters travellers escaping the Crown roads.', portrait: 'portrait_mira', sprite: 'npc_mira', dialogue: [{ tree: 'd_mira_intro' }] },
    { id: 'tamsin', name: 'Tamsin Reed', region: 'ashen_village', role: 'Forgekeeper / Companion', description: 'Blacksmith\'s daughter who tends a forge with no iron left.', portrait: 'portrait_tamsin', sprite: 'npc_tamsin', companion: 'tamsin',
      dialogue: [{ when: Q('c_tamsin', 'active'), tree: 'd_tamsin_forge' }, { when: COMP('tamsin', 'recruited'), tree: 'd_tamsin_camp' }, { tree: 'd_tamsin_meet' }] },
    { id: 'marta', name: 'Old Marta', region: 'ashen_village', role: 'Cellar Keeper', description: 'Hides eleven survivors under the well and counts every crumb.', portrait: 'portrait_marta', sprite: 'npc_marta', dialogue: [{ tree: 'd_marta' }] },
    { id: 'jorin', name: 'Jorin Pike', region: 'ashen_village', role: 'Debt Collector', description: 'A Crown-licensed scavenger buying relics from the ruined.', portrait: 'portrait_jorin', sprite: 'npc_jorin', dialogue: [{ tree: 'd_jorin' }] },
  ],

  dialogues: [
    CUT('d_prison_wake', 'a', {
      a: N('narrator', 'بوی نم و آهن زنگ‌زده بیدارت می‌کند. سقف کوتاه است و صدای قطره‌ها از پشت دیوار می‌آید. از محاکمه فقط تکه‌هایی یادت مانده؛ حالا در سلولی بی‌نامی و نگهبانی در راهرو قدم می‌زند.', { next: 'b' }),
      b: N('aren', 'اگر اینجا بمانم، حقیقت هم همراه من دفن می‌شود. باید از این زندان بیرون بروم.', { choices: [
        C('«اول باید راه خروج را پیدا کنم.»', 'c', { tags: ['pragmatic'], effects: [fl('prison_awake')] }),
        C('«هنوز نمی‌دانم چه کسی به من خیانت کرد.»', 'c', { tags: ['honest'], effects: [vr('trust', -1), fl('prison_awake')] }),
      ] }),
      c: N('narrator', 'قفل در سلول شکسته است. هوای سردی از شکاف راهرو می‌وزد؛ راهی باریک به بیرون وجود دارد.', { effects: [fl('prison_escape_started')] }),
    }),
    T('d_mira_intro', 'mira', 'a', {
      a: N('mira', 'آروم‌تر. اینجا صدای قدم‌ها تا دوردست می‌ره. من میرا هستم؛ گیاه‌های این بیشه رو می‌شناسم. اگر از زندان اومدی، قبل از رسیدن به جاده کمی نفس بگیر.', { choices: [
        C('«چرا اینجا موندی؟»', 'b', { tags: ['curious'] }),
        C('«راه امن به هِرث‌میر کدومه؟', 'c', { tags: ['direct'] }),
      ] }),
      b: N('mira', 'چون همه از جاده فرار می‌کنن و کسی باید حواسش به زخمی‌ها و گم‌شده‌ها باشه. جنگل هنوز برای همه درش رو نبسته.'),
      c: N('mira', 'از کنار جوی آب برو و از برج دیده‌بانی دوری کن. وقتی به خانه‌های سوخته رسیدی، دنبال دود کم‌رنگ آهنگری بگرد.'),
    }),
    CUT('d_village_arrival', 'a', {
      a: N('narrator', 'از بیشهٔ سبز که بیرون می‌آیی، بوی دود دوباره به مشامت می‌رسد. هِرث‌میر هنوز پابرجاست، اما خانه‌هایش سوخته و مردمش در پناه دیوارهای نیمه‌ویران زندگی می‌کنند.', { next: 'b' }),
      b: N('aren', 'این‌بار از زندان فرار کرده‌ام؛ اما تا وقتی نامم را از دروغ پاک نکنم، راه خانه تمام نمی‌شود.', { effects: [fl('village_arrived')] }),
    }),
    CUT('d_opening', 'a', {
      a: N('narrator', 'خاکستر بر زبانت نشسته و سنگ سرد اجاق زیر گونه‌ات است. روستایی که روزی برای بازسازی‌اش هزینه کردی، اکنون به ویرانه‌ای بدل شده است.', { next: 'b' }),
      b: N('aren', 'سه روز از محاکمه گذشته است. عمارت، نام و شمشیرت را گرفتند. دارکن آنجا ایستاد و کلمهٔ «مجرم» را چنان بر زبان آورد که انگار فهرست خرید می‌خواند.', { mood: 'grim', next: 'c' }),
      c: N('aren', 'پس از همان‌جا آغاز می‌کنم که همه‌چیز شروع شد؛ از آهنگری.', { effects: [fl('opening_seen')] }),
    }),
    CUT('d_hobb_pre', 'a', {
      a: N('hobb', 'وال‌کرست! گروهبان هاب هستم، از واحد بازپس‌گیری تاج. برای سرت چهل سکهٔ نقره جایزه گذاشته‌اند و اگر فرار کنی، یازده روستایی را به دار می‌کشند.', { mood: 'cruel', next: 'b' }),
      b: N('aren', 'این مردم مال تو نیستند که به دارشان بکشی.', { choices: [
        C('«عقب بکش و برو؛ هنوز فرصت داری.»', 'c', { tags: ['mercy'], effects: [vr('mercy', 1)] }),
        C('«پس بیا و خودت دستگیرم کن.»', 'c', { tags: ['ruthless'], effects: [vr('ambition', 1)] }) ] }),
      c: N('hobb', 'سربازها! بقیه‌اش را به آتش بکشید.', { mood: 'cruel' }),
    }),
    CUT('d_burn_order', 'a', {
      a: N('narrator', 'فرمان را به تیرکی سوخته میخ کرده‌اند: «هِرث‌میر را بسوزانید؛ به یک خائن پناه داده است.» زیر نوشته، مُهری از موم دیده می‌شود؛ شاهینی بر فراز دو نیزهٔ ضربدری.', { next: 'b' }),
      b: N('aren', 'مُهر دارکن است. خودش فرمان سوزاندن روستایی را امضا کرده که هر دوی ما را بزرگ کرد.', { mood: 'cold', effects: [fl('saw_darken_seal'), vr('trust', -1)], next: 'c' }),
      c: N('aren', 'مردم جنگل اسناد تاج‌وتخت را نگه می‌دارند. اگر کسی بتواند حقیقت را ثابت کند، نگهبانان سبز هستند.'),
    }),
    CUT('d_tamsin_join', 'a', {
      a: N('tamsin', 'آن مُهر شاهین... پدرم نوک نیزه‌های همان هنگ را می‌ساخت. به من گفته بود هرگز آن‌ها را به‌سوی هِرث‌میر نمی‌گیرند. من هم با تو می‌آیم، وال‌کرست.', { mood: 'fierce', choices: [
        C('«به یک همراه قابل‌اعتماد نیاز دارم. خوش آمدی.»', 'b', { tags: ['loyal'], effects: [rl('tamsin', 8), vr('trust', 1)] }),
        C('«این سفر بیش از حد خطرناک است.»', 'c', { tags: ['distance'], effects: [rl('tamsin', -4)] }) ] }),
      b: N('tamsin', 'پشیمان نمی‌شوی. البته شاید هم بشوی؛ آن‌وقت می‌گویم که از اول بهت هشدار داده بودم.', { effects: [rec('tamsin')] }),
      c: N('tamsin', 'ماندن اینجا و منتظر مشعل بعدی نشستن خطرناک‌تر است. من می‌آیم.', { effects: [rec('tamsin')] }),
    }),
    T('d_tamsin_meet', 'tamsin', 'a', {
      a: N('tamsin', 'صبر کن... بذار درست ببینمت. خودتی؟ آرن وال‌کرست؟ به اخگر قسم، فکر می‌کردم دیگه زنده نیستی. همه می‌گفتن کارت تمومه.', { mood: 'wary', choices: [
        C('«تلاششان را کردند. باید به ویرانه‌های عمارت و شمشیرم برسم.»', 'b', { tags: ['honest'] }),
        C('«آهسته‌تر حرف بزن؛ هاب ممکن است صدایت را بشنود.»', 'b') ] }),
      b: N('tamsin', 'شمشیرت هنوز توی خرابه‌های عمارته. خودم از آتیش بیرونش کشیدم، ولی نتونستم از اونجا دورش کنم؛ افراد هاب همه‌جا رو می‌پان. از پشت آهنگری برو. راهش امن‌تره... البته امن که نه، فقط کمتر خطرناکه. من اینجا حواسم به اوضاع هست.', { effects: [fl('tamsin_met')] }),
    }),
    T('d_tamsin_camp', 'tamsin', 'a', {
      a: N('tamsin', 'باز پیدات شد، وال‌کرست. یا کاری داری، یا مثل همیشه می‌خوای وانمود کنی فقط اومدی احوال بپرسی. خب، بگو ببینم.', { variants: [
        { when: R('tamsin', '>=', 60), text: 'می‌دانی، دیگر شمارش راه‌هایی را که آمده‌ایم کنار گذاشته‌ام. هرچه می‌خواهی بپرس.' },
        { when: R('tamsin', '<', 10), text: 'با انتخاب خودم همراهت شده‌ام. کاری نکن از این انتخاب پشیمان شوم.' }],
        choices: [C('«از روستا، پیش از آتش‌سوزی برایم بگو.»', 'b'), C('«چیزی نیست. خوب استراحت کن.»')] }),
      b: N('tamsin', 'هر ناقوس یه اسم داشت. ناقوس صبح مال گرتا بود، ناقوس ظهر رو هم به اسم مادرم صدا می‌زدیم. وقتی برای جنگ ذوبشون کردن، پدرم فقط گفت: «آهن یادش می‌مونه قبلاً چی بوده.» اون موقع نفهمیدم منظورش چیه.', { effects: [rl('tamsin', 2)] }),
    }),
    T('d_marta', 'marta', 'a', {
      a: N('marta', 'هیس... صدات رو بیار پایین. یازده نفر زیر این چاه پنهان شدن. اگه از آدم‌های تاجی، همین حالا برگرد. ولی اگه واقعاً آرنی، دست‌هات رو نشونم بده... چیزی برای ما آوردی؟', { variants: [{ when: Q('s1_cellar', 'active'), text: 'هنوز خبری از نون نیست؟ بچه‌ها دیگه حتی چیزی نمی‌پرسن. می‌دونی، گرسنگی یه طرف... اینکه بچه دیگه امیدی به جواب نداشته باشه، خیلی بدتره.' }],
        choices: [C('«برای پناهگاه غذا پیدا می‌کنم.»', 'ok', { effects: [qs('s1_cellar')], tags: ['mercy'] }), C('«نمی‌توانم کمکی کنم. متأسفم.»', undefined, { effects: [vr('mercy', -1)] })] }),
      ok: N('marta', 'انبار نونوایی قدیمی رو بگرد. پشت تنور، کنار تیر چوبی سوم یه چیزی قایم کرده بود. سربازها هنوز پیداش نکردن. فقط... اگه چیزی پیدا کردی، اول سهم بچه‌ها رو کنار بذار.'),
      deliver: N('marta', 'این بوی نونه؟ نون واقعی؟ یه لحظه صبر کن... چند وقته بچه‌ها نون گرم ندیدن. چقدر تونستی پیدا کنی، آرن؟', { choices: [
        C('«همه‌اش برای شماست.»', 'all', { tags: ['mercy', 'honest'], effects: [vr('mercy', 2), vr('honor', 1), fl('bread_all'), fl('bread_resolved'), fl('village_hope'), rl('tamsin', 3)] }),
        C('«نصفش را می‌دهم؛ خودم هم راهی طولانی در پیش دارم.»', 'half', { tags: ['pragmatic'], effects: [vr('ambition', 1), fl('bread_resolved')] }),
        C('«یک قرص نان برای پناهگاه؛ باقی‌اش برای خودم.»', 'half', { tags: ['greed'], effects: [vr('mercy', -1), vr('ambition', 1), fl('bread_resolved'), rl('tamsin', -3)] })] }),
      all: N('marta', 'این بچه‌ها شاید اسم تو رو یادشون نمونه، ولی کاری که کردی یادشون می‌مونه. ممنونم، آرن. و یه چیز دیگه... اون چاه فقط یه چاه معمولی نیست. مادرت این رو بهتر از هرکسی می‌دونست.', { effects: [reward({ xp: 120, gold: 20 })] }),
      half: N('marta', 'همین هم غنیمت است. با کمتر از این هم دوام آورده‌ایم.', { effects: [reward({ xp: 80, gold: 10 })] }),
      waiting: N('marta', 'نان را پیدا کن، آرن. پشت تیر انبار نانوایی.'),
      done: N('marta', 'بچه‌ها حالا نقش تو را بازی می‌کنند؛ قهرمانی بلندقد با شمشیری چوبی. به سلامت، آرن.'),
    }, { entries: [{ when: AND(Q('s1_cellar', 'active'), COL('pantry_bread'), NOT(F('bread_resolved'))), node: 'deliver' }, { when: Q('s1_cellar', 'completed'), node: 'done' }, { when: Q('s1_cellar', 'active'), node: 'waiting' }] }),
    T('d_jorin', 'jorin', 'a', {
      a: N('jorin', 'این همون انگشتر مُهر وال‌کرسته؟ عجب... فکر نمی‌کردم هنوز نگهش داشته باشی. دربار برای همچین چیزی پول خوبی می‌ده؛ من سیصد سکه می‌دم. نه از روی دلسوزی، معامله‌ست. هر دومون هم این رو می‌دونیم.', { effects: [qs('s1_debt')], choices: [
        C('«بگیرش. حالا دیگر فقط تکه‌ای فلز است.»', 'sell', { tags: ['greed'], effects: [vr('ambition', 2), vr('honor', -1), fl('signet_sold'), fl('jorin_resolved'), reward({ gold: 300 })] }),
        C('«این آخرین یادگار نام خاندانم است. پیش خودم می‌ماند.»', 'refuse', { tags: ['honest'], effects: [vr('honor', 1), fl('jorin_resolved')] }),
        C('«قبل از آن‌که کیفت را بگیرم، از اینجا دور شو.»', 'threat', { tags: ['ruthless'], effects: [vr('mercy', -1), vr('ambition', 1), fl('jorin_threatened'), fl('jorin_resolved')] })] }),
      sell: N('jorin', 'معامله بدی نبود. من سکه‌هام رو می‌شمرم، تو هم راهت رو می‌کشی و می‌ری. اگه کسی سراغت رو گرفت؟ من امروز هیچ‌کس رو ندیدم.', { effects: [] }),
      refuse: N('jorin', 'به یادگارها دل بستن آسون‌تر از روبه‌رو شدن با بدهیه، نه؟ باشه، نگهش دار. ولی اگه یه روز نظرت عوض شد، من همین دور و برم. پول که باشه، راه آدم‌ها دوباره به هم می‌رسه.', {}),
      threat: N('jorin', 'آرام، آرام. احمق‌های دیگری پیدا می‌کنم. یادت باشد: بدهی آدم را هر جا برود دنبال می‌کند.'),
      done: N('jorin', 'حسابمان را صاف کرده‌ایم، وال‌کرست.'),
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
    COLL('prison_mark', 'ashen_village', 'lore', 'Prison Wall Mark', 'A hidden message left by someone who knew the trial was false.'),
    COLL('green_seed', 'ashen_village', 'resource', 'Green Verge Seed', 'A seed carried from the first living patch of forest after the prison.'),
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
    { id: 'ev_prison_wake', zone: 'prison_wake', dialogue: 'd_prison_wake' },
    { id: 'ev_village_arrival', zone: 'start_wake', dialogue: 'd_village_arrival' },
    { id: 'ev_hobb', zone: 'hobb_arena', dialogue: 'd_hobb_pre', when: Q('m1_embers', 'active') },
    { id: 'ev_burn_order', auto: INT('burn_order'), dialogue: 'd_burn_order' },
    { id: 'ev_tamsin_join', auto: AND(INT('burn_order'), COMP('tamsin', 'unmet')), dialogue: 'd_tamsin_join' },
  ],
};
// unused imports guard for strict builds
void K; void R;
