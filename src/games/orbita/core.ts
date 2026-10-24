import type { Rnd } from '@/platform/rnd';

export const VIEW_W = 720;
export const VIEW_H = 1280;
/** Where the player sits on screen (distance from the top of the view). */
export const FOLLOW_Y = 800;

export interface Planet {
  id: number;
  x: number;
  y: number;
  r: number;
  /** Red giants burn anything that gets close; they can't be orbited. */
  hot: boolean;
  /** Angle (on the orbit ring) of a gem, or null when none / already taken. */
  gem: number | null;
}

export type OrbitaEvent =
  | { type: 'launch' }
  | { type: 'capture'; planet: Planet; aimed: boolean }
  | { type: 'gem'; x: number; y: number }
  | { type: 'dead'; reason: 'lost' | 'burn' };

/** Capture happens inside this distance from a planet's surface. */
const CAPTURE_GAP = 95;
const RING_GAP = 62;

/**
 * "Órbita": your satellite circles a planet; tap to fly off in a straight line, and the next
 * planet's gravity grabs you. Aim straight at its centre for a bonus; avoid red giants.
 */
export class OrbitaSim {
  planets: Planet[] = [];
  cur: Planet;
  mode: 'orbit' | 'fly' = 'orbit';
  angle = -Math.PI / 2;
  dir: 1 | -1 = 1;
  orbitR: number;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** World y of the top of the view (smaller = further up). */
  cam = 0;
  visited = 0;
  gems = 0;
  aimedShots = 0;
  streak = 0;
  time = 0;
  dead = false;
  private left: Planet | null = null;
  private nextId = 1;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.cur = { id: 0, x: 360, y: 980, r: 60, hot: false, gem: null };
    this.planets.push(this.cur);
    this.orbitR = this.cur.r + RING_GAP;
    this.placeOnOrbit();
    this.cam = this.y - FOLLOW_Y;
    this.fill();
  }

  get score(): number {
    return this.visited * 10 + this.gems * 5 + this.aimedShots * 5;
  }

  /** Orbit speed in px/s along the ring; it creeps up as you progress. */
  get orbitSpeed(): number {
    return Math.min(640, 380 + this.visited * 7);
  }

  get flySpeed(): number {
    return Math.min(900, 620 + this.visited * 8);
  }

  launch(): OrbitaEvent[] {
    if (this.dead || this.mode !== 'orbit') return [];
    const tx = -Math.sin(this.angle) * this.dir;
    const ty = Math.cos(this.angle) * this.dir;
    this.vx = tx * this.flySpeed;
    this.vy = ty * this.flySpeed;
    this.mode = 'fly';
    this.left = this.cur;
    return [{ type: 'launch' }];
  }

  step(dt: number): OrbitaEvent[] {
    if (this.dead) return [];
    this.time += dt;
    const events: OrbitaEvent[] = [];

    if (this.mode === 'orbit') {
      this.angle += (this.dir * this.orbitSpeed * dt) / this.orbitR;
      this.placeOnOrbit();
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.flyChecks(events);
    }
    this.collectGems(events);

    // The view only ever climbs, smoothly.
    const target = this.y - FOLLOW_Y;
    if (target < this.cam) this.cam += (target - this.cam) * Math.min(1, dt * 6);
    this.fill();

    if (
      !this.dead &&
      (this.y - this.cam > VIEW_H + 120 || this.x < -260 || this.x > VIEW_W + 260)
    ) {
      this.dead = true;
      events.push({ type: 'dead', reason: 'lost' });
    }
    return events;
  }

  private flyChecks(events: OrbitaEvent[]): void {
    for (const p of this.planets) {
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (p.hot) {
        if (d <= p.r + 8) {
          this.dead = true;
          events.push({ type: 'dead', reason: 'burn' });
          return;
        }
        continue;
      }
      if (p === this.left) {
        if (d > p.r + CAPTURE_GAP + 20) this.left = null;
        continue;
      }
      if (d > p.r + CAPTURE_GAP) continue;
      const speed = Math.hypot(this.vx, this.vy) || 1;
      const aimed = (this.vx * (p.x - this.x) + this.vy * (p.y - this.y)) / (speed * d) > 0.965;
      // Spin the way the satellite was already going round the planet.
      const cross = (this.x - p.x) * this.vy - (this.y - p.y) * this.vx;
      this.dir = cross >= 0 ? 1 : -1;
      this.cur = p;
      this.orbitR = Math.max(p.r + 46, Math.min(p.r + RING_GAP + 20, d));
      this.angle = Math.atan2(this.y - p.y, this.x - p.x);
      this.mode = 'orbit';
      this.placeOnOrbit();
      this.visited++;
      if (aimed) {
        this.aimedShots++;
        this.streak++;
      } else this.streak = 0;
      events.push({ type: 'capture', planet: p, aimed });
      return;
    }
  }

  private collectGems(events: OrbitaEvent[]): void {
    for (const p of this.planets) {
      if (p.gem === null || p.hot) continue;
      const gx = p.x + Math.cos(p.gem) * (p.r + RING_GAP);
      const gy = p.y + Math.sin(p.gem) * (p.r + RING_GAP);
      if (Math.hypot(gx - this.x, gy - this.y) < 38) {
        p.gem = null;
        this.gems++;
        events.push({ type: 'gem', x: gx, y: gy });
      }
    }
  }

  private placeOnOrbit(): void {
    this.x = this.cur.x + Math.cos(this.angle) * this.orbitR;
    this.y = this.cur.y + Math.sin(this.angle) * this.orbitR;
  }

  /** Keeps planets generated well above the view and drops the ones far below it. */
  private fill(): void {
    let last = this.planets.filter((p) => !p.hot).reduce((a, b) => (b.y < a.y ? b : a));
    while (last.y > this.cam - 1600) {
      const hard = Math.min(1, this.visited / 40);
      const dy = 320 + this.rnd() * 150 + hard * 40;
      let x = last.x + (this.rnd() - 0.5) * 2 * Math.min(330, 150 + hard * 200);
      x = Math.max(120, Math.min(VIEW_W - 120, x));
      const p: Planet = {
        id: this.nextId++,
        x,
        y: last.y - dy,
        r: 42 + this.rnd() * 30,
        hot: false,
        gem: this.rnd() < 0.55 ? this.rnd() * Math.PI * 2 : null,
      };
      this.planets.push(p);
      // Red giants sit beside the route and get more common with progress.
      if (this.visited > 3 && this.rnd() < Math.min(0.55, 0.15 + hard * 0.4)) {
        const side = x > VIEW_W / 2 ? -1 : 1;
        this.planets.push({
          id: this.nextId++,
          x: Math.max(90, Math.min(VIEW_W - 90, (last.x + x) / 2 + side * (170 + this.rnd() * 90))),
          y: (last.y + p.y) / 2,
          r: 38 + this.rnd() * 16,
          hot: true,
          gem: null,
        });
      }
      last = p;
    }
    const floor = this.cam + VIEW_H + 700;
    this.planets = this.planets.filter((p) => p.y < floor || p === this.cur);
  }
}
