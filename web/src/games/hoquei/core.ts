import type { Rnd } from '@/platform/rnd';

/**
 * Air hockey: a puck, two mallets and two goals. Pure simulation in table units (the scene maps
 * them to the screen). Seat 0 is the player at the bottom, seat 1 the CPU at the top.
 */
export const W = 600;
export const H = 900;
export const PUCK_R = 28;
export const MALLET_R = 46;
/** Half the width of each goal mouth. */
export const GOAL_HALF = 125;
export const GOALS_TO_WIN = 5;
export const MAX_PUCK_SPEED = 1500;
const FRICTION = 0.12;
const WALL_BOUNCE = 0.92;
const MALLET_BOUNCE = 1.9;
const SERVE_FREEZE = 1.1;

export type Seat = 0 | 1;
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface Point {
  x: number;
  y: number;
}
export type HockeyEvent = 'wall' | 'mallet' | { goal: Seat };

const body = (x: number, y: number): Body => ({ x, y, vx: 0, vy: 0 });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class AirHockey {
  puck: Body = body(W / 2, H / 2);
  readonly mallets: [Body, Body] = [body(W / 2, H - 120), body(W / 2, 120)];
  readonly score: [number, number] = [0, 0];
  /** Seconds the puck stays still after a goal. */
  freeze = 1;
  /** What happened during the last `step` (for sounds and effects). */
  events: HockeyEvent[] = [];

  constructor(serveTo: Seat = 0) {
    this.serve(serveTo);
  }

  get winner(): Seat | null {
    if (this.score[0] >= GOALS_TO_WIN) return 0;
    if (this.score[1] >= GOALS_TO_WIN) return 1;
    return null;
  }

  /** Puts the puck on `seat`'s side, still, for a short moment. */
  serve(seat: Seat): void {
    this.puck = body(W / 2, seat === 0 ? H * 0.68 : H * 0.32);
    this.freeze = SERVE_FREEZE;
  }

  private moveMallet(seat: Seat, target: Point, maxSpeed: number, dt: number): void {
    const m = this.mallets[seat];
    const lo = seat === 0 ? H / 2 + 6 : MALLET_R;
    const hi = seat === 0 ? H - MALLET_R : H / 2 - 6;
    const tx = clamp(target.x, MALLET_R, W - MALLET_R);
    const ty = clamp(target.y, lo, hi);
    let dx = tx - m.x;
    let dy = ty - m.y;
    const d = Math.hypot(dx, dy);
    const reach = maxSpeed * dt;
    if (d > reach) {
      dx *= reach / d;
      dy *= reach / d;
    }
    m.vx = dx / dt;
    m.vy = dy / dt;
    m.x += dx;
    m.y += dy;
  }

  /** Advances the table by `dt` seconds (keep it ≤ 1/100 so fast pucks never tunnel). */
  step(dt: number, you: Point, cpu: Point, youSpeed = 2200, cpuSpeed = 1000): void {
    this.events = [];
    this.moveMallet(0, you, youSpeed, dt);
    this.moveMallet(1, cpu, cpuSpeed, dt);
    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }
    const p = this.puck;
    const drag = Math.max(0, 1 - FRICTION * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    for (const seat of [0, 1] as const) this.collide(seat);
    this.walls();
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > MAX_PUCK_SPEED) {
      p.vx *= MAX_PUCK_SPEED / speed;
      p.vy *= MAX_PUCK_SPEED / speed;
    }
  }

  private collide(seat: Seat): void {
    const p = this.puck;
    const m = this.mallets[seat];
    let dx = p.x - m.x;
    let dy = p.y - m.y;
    let d = Math.hypot(dx, dy);
    const min = PUCK_R + MALLET_R;
    if (d >= min) return;
    if (d < 1e-6) {
      dx = 0;
      dy = seat === 0 ? -1 : 1;
      d = 1;
    }
    const nx = dx / d;
    const ny = dy / d;
    p.x = m.x + nx * min;
    p.y = m.y + ny * min;
    const rel = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
    if (rel < 0) {
      p.vx -= MALLET_BOUNCE * rel * nx;
      p.vy -= MALLET_BOUNCE * rel * ny;
      this.events.push('mallet');
    }
    // Squeezed between the mallet and a wall: squirt out to the nearest free spot around the mallet.
    this.walls();
    if (Math.hypot(p.x - m.x, p.y - m.y) < min - 0.5) this.squirt(m, min);
  }

  private squirt(m: Body, radius: number): void {
    const p = this.puck;
    let best: { x: number; y: number; d: number } | null = null;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const x = m.x + Math.cos(a) * radius;
      const y = m.y + Math.sin(a) * radius;
      const mouth = Math.abs(x - W / 2) < GOAL_HALF - PUCK_R * 0.4;
      if (x < PUCK_R || x > W - PUCK_R) continue;
      if (!mouth && (y < PUCK_R || y > H - PUCK_R)) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (!best) return;
    p.x = best.x;
    p.y = best.y;
    // Out of the pocket and into open table, whichever way the mallet was pushing.
    const cx = W / 2 - p.x;
    const cy = H / 2 - p.y;
    const len = Math.hypot(cx, cy) || 1;
    const speed = Math.max(Math.hypot(p.vx, p.vy) * 0.5, 520);
    p.vx = (cx / len) * speed;
    p.vy = (cy / len) * speed;
  }

  private walls(): void {
    const p = this.puck;
    if (p.x < PUCK_R) {
      p.x = PUCK_R;
      p.vx = Math.abs(p.vx) * WALL_BOUNCE;
      this.events.push('wall');
    } else if (p.x > W - PUCK_R) {
      p.x = W - PUCK_R;
      p.vx = -Math.abs(p.vx) * WALL_BOUNCE;
      this.events.push('wall');
    }
    const inMouth = Math.abs(p.x - W / 2) < GOAL_HALF - PUCK_R * 0.4;
    if (p.y < PUCK_R && !inMouth) {
      p.y = PUCK_R;
      p.vy = Math.abs(p.vy) * WALL_BOUNCE;
      this.events.push('wall');
    } else if (p.y > H - PUCK_R && !inMouth) {
      p.y = H - PUCK_R;
      p.vy = -Math.abs(p.vy) * WALL_BOUNCE;
      this.events.push('wall');
    }
    if (p.y < -PUCK_R) this.goal(0);
    else if (p.y > H + PUCK_R) this.goal(1);
  }

  private goal(scorer: Seat): void {
    this.score[scorer]++;
    this.events.push({ goal: scorer });
    // The side that conceded serves.
    this.serve(scorer === 0 ? 1 : 0);
  }
}

// ---------------------------------------------------------------- CPU

export interface OpponentLevel {
  speed: number;
  /** Aim wobble, in table units. */
  error: number;
  /** Whether it predicts bank shots when defending. */
  predicts: boolean;
}

export function opponentLevel(level: number): OpponentLevel {
  return {
    speed: Math.min(1500, 560 + level * 170),
    error: Math.max(6, 64 - level * 12),
    predicts: level >= 2,
  };
}

/** The CPU's brain; it plays either seat, so tests can use it as a bot for the player too. */
export class Opponent {
  private errX = 0;
  private errY = 0;
  private nextErr = 0;
  readonly params: OpponentLevel;

  constructor(
    private readonly seat: Seat,
    level: number,
    private readonly rnd: Rnd,
  ) {
    this.params = opponentLevel(level);
  }

  target(g: AirHockey, dt: number): Point {
    this.nextErr -= dt;
    if (this.nextErr <= 0) {
      this.nextErr = 0.4;
      this.errX = (this.rnd() - 0.5) * 2 * this.params.error;
      this.errY = (this.rnd() - 0.5) * this.params.error;
    }
    const dir = this.seat === 1 ? 1 : -1; // towards the opponent's goal
    const ownY = this.seat === 1 ? 0 : H;
    const foeY = H - ownY;
    const m = g.mallets[this.seat];
    const p = g.puck;
    const home = { x: W / 2, y: ownY + dir * (MALLET_R + 50) };
    if (g.freeze > 0) return home;
    const mine = this.seat === 1 ? p.y < H / 2 + 20 : p.y > H / 2 - 20;
    const speed = Math.hypot(p.vx, p.vy);
    const incoming = p.vy * dir < -80;

    if (mine && (speed < 520 || !incoming)) {
      const gx = W / 2 - p.x;
      const gy = foeY - p.y;
      const gl = Math.hypot(gx, gy) || 1;
      const ux = gx / gl;
      const uy = gy / gl;
      const reach = PUCK_R + MALLET_R;
      const behind = { x: p.x - ux * (reach + 24), y: p.y - uy * (reach + 24) };
      const side = (m.x - p.x) * ux + (m.y - p.y) * uy; // < 0: already behind the puck
      const off = Math.hypot(m.x - behind.x, m.y - behind.y);
      if (side > -reach * 0.6 || off > 70) return { x: behind.x + this.errX, y: behind.y };
      return { x: p.x + ux * reach * 2.2 + this.errX * 0.3, y: p.y + uy * reach * 2.2 };
    }

    const lineY = ownY + dir * (MALLET_R + 36);
    let x = W / 2;
    if (incoming) {
      let t = (lineY - p.y) / p.vy;
      t = clamp(t, 0, 3);
      x = this.params.predicts ? this.bank(p.x + p.vx * t) : p.x;
    } else if (mine) x = p.x;
    x = clamp(x, W / 2 - GOAL_HALF - 10, W / 2 + GOAL_HALF + 10);
    return { x: x + this.errX, y: lineY + this.errY };
  }

  /** Folds an x travelling past a side wall back into the table. */
  private bank(x: number): number {
    const lo = PUCK_R;
    const hi = W - PUCK_R;
    const span = hi - lo;
    let v = (x - lo) % (2 * span);
    if (v < 0) v += 2 * span;
    return lo + (v > span ? 2 * span - v : v);
  }
}

/** Points for winning a match: the level reached and the goal margin. */
export function matchPoints(wins: number, goalsFor: number, goalsAgainst: number): number {
  return 100 + wins * 50 + Math.max(0, goalsFor - goalsAgainst) * 25;
}
