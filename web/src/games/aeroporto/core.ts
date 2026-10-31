/**
 * "Torre de Controle" — pure rules (Flight Control style). Planes and helicopters fly in from the
 * edges; draw a route from an aircraft to its landing spot (planes: the runway threshold,
 * helicopters: the helipad). Two aircraft getting too close is a crash and ends the shift.
 * Without a route an aircraft flies straight and turns back at the edges. Traffic keeps growing.
 */
export const AREA = { x0: 0, y0: 230, x1: 720, y1: 1280 } as const;
export const RUNWAY = { x: 250, y: 760, angle: -Math.PI / 2 } as const; // threshold, heading north
export const HELIPAD = { x: 560, y: 470 } as const;
export const LAND_R = 46;
export const CRASH_D = 52;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Craft {
  readonly id: number;
  readonly kind: 'plane' | 'heli';
  x: number;
  y: number;
  heading: number;
  readonly speed: number;
  path: Point[];
  /** Its route ends on its landing spot. */
  landing: boolean;
}

export type TowerEvent =
  | { type: 'landed'; craft: Craft; points: number }
  | { type: 'crash'; a: Craft; b: Craft }
  | { type: 'near'; a: Craft; b: Craft };

export const landingSpot = (k: Craft['kind']): Point => (k === 'plane' ? RUNWAY : HELIPAD);

export class TowerSim {
  crafts: Craft[] = [];
  time = 0;
  landed = 0;
  score = 0;
  alive = true;
  private spawnIn = 1;
  private nextId = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  get interval(): number {
    return Math.max(2.2, 6 - this.time * 0.035);
  }

  private spawn(): void {
    const side = Math.floor(this.rng() * 4);
    const along = this.rng();
    const x = side === 0 ? AREA.x0 - 20 : side === 1 ? AREA.x1 + 20 : AREA.x0 + 60 + along * 600;
    const y = side === 2 ? AREA.y0 - 20 : side === 3 ? AREA.y1 + 20 : AREA.y0 + 80 + along * 900;
    const toward = Math.atan2(700 - y, 360 - x) + (this.rng() - 0.5) * 0.8;
    const kind: Craft['kind'] = this.rng() < 0.3 ? 'heli' : 'plane';
    this.crafts.push({
      id: this.nextId++,
      kind,
      x,
      y,
      heading: toward,
      speed: (kind === 'heli' ? 48 : 62) * (1 + Math.min(0.6, this.time * 0.004)),
      path: [],
      landing: false,
    });
  }

  /** Replaces an aircraft's route. */
  route(id: number, points: Point[]): void {
    const c = this.crafts.find((k) => k.id === id);
    if (!c) return;
    c.path = [...points];
    const end = points.at(-1);
    const spot = landingSpot(c.kind);
    c.landing = !!end && Math.hypot(end.x - spot.x, end.y - spot.y) < LAND_R;
  }

  /** The aircraft under a finger (generous radius). */
  pick(x: number, y: number): Craft | undefined {
    return this.crafts.find((c) => Math.hypot(c.x - x, c.y - y) < 60);
  }

  step(dt: number): TowerEvent[] {
    const ev: TowerEvent[] = [];
    if (!this.alive) return ev;
    this.time += dt;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = this.interval * (0.7 + this.rng() * 0.6);
      this.spawn();
    }
    for (const c of [...this.crafts]) {
      const next = c.path[0];
      if (next) {
        const want = Math.atan2(next.y - c.y, next.x - c.x);
        let d = want - c.heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.heading += Math.max(-3.5 * dt, Math.min(3.5 * dt, d));
        if (Math.hypot(next.x - c.x, next.y - c.y) < 14) c.path.shift();
      } else {
        // No route: turn back towards the middle when leaving the area.
        const out =
          c.x < AREA.x0 + 10 || c.x > AREA.x1 - 10 || c.y < AREA.y0 + 10 || c.y > AREA.y1 - 10;
        const inbound = Math.cos(Math.atan2(700 - c.y, 360 - c.x) - c.heading) > 0;
        if (out && !inbound) c.heading += Math.PI * 0.9 * dt * 2;
      }
      c.x += Math.cos(c.heading) * c.speed * dt;
      c.y += Math.sin(c.heading) * c.speed * dt;
      const spot = landingSpot(c.kind);
      // Landing: reaching the spot at the end of a route drawn to it.
      if (c.landing && c.path.length <= 1 && Math.hypot(c.x - spot.x, c.y - spot.y) < LAND_R) {
        this.crafts.splice(this.crafts.indexOf(c), 1);
        this.landed++;
        const points = 10 + Math.floor(this.landed / 5) * 5;
        this.score += points;
        ev.push({ type: 'landed', craft: c, points });
      }
    }
    for (let i = 0; i < this.crafts.length; i++)
      for (let j = i + 1; j < this.crafts.length; j++) {
        const a = this.crafts[i]!;
        const b = this.crafts[j]!;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < CRASH_D) {
          this.alive = false;
          ev.push({ type: 'crash', a, b });
          return ev;
        }
        if (d < CRASH_D * 2.2) ev.push({ type: 'near', a, b });
      }
    return ev;
  }
}
