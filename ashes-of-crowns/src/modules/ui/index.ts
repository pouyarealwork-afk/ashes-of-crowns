/**
 * ASHES OF CROWNS — UI module (Module 5). Public API.
 *
 *   import { createUI } from './modules/ui';
 *   const ui = createUI({ parent: document.getElementById('app')!, backend: { ... } });
 *
 * See README.md in this folder for the full integration contract.
 */
export { GameUI, createUI } from './GameUI';
export type { CreateUIOptions } from './GameUI';
export * from './contracts';
export { ICON_NAMES } from './core/icons';
export type { IconName } from './core/icons';
export { DEFAULT_SETTINGS } from './core/settings';
export type { KV } from './core/settings';
export { UI_VERSION } from './screens/MainMenu';
export { ENDING_IDS } from './screens/Ending';
export type { ScreenId } from './core/context';
