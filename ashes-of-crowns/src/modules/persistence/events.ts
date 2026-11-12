import type { EventBus } from './types';

/** Events this module EMITS. */
export const PersistenceEvents = {
  READY: 'persistence:ready',
  DEGRADED: 'persistence:degraded',
  SAVED: 'persistence:saved',
  SAVE_FAILED: 'persistence:save-failed',
  STATE_LOADED: 'persistence:state-loaded',
  LOAD_FAILED: 'persistence:load-failed',
  SLOT_DELETED: 'persistence:slot-deleted',
  IMPORTED: 'persistence:imported',
  CHECKPOINT_ACTIVATED: 'checkpoint:activated',
  CHECKPOINT_RESPAWN: 'checkpoint:respawn',
  SETTINGS_CHANGED: 'settings:changed',
  AUDIO_UNLOCKED: 'audio:unlocked',
  AUDIO_BLOCKED: 'audio:blocked',
  AUDIO_ERROR: 'audio:error',
  AUDIO_MUSIC_CHANGED: 'audio:music-changed',
} as const;

/**
 * Events this module LISTENS to. Payload shapes are documented in README.md.
 * NOTE: names of events owned by other modules (world:/rpg:/combat:) are a CONTRACT PROPOSAL and
 * can be remapped through PersistenceOptions (autosave.triggers, eventMap).
 */
export const ListenedEvents = {
  REQUEST_SAVE: 'persistence:request-save',
  REQUEST_AUTOSAVE: 'persistence:request-autosave',
  CHECKPOINT_REQUEST_ACTIVATE: 'checkpoint:request-activate',
  CHECKPOINT_REQUEST_RESPAWN: 'checkpoint:request-respawn',
  AUDIO_PLAY_SFX: 'audio:play-sfx',
  AUDIO_SET_REGION: 'audio:set-region',
  AUDIO_COMBAT: 'audio:combat',
  AUDIO_BOSS: 'audio:boss',
  WORLD_REGION_CHANGED: 'world:region-changed',
  RPG_QUEST_COMPLETED: 'rpg:quest-completed',
  RPG_LEVEL_UP: 'rpg:level-up',
  COMBAT_BOSS_DEFEATED: 'combat:boss-defeated',
} as const;

/** Tiny emitter used when the host game does not pass its own bus (e.g. Phaser's scene/game events). */
export class SimpleEmitter implements EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map = new Map<string, Set<(...a: any[]) => void>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, fn: (...a: any[]) => void): this {
    let s = this.map.get(event);
    if (!s) this.map.set(event, (s = new Set()));
    s.add(fn);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, fn?: (...a: any[]) => void): this {
    if (!fn) this.map.delete(event);
    else this.map.get(event)?.delete(fn);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, ...args: any[]): boolean {
    const s = this.map.get(event);
    if (!s || s.size === 0) return false;
    for (const fn of [...s]) {
      try {
        fn(...args);
      } catch (err) {
        // A faulty listener must never break persistence.
        console.error(`[persistence] listener for "${event}" threw`, err);
      }
    }
    return true;
  }
  listenerCount(event: string): number {
    return this.map.get(event)?.size ?? 0;
  }
}
