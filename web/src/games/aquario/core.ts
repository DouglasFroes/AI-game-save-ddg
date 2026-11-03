/**
 * "Aquário" — pure rules. Drop pellets (they cost a coin) so your fish grow, sell the big ones,
 * buy new fish. A fish that goes hungry too long is lost. 75 seconds.
 */
export const DURATION = 75;
export const MAX_FISH = 6;
export const TANK = { x: 20, y: 250, w: 680, h: 860 } as const;
export const FISH_PRICE = 15;
/** Pellets a fish at each stage must eat to grow. */
export const NEED = [2, 3, 4] as const;
export const VALUE = [5, 15, 40, 100] as const;
const HUNGER_LIMIT = 14;

export interface Fish {
  id: number;
  x: number;
  y: number;
  vx: number;
  stage: number;
  fed: number;
  hunger: number;
  hue: number;
}
export interface Pellet {
  x: number;
  y: number;
  /** Seconds it has rested on the floor. */
  rest: number;
}

export class TankSim {
  t = 0;
  coins = 30;
  fish: Fish[] = [];
  pellets: Pellet[] = [];
  lost = 0;
  sold = 0;
  private nextId = 1;

  constructor(private readonly rng: () => number = Math.random) {
    this.addFish();
    this.addFish();
  }

  get done(): boolean {
    return this.t >= DURATION;
  }

  /** Coins plus what the fish in the tank would fetch. */
  get score(): number {
    return Math.floor(this.coins + this.fish.reduce((a, f) => a + VALUE[f.stage]! * 0.5, 0));
  }

  private addFish(): void {
    this.fish.push({
      id: this.nextId++,
      x: TANK.x + 60 + this.rng() * (TANK.w - 120),
      y: TANK.y + 200 + this.rng() * 500,
      vx: (this.rng() < 0.5 ? -1 : 1) * (50 + this.rng() * 30),
      stage: 0,
      fed: 0,
      hunger: 0,
      hue: Math.floor(this.rng() * 5),
    });
  }

  buyFish(): boolean {
    if (this.done || this.coins < FISH_PRICE || this.fish.length >= MAX_FISH) return false;
    this.coins -= FISH_PRICE;
    this.addFish();
    return true;
  }

  drop(x: number): boolean {
    if (this.done || this.coins < 1) return false;
    this.coins -= 1;
    this.pellets.push({
      x: Math.min(TANK.x + TANK.w - 20, Math.max(TANK.x + 20, x)),
      y: TANK.y + 10,
      rest: 0,
    });
    return true;
  }

  /** Sells fish `id` if fully grown. Returns the coins. */
  sell(id: number): number {
    const f = this.fish.find((o) => o.id === id);
    if (this.done || !f || f.stage < 3) return 0;
    this.fish = this.fish.filter((o) => o.id !== id);
    this.coins += VALUE[3];
    this.sold++;
    return VALUE[3];
  }

  step(dt: number): { ate: number; died: number } {
    if (this.done) return { ate: 0, died: 0 };
    this.t = Math.min(DURATION, this.t + dt);
    const floor = TANK.y + TANK.h - 30;
    for (const p of this.pellets) {
      if (p.y < floor) p.y = Math.min(floor, p.y + 150 * dt);
      else p.rest += dt;
    }
    let ate = 0;
    for (const f of this.fish) {
      f.hunger += dt;
      // Swim toward the closest pellet that is below (or beside) the fish; otherwise wander.
      let target: Pellet | null = null;
      let best = Infinity;
      for (const p of this.pellets) {
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < best && d < 420) {
          best = d;
          target = p;
        }
      }
      if (target) {
        f.vx = Math.sign(target.x - f.x || 1) * 150;
        f.y += Math.sign(target.y - f.y) * Math.min(Math.abs(target.y - f.y), 120 * dt);
      }
      f.x += f.vx * dt;
      if (f.x < TANK.x + 40 || f.x > TANK.x + TANK.w - 40) {
        f.vx = -f.vx;
        f.x = Math.min(TANK.x + TANK.w - 40, Math.max(TANK.x + 40, f.x));
      }
      if (target && Math.hypot(target.x - f.x, target.y - f.y) < 46 && f.stage < 3) {
        this.pellets = this.pellets.filter((p) => p !== target);
        f.hunger = 0;
        f.fed++;
        ate++;
        if (f.fed >= NEED[f.stage]!) {
          f.stage++;
          f.fed = 0;
        }
      }
    }
    this.pellets = this.pellets.filter((p) => p.rest < 4);
    const before = this.fish.length;
    this.fish = this.fish.filter((f) => f.hunger < HUNGER_LIMIT);
    const died = before - this.fish.length;
    this.lost += died;
    return { ate, died };
  }
}

/** Sells grown fish, buys fish when rich, and feeds whoever is hungriest. */
export function botAct(s: TankSim): void {
  for (const f of s.fish) if (f.stage >= 3) s.sell(f.id);
  if (s.coins >= 40 && s.fish.length < 5) s.buyFish();
  const hungry = [...s.fish].filter((f) => f.stage < 3).sort((a, b) => b.hunger - a.hunger)[0];
  if (!hungry) return;
  const pending = s.pellets.filter((p) => Math.abs(p.x - hungry.x) < 160 && p.rest < 1).length;
  if (pending < 1 && s.coins >= 1) s.drop(hungry.x);
}
