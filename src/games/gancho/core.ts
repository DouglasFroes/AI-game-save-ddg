import type { Rnd } from '@/platform/rnd';

export const FLOOR_Y = 1150;
export const CEIL_Y = 170;
export const BALL_R = 18;
export const GRAVITY = 1500;
/** How far a hook can reach. */
export const REACH = 560;
const START_X = 140;
const AHEAD = 1900;

export interface Anchor {
  x: number;
  y: number;
}
export interface Star {
  x: number;
  y: number;
  taken: boolean;
}

export type GanchoEvent =
  | { type: 'attach'; anchor: Anchor }
  | { type: 'release' }
  | { type: 'star'; star: Star; combo: number }
  | { type: 'dead'; reason: 'lava' | 'behind' };

/**
 * "Gancho Elástico": hold to throw a rope at the nearest anchor and swing, let go to fly.
 * The view scrolls faster and faster; lava below and the left edge behind you both end the run.
 */
export class GanchoSim {
  x = START_X;
  y = 560;
  vx = 280;
  vy = -120;
  anchor: Anchor | null = null;
  ropeLen = 0;
  /** Left edge of the view, in world x. */
  cam = 0;
  time = 0;
  stars = 0;
  bonus = 0;
  combo = 0;
  maxX = START_X;
  dead = false;
  anchors: Anchor[] = [];
  starList: Star[] = [];
  private nextX = 330;
  private lastStarAt = -9;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.fill();
  }

  get meters(): number {
    return Math.floor(Math.max(0, this.maxX - START_X) / 50);
  }

  get score(): number {
    return this.meters + this.bonus;
  }

  /** The view creeps right faster over time, so hanging around is never safe. */
  get scrollSpeed(): number {
    return Math.min(310, 80 + this.time * 3.4);
  }

  /** The anchor a throw would grab right now (above and not too far behind), or null. */
  nearestAnchor(): Anchor | null {
    let best: Anchor | null = null;
    let bestScore = Infinity;
    for (const a of this.anchors) {
      if (a.y > this.y - 40 || a.x < this.x - 80) continue;
      const d = Math.hypot(a.x - this.x, a.y - this.y);
      if (d > REACH) continue;
      // Anchors ahead are worth a little more than the ones behind.
      const s = d - (a.x - this.x) * 0.3;
      if (s < bestScore) {
        bestScore = s;
        best = a;
      }
    }
    return best;
  }

  attach(): GanchoEvent[] {
    if (this.dead || this.anchor) return [];
    const a = this.nearestAnchor();
    if (!a) return [];
    this.anchor = a;
    this.ropeLen = Math.hypot(a.x - this.x, a.y - this.y);
    return [{ type: 'attach', anchor: a }];
  }

  release(): GanchoEvent[] {
    if (!this.anchor) return [];
    this.anchor = null;
    // A small kick on release feels like a slingshot.
    this.vx *= 1.06;
    this.vy *= 1.06;
    return [{ type: 'release' }];
  }

  step(dt: number): GanchoEvent[] {
    if (this.dead) return [];
    const events: GanchoEvent[] = [];
    this.time += dt;
    this.cam = Math.max(this.cam + this.scrollSpeed * dt, this.x - 320);

    this.vy += GRAVITY * dt;
    const a = this.anchor;
    if (a) {
      // Pumping: reel the rope in and lean forward, so a swing builds speed instead of dying out.
      this.ropeLen = Math.max(140, this.ropeLen - 110 * dt);
      this.vx += 170 * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (a) {
      const dx = this.x - a.x;
      const dy = this.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > this.ropeLen) {
        const nx = dx / d;
        const ny = dy / d;
        this.x = a.x + nx * this.ropeLen;
        this.y = a.y + ny * this.ropeLen;
        const radial = this.vx * nx + this.vy * ny;
        if (radial > 0) {
          this.vx -= radial * nx;
          this.vy -= radial * ny;
        }
      }
    }

    if (this.y < CEIL_Y + BALL_R) {
      this.y = CEIL_Y + BALL_R;
      this.vy = Math.abs(this.vy) * 0.3;
    }
    this.maxX = Math.max(this.maxX, this.x);

    for (const s of this.starList) {
      if (s.taken || Math.hypot(s.x - this.x, s.y - this.y) > BALL_R + 26) continue;
      s.taken = true;
      this.combo = this.time - this.lastStarAt < 1.3 ? this.combo + 1 : 1;
      this.lastStarAt = this.time;
      this.stars++;
      this.bonus += 10 * Math.min(this.combo, 5);
      events.push({ type: 'star', star: s, combo: this.combo });
    }

    this.fill();
    if (this.y > FLOOR_Y - BALL_R) {
      this.dead = true;
      events.push({ type: 'dead', reason: 'lava' });
    } else if (this.x < this.cam + 24) {
      this.dead = true;
      events.push({ type: 'dead', reason: 'behind' });
    }
    return events;
  }

  /** Lays anchors (and the stars between them) ahead of the view and forgets what's far behind. */
  private fill(): void {
    while (this.nextX < Math.max(this.cam, this.x) + AHEAD) {
      const progress = Math.min(1, this.nextX / 9000);
      const gap = 230 + this.rnd() * 110 + progress * 90;
      const y = 270 + this.rnd() * 230;
      const a = { x: this.nextX, y };
      const prev = this.anchors[this.anchors.length - 1];
      this.anchors.push(a);
      if (prev && this.rnd() < 0.7) {
        const n = this.rnd() < 0.4 ? 3 : 1;
        const mx = (prev.x + a.x) / 2;
        const my = 640 + this.rnd() * 260;
        for (let i = 0; i < n; i++) {
          // Three stars form a little arch (the middle one highest).
          const lift = n > 1 ? (i === 1 ? 80 : 40) : 0;
          this.starList.push({ x: mx + (i - (n - 1) / 2) * 70, y: my - lift, taken: false });
        }
      }
      this.nextX += gap;
    }
    const limit = this.cam - 700;
    this.anchors = this.anchors.filter((a) => a.x > limit || a === this.anchor);
    this.starList = this.starList.filter((s) => s.x > limit);
  }
}
