/**
 * "Skate na Rampa" — pure rules of a halfpipe (screen pixels). The skater rides along the ramp
 * under gravity; a tap while going DOWN a curve pumps (more speed), a tap at the wrong moment
 * brakes. Past a lip he flies straight up and comes back down on the same lip. In the air,
 * swipes do tricks (left/right: 180° spins, up: kickflip, down: grab) that must be finished before
 * landing, or he bails. 75 seconds, three falls and you're out.
 */
export const LIP_X = 60;
export const RADIUS = 210;
export const FLAT = 180;
export const BOTTOM_Y = 1010;
export const LIP_Y = BOTTOM_Y - RADIUS;
export const LENGTH = Math.PI * RADIUS + FLAT;
export const GRAVITY = 1500;
export const MAX_SPEED = 1120;
export const RUN_TIME = 75;
export const LIVES = 3;
const FRICTION = 22;
/** Height (px) a good pump adds: the same at any speed, like pumping a swing. */
const PUMP_H = 32;
const RECOVER = 1.3;

export type TrickKind = 'spinL' | 'spinR' | 'kickflip' | 'grab';

export const TRICKS: Record<TrickKind, { name: string; time: number; points: number }> = {
  spinL: { name: '180', time: 0.3, points: 100 },
  spinR: { name: '180', time: 0.3, points: 100 },
  kickflip: { name: 'Kickflip', time: 0.34, points: 150 },
  grab: { name: 'Indy grab', time: 0.4, points: 120 },
};

/** Point on the ramp at arc length `s` (0 = left lip, LENGTH = right lip) and its slope angle. */
export function rampAt(s: number): { x: number; y: number; angle: number } {
  const q = (Math.PI * RADIUS) / 2;
  if (s <= q) {
    const t = Math.max(0, s) / RADIUS;
    return {
      x: LIP_X + RADIUS - RADIUS * Math.cos(t),
      y: LIP_Y + RADIUS * Math.sin(t),
      angle: t - Math.PI / 2,
    };
  }
  if (s <= q + FLAT) return { x: LIP_X + RADIUS + (s - q), y: BOTTOM_Y, angle: 0 };
  const p = Math.min(Math.PI / 2, (s - q - FLAT) / RADIUS);
  return {
    x: LIP_X + RADIUS + FLAT + RADIUS * Math.sin(p),
    y: LIP_Y + RADIUS * Math.cos(p),
    angle: p,
  };
}

/** How much the height changes per pixel along the ramp (−1 … 1). */
export function slopeAt(s: number): number {
  const q = (Math.PI * RADIUS) / 2;
  if (s <= q) return -Math.cos(Math.max(0, s) / RADIUS);
  if (s <= q + FLAT) return 0;
  return Math.sin(Math.min(Math.PI / 2, (s - q - FLAT) / RADIUS));
}

export type SkateEvent =
  | { type: 'pump'; good: boolean }
  | { type: 'air'; side: 'L' | 'R' }
  | { type: 'trick'; kind: TrickKind }
  | { type: 'land'; points: number; tricks: string[]; height: number }
  | { type: 'bail' }
  | { type: 'over' };

export class SkateSim {
  s = LENGTH / 2;
  v = 240;
  /** In the air above a lip: height above it and vertical speed. */
  air: { side: 'L' | 'R'; h: number; vy: number; peak: number } | null = null;
  time = 0;
  lives = LIVES;
  score = 0;
  best = 0;
  /** Tricks done in the current air. */
  combo: TrickKind[] = [];
  /** The trick being done and how far along it is (seconds). */
  doing: { kind: TrickKind; t: number } | null = null;
  queue: TrickKind[] = [];
  /** Half-turns done in this air (odd = landing backwards). */
  halfTurns = 0;
  fakie = false;
  /** Seconds left of getting up after a fall. */
  down = 0;
  over = false;
  private pumped = false;

  get clock(): number {
    return Math.max(0, RUN_TIME - this.time);
  }

  /** Is he going down a curve right now (the moment to pump)? */
  get descending(): boolean {
    if (this.air) return false;
    const slope = slopeAt(this.s);
    return slope * this.v < -0.05 * Math.abs(this.v);
  }

  /** The right moment to pump: low on a curve, going down, not pumped yet in this descent. */
  get pumpWindow(): boolean {
    return this.descending && Math.abs(slopeAt(this.s)) < 0.75 && !this.pumped && this.down === 0;
  }

  /** A tap on the ramp. */
  pump(): SkateEvent | null {
    if (this.air || this.down > 0 || this.over) return null;
    // Good in the lower half of a curve on the way down, once per descent.
    const good = this.pumpWindow;
    if (good) {
      this.pumped = true;
      const v = Math.sqrt(this.v * this.v + 2 * GRAVITY * PUMP_H);
      this.v = Math.sign(this.v || 1) * Math.min(MAX_SPEED, v);
    } else this.v *= 0.93;
    return { type: 'pump', good };
  }

  /** A swipe in the air: queued after the trick in progress. */
  trick(kind: TrickKind): boolean {
    if (!this.air || this.over || this.down > 0) return false;
    if (this.queue.length >= 3) return false;
    this.queue.push(kind);
    return true;
  }

  step(dt: number): SkateEvent[] {
    const events: SkateEvent[] = [];
    if (this.over) return events;
    this.time += dt;
    if (this.down > 0) {
      this.down = Math.max(0, this.down - dt);
      this.v *= Math.exp(-3 * dt);
      // Back on the board: a push to get going again.
      if (this.down === 0) this.v = 260;
    }
    if (this.air) this.stepAir(dt, events);
    else this.stepRamp(dt, events);
    if (this.time >= RUN_TIME && !this.air) {
      this.over = true;
      events.push({ type: 'over' });
    }
    return events;
  }

  private stepRamp(dt: number, events: SkateEvent[]): void {
    const slope = slopeAt(this.s);
    this.v -= GRAVITY * slope * dt;
    this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), FRICTION * dt);
    // One pump per descent: the chance comes back once he stops going down.
    if (!this.descending) this.pumped = false;
    this.s += this.v * dt;
    if (this.s <= 0 || this.s >= LENGTH) {
      const side = this.s <= 0 ? 'L' : 'R';
      this.s = side === 'L' ? 0 : LENGTH;
      this.air = { side, h: 0, vy: Math.abs(this.v), peak: 0 };
      this.combo = [];
      this.queue = [];
      this.doing = null;
      this.halfTurns = 0;
      events.push({ type: 'air', side });
    }
  }

  private stepAir(dt: number, events: SkateEvent[]): void {
    const a = this.air!;
    a.vy -= GRAVITY * dt;
    a.h += a.vy * dt;
    a.peak = Math.max(a.peak, a.h);
    if (!this.doing && this.queue.length) {
      this.doing = { kind: this.queue.shift()!, t: 0 };
      events.push({ type: 'trick', kind: this.doing.kind });
    }
    if (this.doing) {
      this.doing.t += dt;
      if (this.doing.t >= TRICKS[this.doing.kind].time) {
        this.combo.push(this.doing.kind);
        if (this.doing.kind === 'spinL' || this.doing.kind === 'spinR') this.halfTurns++;
        this.doing = null;
      }
    }
    if (a.h > 0 || a.vy > 0) return;
    // Back on the lip.
    const speed = Math.max(0, -a.vy);
    this.air = null;
    if (this.doing || this.queue.length) {
      this.bail(events);
      return;
    }
    if (this.halfTurns % 2 === 1) this.fakie = !this.fakie;
    const tricks = this.combo.map((k) => TRICKS[k].name);
    const base = this.combo.reduce((n, k) => n + TRICKS[k].points, 0);
    const kinds = new Set(this.combo.map((k) => (k === 'spinL' || k === 'spinR' ? 'spin' : k)))
      .size;
    // Variety and height multiply; a plain air still scores a little for the height.
    const points = Math.round((base * Math.max(1, kinds) + a.peak * 0.4) * (1 + a.peak / 600));
    this.score += points;
    this.best = Math.max(this.best, points);
    this.v = (a.side === 'L' ? 1 : -1) * speed * 0.97;
    this.s = a.side === 'L' ? 0.01 : LENGTH - 0.01;
    this.pumped = false;
    events.push({
      type: 'land',
      points,
      tricks: this.combo.length ? tricks : ['Aéreo'],
      height: Math.round(a.peak),
    });
    this.combo = [];
  }

  private bail(events: SkateEvent[]): void {
    this.lives--;
    this.combo = [];
    this.queue = [];
    this.doing = null;
    this.halfTurns = 0;
    this.v = 0;
    this.s = LENGTH / 2;
    this.down = RECOVER;
    events.push({ type: 'bail' });
    if (this.lives <= 0) {
      this.over = true;
      events.push({ type: 'over' });
    }
  }
}
