/** Public API of the persistence module (Module 6). Import ONLY from this file. */
export { PersistenceModule } from './PersistenceModule';
export type { PersistenceOptions } from './PersistenceModule';
export { SaveManager, MAX_IMPORT_BYTES } from './save/SaveManager';
export { AutoSaver, DEFAULT_AUTOSAVE } from './save/AutoSaver';
export type { AutoSaveOptions } from './save/AutoSaver';
export { createDefaultGameState, sanitizeGameState } from './save/sanitize';
export { downloadTextFile, pickTextFile } from './save/fileIO';
export { SettingsManager, defaultSettings, sanitizeSettings, detectPerformanceTier } from './settings/SettingsManager';
export { CheckpointManager } from './checkpoint/CheckpointManager';
export type { MemoryStoneDef, RespawnPoint } from './checkpoint/CheckpointManager';
export { AudioManager } from './audio/AudioManager';
export type { AudioManagerOptions } from './audio/AudioManager';
export { IndexedDbBackend } from './storage/IndexedDbBackend';
export { MemoryBackend } from './storage/MemoryBackend';
export type { KVBackend } from './storage/backend';
export { PersistenceEvents, ListenedEvents, SimpleEmitter } from './events';
export * from './types';
