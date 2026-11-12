import { DEFAULT_STATS } from './config';
import type { PlayerStatsConfig } from './types';

/** Runtime vitals + max stats. Pure logic; the RPG module feeds `applyConfig`. */
export class PlayerStats {
  config: PlayerStatsConfig;
  health: number;
  mana: number;
  stamina: number;
  private staminaLock = 0;

  constructor(config: Partial<PlayerStatsConfig> = {}) {
    this.config = { ...DEFAULT_STATS, ...sanitize(config) };
    this.health = this.config.maxHealth;
    this.mana = this.config.maxMana;
    this.stamina = this.config.maxStamina;
  }

  /** Merge new stats (e.g. after level-up / equipment). Keeps current ratios unless `refill`. */
  applyConfig(partial: Partial<PlayerStatsConfig>, refill = false): void {
    const old = this.config;
    this.config = { ...old, ...sanitize(partial) };
    const c = this.config;
    if (refill) {
      this.health = c.maxHealth;
      this.mana = c.maxMana;
      this.stamina = c.maxStamina;
      return;
    }
    // Keep absolute current values, but gain the increase in max (typical RPG feel).
    if (c.maxHealth > old.maxHealth) this.health += c.maxHealth - old.maxHealth;
    if (c.maxMana > old.maxMana) this.mana += c.maxMana - old.maxMana;
    if (c.maxStamina > old.maxStamina) this.stamina += c.maxStamina - old.maxStamina;
    this.health = clamp(this.health, 0, c.maxHealth);
    this.mana = clamp(this.mana, 0, c.maxMana);
    this.stamina = clamp(this.stamina, 0, c.maxStamina);
  }

  get speedMultiplier(): number {
    return this.config.speed / 100;
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  update(dt: number): void {
    if (this.isDead) return;
    if (this.staminaLock > 0) this.staminaLock = Math.max(0, this.staminaLock - dt);
    else this.stamina = Math.min(this.config.maxStamina, this.stamina + this.config.staminaRegen * dt);
    this.mana = Math.min(this.config.maxMana, this.mana + this.config.manaRegen * dt);
  }

  /** Spend stamina if available. `lock` delays regeneration (seconds). */
  spendStamina(amount: number, lock = 0.5): boolean {
    if (amount <= 0) return true;
    if (this.stamina < amount) return false;
    this.stamina -= amount;
    this.staminaLock = Math.max(this.staminaLock, lock);
    return true;
  }

  /** Drain without requiring full amount (block hits). Returns true if stamina hit zero. */
  drainStamina(amount: number, lock = 1.0): boolean {
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaLock = Math.max(this.staminaLock, lock);
    return this.stamina <= 0;
  }

  spendMana(amount: number): boolean {
    if (this.mana < amount) return false;
    this.mana -= amount;
    return true;
  }

  heal(amount: number): number {
    if (this.isDead) return 0;
    const before = this.health;
    this.health = Math.min(this.config.maxHealth, this.health + Math.max(0, amount));
    return this.health - before;
  }

  restoreMana(amount: number): void {
    this.mana = Math.min(this.config.maxMana, this.mana + Math.max(0, amount));
  }

  /** Raw health loss, floor 0. Returns actual loss. */
  loseHealth(amount: number): number {
    const before = this.health;
    this.health = Math.max(0, this.health - Math.max(0, amount));
    return before - this.health;
  }

  /** Defense reduces damage with diminishing returns: dmg * 100/(100+def*5), min 1. */
  mitigate(amount: number): number {
    const reduced = (amount * 100) / (100 + this.config.defense * 5);
    return Math.max(1, Math.round(reduced));
  }

  /** Damage dealt by a hit of the given multiplier. */
  outgoingDamage(mul: number): number {
    return Math.max(1, Math.round(this.config.attack * mul));
  }

  fullRestore(): void {
    this.health = this.config.maxHealth;
    this.mana = this.config.maxMana;
    this.stamina = this.config.maxStamina;
    this.staminaLock = 0;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function sanitize(p: Partial<PlayerStatsConfig>): Partial<PlayerStatsConfig> {
  const out: Partial<PlayerStatsConfig> = {};
  for (const k of Object.keys(p) as (keyof PlayerStatsConfig)[]) {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, v);
  }
  if (out.maxHealth !== undefined) out.maxHealth = Math.max(1, out.maxHealth);
  return out;
}
