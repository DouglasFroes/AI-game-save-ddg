/**
 * "Pouso Lunar" — pure rules. Two engines: the left one pushes the ship up and to the right, the
 * right one up and to the left; both together push straight up. Land gently and level on a pad
 * (narrow pads pay more). Fuel carries over between landings, with a partial refill each time.
 */
export const WORLD_W = 720;
export const SKY_TOP = 240;
export const SHIP_R = 22;
export const SAFE_VY = 85;
export const SAFE_VX = 55;
const THRUST = 260;
const SIDE = 150;
const BURN = 5.5; // fuel per second per engine

export interface Pad {
  readonly x0: number;
  readonly x1: number;
  readonly y: number;
  readonly mult: number;
}

export interface Terrain {
  /** Polyline from x=0 to x=WORLD_W. */
  readonly points: ReadonlyArray<{ x: number; y: number }>;
  readonly pads: readonly Pad[];
}

export function makeTerrain(level: number, rng: () => number = Math.random): Terrain {
  const points: Array<{ x: number; y: number }> = [];
  const pads: Pad[] = [];
  const padCount = 3;
  const widths = [130, 96, Math.max(60, 80 - level * 2)];
  const mults = [1, 2, 4];
  // Pick pad slots on a coarse grid so they never overlap.
  const slots = [0, 1, 2, 3, 4]
    .sort(() => rng() - 0.5)
    .slice(0, padCount)
    .sort((a, b) => a - b);
  const slotW = WORLD_W / 5;
  const order = [0, 1, 2].sort(() => rng() - 0.5);
  let x = 0;
  let y = 1000 + rng() * 120;
  points.push({ x, y });
  slots.forEach((slot, i) => {
    const w = widths[order[i]!]!;
    const start = Math.max(x + 30, slot * slotW + (slotW - w) * rng());
    while (x + 40 < start) {
      x = Math.min(start, x + 30 + rng() * 40);
      y = Math.max(780, Math.min(1180, y + (rng() - 0.5) * (140 + level * 14)));
      points.push({ x, y });
    }
    x = start;
    y = Math.max(820, Math.min(1150, y));
    points.push({ x, y });
    x = start + w;
    points.push({ x, y });
    pads.push({ x0: start, x1: start + w, y, mult: mults[order[i]!]! });
  });
  while (x < WORLD_W) {
    x = Math.min(WORLD_W, x + 30 + rng() * 40);
    y = Math.max(780, Math.min(1180, y + (rng() - 0.5) * (140 + level * 14)));
    points.push({ x, y });
  }
  return { points, pads };
}

/** Ground height under x. */
export function groundAt(t: Terrain, x: number): number {
  const p = t.points;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return p.at(-1)!.y;
}

export type LunarEvent =
  | { type: 'landed'; points: number; pad: Pad; soft: boolean }
  | { type: 'crash'; reason: 'fast' | 'rock' };

export class LunarSim {
  level = 1;
  terrain: Terrain;
  x = 360;
  y = SKY_TOP + 40;
  vx = 0;
  vy = 0;
  fuel = 100;
  score = 0;
  landings = 0;
  state: 'flying' | 'landed' | 'crashed' = 'flying';
  left = false;
  right = false;

  constructor(private readonly rng: () => number = Math.random) {
    this.terrain = makeTerrain(1, rng);
    this.reset();
  }

  get gravity(): number {
    return Math.min(150, 70 + this.level * 7);
  }

  /** A sideways drift that grows with the level. */
  get wind(): number {
    return this.level < 3 ? 0 : Math.sin(this.level * 1.7) * Math.min(40, this.level * 4);
  }

  private reset(): void {
    this.x = 120 + this.rng() * 480;
    this.y = SKY_TOP + 40;
    this.vx = (this.rng() - 0.5) * 60;
    this.vy = 0;
    this.state = 'flying';
  }

  step(dt: number): LunarEvent[] {
    if (this.state !== 'flying') return [];
    const l = this.left && this.fuel > 0;
    const r = this.right && this.fuel > 0;
    const engines = (l ? 1 : 0) + (r ? 1 : 0);
    this.fuel = Math.max(0, this.fuel - engines * BURN * dt);
    const up = engines === 2 ? THRUST * 1.15 : engines === 1 ? THRUST * 0.75 : 0;
    const side = (l ? SIDE : 0) - (r ? SIDE : 0);
    this.vx += (side + this.wind) * dt;
    this.vy += (this.gravity - up) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < SHIP_R) {
      this.x = SHIP_R;
      this.vx = Math.abs(this.vx) * 0.4;
    } else if (this.x > WORLD_W - SHIP_R) {
      this.x = WORLD_W - SHIP_R;
      this.vx = -Math.abs(this.vx) * 0.4;
    }
    if (this.y < SKY_TOP) {
      this.y = SKY_TOP;
      this.vy = Math.max(0, this.vy);
    }
    const ground = groundAt(this.terrain, this.x);
    if (this.y + SHIP_R < ground) return [];

    this.y = ground - SHIP_R;
    const pad = this.terrain.pads.find((p) => this.x - 8 >= p.x0 && this.x + 8 <= p.x1);
    const gentle = Math.abs(this.vy) <= SAFE_VY && Math.abs(this.vx) <= SAFE_VX;
    if (!pad || !gentle) {
      this.state = 'crashed';
      return [{ type: 'crash', reason: pad ? 'fast' : 'rock' }];
    }
    this.state = 'landed';
    const soft = Math.abs(this.vy) < SAFE_VY / 2;
    const points = Math.round(
      (100 + this.fuel * 2 + (soft ? 100 : 0)) * pad.mult * (1 + this.level * 0.1),
    );
    this.score += points;
    this.landings++;
    return [{ type: 'landed', points, pad, soft }];
  }

  /** Takes off for the next level. */
  next(): void {
    if (this.state !== 'landed') return;
    this.level++;
    this.fuel = Math.min(100, this.fuel + 45);
    this.terrain = makeTerrain(this.level, this.rng);
    this.reset();
  }
}
