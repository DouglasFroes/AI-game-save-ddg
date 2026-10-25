/**
 * "Arremesso" (basketball) — pure rules, side view in screen pixels. Pull back from the ball and
 * let go: it flies under gravity, bounces off the rim, the backboard and the floor, and scores
 * when it drops through the hoop. 60 seconds on the clock, each basket gives a little time back;
 * three swishes in a row set you on fire (double points) until you miss.
 */
import type { Rnd } from '@/platform/rnd';

export const BALL_R = 27;
export const GRAVITY = 1850;
export const FLOOR_Y = 1150;
export const FIELD_W = 720;
export const RIM_HALF = 44;
export const RIM_KNOT = 6;
export const START_TIME = 60;
export const MAX_TIME = 60;
/** Pull-back (px) that gives full power, and that power (px/s). */
export const MAX_PULL = 300;
export const MAX_SPEED = 2350;
/** Spots left of this line are worth three. */
export const THREE_X = 250;
const RIM_E = 0.55;
const BOARD_E = 0.6;
const FLOOR_E = 0.55;

export interface Hoop {
  /** Centre of the rim. */
  readonly x: number;
  readonly y: number;
}

export type BasketEvent =
  | { type: 'rim' }
  | { type: 'board' }
  | { type: 'floor' }
  | { type: 'score'; points: number; swish: boolean; three: boolean; fire: boolean }
  | { type: 'miss' }
  | { type: 'over' };

/** Where the hoop is: still at first, then bobbing, then also sliding. */
export function hoopAt(baskets: number, time: number): Hoop {
  const base = { x: 560, y: 470 };
  const bob = baskets >= 8 ? Math.sin(time * 1.3) * Math.min(90, (baskets - 7) * 12) : 0;
  const slide = baskets >= 16 ? Math.sin(time * 0.9) * Math.min(70, (baskets - 15) * 10) : 0;
  return { x: base.x + slide, y: base.y + bob };
}

/** The ball's launch velocity for a pull-back vector (from the ball to the finger). */
export function launch(pullX: number, pullY: number): { vx: number; vy: number } | null {
  const len = Math.hypot(pullX, pullY);
  if (len < 20) return null;
  const k = (Math.min(len, MAX_PULL) / MAX_PULL) * MAX_SPEED;
  return { vx: (-pullX / len) * k, vy: (-pullY / len) * k };
}

export class BasketSim {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  flying = false;
  /** Seconds left on the clock. */
  clock = START_TIME;
  /** Seconds played (moves the hoop). */
  time = 0;
  score = 0;
  baskets = 0;
  swishes = 0;
  threes = 0;
  /** Swishes in a row; 3 or more = on fire. */
  streak = 0;
  fire = false;
  over = false;
  spot = { x: 200, y: 1000 };
  private touched = false;
  private scored = false;
  private airTime = 0;
  private prevY = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.nextSpot();
  }

  get hoop(): Hoop {
    return hoopAt(this.baskets, this.time);
  }

  get isThree(): boolean {
    return this.spot.x < THREE_X;
  }

  /** A new shooting spot: farther and more varied as you score. */
  nextSpot(): void {
    const far = Math.min(1, this.baskets / 12);
    this.spot = {
      x: 110 + this.rnd() * (300 - far * 120),
      y: 820 + this.rnd() * 260,
    };
    this.x = this.spot.x;
    this.y = this.spot.y;
    this.vx = this.vy = 0;
    this.flying = false;
  }

  shoot(pullX: number, pullY: number): boolean {
    if (this.flying || this.over) return false;
    const v = launch(pullX, pullY);
    if (!v) return false;
    this.vx = v.vx;
    this.vy = v.vy;
    this.flying = true;
    this.touched = false;
    this.scored = false;
    this.airTime = 0;
    return true;
  }

  step(dt: number): BasketEvent[] {
    const events: BasketEvent[] = [];
    if (this.over) return events;
    this.time += dt;
    this.clock = Math.max(0, this.clock - dt);
    if (this.flying) {
      const steps = Math.ceil(dt / (1 / 240));
      for (let i = 0; i < steps && this.flying; i++) this.sub(dt / steps, events);
    }
    if (this.clock <= 0 && !this.flying) {
      this.over = true;
      events.push({ type: 'over' });
    }
    return events;
  }

  private sub(h: number, events: BasketEvent[]): void {
    this.airTime += h;
    this.prevY = this.y;
    this.vy += GRAVITY * h;
    this.x += this.vx * h;
    this.y += this.vy * h;
    const hoop = this.hoop;
    // Rim knots: the front and back edge of the ring.
    for (const kx of [hoop.x - RIM_HALF, hoop.x + RIM_HALF])
      this.bounceOff(kx, hoop.y, RIM_KNOT, RIM_E, 'rim', events);
    // Backboard: a vertical bar behind the rim.
    const bx = hoop.x + RIM_HALF + 20;
    const top = hoop.y - 150;
    const bottom = hoop.y + 30;
    if (this.y > top && this.y < bottom && Math.abs(this.x - bx) < BALL_R) {
      this.x = this.x < bx ? bx - BALL_R : bx + BALL_R;
      this.vx = -this.vx * BOARD_E;
      this.touched = true;
      events.push({ type: 'board' });
    } else this.bounceOff(bx, top, 4, BOARD_E, 'board', events);
    // Through the hoop: crossing the rim line downwards between the knots.
    if (
      !this.scored &&
      this.vy > 0 &&
      this.prevY < hoop.y &&
      this.y >= hoop.y &&
      Math.abs(this.x - hoop.x) < RIM_HALF - RIM_KNOT
    ) {
      this.scored = true;
      this.basket(events);
    }
    // Floor and walls.
    if (this.y > FLOOR_Y - BALL_R) {
      this.y = FLOOR_Y - BALL_R;
      if (this.vy > 0) {
        this.vy = -this.vy * FLOOR_E;
        this.vx *= 0.8;
        if (Math.abs(this.vy) > 120) events.push({ type: 'floor' });
      }
    }
    if (this.x < BALL_R) {
      this.x = BALL_R;
      this.vx = Math.abs(this.vx) * 0.6;
    } else if (this.x > FIELD_W - BALL_R) {
      this.x = FIELD_W - BALL_R;
      this.vx = -Math.abs(this.vx) * 0.6;
    }
    // The shot is over when the ball settles, leaves the screen or after a while.
    const settled = this.y >= FLOOR_Y - BALL_R - 1 && Math.abs(this.vy) < 140;
    if (settled || this.airTime > 4.5 || this.y < -900) this.endShot(events);
  }

  private bounceOff(
    px: number,
    py: number,
    pr: number,
    e: number,
    kind: 'rim' | 'board',
    events: BasketEvent[],
  ): void {
    const dx = this.x - px;
    const dy = this.y - py;
    const d = Math.hypot(dx, dy);
    const min = BALL_R + pr;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    this.x = px + nx * min;
    this.y = py + ny * min;
    const vn = this.vx * nx + this.vy * ny;
    if (vn < 0) {
      this.vx -= (1 + e) * vn * nx;
      this.vy -= (1 + e) * vn * ny;
      this.touched = true;
      events.push({ type: kind });
    }
  }

  private basket(events: BasketEvent[]): void {
    const swish = !this.touched;
    const three = this.isThree;
    let points = (three ? 3 : 2) + (swish ? 1 : 0);
    if (this.fire) points *= 2;
    this.score += points;
    this.baskets++;
    if (three) this.threes++;
    if (swish) {
      this.swishes++;
      this.streak++;
      if (this.streak >= 3) this.fire = true;
    } else this.streak = Math.max(0, this.streak - 1);
    this.clock = Math.min(MAX_TIME, this.clock + (swish ? 3 : 2));
    events.push({ type: 'score', points, swish, three, fire: this.fire });
  }

  private endShot(events: BasketEvent[]): void {
    this.flying = false;
    if (!this.scored) {
      this.streak = 0;
      this.fire = false;
      events.push({ type: 'miss' });
    }
    if (this.clock > 0) this.nextSpot();
  }
}
