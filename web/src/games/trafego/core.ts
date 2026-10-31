/**
 * "Controle de Tráfego" — pure rules. Cars arrive from four sides of a crossroads and drive
 * straight across. Tap a side to switch its light between green and red: cars stop at red.
 * A car crossing while another one from a perpendicular road is in the junction is a crash
 * (game over); a queue growing too long makes drivers give up (a life lost).
 */
export type Dir = 'N' | 'S' | 'E' | 'W';
export const DIRS: readonly Dir[] = ['N', 'S', 'E', 'W'];
/** Distance from the spawn point to the stop line, and the junction's length, in px. */
export const STOP = 360;
export const BOX = 180;
export const TRACK = STOP * 2 + BOX;
export const CAR_LEN = 70;
const GAP = 22;
export const MAX_QUEUE = 6;
export const LIVES = 3;

export const vertical = (d: Dir): boolean => d === 'N' || d === 'S';

export interface Car {
  readonly id: number;
  readonly dir: Dir;
  /** Distance travelled from the spawn point (front bumper). */
  pos: number;
  speed: number;
}

export type TrafficEvent =
  | { type: 'passed'; car: Car; points: number }
  | { type: 'crash'; a: Car; b: Car }
  | { type: 'jam'; dir: Dir; livesLeft: number }
  | { type: 'over' };

export class TrafficSim {
  cars: Car[] = [];
  green: Record<Dir, boolean> = { N: true, S: true, E: false, W: false };
  time = 0;
  score = 0;
  passed = 0;
  lives = LIVES;
  alive = true;
  private spawnIn: Record<Dir, number> = { N: 1, S: 2, E: 1.5, W: 2.5 };
  private nextId = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  /** Cars per second on each road. */
  get rate(): number {
    return Math.min(0.75, 0.22 + this.time * 0.006);
  }

  toggle(d: Dir): void {
    this.green[d] = !this.green[d];
  }

  /** Whether a car is inside the junction box. */
  static inBox(c: Car): boolean {
    return c.pos > STOP && c.pos - CAR_LEN < STOP + BOX;
  }

  queue(d: Dir): number {
    return this.cars.filter((c) => c.dir === d && c.pos <= STOP + 2).length;
  }

  step(dt: number): TrafficEvent[] {
    const ev: TrafficEvent[] = [];
    if (!this.alive) return ev;
    this.time += dt;
    for (const d of DIRS) {
      this.spawnIn[d] -= dt;
      const last = this.cars.filter((c) => c.dir === d).sort((a, b) => a.pos - b.pos)[0];
      if (this.spawnIn[d] <= 0 && (!last || last.pos > CAR_LEN + GAP)) {
        this.spawnIn[d] = (1 / this.rate) * (0.6 + this.rng() * 0.8);
        this.cars.push({ id: this.nextId++, dir: d, pos: 0, speed: 150 + this.rng() * 60 });
      }
    }
    for (const d of DIRS) {
      const lane = this.cars.filter((c) => c.dir === d).sort((a, b) => b.pos - a.pos);
      let ahead: Car | undefined;
      for (const c of lane) {
        let limit = Infinity;
        if (ahead) limit = ahead.pos - CAR_LEN - GAP;
        // A red light holds cars that have not reached the junction yet.
        if (!this.green[d] && c.pos <= STOP) limit = Math.min(limit, STOP);
        c.pos = Math.min(c.pos + c.speed * dt, Math.max(c.pos, limit));
        ahead = c;
      }
    }
    // Crashes: a vertical and a horizontal car in the box together.
    const inside = this.cars.filter(TrafficSim.inBox);
    const a = inside.find((c) => vertical(c.dir));
    const b = inside.find((c) => !vertical(c.dir));
    if (a && b) {
      this.alive = false;
      ev.push({ type: 'crash', a, b }, { type: 'over' });
      return ev;
    }
    for (const c of this.cars.filter((x) => x.pos - CAR_LEN > TRACK)) {
      this.cars.splice(this.cars.indexOf(c), 1);
      this.passed++;
      const points = 10 + Math.floor(this.time / 10);
      this.score += points;
      ev.push({ type: 'passed', car: c, points });
    }
    for (const d of DIRS) {
      if (this.queue(d) < MAX_QUEUE) continue;
      // Fed-up drivers turn around: the queue empties and a life is lost.
      this.cars = this.cars.filter((c) => !(c.dir === d && c.pos <= STOP + 2));
      this.lives--;
      ev.push({ type: 'jam', dir: d, livesLeft: this.lives });
      if (this.lives <= 0) {
        this.alive = false;
        ev.push({ type: 'over' });
        return ev;
      }
    }
    return ev;
  }
}
