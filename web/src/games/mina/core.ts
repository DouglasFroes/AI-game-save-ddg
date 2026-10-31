/**
 * "Mina de Ouro" — pure rules of a 90-second idle-clicker sprint. Tap the rock to mine gold, and
 * spend it on picks (more per tap) and miners, carts and drills (gold every second). Prices go up
 * with each purchase. The score is all the gold mined in the time — spending wisely early is
 * what makes a big total.
 */
export const TIME = 90;

export type UpgradeId = 'picareta' | 'mineiro' | 'carrinho' | 'broca' | 'dinamite';

export interface Upgrade {
  readonly id: UpgradeId;
  readonly name: string;
  readonly emoji: string;
  readonly base: number;
  /** Gold per tap added. */
  readonly tap: number;
  /** Gold per second added. */
  readonly sec: number;
}

export const UPGRADES: readonly Upgrade[] = [
  { id: 'picareta', name: 'Picareta', emoji: '⛏️', base: 15, tap: 1, sec: 0 },
  { id: 'mineiro', name: 'Mineiro', emoji: '👷', base: 40, tap: 0, sec: 2 },
  { id: 'carrinho', name: 'Carrinho', emoji: '🛒', base: 250, tap: 0, sec: 12 },
  { id: 'broca', name: 'Broca', emoji: '🔩', base: 1400, tap: 0, sec: 60 },
  { id: 'dinamite', name: 'Dinamite', emoji: '🧨', base: 600, tap: 8, sec: 0 },
];

/** Price of the next unit when `owned` are already bought. */
export const priceOf = (u: Upgrade, owned: number): number =>
  Math.round(u.base * Math.pow(1.17, owned));

export class MineRun {
  gold = 0;
  total = 0;
  taps = 0;
  timeLeft = TIME;
  owned: Record<UpgradeId, number> = {
    picareta: 0,
    mineiro: 0,
    carrinho: 0,
    broca: 0,
    dinamite: 0,
  };
  private carry = 0;

  get over(): boolean {
    return this.timeLeft <= 0;
  }

  get perTap(): number {
    return 1 + UPGRADES.reduce((s, u) => s + u.tap * this.owned[u.id], 0);
  }

  get perSec(): number {
    return UPGRADES.reduce((s, u) => s + u.sec * this.owned[u.id], 0);
  }

  price(id: UpgradeId): number {
    return priceOf(
      UPGRADES.find((u) => u.id === id)!,
      this.owned[id],
    );
  }

  private earn(n: number): void {
    this.gold += n;
    this.total += n;
  }

  tap(): number {
    if (this.over) return 0;
    this.taps++;
    const n = this.perTap;
    this.earn(n);
    return n;
  }

  buy(id: UpgradeId): boolean {
    const p = this.price(id);
    if (this.over || this.gold < p) return false;
    this.gold -= p;
    this.owned[id]++;
    return true;
  }

  tick(dt: number): void {
    if (this.over) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.carry += this.perSec * dt;
    const whole = Math.floor(this.carry);
    this.carry -= whole;
    this.earn(whole);
  }
}
