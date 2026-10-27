/**
 * "Tiro de Precisão" — pure rules of a long-range rifle match, measured in mils (angle units the
 * scope reticle is marked in; y grows downwards). Ten shots at targets that get farther away. The
 * bullet drops and drifts with the wind, so the shooter has to hold over; the rifle sways and
 * holding the breath steadies it for a few seconds — hold it too long and it shakes. From the
 * sixth shot the targets walk, and the bullet takes its time of flight to get there (lead them).
 */
import type { Rnd } from '@/platform/rnd';

export const SHOTS = 10;
export const BULLET_SPEED = 850;
/** Seconds of steady breath before the rifle starts to shake. */
export const STEADY = 3;
/** Walking targets turn around at this many mils from the centre. */
export const WALK_RANGE = 4;

/** Bullet drop (mils) at a distance in metres. */
export const dropAt = (d: number): number => 0.000008 * d * d;
/** Wind drift (mils) per m/s of crosswind at a distance in metres. */
export const driftPerWind = (d: number): number => (0.9 * d) / 1000;
/** Target radius in mils (a 1 m wide board). */
export const targetRadius = (d: number): number => 500 / d;

export interface Target {
  readonly n: number;
  readonly distance: number;
  /** Mean crosswind in m/s (positive blows to the right); gusts move it ±25%. */
  readonly wind: number;
  /** Walking speed in m/s (0 for a still board). */
  speed: number;
  /** Centre position in mils. */
  x: number;
}

export function targetFor(n: number, rnd: Rnd): Target {
  const distance = Math.round((200 + n * 55 + rnd() * 40) / 5) * 5;
  const wind = Math.round((rnd() * 2 - 1) * (1.5 + n * 0.6) * 10) / 10;
  const speed = n >= 5 ? (0.6 + rnd() * 0.8 + (n - 5) * 0.1) * (rnd() < 0.5 ? -1 : 1) : 0;
  return { n, distance, wind, speed, x: 0 };
}

export interface Impact {
  /** Where the bullet landed relative to the target centre, in mils. */
  readonly dx: number;
  readonly dy: number;
  /** 10 = centre ring … 1 = edge, 0 = off the board. */
  readonly ring: number;
  readonly x: boolean;
  readonly points: number;
}

export type SniperEvent =
  | { type: 'fired'; aimX: number; aimY: number }
  | { type: 'impact'; impact: Impact }
  | { type: 'next'; target: Target }
  | { type: 'over' };

export function scoreImpact(dx: number, dy: number, distance: number): Impact {
  const r = targetRadius(distance);
  const dist = Math.hypot(dx, dy);
  const ring = dist >= r ? 0 : 10 - Math.floor((dist / r) * 10);
  const x = dist < r * 0.05;
  const points = ring ? Math.round((ring * 10 + (x ? 5 : 0)) * (distance / 300)) : 0;
  return { dx, dy, ring, x, points };
}

export class SniperSim {
  target: Target;
  /** Where the reticle points (without sway), in mils. */
  aimX = 0;
  aimY = 0;
  time = 0;
  holding = false;
  /** Seconds the breath has been held (recovers slowly after letting go). */
  breath = 0;
  shot = 0;
  score = 0;
  xs = 0;
  tens = 0;
  impacts: Impact[] = [];
  over = false;
  /** Bullet in flight: seconds to impact and where it will land. */
  flight: { left: number; x: number; y: number } | null = null;
  /** Pause after an impact before the next target. */
  private between = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.target = targetFor(0, rnd);
    this.offsetAim();
  }

  /** Wind right now (the mean with slow gusts). */
  get wind(): number {
    const t = this.time;
    return this.target.wind * (1 + 0.25 * Math.sin(t * 0.7 + this.shot) * Math.sin(t * 0.23 + 1));
  }

  /** Sway amplitude in mils: calm while holding the breath, then shaky. */
  get swayAmp(): number {
    if (!this.holding) return 0.9 + Math.min(0.6, this.breath * 0.15);
    const h = this.breath;
    if (h < 0.5) return 0.9 - (0.75 * h) / 0.5;
    if (h < STEADY) return 0.15;
    return Math.min(2.5, 0.15 + (h - STEADY) * 1.1);
  }

  /** Current sway offset (mils). */
  get sway(): { x: number; y: number } {
    const t = this.time;
    const a = this.swayAmp;
    return {
      x: a * (Math.sin(t * 1.1) * 0.75 + Math.sin(t * 2.7 + 1) * 0.25),
      y: a * 0.7 * (Math.sin(t * 1.6 + 0.5) * 0.75 + Math.sin(t * 3.3) * 0.25),
    };
  }

  get ready(): boolean {
    return !this.over && !this.flight && this.between <= 0;
  }

  get timeOfFlight(): number {
    return this.target.distance / BULLET_SPEED;
  }

  aim(dx: number, dy: number): void {
    if (this.over) return;
    this.aimX = Math.max(-12, Math.min(12, this.aimX + dx));
    this.aimY = Math.max(-12, Math.min(12, this.aimY + dy));
  }

  hold(on: boolean): void {
    if (on && !this.ready) return;
    this.holding = on;
  }

  fire(): SniperEvent[] {
    if (!this.ready) return [];
    const s = this.sway;
    const x = this.aimX + s.x;
    const y = this.aimY + s.y;
    const d = this.target.distance;
    this.flight = { left: this.timeOfFlight, x: x + this.wind * driftPerWind(d), y: y + dropAt(d) };
    this.holding = false;
    return [{ type: 'fired', aimX: x, aimY: y }];
  }

  step(dt: number): SniperEvent[] {
    const events: SniperEvent[] = [];
    if (this.over) return events;
    this.time += dt;
    this.breath = this.holding ? this.breath + dt : Math.max(0, this.breath - dt * 1.5);
    const tg = this.target;
    if (tg.speed) {
      tg.x += ((tg.speed * 1000) / tg.distance) * dt;
      if (Math.abs(tg.x) > WALK_RANGE) {
        tg.x = Math.sign(tg.x) * WALK_RANGE;
        tg.speed = -tg.speed;
      }
    }
    if (this.flight) {
      this.flight.left -= dt;
      if (this.flight.left <= 0) {
        const impact = scoreImpact(this.flight.x - tg.x, this.flight.y, tg.distance);
        this.flight = null;
        this.impacts.push(impact);
        this.shot++;
        this.score += impact.points;
        if (impact.ring === 10) this.tens++;
        if (impact.x) this.xs++;
        this.between = 1.8;
        events.push({ type: 'impact', impact });
      }
    } else if (this.between > 0) {
      this.between -= dt;
      if (this.between <= 0) {
        if (this.shot >= SHOTS) {
          this.over = true;
          events.push({ type: 'over' });
        } else {
          this.target = targetFor(this.shot, this.rnd);
          this.offsetAim();
          this.breath = 0;
          events.push({ type: 'next', target: this.target });
        }
      }
    }
    return events;
  }

  /** Each target starts a little off the reticle, so it has to be found. */
  private offsetAim(): void {
    this.aimX = (this.rnd() * 2 - 1) * 3;
    this.aimY = -1 - this.rnd() * 2;
  }
}
