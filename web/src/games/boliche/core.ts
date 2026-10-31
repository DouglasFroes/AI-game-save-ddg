/**
 * "Boliche" — pure rules: ten frames of real bowling. The lane is seen from above (pixels):
 * place the ball, swipe up to roll it (the direction aims, the speed is the speed, a curved swipe
 * spins it so it hooks late). Ball and pins are circles that collide; a pin that is pushed off its
 * spot falls. Scoring is the official one (strikes and spares count the next rolls).
 */
export const LANE_L = 210;
export const LANE_R = 510;
export const GUTTER = 30;
export const FOUL_Y = 1100;
export const PIT_Y = 120;
export const BALL_R = 30;
export const PIN_R = 16;
const BALL_M = 7;
const PIN_M = 1.5;
const PIN_E = 0.7;
/** A falling pin lies down and sweeps a wider area than a standing one. */
const FALLEN_R = 26;
const pinR = (p: Pin) => (p.down ? FALLEN_R : PIN_R);
const STEP = 1 / 240;
/** Lateral push (px/s²) of full spin at the back of the lane. */
const HOOK = 520;
/** How far a pin may wobble before it falls. */
const FALL_D = 7;

export interface Pin {
  readonly id: number;
  readonly hx: number;
  readonly hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  down: boolean;
  /** Removed from the deck (it fell into the pit or the gutter). */
  gone: boolean;
}

/** Spots of the ten pins, head pin first (1, 2-3, 4-6, 7-10). */
export function pinSpots(): Array<{ x: number; y: number }> {
  const spots: Array<{ x: number; y: number }> = [];
  const dx = 87;
  const dy = 75;
  for (let row = 0; row < 4; row++)
    for (let i = 0; i <= row; i++) spots.push({ x: 360 + (i - row / 2) * dx, y: 420 - row * dy });
  return spots;
}

/** A swipe from its first to last point (and how far its middle bows out) as a roll. */
export interface Roll {
  readonly x: number;
  /** Radians off straight up (positive = to the right). */
  readonly angle: number;
  /** px/s. */
  readonly speed: number;
  /** -1 (hooks left) to 1 (hooks right). */
  readonly spin: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function rollFromSwipe(
  x: number,
  path: ReadonlyArray<{ x: number; y: number; t: number }>,
): Roll | null {
  if (path.length < 2) return null;
  const a = path[0]!;
  const b = path[path.length - 1]!;
  const dx = b.x - a.x;
  const dy = a.y - b.y;
  const len = Math.hypot(dx, dy);
  if (dy < 50) return null;
  const ms = Math.max(30, b.t - a.t);
  const mid = path[Math.floor(path.length / 2)]!;
  const bow = ((mid.x - a.x) * dy - (a.y - mid.y) * dx) / len;
  return {
    x: clamp(x, LANE_L + BALL_R, LANE_R - BALL_R),
    angle: clamp(Math.atan2(dx, dy) * 0.35, -0.12, 0.12),
    speed: clamp((len / ms) * 1000 * 0.55, 520, 1250),
    spin: clamp(-bow / (len * 0.18), -1, 1),
  };
}

/** Frame-by-frame score of a list of rolls (pins knocked each roll). Null = not known yet. */
export function frameScores(rolls: readonly number[]): Array<number | null> {
  const out: Array<number | null> = [];
  let i = 0;
  let total = 0;
  for (let f = 0; f < 10; f++) {
    if (i >= rolls.length) break;
    const a = rolls[i]!;
    const b = rolls[i + 1];
    const c = rolls[i + 2];
    if (a === 10) {
      if (b === undefined || c === undefined) {
        out.push(null);
        break;
      }
      total += 10 + b + c;
      i += 1;
    } else {
      if (b === undefined) {
        out.push(null);
        break;
      }
      if (a + b === 10) {
        if (c === undefined) {
          out.push(null);
          break;
        }
        total += 10 + c;
      } else total += a + b;
      i += 2;
    }
    out.push(total);
  }
  return out;
}

/** Total so far, counting every pin already knocked and any bonus not rolled yet as zero. */
export function runningTotal(rolls: readonly number[]): number {
  let total = 0;
  let i = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    const a = rolls[i]!;
    const b = rolls[i + 1] ?? 0;
    const c = rolls[i + 2] ?? 0;
    if (f === 9) return total + rolls.slice(i).reduce((sum, v) => sum + v, 0);
    if (a === 10) {
      total += 10 + b + c;
      i += 1;
    } else {
      total += a + b + (a + b === 10 ? c : 0);
      i += 2;
    }
  }
  return total;
}

/** Where each roll goes on the score sheet: frame index and ball within it. */
export function frameOf(rolls: readonly number[]): { frame: number; ball: number } {
  let f = 0;
  let i = 0;
  while (f < 9 && i < rolls.length) {
    if (rolls[i] === 10) i += 1;
    else if (i + 1 < rolls.length) i += 2;
    else return { frame: f, ball: 1 };
    f++;
  }
  return { frame: f, ball: rolls.length - i };
}

/** Whether the next ball is thrown at a full rack of ten. */
export function freshRack(rolls: readonly number[]): boolean {
  const { frame, ball } = frameOf(rolls);
  if (ball === 0) return true;
  if (frame < 9) return false;
  const t = rolls.slice(rolls.length - ball);
  if (t.length === 1) return t[0] === 10;
  if (t.length === 2) return (t[0] === 10 && t[1] === 10) || (t[0]! < 10 && t[0]! + t[1]! === 10);
  return false;
}

/** Whether the game is over (ten frames, with the 10th's bonus balls). */
export function gameOver(rolls: readonly number[]): boolean {
  const { frame, ball } = frameOf(rolls);
  if (frame < 9) return false;
  const tenth = rolls.slice(rolls.length - ball);
  if (tenth.length < 2) return false;
  if (tenth.length === 2) return tenth[0]! + tenth[1]! < 10;
  return tenth.length >= 3;
}

export type BowlEvent =
  | { type: 'pin'; id: number }
  | { type: 'gutter' }
  | { type: 'done'; knocked: number; strike: boolean; spare: boolean };

export class BowlingSim {
  pins: Pin[] = [];
  ball = { x: 360, y: FOUL_Y, vx: 0, vy: 0, spin: 0, rolling: false, gutter: false };
  rolls: number[] = [];
  private standingBefore = 10;
  private settle = 0;

  constructor() {
    this.resetPins();
  }

  resetPins(): void {
    this.pins = pinSpots().map((p, i) => ({
      id: i + 1,
      hx: p.x,
      hy: p.y,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      down: false,
      gone: false,
    }));
  }

  get standing(): number {
    return this.pins.filter((p) => !p.down).length;
  }

  get over(): boolean {
    return gameOver(this.rolls);
  }

  get score(): number {
    const f = frameScores(this.rolls).filter((x): x is number => x !== null);
    return f.length ? f[f.length - 1]! : 0;
  }

  /** Total so far counting the open bonuses as zero (for the live score). */
  get runningScore(): number {
    return runningTotal(this.rolls);
  }

  /** Puts the ball at `x` on the foul line, ready to roll. */
  place(x: number): void {
    if (this.ball.rolling) return;
    this.ball = { ...this.ball, x: clamp(x, LANE_L + BALL_R, LANE_R - BALL_R), y: FOUL_Y };
  }

  roll(r: Roll): boolean {
    if (this.ball.rolling || this.over) return false;
    this.standingBefore = this.standing;
    this.ball = {
      x: r.x,
      y: FOUL_Y,
      vx: Math.sin(r.angle) * r.speed,
      vy: -Math.cos(r.angle) * r.speed,
      spin: r.spin,
      rolling: true,
      gutter: false,
    };
    this.settle = 0;
    return true;
  }

  step(dt: number): BowlEvent[] {
    const events: BowlEvent[] = [];
    if (!this.ball.rolling) return events;
    let left = dt;
    while (left > 1e-9 && this.ball.rolling) {
      const h = Math.min(STEP, left);
      left -= h;
      this.sub(h, events);
    }
    return events;
  }

  private sub(h: number, events: BowlEvent[]): void {
    const b = this.ball;
    if (b.y > PIT_Y - 200) {
      // The hook bites in the back half of the lane.
      const back = clamp((FOUL_Y - b.y) / (FOUL_Y - 420), 0, 1);
      if (!b.gutter) b.vx += b.spin * HOOK * back * back * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
    if (!b.gutter && (b.x < LANE_L || b.x > LANE_R)) {
      b.gutter = true;
      b.x = b.x < LANE_L ? LANE_L - GUTTER / 2 : LANE_R + GUTTER / 2;
      b.vx = 0;
      events.push({ type: 'gutter' });
    }
    // Pins.
    for (const p of this.pins) {
      if (p.gone) continue;
      if (!b.gutter && b.y > PIT_Y - 60) this.collide(b, BALL_R, BALL_M, p, events);
      p.x += p.vx * h;
      p.y += p.vy * h;
      const k = Math.exp(-1.3 * h);
      p.vx *= k;
      p.vy *= k;
    }
    for (let i = 0; i < this.pins.length; i++)
      for (let j = i + 1; j < this.pins.length; j++) {
        const a = this.pins[i]!;
        const c = this.pins[j]!;
        if (!a.gone && !c.gone) this.pinPin(a, c, events);
      }
    for (const p of this.pins) {
      if (p.gone) continue;
      if (!p.down && Math.hypot(p.x - p.hx, p.y - p.hy) > FALL_D) {
        p.down = true;
        events.push({ type: 'pin', id: p.id });
      }
      if (p.y < PIT_Y - 80 || p.x < LANE_L - GUTTER - 10 || p.x > LANE_R + GUTTER + 10)
        p.gone = true;
    }
    // The roll ends once the ball reached the pit and the deck has calmed down.
    if (b.y < PIT_Y - 120) {
      this.settle += h;
      const calm = this.pins.every((p) => p.gone || Math.hypot(p.vx, p.vy) < 25);
      if ((calm && this.settle > 0.4) || this.settle > 3) this.finishRoll(events);
    }
  }

  private collide(
    b: { x: number; y: number; vx: number; vy: number },
    br: number,
    bm: number,
    p: Pin,
    events: BowlEvent[],
  ): void {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy);
    const min = br + pinR(p);
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const overlap = min - d;
    p.x += nx * overlap * (bm / (bm + PIN_M));
    p.y += ny * overlap * (bm / (bm + PIN_M));
    const rel = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
    if (rel <= 0) return;
    const j = ((1 + PIN_E) * rel) / (1 / bm + 1 / PIN_M);
    b.vx -= (j / bm) * nx;
    b.vy -= (j / bm) * ny;
    p.vx += (j / PIN_M) * nx;
    p.vy += (j / PIN_M) * ny;
    void events;
  }

  private pinPin(a: Pin, c: Pin, events: BowlEvent[]): void {
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = pinR(a) + pinR(c);
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const push = (min - d) / 2;
    a.x -= nx * push;
    a.y -= ny * push;
    c.x += nx * push;
    c.y += ny * push;
    const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
    if (rel <= 0) return;
    const j = ((1 + PIN_E) * rel) / 2;
    a.vx -= j * nx;
    a.vy -= j * ny;
    c.vx += j * nx;
    c.vy += j * ny;
    void events;
  }

  private finishRoll(events: BowlEvent[]): void {
    this.ball.rolling = false;
    const knocked = this.standingBefore - this.standing;
    this.rolls.push(knocked);
    const strike = knocked === 10 && this.standingBefore === 10;
    const spare = !strike && this.standing === 0;
    events.push({ type: 'done', knocked, strike, spare });
    if (freshRack(this.rolls)) this.resetPins();
    else this.clearDeadwood();
    this.ball = { ...this.ball, x: 360, y: FOUL_Y, vx: 0, vy: 0, rolling: false, gutter: false };
  }

  /** Fallen pins are swept away; standing ones stay where they are. */
  private clearDeadwood(): void {
    for (const p of this.pins) if (p.down) p.gone = true;
  }
}
