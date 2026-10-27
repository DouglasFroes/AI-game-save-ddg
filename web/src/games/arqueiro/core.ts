/**
 * "Arqueiro Infinito" — pure rules, side view in screen pixels. Pull back from the bow and let go:
 * the arrow flies under gravity and wind towards a target board. Every hit brings a new target —
 * farther, smaller, then bobbing and with stronger wind. Each miss costs one of three lives; a
 * run of bullseyes earns a life back. It never ends until you run out of lives.
 */
import type { Rnd } from '@/platform/rnd';

export const BOW = { x: 110, y: 880 } as const;
export const GRAVITY = 900;
export const MAX_PULL = 260;
export const MAX_SPEED = 1500;
export const LIVES = 3;
export const GROUND_Y = 1120;

export interface Target {
  /** The board's plane (the arrow is judged when it reaches this x). */
  readonly x: number;
  /** Centre height when still. */
  readonly y: number;
  /** Half-height of the board. */
  readonly r: number;
  /** Bobbing amplitude (px) and speed (rad/s). */
  readonly bob: number;
  readonly bobSpeed: number;
  /** Horizontal push on the arrow (px/s²): + blows to the right (towards the target). */
  readonly wind: number;
}

/** Rings from the centre: bullseye, then three more, as a fraction of the half-height. */
export const RINGS = [
  { upTo: 0.2, points: 50, name: 'MOSCA!' },
  { upTo: 0.45, points: 30, name: 'Ótimo' },
  { upTo: 0.72, points: 20, name: 'Bom' },
  { upTo: 1, points: 10, name: 'Na borda' },
] as const;

/** The n-th target (0-based): every hit makes the next one a little harder. */
export function targetFor(n: number, rnd: Rnd): Target {
  const hard = Math.min(1, n / 25);
  return {
    x: 430 + rnd() * (150 + hard * 100),
    y: 420 + rnd() * 520,
    r: 92 - hard * 46,
    bob: n < 6 ? 0 : Math.min(160, (n - 5) * 9) * (0.5 + rnd() * 0.5),
    bobSpeed: 0.9 + rnd() * (0.6 + hard),
    wind: n < 3 ? 0 : (rnd() * 2 - 1) * (60 + hard * 240),
  };
}

/** Where the target's centre is after `t` seconds. */
export const targetY = (tg: Target, t: number): number => tg.y + Math.sin(t * tg.bobSpeed) * tg.bob;

/** Launch velocity for a pull vector (from the bow to the finger): the arrow goes the other way. */
export function launch(pullX: number, pullY: number): { vx: number; vy: number } | null {
  const len = Math.hypot(pullX, pullY);
  if (len < 25 || pullX > -10) return null;
  const k = (Math.min(len, MAX_PULL) / MAX_PULL) * MAX_SPEED;
  return { vx: (-pullX / len) * k, vy: (-pullY / len) * k };
}

export type ArrowEvent =
  | { type: 'hit'; ring: number; points: number; name: string; dy: number }
  | { type: 'miss' }
  | { type: 'life' }
  | { type: 'over' };

export class ArcherySim {
  shots = 0;
  hits = 0;
  bullseyes = 0;
  /** Hits in a row (the multiplier) and bullseyes in a row (a life back at 3). */
  streak = 0;
  eyeStreak = 0;
  lives = LIVES;
  score = 0;
  over = false;
  /** Seconds since the current target appeared. */
  time = 0;
  target: Target;
  arrow: { x: number; y: number; vx: number; vy: number } | null = null;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.target = targetFor(0, rnd);
  }

  get multiplier(): number {
    return 1 + Math.floor(this.streak / 3) * 0.5;
  }

  shoot(pullX: number, pullY: number): boolean {
    if (this.arrow || this.over) return false;
    const v = launch(pullX, pullY);
    if (!v) return false;
    this.arrow = { x: BOW.x, y: BOW.y, ...v };
    this.shots++;
    return true;
  }

  step(dt: number): ArrowEvent[] {
    const events: ArrowEvent[] = [];
    if (this.over) return events;
    this.time += dt;
    const a = this.arrow;
    if (!a) return events;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n && this.arrow; i++) {
      const h = dt / n;
      const prevX = a.x;
      const prevY = a.y;
      a.vx += this.target.wind * h;
      a.vy += GRAVITY * h;
      a.x += a.vx * h;
      a.y += a.vy * h;
      // Crossing the board's plane: where exactly did it cross?
      if (prevX < this.target.x && a.x >= this.target.x) {
        const k = (this.target.x - prevX) / (a.x - prevX);
        const y = prevY + (a.y - prevY) * k;
        const dy = y - targetY(this.target, this.time);
        if (Math.abs(dy) <= this.target.r) {
          events.push(...this.hit(dy));
          this.arrow = null;
          return events;
        }
      }
      if (a.y > GROUND_Y || a.x > 760 || a.x < -60 || a.y < -1500) {
        this.arrow = null;
        events.push(...this.miss());
        return events;
      }
    }
    return events;
  }

  private hit(dy: number): ArrowEvent[] {
    const frac = Math.abs(dy) / this.target.r;
    const ring = RINGS.findIndex((r) => frac <= r.upTo);
    const r = RINGS[ring]!;
    this.hits++;
    this.streak++;
    const points = Math.round(r.points * this.multiplier);
    this.score += points;
    if (ring === 0) {
      this.bullseyes++;
      this.eyeStreak++;
    } else this.eyeStreak = 0;
    this.target = targetFor(this.hits, this.rnd);
    this.time = 0;
    const events: ArrowEvent[] = [{ type: 'hit', ring, points, name: r.name, dy }];
    // Three bullseyes in a row give a life back.
    if (this.eyeStreak >= 3) {
      this.eyeStreak = 0;
      if (this.lives < LIVES) {
        this.lives++;
        events.push({ type: 'life' });
      }
    }
    return events;
  }

  private miss(): ArrowEvent[] {
    this.streak = 0;
    this.eyeStreak = 0;
    this.lives--;
    const events: ArrowEvent[] = [{ type: 'miss' }];
    if (this.lives <= 0) {
      this.over = true;
      events.push({ type: 'over' });
    }
    return events;
  }
}
