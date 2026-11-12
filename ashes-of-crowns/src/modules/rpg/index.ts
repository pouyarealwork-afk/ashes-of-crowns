/**
 * ASHES OF CROWNS — Module 4: RPG progression, inventory, crafting & economy.
 * Public API. Import only from this file: `import { RpgModule } from '../rpg'`.
 */
export { RpgModule } from './RpgModule';
export type { RpgModuleOptions } from './RpgModule';
export { RpgEmitter } from './events';
export type { ExternalBus, RpgEventMap, InboundEventMap, RewardBundle, LevelUpReward, NgPlusScaling } from './events';
export * from './types';
export { ITEMS, ITEM_LIST, getItemDef } from './data/items';
export { RECIPES, RECIPE_LIST } from './data/recipes';
export type { Recipe } from './data/recipes';
export { SKILLS, SKILL_TREES } from './data/skills';
export type { SkillNode, AbilityDef, AbilityEffect, AbilityKind } from './data/skills';
export { SHOPS, SHOP_LIST } from './data/shops';
export type { ShopDef, ShopEntry } from './data/shops';
export { SKINS, SKIN_LIST } from './data/skins';
export type { SkinDef, UnlockCondition } from './data/skins';
export { ACHIEVEMENT_LIST } from './data/achievements';
export { RARITY_INFO, xpToNext, levelCap, BASE_LEVEL_CAP, INVENTORY_CAPACITY, HOTBAR_SIZE } from './data/config';
export { validateData } from './data/validate';
export type { ItemView, InventoryQuery, SortKey } from './systems/InventorySystem';
export type { ItemComparison } from './systems/EquipmentSystem';
export type { RecipeView, UpgradePreview, Cost } from './systems/CraftingSystem';
export type { ShopEntryView } from './systems/ShopSystem';
export type { SkillNodeView, AbilityUseResult } from './systems/SkillSystem';
export type { ConsumableResult } from './systems/ConsumableSystem';
export type { DamageInput, DamageResult } from './systems/CombatMath';
export type { EnemyKillInfo } from './systems/LootSystem';
export type { SkinView } from './systems/SkinSystem';
