/**
 * ASHES OF CROWNS — UI module contracts.
 *
 * These are the interfaces OTHER modules (player, combat, world, rpg, persistence)
 * must satisfy so the UI can display and drive them. The UI never imports other
 * modules directly; everything goes through the `UIBackend` object passed to
 * `createUI()` (or registered later with `ui.setBackend()`).
 *
 * Every provider is OPTIONAL. When a provider is missing the matching screen
 * renders an honest "system not available" state instead of fake data, and
 * actions that need the provider are hidden or disabled.
 *
 * Every getter may return a value or a Promise of it.
 */

export type Lang = 'en' | 'fa';
export type MaybePromise<T> = T | Promise<T>;

/** Content text coming from other modules: a plain string or per-language strings. */
export type Text = string | Partial<Record<Lang, string>>;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemType = 'weapon' | 'armor' | 'consumable' | 'material' | 'quest' | 'misc';
export type EquipSlot =
  | 'weapon' | 'offhand' | 'head' | 'chest' | 'legs' | 'boots' | 'ring' | 'amulet';
export type StatId =
  | 'attack' | 'defense' | 'magic' | 'speed' | 'crit'
  | 'maxHealth' | 'maxMana' | 'maxStamina';
export type StatMods = Partial<Record<StatId, number>>;

export type RegionId =
  | 'ashen_village' | 'whispering_forest' | 'forgotten_desert'
  | 'frozen_highlands' | 'hollow_city' | 'crownfall';

export type EndingId = 'true_king' | 'tyrant' | 'wanderer' | 'hidden_truth' | 'fallen_hero';

export type Result = { ok: true } | { ok: false; reason?: Text };

/* ------------------------------------------------------------------ items */

export interface ItemDef {
  id: string;
  name: Text;
  description?: Text;
  type: ItemType;
  rarity: Rarity;
  /** Built-in icon name (see `ICON_NAMES`) OR an image URL (contains "/" or "."). */
  icon?: string;
  /** Required for equippable items. */
  slot?: EquipSlot;
  stats?: StatMods;
  /** Base gold value. */
  value?: number;
  /** Required player level. */
  levelReq?: number;
}
export interface ItemStack { item: ItemDef; qty: number }

/* ----------------------------------------------------------------- player */

export interface PlayerSnapshot {
  name: Text;
  level: number;
  xp: number;
  xpToNext: number;
  health: number; maxHealth: number;
  mana: number; maxMana: number;
  stamina: number; maxStamina: number;
  gold: number;
  /** Final (equipment-included) stats. */
  stats: Partial<Record<StatId, number>>;
  playTimeSec?: number;
  /** Optional extra rows for the character sheet (kills, deaths …). */
  extra?: { label: Text; value: string | number }[];
}

export interface PlayerProvider {
  getPlayer(): MaybePromise<PlayerSnapshot>;
}

/* -------------------------------------------------------------- inventory */

export interface InventorySnapshot {
  items: ItemStack[];
  capacity: number;
  gold: number;
  equipped: Partial<Record<EquipSlot, ItemDef>>;
}
export interface InventoryProvider {
  getInventory(): MaybePromise<InventorySnapshot>;
  equip?(itemId: string, slot: EquipSlot): MaybePromise<Result>;
  unequip?(slot: EquipSlot): MaybePromise<Result>;
  use?(itemId: string): MaybePromise<Result>;
  drop?(itemId: string, qty: number): MaybePromise<Result>;
}

/* ----------------------------------------------------------------- skills */

export interface SkillNode {
  id: string;
  name: Text;
  description?: Text;
  icon?: string;
  /** 1-based tier = column progress in the tree. */
  tier: number;
  /** 0-based row within the tier. */
  row: number;
  requires?: string[];
  cost: number;
  maxRank: number;
  rank: number;
  /** All prerequisites met (can be purchased if points are available). */
  available: boolean;
  /** Active skills can be put on the hotbar. */
  active: boolean;
  manaCost?: number;
  cooldownSec?: number;
}
export interface SkillTree { id: string; name: Text; icon?: string; nodes: SkillNode[] }
export interface SkillsProvider {
  getSkillTrees(): MaybePromise<SkillTree[]>;
  getSkillPoints(): MaybePromise<number>;
  unlockSkill?(skillId: string): MaybePromise<Result>;
  /** Hotbar of N slots (HUD shows the first `HUD_SKILL_SLOTS`). */
  getHotbar?(): MaybePromise<(string | null)[]>;
  setHotbar?(index: number, skillId: string | null): MaybePromise<Result>;
}

/* ----------------------------------------------------------------- quests */

export interface QuestObjective { text: Text; current: number; target: number; done: boolean }
export interface QuestSnapshot {
  id: string;
  title: Text;
  kind: 'main' | 'side' | 'bounty';
  status: 'active' | 'completed' | 'failed';
  summary?: Text;
  region?: RegionId;
  objectives: QuestObjective[];
  rewards?: { xp?: number; gold?: number; items?: ItemStack[] };
  tracked: boolean;
}
export interface QuestProvider {
  getQuests(): MaybePromise<QuestSnapshot[]>;
  setTracked?(questId: string, tracked: boolean): MaybePromise<Result>;
}

/* ------------------------------------------------------------------ world */

export interface MapRegion {
  id: RegionId;
  /** Optional override; the UI has built-in names for the six regions. */
  name?: Text;
  description?: Text;
  /** Position on the parchment in percent (0-100). */
  x: number; y: number;
  state: 'locked' | 'unlocked' | 'cleared';
  levelRange?: [number, number];
  fastTravelCost?: number;
}
export interface MapSnapshot { regions: MapRegion[]; current?: RegionId }
export interface WorldProvider {
  getMap(): MaybePromise<MapSnapshot>;
  fastTravel?(region: RegionId): MaybePromise<Result>;
}

/* --------------------------------------------------------------- crafting */

export interface Recipe {
  id: string;
  result: ItemStack;
  ingredients: ItemStack[];
  station?: Text;
  levelReq?: number;
  /** Unknown recipes are shown as locked silhouettes. */
  known: boolean;
}
export interface CraftingProvider {
  getRecipes(): MaybePromise<Recipe[]>;
  craft(recipeId: string): MaybePromise<Result>;
}

/* ------------------------------------------------------------------- shop */

export interface ShopEntry { item: ItemDef; price: number; stock?: number }
export interface ShopSnapshot {
  id: string;
  name: Text;
  merchant?: Text;
  stock: ShopEntry[];
  /** Fraction of `item.value` paid when the player sells (default 0.5). */
  sellRate?: number;
}
export interface ShopProvider {
  getShop(shopId: string): MaybePromise<ShopSnapshot>;
  buy(shopId: string, itemId: string, qty: number): MaybePromise<Result>;
  /** If omitted the Sell tab is hidden. */
  sell?(shopId: string, itemId: string, qty: number): MaybePromise<Result>;
}

/* ------------------------------------------------------------ persistence */

export interface SaveSlotSummary {
  slot: number;
  empty: boolean;
  playerName?: string;
  level?: number;
  region?: RegionId;
  playTimeSec?: number;
  /** epoch ms */
  savedAt?: number;
}
export interface PersistenceProvider {
  listSlots(): MaybePromise<SaveSlotSummary[]>;
  /** Save the live game into `slot`. */
  save(slot: number): MaybePromise<Result>;
  deleteSlot?(slot: number): MaybePromise<Result>;
  /** Number of slots (default 3). */
  slotCount?: number;
}

export interface UIBackend {
  player?: PlayerProvider;
  inventory?: InventoryProvider;
  skills?: SkillsProvider;
  quests?: QuestProvider;
  world?: WorldProvider;
  crafting?: CraftingProvider;
  shop?: ShopProvider;
  persistence?: PersistenceProvider;
}

/* ---------------------------------------------------------------- dialogue */

export interface DialogueChoice {
  id: string;
  text: Text;
  /** Next node id; omit to end the dialogue. */
  next?: string;
  disabled?: boolean;
  /** Shown under a disabled choice (e.g. "Requires 50 gold"). */
  hint?: Text;
  /** Opaque data passed back untouched in `dialogue:choice`. The UI never displays it. */
  meta?: unknown;
}
export interface DialogueNode {
  id: string;
  speaker?: Text;
  /** Built-in icon name or image URL. */
  portrait?: string;
  text: Text;
  next?: string;
  choices?: DialogueChoice[];
}
export interface DialogueTree { id: string; start: string; nodes: Record<string, DialogueNode> }

/* --------------------------------------------------------------------- HUD */

export const HUD_SKILL_SLOTS = 3;

export interface HudSkill {
  id: string;
  name?: Text;
  icon?: string;
  manaCost?: number;
}
export interface HudObjective { title: Text; text?: Text; current?: number; target?: number }
export interface HudBoss { name: Text; health: number; maxHealth: number; phase?: number }
export interface HudState {
  health: number; maxHealth: number;
  mana: number; maxMana: number;
  stamina: number; maxStamina: number;
  xp: number; xpToNext: number;
  level: number;
  gold: number;
  skills: (HudSkill | null)[];
  objectives: HudObjective[];
  boss: HudBoss | null;
  playerName: Text;
}

/* --------------------------------------------------------------- settings */

export interface UISettings {
  lang: Lang;
  masterVolume: number; // 0..1
  musicVolume: number;
  sfxVolume: number;
  touchControls: boolean;
  controlScale: number;   // 0.8..1.4
  controlOpacity: number; // 0.3..1
  leftHanded: boolean;
  hudScale: 'small' | 'medium' | 'large';
  textScale: 'small' | 'medium' | 'large';
  reduceMotion: boolean;
  vibration: boolean;
  persianDigits: boolean;
}

/* ------------------------------------------------------------------ events */

export type InputAction = 'attack' | 'jump' | 'dodge' | 'interact' | 'skill1' | 'skill2' | 'skill3' | 'heavy' | 'block';

export interface UIEvents {
  'game:new': { slot: number; classId?: 'warrior' | 'assassin' | 'mage' };
  'game:continue': { slot: number };
  'game:load': { slot: number };
  /** Emitted when the first blocking overlay opens during gameplay. */
  'game:pause': { reason: string };
  /** Emitted when the last blocking overlay closes during gameplay. */
  'game:resume': Record<string, never>;
  'game:quitToMenu': Record<string, never>;
  'game:retry': Record<string, never>;
  'game:newGamePlus': { ending: EndingId };
  'game:saved': { slot: number };
  /** Touch joystick, range -1..1 on each axis. Fired on change and on release (0,0). */
  'input:axis': { x: number; y: number };
  'input:action': { action: InputAction; pressed: boolean };
  'dialogue:choice': { dialogueId: string; nodeId: string; choiceId: string; meta?: unknown };
  'dialogue:end': { dialogueId: string; choices: string[] };
  'settings:changed': { settings: UISettings; key: keyof UISettings };
  'ending:finished': { ending: EndingId };
  'ui:screen': { id: string; open: boolean };
  /** Sound hook for the audio module. */
  'ui:sfx': { name: 'click' | 'open' | 'close' | 'confirm' | 'error' | 'equip' | 'coin' | 'levelup' };
}
