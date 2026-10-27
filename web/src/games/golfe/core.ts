/**
 * "Mini Golfe" — pure rules: nine holes seen from above. Pull back and release to putt; the ball
 * rolls with friction, bounces off walls, slows in sand, drifts on slopes, sinks in water (one
 * stroke penalty) and drops into the cup only when it arrives slowly enough.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Slope extends Rect {
  /** Push in px/s² (the slope's direction). */
  readonly ax: number;
  readonly ay: number;
}

export interface Mover extends Rect {
  /** Moves along this axis by ±range px, one full cycle every `period` seconds. */
  readonly axis: 'x' | 'y';
  readonly range: number;
  readonly period: number;
}

export interface Hole {
  readonly par: number;
  readonly tee: { x: number; y: number };
  readonly cup: { x: number; y: number };
  readonly walls: readonly Rect[];
  readonly sand?: readonly Rect[];
  readonly water?: readonly Rect[];
  readonly slopes?: readonly Slope[];
  readonly movers?: readonly Mover[];
}

/** The playing area every hole sits in (its border is a wall too). */
export const AREA: Rect = { x: 40, y: 200, w: 640, h: 1020 };
export const BALL_R = 13;
export const CUP_R = 17;
export const MAX_SPEED = 1500;
/** Pull-back distance (px) that gives full power. */
export const MAX_PULL = 260;
export const MAX_STROKES = 8;
/** A ball faster than this rolls over the cup (lips out). */
const SINK_SPEED = 620;
const BOUNCE = 0.78;
const ROLL = 1.05;
const SAND = 4.8;
const STOP = 9;
const STEP = 1 / 240;

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const HOLES: readonly Hole[] = [
  {
    par: 2,
    tee: { x: 360, y: 1120 },
    cup: { x: 360, y: 360 },
    walls: [r(40, 640, 230, 40), r(450, 640, 230, 40)],
  },
  { par: 3, tee: { x: 150, y: 1120 }, cup: { x: 560, y: 340 }, walls: [r(260, 560, 420, 660)] },
  {
    par: 3,
    tee: { x: 360, y: 1130 },
    cup: { x: 360, y: 360 },
    walls: [],
    sand: [r(220, 440, 280, 110)],
    water: [r(40, 760, 250, 90), r(430, 760, 250, 90)],
  },
  {
    par: 3,
    tee: { x: 360, y: 1120 },
    cup: { x: 360, y: 330 },
    walls: [r(40, 640, 250, 50), r(430, 640, 250, 50)],
    movers: [{ ...r(315, 560, 90, 46), axis: 'x', range: 150, period: 2.4 }],
  },
  {
    par: 3,
    tee: { x: 220, y: 1120 },
    cup: { x: 220, y: 330 },
    walls: [r(520, 200, 40, 380)],
    slopes: [{ ...r(40, 480, 640, 440), ax: 300, ay: 0 }],
  },
  {
    par: 4,
    tee: { x: 150, y: 1130 },
    cup: { x: 140, y: 280 },
    walls: [r(40, 900, 470, 45), r(210, 640, 470, 45), r(40, 390, 470, 45)],
  },
  {
    par: 3,
    tee: { x: 360, y: 1130 },
    cup: { x: 360, y: 470 },
    walls: [],
    water: [
      r(140, 260, 440, 60),
      r(140, 320, 60, 300),
      r(520, 320, 60, 300),
      r(140, 620, 180, 60),
      r(400, 620, 180, 60),
    ],
  },
  {
    par: 4,
    tee: { x: 360, y: 1140 },
    cup: { x: 360, y: 290 },
    walls: [
      r(150, 820, 90, 90),
      r(480, 780, 90, 90),
      r(305, 620, 110, 90),
      r(110, 460, 90, 90),
      r(520, 440, 90, 90),
    ],
    sand: [r(250, 340, 220, 60)],
  },
  {
    par: 4,
    tee: { x: 360, y: 1140 },
    cup: { x: 580, y: 300 },
    walls: [r(40, 840, 420, 40)],
    movers: [{ ...r(330, 620, 110, 40), axis: 'x', range: 200, period: 1.9 }],
    slopes: [{ ...r(40, 220, 420, 320), ax: -260, ay: 0 }],
    water: [r(540, 520, 140, 60)],
  },
];

const inRect = (x: number, y: number, q: Rect) =>
  x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h;

/** Where a moving block is at `time` seconds. */
export function moverAt(m: Mover, time: number): Rect {
  const off = m.range * Math.sin((time / m.period) * Math.PI * 2);
  return m.axis === 'x' ? { ...m, x: m.x + off } : { ...m, y: m.y + off };
}

/** Points and the name of a score on a hole. */
export function holeScore(strokes: number, par: number): { points: number; name: string } {
  const d = strokes - par;
  const name =
    strokes === 1
      ? 'Hole in one!'
      : d <= -3
        ? 'Albatroz!'
        : d === -2
          ? 'Eagle!'
          : d === -1
            ? 'Birdie!'
            : d === 0
              ? 'Par'
              : d === 1
                ? 'Bogey'
                : d === 2
                  ? 'Duplo bogey'
                  : `+${d}`;
  const points = Math.max(0, (par + 3 - strokes) * 100) + (strokes === 1 ? 300 : 0);
  return { points, name };
}

export type GolfEvent = 'wall' | 'sand' | 'water' | 'sink' | 'lip' | 'stop';

export class GolfSim {
  hole = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  strokes = 0;
  /** Seconds since the hole began (drives the moving blocks). */
  time = 0;
  /** Strokes taken on each finished hole. */
  cards: number[] = [];
  score = 0;
  sunk = false;
  private lastRest = { x: 0, y: 0 };
  private wasInSand = false;

  constructor(readonly holes: readonly Hole[] = HOLES) {
    this.place();
  }

  get current(): Hole {
    return this.holes[this.hole]!;
  }

  get moving(): boolean {
    return this.vx !== 0 || this.vy !== 0;
  }

  get done(): boolean {
    return this.cards.length >= this.holes.length;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  private place(): void {
    const { tee } = this.current;
    this.x = tee.x;
    this.y = tee.y;
    this.lastRest = { ...tee };
    this.vx = this.vy = 0;
    this.strokes = 0;
    this.sunk = false;
    this.time = 0;
  }

  /** A putt: the pull-back vector (from the ball towards the finger) sends it the other way. */
  putt(pullX: number, pullY: number): boolean {
    if (this.moving || this.sunk || this.done || this.strokes >= MAX_STROKES) return false;
    const len = Math.hypot(pullX, pullY);
    if (len < 12) return false;
    const power = Math.min(1, len / MAX_PULL) * MAX_SPEED;
    this.vx = (-pullX / len) * power;
    this.vy = (-pullY / len) * power;
    this.strokes++;
    this.lastRest = { x: this.x, y: this.y };
    return true;
  }

  /** Every solid block right now: the walls plus where the movers are. */
  solids(): Rect[] {
    const h = this.current;
    return [...h.walls, ...(h.movers ?? []).map((m) => moverAt(m, this.time))];
  }

  step(dt: number): GolfEvent[] {
    const events: GolfEvent[] = [];
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(STEP, left);
      left -= h;
      this.time += h;
      if (!this.moving || this.sunk) continue;
      this.sub(h, events);
    }
    return events;
  }

  private sub(h: number, events: GolfEvent[]): void {
    const hole = this.current;
    const inSand = (hole.sand ?? []).some((q) => inRect(this.x, this.y, q));
    if (inSand && !this.wasInSand) events.push('sand');
    this.wasInSand = inSand;
    for (const s of hole.slopes ?? []) {
      if (!inRect(this.x, this.y, s)) continue;
      this.vx += s.ax * h;
      this.vy += s.ay * h;
    }
    // The cup pulls a slow ball in a little, so a ball that just reaches it drops.
    const cx = hole.cup.x - this.x;
    const cy = hole.cup.y - this.y;
    const cd = Math.hypot(cx, cy);
    if (cd < CUP_R + 10 && this.speed < 320 && cd > 0) {
      this.vx += (cx / cd) * 900 * h;
      this.vy += (cy / cd) * 900 * h;
    }
    const k = Math.exp(-(inSand ? SAND : ROLL) * h);
    this.vx *= k;
    this.vy *= k;
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.collide(events);
    if (cd < CUP_R) {
      if (this.speed < SINK_SPEED) {
        this.x = hole.cup.x;
        this.y = hole.cup.y;
        this.vx = this.vy = 0;
        this.sunk = true;
        events.push('sink');
        return;
      }
      if (!events.includes('lip')) {
        // Too fast: it rattles over the cup and loses some pace.
        this.vx *= 0.8;
        this.vy *= 0.8;
        events.push('lip');
      }
    }
    if ((hole.water ?? []).some((q) => inRect(this.x, this.y, q))) {
      events.push('water');
      this.strokes++;
      this.x = this.lastRest.x;
      this.y = this.lastRest.y;
      this.vx = this.vy = 0;
      return;
    }
    if (this.speed < STOP && !(this.slopeHere() && this.speed > 0.5)) {
      this.vx = this.vy = 0;
      events.push('stop');
      if (this.strokes >= MAX_STROKES) events.push('sink');
    }
  }

  private slopeHere(): boolean {
    return (this.current.slopes ?? []).some((s) => inRect(this.x, this.y, s));
  }

  /** Bounces off the border and every block. */
  private collide(events: GolfEvent[]): void {
    let hit = false;
    const a = AREA;
    if (this.x < a.x + BALL_R) {
      this.x = a.x + BALL_R;
      this.vx = Math.abs(this.vx) * BOUNCE;
      hit = true;
    } else if (this.x > a.x + a.w - BALL_R) {
      this.x = a.x + a.w - BALL_R;
      this.vx = -Math.abs(this.vx) * BOUNCE;
      hit = true;
    }
    if (this.y < a.y + BALL_R) {
      this.y = a.y + BALL_R;
      this.vy = Math.abs(this.vy) * BOUNCE;
      hit = true;
    } else if (this.y > a.y + a.h - BALL_R) {
      this.y = a.y + a.h - BALL_R;
      this.vy = -Math.abs(this.vy) * BOUNCE;
      hit = true;
    }
    for (const q of this.solids()) {
      const nx = Math.max(q.x, Math.min(this.x, q.x + q.w));
      const ny = Math.max(q.y, Math.min(this.y, q.y + q.h));
      let dx = this.x - nx;
      let dy = this.y - ny;
      const d = Math.hypot(dx, dy);
      if (d >= BALL_R) continue;
      if (d === 0) {
        // Centre inside the block (a mover ran into it): push out the shortest way.
        const outs = [this.x - q.x, q.x + q.w - this.x, this.y - q.y, q.y + q.h - this.y];
        const i = outs.indexOf(Math.min(...outs));
        dx = i === 0 ? -1 : i === 1 ? 1 : 0;
        dy = i === 2 ? -1 : i === 3 ? 1 : 0;
        this.x += dx * (outs[i]! + BALL_R);
        this.y += dy * (outs[i]! + BALL_R);
      } else {
        dx /= d;
        dy /= d;
        this.x += dx * (BALL_R - d);
        this.y += dy * (BALL_R - d);
      }
      const vn = this.vx * dx + this.vy * dy;
      if (vn < 0) {
        this.vx -= (1 + BOUNCE) * vn * dx;
        this.vy -= (1 + BOUNCE) * vn * dy;
        hit = true;
      }
    }
    if (hit) events.push('wall');
  }

  /** Card the hole (after a sink or the stroke limit) and move to the next one. */
  nextHole(): { points: number; name: string } {
    const strokes = Math.min(this.strokes, MAX_STROKES);
    const result = holeScore(strokes, this.current.par);
    this.cards.push(strokes);
    this.score += result.points;
    if (!this.done) {
      this.hole++;
      this.place();
    }
    return result;
  }

  get totalStrokes(): number {
    return this.cards.reduce((a, b) => a + b, 0);
  }

  get totalPar(): number {
    return this.holes.slice(0, this.cards.length).reduce((a, h) => a + h.par, 0);
  }
}
