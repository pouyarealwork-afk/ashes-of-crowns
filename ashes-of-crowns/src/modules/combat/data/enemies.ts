import type { BossDefinition, EnemyArchetype } from '../types';

const make = (id: string, name: string, ai: EnemyArchetype['ai'], health: number, damage: number, speed: number, color: number, extra: Partial<EnemyArchetype> = {}): EnemyArchetype => ({
  id, name, tier: 'normal', ai, health, damage, defense: 2, speed, aggroRange: 360, attackRange: ai === 'ranged' ? 250 : 48,
  attackCooldownMs: ai === 'ranged' ? 1900 : 1450, attackWindupMs: ai === 'ranged' ? 650 : 420,
  hitbox: { width: 34, height: 38, offsetY: 0 }, xp: 18, gold: 5, color, poise: 1, ...extra,
});

export const ENEMIES: Record<string, EnemyArchetype> = {
  ash_wolf: make('ash_wolf', 'Ash Wolf', 'charger', 72, 12, 105, 0x9b7561, { attackRange: 58, xp: 20, gold: 4 }),
  crown_soldier: make('crown_soldier', 'Crown Soldier', 'melee', 115, 16, 72, 0x9dabb8, { defense: 7, xp: 26, gold: 9 }),
  thornling: make('thornling', 'Thornling', 'ambusher', 58, 10, 92, 0x65945d, { attackRange: 52, xp: 17, gold: 3 }),
  rook_bandit: make('rook_bandit', 'Rook Bandit', 'melee', 96, 14, 86, 0x8e7657, { xp: 22, gold: 11 }),
  sand_scorpion: make('sand_scorpion', 'Sand Scorpion', 'ambusher', 105, 17, 62, 0xb78b49, { defense: 5, xp: 28, gold: 8 }),
  dune_raider: make('dune_raider', 'Dune Raider', 'melee', 122, 18, 82, 0xa97943, { xp: 30, gold: 12 }),
  glass_serpent: make('glass_serpent', 'Glass Serpent', 'charger', 88, 20, 125, 0x6eabb0, { attackRange: 64, xp: 32, gold: 8 }),
  sand_wraith: make('sand_wraith', 'Sand Wraith', 'flying', 100, 19, 92, 0xc6b98e, { defense: 1, xp: 35, gold: 13 }),
  frost_wolf: make('frost_wolf', 'Frost Wolf', 'charger', 118, 21, 118, 0x8ab5c8, { xp: 34, gold: 9 }),
  ice_wraith: make('ice_wraith', 'Ice Wraith', 'flying', 110, 22, 80, 0x9bd8e5, { xp: 38, gold: 12, resistances: { magic: 0.2 } }),
  crown_scout: make('crown_scout', 'Crown Scout', 'ranged', 82, 15, 74, 0x8e9c9e, { attackRange: 300, xp: 24, gold: 8 }),
  ironwatch_guard: make('ironwatch_guard', 'Ironwatch Guard', 'melee', 180, 22, 52, 0x737b83, { defense: 14, xp: 45, gold: 16, poise: 3 }),
  crossbow_sentry: make('crossbow_sentry', 'Crossbow Sentry', 'ranged', 92, 20, 36, 0x9c8a73, { attackRange: 360, attackCooldownMs: 2200, xp: 32, gold: 10 }),
  hushed_guard: make('hushed_guard', 'Hushed Guard', 'melee', 152, 23, 65, 0x777b91, { defense: 9, xp: 42, gold: 15 }),
  hollow_shade: make('hollow_shade', 'Hollow Shade', 'ambusher', 126, 25, 110, 0x77718f, { xp: 46, gold: 17 }),
  royal_champion: make('royal_champion', 'Royal Champion', 'melee', 230, 28, 76, 0xb99b65, { defense: 16, xp: 65, gold: 24, poise: 4 }),
  cellar_rat_swarm: make('cellar_rat_swarm', 'Cellar Rat Swarm', 'charger', 48, 8, 145, 0x82766b, { hitbox: { width: 42, height: 22, offsetY: 8 }, xp: 10, gold: 2 }),
  sickened_stag: make('sickened_stag', 'Sickened Stag', 'charger', 165, 24, 104, 0x786e60, { defense: 5, xp: 52, gold: 14 }),
};

const boss = (id: string, enemyType: string, name: string, title: string, intro: string, defeatLine: string, arenaRadius: number, base: number): BossDefinition => ({
  id, enemyType, name, title, intro, defeatLine, arenaRadius,
  phases: [
    { threshold: 1, damageMultiplier: 1, speedMultiplier: 1, pattern: 'guarded opening' },
    { threshold: 0.65, damageMultiplier: 1.2, speedMultiplier: 1.12, pattern: 'aggressive assault' },
    { threshold: 0.3, damageMultiplier: 1.45, speedMultiplier: 1.25, pattern: 'desperation sequence' },
  ],
});

export const BOSSES: Record<string, BossDefinition> = {
  prison_sentinel: boss('prison_sentinel', 'prison_sentinel', 'The Bound Sentinel', 'Keeper of Blackwell', 'The gate opens only when the debt is paid.', 'The prison has lost its keeper.', 700, 1),
  sergeant_hobb: boss('sergeant_hobb', 'sergeant_hobb', 'Sergeant Hobb', 'The Ashen Hound', 'You should have stayed buried, exile.', 'The watch has fallen.', 520, 1),
  thornwarden: boss('thornwarden', 'thornwarden', 'The Thornwarden', 'Keeper of the Whispering Wood', 'The forest remembers every trespass.', 'The roots fall silent.', 600, 1),
  sandglass_colossus: boss('sandglass_colossus', 'sandglass_colossus', 'Sandglass Colossus', 'The Dune Titan', 'Time will grind you to dust.', 'The sands reclaim their giant.', 680, 1),
  captain_voss: boss('captain_voss', 'captain_voss', 'Captain Voss', 'The Frozen Blade', 'No one crosses the highlands alive.', 'The pass is yours.', 560, 1),
  hush_mother_vesk: boss('hush_mother_vesk', 'hush_mother_vesk', 'Hush-Mother Vesk', 'Voice Beneath the City', 'Hush now. Let the dark speak.', 'The hollow voice is gone.', 640, 1),
  chancellor_morrow: boss('chancellor_morrow', 'chancellor_morrow', 'Chancellor Morrow', 'The Crown’s Last Hand', 'You mistake survival for victory, Aren.', 'The crown has no master now.', 720, 1),
};

export function getEnemyArchetype(id: string): EnemyArchetype | undefined {
  if (ENEMIES[id]) return ENEMIES[id];
  const b = BOSSES[id];
  if (!b) return undefined;
  const base = make(id, b.name, 'boss', id === 'chancellor_morrow' ? 1800 : 1250, 32, 76, 0x9a6574, {
    tier: 'boss', defense: 18, aggroRange: 900, attackRange: 100, attackCooldownMs: 1750, attackWindupMs: 900,
    hitbox: { width: 90, height: 90, offsetY: -10 }, xp: 500, gold: 250, poise: 8, scale: 2.4,
  });
  return base;
}

const BOSS_ALIASES: Record<string, string> = {
  hobb: 'sergeant_hobb', colossus: 'sandglass_colossus', voss: 'captain_voss',
  hushmother: 'hush_mother_vesk', morrow: 'chancellor_morrow',
};
export function getBossDefinition(id: string): BossDefinition | undefined { return BOSSES[BOSS_ALIASES[id] ?? id]; }
