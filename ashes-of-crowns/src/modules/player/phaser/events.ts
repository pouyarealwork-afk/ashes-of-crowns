/**
 * Global event names. Every PlayerController event is forwarded on `game.events` as
 * `player:<event>` and on the Player sprite itself (without prefix).
 * Incoming (commands) are listened to on `game.events`.
 */
export const PLAYER_OUT = {
  stateChanged: 'player:stateChanged',
  jump: 'player:jump',
  land: 'player:land',
  dodge: 'player:dodge',
  blockStart: 'player:blockStart',
  blockEnd: 'player:blockEnd',
  parry: 'player:parry',
  guardBreak: 'player:guardBreak',
  attackStart: 'player:attackStart',
  attackActive: 'player:attackActive',
  attackEnd: 'player:attackEnd',
  skillFailed: 'player:skillFailed',
  damaged: 'player:damaged',
  death: 'player:death',
  deathComplete: 'player:deathComplete',
  respawn: 'player:respawn',
  vitals: 'player:vitals',
  /** Emitted after the body has been moved to the checkpoint: { x, y }. */
  respawned: 'player:respawned',
  /** Emitted once when the module is ready: Player instance. */
  ready: 'player:ready',
} as const;

export const PLAYER_IN = {
  /** payload: IncomingHit */
  hit: 'player:cmd:hit',
  /** payload: number (health) */
  heal: 'player:cmd:heal',
  /** payload: Partial<PlayerStatsConfig>, or { stats, refill } */
  stats: 'player:cmd:stats',
  /** payload: { x, y } */
  checkpoint: 'player:cmd:checkpoint',
  /** payload: SkillDef[] */
  skills: 'player:cmd:skills',
  /** payload: boolean (true = ignore player input; cutscenes/dialogue/menus) */
  lockInput: 'player:cmd:lockInput',
  /** payload: boolean */
  touchVisible: 'player:cmd:touchVisible',
  /** no payload: force respawn at checkpoint */
  respawn: 'player:cmd:respawn',
  /** no payload: instant kill */
  kill: 'player:cmd:kill',
} as const;
