/**
 * "Sinuca" — pure pool physics and arcade rules. Pull back from the cue ball and release to shoot;
 * every shot must pocket at least one ball, otherwise (or if the cue ball drops) a life is lost.
 * Several balls in one shot and successful shots in a row multiply the points; clearing the
 * table racks up a new one.
 */
export const TABLE = { x0: 80, y0: 260, x1: 640, y1: 1140 } as const;
export const BALL_R = 17;
export const POCKET_R = 32;
export const MAX_POWER = 2000;
export const LIVES = 3;
const STEP = 1 / 240;
const ROLL_DECEL = 70; // px/s² of rolling resistance
const DRAG = 0.6; // proportional slow-down per second
const CUSHION = 0.78;
const BALL_E = 0.95;

export const POCKETS: ReadonlyArray<{ x: number; y: number }> = [
  { x: TABLE.x0 + 6, y: TABLE.y0 + 6 },
  { x: TABLE.x1 - 6, y: TABLE.y0 + 6 },
  { x: TABLE.x0 - 4, y: (TABLE.y0 + TABLE.y1) / 2 },
  { x: TABLE.x1 + 4, y: (TABLE.y0 + TABLE.y1) / 2 },
  { x: TABLE.x0 + 6, y: TABLE.y1 - 6 },
  { x: TABLE.x1 - 6, y: TABLE.y1 - 6 },
];

export const CUE_SPOT = { x: 360, y: 960 } as const;

export interface Ball {
  /** 0 = cue ball, 1..15 = object balls. */
  readonly n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  down: boolean;
}

export function rack(): Ball[] {
  const balls: Ball[] = [{ n: 0, ...CUE_SPOT, vx: 0, vy: 0, down: false }];
  const apex = { x: 360, y: 520 };
  const dy = BALL_R * Math.sqrt(3) * 1.02;
  let n = 1;
  for (let row = 0; row < 5; row++)
    for (let i = 0; i <= row; i++)
      balls.push({
        n: n++,
        x: apex.x + (i - row / 2) * BALL_R * 2.04,
        y: apex.y - row * dy,
        vx: 0,
        vy: 0,
        down: false,
      });
  return balls;
}

export type PoolEvent =
  | { type: 'pocket'; n: number }
  | { type: 'clack'; speed: number }
  | { type: 'cushion' }
  | { type: 'shot'; pocketed: number[]; scratch: boolean; points: number; livesLeft: number }
  | { type: 'rack'; bonus: number };

/** First object ball the cue ball would touch along `dir` (for the aiming guide). */
export function firstContact(
  balls: readonly Ball[],
  dx: number,
  dy: number,
): { x: number; y: number; ball: Ball } | null {
  const cue = balls[0]!;
  let best: { t: number; ball: Ball } | null = null;
  for (const b of balls) {
    if (b.n === 0 || b.down) continue;
    // |cue + d t - b| = 2R
    const fx = cue.x - b.x;
    const fy = cue.y - b.y;
    const bq = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - 4 * BALL_R * BALL_R;
    const disc = bq * bq - c;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0 && (!best || t < best.t)) best = { t, ball: b };
  }
  return best ? { x: cue.x + dx * best.t, y: cue.y + dy * best.t, ball: best.ball } : null;
}

export class PoolSim {
  balls: Ball[] = rack();
  score = 0;
  lives = LIVES;
  streak = 0;
  potted = 0;
  racks = 0;
  private moving = false;
  private pocketed: number[] = [];

  get over(): boolean {
    return this.lives <= 0;
  }

  get rolling(): boolean {
    return this.moving;
  }

  shoot(dx: number, dy: number, power: number): boolean {
    if (this.moving || this.over) return false;
    const len = Math.hypot(dx, dy);
    if (len === 0 || power <= 0.03) return false;
    const cue = this.balls[0]!;
    const v = Math.min(1, power) * MAX_POWER;
    cue.vx = (dx / len) * v;
    cue.vy = (dy / len) * v;
    this.moving = true;
    this.pocketed = [];
    return true;
  }

  step(dt: number): PoolEvent[] {
    const ev: PoolEvent[] = [];
    if (!this.moving) return ev;
    for (let left = dt; left > 1e-9; left -= STEP) this.sub(Math.min(STEP, left), ev);
    if (this.balls.every((b) => b.down || (b.vx === 0 && b.vy === 0))) {
      this.moving = false;
      ev.push(...this.resolve());
    }
    return ev;
  }

  private sub(h: number, ev: PoolEvent[]): void {
    const live = this.balls.filter((b) => !b.down);
    for (const b of live) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp === 0) continue;
      const ns = Math.max(0, sp - (ROLL_DECEL + sp * DRAG) * h);
      if (ns < 4) {
        b.vx = 0;
        b.vy = 0;
        continue;
      }
      b.vx *= ns / sp;
      b.vy *= ns / sp;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
    for (const b of live) {
      if (POCKETS.some((p) => Math.hypot(b.x - p.x, b.y - p.y) < POCKET_R)) {
        b.down = true;
        b.vx = 0;
        b.vy = 0;
        this.pocketed.push(b.n);
        ev.push({ type: 'pocket', n: b.n });
        continue;
      }
      let hit = false;
      if (b.x < TABLE.x0 + BALL_R) {
        b.x = TABLE.x0 + BALL_R;
        b.vx = Math.abs(b.vx) * CUSHION;
        hit = true;
      } else if (b.x > TABLE.x1 - BALL_R) {
        b.x = TABLE.x1 - BALL_R;
        b.vx = -Math.abs(b.vx) * CUSHION;
        hit = true;
      }
      if (b.y < TABLE.y0 + BALL_R) {
        b.y = TABLE.y0 + BALL_R;
        b.vy = Math.abs(b.vy) * CUSHION;
        hit = true;
      } else if (b.y > TABLE.y1 - BALL_R) {
        b.y = TABLE.y1 - BALL_R;
        b.vy = -Math.abs(b.vy) * CUSHION;
        hit = true;
      }
      if (hit && Math.hypot(b.vx, b.vy) > 200) ev.push({ type: 'cushion' });
    }
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!;
        const c = live[j]!;
        if (a.down || c.down) continue;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= BALL_R * 2 || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (BALL_R * 2 - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        c.x += nx * push;
        c.y += ny * push;
        const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (rel <= 0) continue;
        const j2 = ((1 + BALL_E) * rel) / 2;
        a.vx -= j2 * nx;
        a.vy -= j2 * ny;
        c.vx += j2 * nx;
        c.vy += j2 * ny;
        if (rel > 120) ev.push({ type: 'clack', speed: rel });
      }
  }

  private resolve(): PoolEvent[] {
    const ev: PoolEvent[] = [];
    const scratch = this.pocketed.includes(0);
    const objects = this.pocketed.filter((n) => n !== 0);
    let points = 0;
    if (objects.length && !scratch) {
      this.streak++;
      const value = objects.reduce((s, n) => s + 10 + n * 2, 0);
      points = Math.round(value * objects.length * (1 + 0.5 * (this.streak - 1)));
    } else {
      this.streak = 0;
      this.lives--;
    }
    this.score += points;
    this.potted += objects.length;
    if (scratch) this.respot();
    ev.push({ type: 'shot', pocketed: objects, scratch, points, livesLeft: this.lives });
    if (!this.over && this.balls.every((b) => b.n === 0 || b.down)) {
      this.racks++;
      const bonus = 1000 * this.racks;
      this.score += bonus;
      const cue = this.balls[0]!;
      this.balls = rack();
      this.balls[0] = { ...cue, down: false, vx: 0, vy: 0 };
      // The cue ball stays where it stopped unless the new rack sits on it.
      if (this.balls.some((b) => b.n !== 0 && Math.hypot(b.x - cue.x, b.y - cue.y) < BALL_R * 2))
        this.respot();
      ev.push({ type: 'rack', bonus });
    }
    return ev;
  }

  /** Puts the cue ball back on its spot, nudged down if a ball is there. */
  private respot(): void {
    const cue = this.balls[0]!;
    cue.down = false;
    cue.vx = 0;
    cue.vy = 0;
    cue.x = CUE_SPOT.x;
    cue.y = CUE_SPOT.y;
    const blocked = () =>
      this.balls.some(
        (b) => b.n !== 0 && !b.down && Math.hypot(b.x - cue.x, b.y - cue.y) < BALL_R * 2.2,
      );
    for (let i = 0; i < 20 && blocked(); i++)
      cue.y = Math.min(TABLE.y1 - BALL_R, cue.y + BALL_R * 2.2);
    for (let i = 0; i < 20 && blocked(); i++)
      cue.x = TABLE.x0 + BALL_R + ((cue.x + 60) % (TABLE.x1 - TABLE.x0 - BALL_R * 2));
  }
}
