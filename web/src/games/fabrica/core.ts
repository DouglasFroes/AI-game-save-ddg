/**
 * "Fábrica de Biscoitos" — pure rules of a 90-second clicker. Tap to bake, spend biscuits on
 * upgrades that bake for you, and catch the golden biscuit for a big bonus.
 */
export const DURATION = 90;

export type Upgrade = 'click' | 'oven' | 'factory' | 'mult';
export const UPGRADES: Readonly<Record<Upgrade, { base: number; growth: number }>> = {
  click: { base: 15, growth: 1.55 },
  oven: { base: 40, growth: 1.4 },
  factory: { base: 320, growth: 1.45 },
  mult: { base: 1500, growth: 2.2 },
};
export const UPGRADE_KEYS: readonly Upgrade[] = ['click', 'oven', 'factory', 'mult'];

export interface Golden {
  x: number;
  y: number;
  left: number;
}

export class FactorySim {
  t = 0;
  cookies = 0;
  total = 0;
  clicks = 0;
  levels: Record<Upgrade, number> = { click: 0, oven: 0, factory: 0, mult: 0 };
  golden: Golden | null = null;
  private goldenIn = 12;

  constructor(private readonly rng: () => number = Math.random) {}

  get done(): boolean {
    return this.t >= DURATION;
  }

  get mult(): number {
    return 1 + this.levels.mult * 0.5;
  }

  get perClick(): number {
    return (1 + this.levels.click) * this.mult;
  }

  /** Biscuits per second from ovens and factories. */
  get cps(): number {
    return (this.levels.oven * 1.2 + this.levels.factory * 9) * this.mult;
  }

  get score(): number {
    return Math.floor(this.total);
  }

  cost(k: Upgrade): number {
    const u = UPGRADES[k];
    return Math.round(u.base * Math.pow(u.growth, this.levels[k]));
  }

  private add(n: number): void {
    this.cookies += n;
    this.total += n;
  }

  click(): number {
    if (this.done) return 0;
    this.clicks++;
    const n = this.perClick;
    this.add(n);
    return n;
  }

  buy(k: Upgrade): boolean {
    const c = this.cost(k);
    if (this.done || this.cookies < c) return false;
    this.cookies -= c;
    this.levels[k]++;
    return true;
  }

  /** Taps the golden biscuit: returns the bonus (0 if there is none). */
  tapGolden(): number {
    if (!this.golden || this.done) return 0;
    const bonus = Math.max(40, this.cps * 20) + this.perClick * 10;
    this.add(bonus);
    this.golden = null;
    return bonus;
  }

  step(dt: number): void {
    if (this.done) return;
    this.t = Math.min(DURATION, this.t + dt);
    this.add(this.cps * dt);
    if (this.golden) {
      this.golden.left -= dt;
      if (this.golden.left <= 0) this.golden = null;
    } else {
      this.goldenIn -= dt;
      if (this.goldenIn <= 0) {
        this.golden = { x: 120 + this.rng() * 480, y: 330 + this.rng() * 300, left: 5 };
        this.goldenIn = 14 + this.rng() * 6;
      }
    }
  }
}

/** One decision of a decent player: grab gold, buy the best-paying upgrade, else click. */
export function botAct(s: FactorySim, clicksPerSecond = 6): void {
  s.tapGolden();
  const left = DURATION - s.t;
  const rate = s.perClick * clicksPerSecond + s.cps;
  let best: Upgrade | null = null;
  let bestPay = Infinity;
  for (const k of UPGRADE_KEYS) {
    const cost = s.cost(k);
    const gain =
      k === 'click'
        ? clicksPerSecond * s.mult
        : k === 'oven'
          ? 1.2 * s.mult
          : k === 'factory'
            ? 9 * s.mult
            : rate * (0.5 / s.mult);
    const pay = cost / gain;
    if (pay < bestPay && pay < left * 0.8) {
      bestPay = pay;
      best = k;
    }
  }
  if (best && s.cookies >= s.cost(best)) s.buy(best);
}
