/**
 * "Usina" — pure rules. Three reactors heat up on their own; the hotter they run, the more power
 * they make — and at 100° they blow. Tap a reactor to cool it down. How much power can you make?
 */
export const REACTORS = 3;
export const LIMIT = 100;
export const COOL = 30;
const COOLDOWN = 0.5;

export class PlantSim {
  t = 0;
  temps = [40, 40, 40];
  /** Seconds until each reactor can be cooled again. */
  cd = [0, 0, 0];
  /** Extra heating per second on each reactor, and its remaining seconds. */
  surge = [0, 0, 0];
  surgeLeft = [0, 0, 0];
  /** Reactor about to surge (a warning for the player), or -1. */
  warn = -1;
  warnLeft = 0;
  energy = 0;
  exploded = -1;
  private surgeIn = 7;

  constructor(private readonly rng: () => number = Math.random) {}

  get alive(): boolean {
    return this.exploded < 0;
  }

  get score(): number {
    return Math.floor(this.energy);
  }

  /** Power per second a reactor makes at temperature `t`. */
  static power(t: number): number {
    return t < 30 ? 0.5 : t < 60 ? 2 : t < 90 ? 4 : 6;
  }

  cool(i: number): boolean {
    if (!this.alive || this.cd[i]! > 0) return false;
    this.temps[i] = Math.max(0, this.temps[i]! - COOL);
    this.cd[i] = COOLDOWN;
    return true;
  }

  step(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    const base = 3.4 + this.t * 0.03;
    for (let i = 0; i < REACTORS; i++) {
      this.cd[i] = Math.max(0, this.cd[i]! - dt);
      let rate = base * (0.85 + 0.1 * i);
      if (this.surgeLeft[i]! > 0) {
        rate += this.surge[i]!;
        this.surgeLeft[i] = this.surgeLeft[i]! - dt;
      }
      this.temps[i] = this.temps[i]! + rate * dt;
      this.energy += PlantSim.power(this.temps[i]!) * dt;
      if (this.temps[i]! >= LIMIT) {
        this.exploded = i;
        return;
      }
    }
    if (this.warn >= 0) {
      this.warnLeft -= dt;
      if (this.warnLeft <= 0) {
        this.surge[this.warn] = 7;
        this.surgeLeft[this.warn] = 3;
        this.warn = -1;
      }
    } else {
      this.surgeIn -= dt;
      if (this.surgeIn <= 0) {
        this.warn = Math.floor(this.rng() * REACTORS);
        this.warnLeft = 1.5;
        this.surgeIn = 8 + this.rng() * 3;
      }
    }
  }
}

/** Cools the hottest reactor as soon as it nears the limit. */
export function botAct(s: PlantSim, threshold = 80): void {
  let hot = -1;
  for (let i = 0; i < REACTORS; i++) {
    if (s.temps[i]! >= threshold && s.cd[i]! <= 0 && (hot < 0 || s.temps[i]! > s.temps[hot]!))
      hot = i;
  }
  if (hot >= 0) s.cool(hot);
}
