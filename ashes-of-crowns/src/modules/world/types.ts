/**
 * ASHES OF CROWNS — World / Story / Quest module: shared type definitions.
 * Pure data + interfaces. No engine dependencies (Phaser-free) so every module can import them.
 */
export type NarrativeVar = 'honor' | 'trust' | 'ambition' | 'mercy';
export const NARRATIVE_VARS: NarrativeVar[] = ['honor', 'trust', 'ambition', 'mercy'];
export const VAR_MIN = -10;
export const VAR_MAX = 10;
export type Cmp = '>=' | '<=' | '>' | '<' | '==' | '!=';
export type QuestStatus = 'inactive' | 'active' | 'completed' | 'failed';
export type QuestType = 'main' | 'side' | 'exploration' | 'hidden' | 'companion';
export type EndingId = 'true_king' | 'tyrant' | 'wanderer' | 'hidden_truth' | 'fallen_hero';
export type RegionId =
  | 'ashen_village' | 'whispering_forest' | 'forgotten_desert'
  | 'frozen_highlands' | 'hollow_city' | 'crownfall';
export type CompanionState = 'unmet' | 'recruited' | 'left' | 'dead';
export interface Rect { x: number; y: number; w: number; h: number }

/* ---------------- Conditions & Effects (data-driven logic) ---------------- */
export type Condition =
  | { t: 'var'; v: NarrativeVar; op: Cmp; n: number }
  | { t: 'flag'; f: string; is?: boolean }
  | { t: 'quest'; q: string; is: QuestStatus }
  | { t: 'rel'; id: string; op: Cmp; n: number }
  | { t: 'key'; id: string; min?: number }
  | { t: 'comp'; id: string; is: CompanionState | 'party' }
  | { t: 'chapter'; op: Cmp; n: number }
  | { t: 'ctr'; k: string; op: Cmp; n: number }
  | { t: 'count'; prefix: string; op: Cmp; n: number }
  | { t: 'loyal'; min: number; above: number }
  | { t: 'ending'; id: EndingId }
  | { t: 'and'; c: Condition[] }
  | { t: 'or'; c: Condition[] }
  | { t: 'not'; c: Condition };

export interface RewardSpec {
  xp?: number; gold?: number;
  items?: { id: string; n: number }[];   // handed to the RPG module via 'world:reward'
  keys?: { id: string; n?: number }[];   // narrative key items kept by this module
}
export type Effect =
  | { t: 'var'; v: NarrativeVar; d: number }
  | { t: 'flag'; f: string; val?: boolean }
  | { t: 'rel'; id: string; d: number }
  | { t: 'quest.start'; q: string }
  | { t: 'quest.obj'; q: string; o: string }
  | { t: 'quest.complete'; q: string }
  | { t: 'quest.fail'; q: string }
  | { t: 'key'; id: string; n?: number }
  | { t: 'reward'; r: RewardSpec }
  | { t: 'recruit'; id: string }
  | { t: 'leave'; id: string }
  | { t: 'die'; id: string }
  | { t: 'unlock'; id: string }
  | { t: 'discover'; id: string }
  | { t: 'chapter'; n: number }
  | { t: 'emit'; event: string; data?: unknown }
  | { t: 'resolve_ending' };

/* ---------------- Dialogue ---------------- */
export interface DialogueChoice {
  text: string;
  when?: Condition;          // choice hidden when false
  effects?: Effect[];
  tags?: string[];           // moral tags -> companion reactions ('mercy','ruthless','honest','deceit','greed','loyal'...)
  next?: string;             // node id; omitted = end of conversation
}
export interface DialogueNode {
  speaker: string;           // 'aren' | npc id | 'narrator'
  text: string;
  variants?: { when: Condition; text: string }[]; // conditional wording, first match wins
  mood?: string;
  effects?: Effect[];        // applied when the node is entered
  choices?: DialogueChoice[];
  next?: string;             // used when there are no choices
}
export interface DialogueTree {
  id: string; npc?: string; kind?: 'talk' | 'cutscene';
  start: string;
  entries?: { when: Condition; node: string }[]; // conditional entry points
  nodes: Record<string, DialogueNode>;
  onEnd?: Effect[];
}
export interface NpcDef {
  id: string; name: string; region: RegionId; role: string; description: string;
  portrait: string; sprite: string;
  dialogue: { when?: Condition; tree: string }[]; // first matching tree is used
  companion?: string;
}

/* ---------------- Quests ---------------- */
export interface QuestObjective {
  id: string; text: string;
  done: Condition;                 // auto-evaluated; may also be forced with {t:'quest.obj'}
  after?: string[];                // objective ids that must be finished first
  hidden?: boolean;                // not shown until done
  optional?: boolean;
  progress?: { ctr?: string; prefix?: string; n: number }; // display counter
}
export interface QuestDef {
  id: string; title: string; type: QuestType; region: RegionId; chapter: number;
  summary: string;
  requires?: Condition;            // prerequisites
  autoStart?: Condition;           // start automatically when true (and prerequisites hold)
  objectives: QuestObjective[];
  manualComplete?: boolean;
  failWhen?: Condition;
  reward?: RewardSpec;
  onStart?: Effect[]; onComplete?: Effect[]; onFail?: Effect[];
  hiddenUntilStarted?: boolean;
}

/* ---------------- Collectibles & POIs ---------------- */
export interface CollectibleDef {
  id: string; region: RegionId; kind: 'lore' | 'relic' | 'token' | 'testament' | 'key' | 'resource';
  name: string; text: string; effects?: Effect[];
}
export interface PoiDef {
  id: string; region: RegionId; level: string; name: string;
  kind: 'camp' | 'landmark' | 'shrine' | 'secret' | 'settlement'; x: number; y: number;
  fastTravel?: boolean; description: string; hiddenUntilDiscovered?: boolean;
}

/* ---------------- Levels ---------------- */
export type PlatformKind = 'ground' | 'stone' | 'wood' | 'ice' | 'sand' | 'crumble' | 'oneway' | 'vine' | 'metal';
export type Platform = [x: number, y: number, w: number, h: number, kind?: PlatformKind];
export interface HazardDef { type: string; rect: Rect; damage: number; note?: string }
export interface EnemySpawn { type: string; x: number; y: number; patrol?: [number, number]; boss?: string; elite?: boolean; region?: RegionId }
export interface LevelExit { id: string; rect: Rect; to: { level: string; spawn: string }; requires?: Condition; lockedText?: string }
export interface HiddenPathDef {
  id: string; level: string; rect: Rect; hint: string;
  reveal: Condition; leadsTo?: { level: string; spawn: string }; effects?: Effect[];
}
export interface LoreProp { id: string; kind: 'sign' | 'ruin' | 'remains' | 'mural' | 'letter' | 'grave'; x: number; y: number; text: string }
export interface Atmosphere {
  palette: { sky: string; mid: string; fore: string; accent: string };
  weather: 'ash' | 'embers' | 'fog' | 'rain' | 'sandstorm' | 'blizzard' | 'spores' | 'none';
  light: 'dawn' | 'noon' | 'dusk' | 'night' | 'gloom';
  music: string; ambience: string[]; particles: string; notes: string;
}
export interface LevelDef {
  id: string; region: RegionId; name: string; size: { w: number; h: number };
  atmosphere: Atmosphere;
  spawns: Record<string, { x: number; y: number }>;
  platforms: Platform[]; hazards: HazardDef[]; enemies: EnemySpawn[];
  npcs: { npc: string; x: number; y: number; when?: Condition }[];
  collectibles: { id: string; x: number; y: number }[];
  hiddenPaths: HiddenPathDef[]; zones: { id: string; rect: Rect }[];
  interactables: { id: string; x: number; y: number; label: string }[];
  exits: LevelExit[]; lore: LoreProp[];
}
export interface RegionDef {
  id: RegionId; name: string; chapter: number; tagline: string; description: string;
  entryLevel: string; connections: { to: RegionId; requires?: Condition }[];
  mapPos: { x: number; y: number }; startsUnlocked?: boolean;
}

/* ---------------- Story events, companions, endings ---------------- */
export interface StoryEventDef {
  id: string; dialogue: string; zone?: string; auto?: Condition; when?: Condition; once?: boolean;
}
export interface CompanionAbility {
  id: string; name: string; kind: 'damage' | 'heal' | 'shield' | 'stun' | 'buff' | 'revive';
  power: number; cooldownMs: number; minLoyalty?: number;
  trigger: { type: 'interval' | 'player_hp_below' | 'enemies_at_least' | 'boss' | 'combo_at_least'; value?: number };
  targeting: 'nearest' | 'all_in_range' | 'player' | 'boss'; vfx: string;
}
export interface CompanionDef {
  id: string; name: string; title: string; role: 'guardian' | 'ranged' | 'support' | 'bruiser';
  personality: string; backstory: string; sprite: string; portrait: string;
  baseStats: { hp: number; attack: number; speed: number };
  startLoyalty: number; leaveBelow: number;
  reactions: Record<string, number>;       // choice tag -> loyalty delta
  barks: Record<string, string>;           // choice tag -> spoken reaction
  abilities: CompanionAbility[];
  personalQuest: string;
  fates: { when?: Condition; text: string }[]; // first match used at epilogue
}
export interface EndingDef {
  id: EndingId; title: string; tagline: string;
  gate: Condition;                           // hard requirement
  weights: Partial<Record<NarrativeVar, number>>; base: number; priority: number;
  bonus: { when: Condition; add: number }[];
  slides: { when?: Condition; text: string }[];
}
export interface RegionContent {
  region: RegionDef; levels: LevelDef[]; npcs: NpcDef[]; dialogues: DialogueTree[];
  quests: QuestDef[]; collectibles: CollectibleDef[]; pois: PoiDef[]; storyEvents: StoryEventDef[];
}

/* ---------------- Runtime views / save ---------------- */
export interface DialogueView {
  treeId: string; nodeId: string; speaker: string; speakerName: string; text: string; mood?: string;
  choices: { index: number; text: string; tags?: string[] }[];
  canAdvance: boolean; ended: boolean;
  reactions: { companion: string; line?: string; delta: number }[];
}
export interface QuestProgress { status: QuestStatus; done: Record<string, boolean> }
export interface SaveData {
  version: 1;
  vars: Record<NarrativeVar, number>; flags: string[]; counters: Record<string, number>;
  rels: Record<string, number>; keys: Record<string, number>;
  collected: string[]; discovered: string[]; unlocked: string[]; revealed: string[]; fired: string[];
  companions: Record<string, { status: CompanionState; inParty: boolean }>;
  quests: Record<string, QuestProgress>; chapter: number; ending: EndingId | null;
}
