/**
 * "Fazendinha" — pure rules. Nine plots, three crops: plant, wait, harvest before it rots, and
 * end the two minutes with as many coins as you can. Rain makes everything grow twice as fast.
 */
export const DURATION = 120;
export const PLOTS = 9;

export interface Crop {
  name: string;
  emoji: string;
  seed: number;
  /** Seconds to ripen. */
  grow: number;
  price: number;
}
export const CROPS: readonly Crop[] = [
  { name: 'Cenoura', emoji: '🥕', seed: 3, grow: 6, price: 9 },
  { name: 'Milho', emoji: '🌽', seed: 10, grow: 13, price: 32 },
  { name: 'Abóbora', emoji: '🎃', seed: 30, grow: 28, price: 100 },
];
/** Seconds a ripe crop can wait before it rots. */
export const ROT_AFTER = 10;

export interface Plot {
  crop: number;
  age: number;
}

export class FarmSim {
  t = 0;
  coins = 25;
  plots: Array<Plot | null> = Array.from({ length: PLOTS }, () => null);
  /** Seconds of rain left (0 = dry). */
  rain = 0;
  harvested = 0;
  rotted = 0;
  private rainIn = 18;

  constructor(private readonly rng: () => number = Math.random) {}

  get done(): boolean {
    return this.t >= DURATION;
  }

  get score(): number {
    return Math.floor(this.coins);
  }

  isRipe(i: number): boolean {
    const p = this.plots[i];
    return !!p && p.age >= CROPS[p.crop]!.grow;
  }

  plant(i: number, crop: number): boolean {
    const c = CROPS[crop];
    if (!c || this.done || this.plots[i] || this.coins < c.seed) return false;
    this.coins -= c.seed;
    this.plots[i] = { crop, age: 0 };
    return true;
  }

  /** Harvests plot `i`; returns the coins earned (0 if nothing is ripe). */
  harvest(i: number): number {
    if (this.done || !this.isRipe(i)) return 0;
    const price = CROPS[this.plots[i]!.crop]!.price;
    this.plots[i] = null;
    this.coins += price;
    this.harvested++;
    return price;
  }

  step(dt: number): void {
    if (this.done) return;
    this.t = Math.min(DURATION, this.t + dt);
    const k = this.rain > 0 ? 2 : 1;
    this.rain = Math.max(0, this.rain - dt);
    this.rainIn -= dt;
    if (this.rainIn <= 0) {
      this.rain = 7;
      this.rainIn = 20 + this.rng() * 10;
    }
    this.plots = this.plots.map((p) => {
      if (!p) return null;
      p.age += dt * k;
      if (p.age >= CROPS[p.crop]!.grow + ROT_AFTER) {
        this.rotted++;
        return null;
      }
      return p;
    });
  }
}

/** Harvests everything ripe, then plants the crop that pays best and still ripens in time. */
export function botAct(s: FarmSim): void {
  const left = DURATION - s.t;
  for (let i = 0; i < PLOTS; i++) s.harvest(i);
  for (let i = 0; i < PLOTS; i++) {
    if (s.plots[i]) continue;
    let best = -1;
    let rate = 0;
    CROPS.forEach((c, k) => {
      const r = (c.price - c.seed) / c.grow;
      if (s.coins >= c.seed && c.grow < left - 1 && r > rate) {
        rate = r;
        best = k;
      }
    });
    if (best >= 0) s.plant(i, best);
  }
}
