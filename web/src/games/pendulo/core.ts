/**
 * "Pêndulo" — pure rules. Swing from hook to hook: hold to throw the rope at the next hook and
 * swing, let go to fly. Fall into the lava and the run is over. Score is the distance covered.
 */
export const LAVA_Y = 1160;
const GRAVITY = 1500;
export const REACH = 430;
export const START = { x: 220, y: 330 } as const;

export interface Hook {
  x: number;
  y: number;
}

export class SwingSim {
  x = START.x - 150;
  y = START.y + 190;
  vx = 330;
  vy = 0;
  /** Hook the rope is tied to, or null in free flight. */
  hook: Hook | null = null;
  len = 0;
  alive = true;
  t = 0;
  maxX: number = START.x;
  hooks: Hook[] = [{ ...START }];

  constructor(private readonly rng: () => number = Math.random) {
    this.fill(2400);
    this.hook = this.hooks[0]!;
    this.len = Math.hypot(this.x - this.hook.x, this.y - this.hook.y);
  }

  /** Keeps hooks generated up to `untilX`. */
  fill(untilX: number): void {
    let last = this.hooks[this.hooks.length - 1]!;
    while (last.x < untilX) {
      const gap = 250 + this.rng() * 70 + Math.min(60, last.x / 120);
      last = { x: last.x + gap, y: 300 + this.rng() * 110 };
      this.hooks.push(last);
    }
  }

  get score(): number {
    return Math.max(0, Math.floor((this.maxX - START.x) / 10));
  }

  /** Ties the rope to the nearest hook ahead (and above) within reach. */
  grab(): boolean {
    if (this.hook || !this.alive) return false;
    let best: Hook | null = null;
    let bestD = Infinity;
    for (const h of this.hooks) {
      const d = Math.hypot(h.x - this.x, h.y - this.y);
      if (h.x > this.x + 40 && h.y < this.y - 80 && d < REACH && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    if (!best) return false;
    this.hook = best;
    this.len = Math.max(140, bestD);
    return true;
  }

  release(): void {
    this.hook = null;
  }

  step(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const h = this.hook;
    if (h) {
      const dx = this.x - h.x;
      const dy = this.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d > this.len) {
        const nx = dx / d;
        const ny = dy / d;
        this.x = h.x + nx * this.len;
        this.y = h.y + ny * this.len;
        const radial = this.vx * nx + this.vy * ny;
        if (radial > 0) {
          this.vx -= radial * nx;
          this.vy -= radial * ny;
        }
      }
    }
    this.maxX = Math.max(this.maxX, this.x);
    this.fill(this.x + 2200);
    if (this.y > LAVA_Y) this.alive = false;
  }
}

/** A decent player: grab as soon as there is a hook, let go on the upswing past the hook. */
export function botAct(s: SwingSim): void {
  if (!s.hook) {
    s.grab();
    return;
  }
  const ahead = s.x - s.hook.x;
  if (ahead > s.len * 0.3 && s.vy < -50 && s.vx > 200) s.release();
}
