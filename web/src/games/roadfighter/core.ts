/** Endless Road Fighter simulation — pure (no Phaser), deterministic with an injected RNG. */

export type Rng = () => number;

export const ROAD_LEFT = 150;
export const ROAD_RIGHT = 570;
export const LANES = 4;
export const LANE_W = (ROAD_RIGHT - ROAD_LEFT) / LANES;
export const laneX = (lane: number) => ROAD_LEFT + LANE_W * (lane + 0.5);

export const PLAYER_Y = 1040;
export const CAR_W = 62;
export const CAR_H = 110;
export const TRUCK_W = 74;
export const TRUCK_H = 190;
export const FUEL_W = 44;
export const FUEL_H = 56;

export const START_SPEED = 420;
export const MAX_SPEED = 1400;
export const MAX_FUEL = 100;
export const START_LIVES = 3;
export const PIXELS_PER_METER = 10;
const LATERAL_SPEED = 1000;
const ACCEL = 260;
const INVULNERABLE_S = 1.6;
const FUEL_EVERY = 4200;
const FUEL_REFILL = 32;
/** Bumper-to-bumper distance a car keeps behind the one ahead in its lane. */
const FOLLOW_GAP = 40;
const SPAWN_Y = -200;
/** Extra vertical room around traffic the player needs to weave through (a car's height). */
const PASS_GAP = CAR_H;

export type CarKind = 'blue' | 'yellow' | 'red' | 'truck';

export interface Car {
  readonly id: number;
  readonly kind: CarKind;
  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
  /** Absolute speed in px/s (the player's speed scrolls the world). Drops when stuck behind a slower car. */
  speed: number;
  targetX: number;
  swerved: boolean;
}

export interface Pickup {
  readonly id: number;
  x: number;
  y: number;
}

export type RoadEvent =
  | { type: 'crash'; car: Car }
  | { type: 'fuel'; pickup: Pickup }
  | { type: 'pass'; car: Car }
  | { type: 'over'; reason: 'crash' | 'fuel' };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Center-based boxes with a small forgiveness margin. */
export function overlaps(a: Box, b: Box, margin = 6): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 - margin && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - margin
  );
}

export const speedFor = (distance: number): number =>
  Math.min(MAX_SPEED, START_SPEED + distance * 0.0125);

/** Distance (px) between traffic waves: shorter as the game speeds up. */
export function spawnGap(speed: number): number {
  const t = (speed - START_SPEED) / (MAX_SPEED - START_SPEED);
  return 560 - t * 280;
}

export const fuelDrain = (speed: number): number => 1.5 + speed / 900;

export class RoadSim {
  playerX = laneX(1);
  speed = START_SPEED;
  distance = 0;
  fuel = MAX_FUEL;
  lives = START_LIVES;
  passed = 0;
  invulnerable = 0;
  over: 'crash' | 'fuel' | null = null;
  readonly cars: Car[] = [];
  readonly pickups: Pickup[] = [];
  private nextSpawn = 300;
  private nextFuel = FUEL_EVERY;
  private ids = 0;

  constructor(private readonly rng: Rng = Math.random) {}

  get meters(): number {
    return Math.floor(this.distance / PIXELS_PER_METER);
  }

  get score(): number {
    return this.meters + this.passed * 10;
  }

  get playerBox(): Box {
    return { x: this.playerX, y: PLAYER_Y, w: CAR_W, h: CAR_H };
  }

  /** Advances the simulation. steerX is where the player wants to go (null = keep going). */
  step(dt: number, steerX: number | null): RoadEvent[] {
    if (this.over) return [];
    const events: RoadEvent[] = [];

    const target = speedFor(this.distance);
    this.speed = Math.min(target, this.speed + ACCEL * dt);
    const dy = this.speed * dt;
    this.distance += dy;
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    if (steerX !== null) {
      const maxMove = LATERAL_SPEED * dt;
      this.playerX += Math.max(-maxMove, Math.min(maxMove, steerX - this.playerX));
    }
    this.playerX = Math.max(ROAD_LEFT + CAR_W / 2, Math.min(ROAD_RIGHT - CAR_W / 2, this.playerX));

    this.moveTraffic(dt, events);
    for (const p of this.pickups) p.y += dy;

    while (this.distance >= this.nextSpawn) this.spawnWave();
    if (this.distance >= this.nextFuel) {
      this.pickups.push({ id: ++this.ids, x: laneX(Math.floor(this.rng() * LANES)), y: -120 });
      this.nextFuel += FUEL_EVERY * (0.8 + this.rng() * 0.4);
    }

    this.collide(events);

    this.fuel = Math.max(0, this.fuel - fuelDrain(this.speed) * dt);
    if (this.lives <= 0) this.over = 'crash';
    else if (this.fuel <= 0) this.over = 'fuel';
    if (this.over) events.push({ type: 'over', reason: this.over });
    return events;
  }

  private moveTraffic(dt: number, events: RoadEvent[]): void {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i]!;
      car.y += (this.speed - car.speed) * dt;

      // Yellow cars swerve once; red cars chase the player's lane.
      if (car.kind === 'yellow' && !car.swerved && car.y > 380) {
        car.swerved = true;
        const lane = Math.round((car.x - ROAD_LEFT) / LANE_W - 0.5);
        const dir = lane === 0 ? 1 : lane === LANES - 1 ? -1 : this.rng() < 0.5 ? -1 : 1;
        car.targetX = laneX(lane + dir);
      } else if (car.kind === 'red' && car.y > 200 && car.y < 700) {
        car.targetX = this.playerX;
      }
      const maxMove = 260 * dt;
      const nextX = car.x + Math.max(-maxMove, Math.min(maxMove, car.targetX - car.x));
      // Change lanes only into free space; otherwise wait for a gap.
      if (nextX !== car.x && !this.blocked({ ...car, x: nextX }, car)) car.x = nextX;

      if (car.y > PLAYER_Y + 400) {
        this.cars.splice(i, 1);
        this.passed++;
        events.push({ type: 'pass', car });
      } else if (car.y < -600) {
        this.cars.splice(i, 1);
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (this.pickups[i]!.y > PLAYER_Y + 300) this.pickups.splice(i, 1);
    }
    this.keepDistance();
  }

  /** Whether a car-sized box would touch any other traffic car. */
  private blocked(box: Box, self?: Car): boolean {
    return this.cars.some((c) => c !== self && overlaps(box, c, -FOLLOW_GAP / 2));
  }

  /**
   * Keeps traffic orderly, front to back (smaller y = further ahead): a faster car brakes behind a
   * slower one in its lane instead of driving through it, and a car about to line up with the
   * others into a wall across the whole road brakes behind them as well. Each rule only ever
   * pushes a car back (and slows it to the speed of what it queues behind), so one pass settles.
   */
  private keepDistance(): void {
    const placed: Car[] = [];
    for (const car of [...this.cars].sort((a, b) => a.y - b.y)) {
      for (let guard = 0; guard < 12; guard++) {
        let moved = false;
        for (const ahead of placed) {
          if (Math.abs(car.x - ahead.x) >= (car.w + ahead.w) / 2) continue;
          const minY = ahead.y + (car.h + ahead.h) / 2 + FOLLOW_GAP;
          if (car.y < minY) {
            car.y = minY;
            car.speed = Math.min(car.speed, ahead.speed);
            moved = true;
          }
        }
        const wall = this.closesRoad(car, placed);
        if (wall) {
          car.y = Math.max(...wall.map((o) => o.y + (o.h + car.h) / 2 + PASS_GAP));
          car.speed = Math.min(car.speed, ...wall.map((o) => o.speed));
          moved = true;
        }
        if (!moved) break;
      }
      placed.push(car);
    }
  }

  /** The lanes a car touches (two while it is changing lanes). */
  private lanesOf(c: Box): number[] {
    return [0, 1, 2, 3].filter((l) => Math.abs(c.x - laneX(l)) < (c.w + CAR_W) / 2 - 6);
  }

  /** Whether `box` would close the road: with the traffic around it, every lane is taken. */
  private closesRoad(box: Box, others: readonly Car[]): Car[] | null {
    const near = others.filter((o) => Math.abs(o.y - box.y) < (o.h + box.h) / 2 + PASS_GAP);
    const lanes = new Set<number>(this.lanesOf(box));
    for (const o of near) for (const l of this.lanesOf(o)) lanes.add(l);
    return lanes.size >= LANES ? near : null;
  }

  private pickKind(): CarKind {
    const progress = Math.min(1, this.distance / 60000);
    const r = this.rng();
    if (r < 0.12 + progress * 0.08) return 'truck';
    if (r < 0.3 + progress * 0.2) return 'yellow';
    if (progress > 0.25 && r < 0.38 + progress * 0.22) return 'red';
    return 'blue';
  }

  /** One or two cars, always leaving at least one free lane; never on top of another car. */
  private spawnWave(): void {
    const lanes = [0, 1, 2, 3].sort(() => this.rng() - 0.5);
    const count = this.speed > 700 && this.rng() < 0.45 ? 2 : 1;
    for (const lane of lanes.slice(0, count)) {
      const kind = this.pickKind();
      const truck = kind === 'truck';
      const w = truck ? TRUCK_W : CAR_W;
      const h = truck ? TRUCK_H : CAR_H;
      const spot = { x: laneX(lane), y: SPAWN_Y, w, h };
      if (this.blocked(spot) || this.closesRoad(spot, this.cars)) continue;
      this.cars.push({
        id: ++this.ids,
        kind,
        x: laneX(lane),
        y: SPAWN_Y,
        w,
        h,
        speed: this.speed * (truck ? 0.35 : kind === 'red' ? 0.55 : 0.45 + this.rng() * 0.15),
        targetX: laneX(lane),
        swerved: false,
      });
    }
    this.nextSpawn += spawnGap(this.speed) * (0.75 + this.rng() * 0.5);
  }

  private collide(events: RoadEvent[]): void {
    const me = this.playerBox;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      if (overlaps(me, { x: p.x, y: p.y, w: FUEL_W, h: FUEL_H }, 0)) {
        this.pickups.splice(i, 1);
        this.fuel = Math.min(MAX_FUEL, this.fuel + FUEL_REFILL);
        events.push({ type: 'fuel', pickup: p });
      }
    }
    if (this.invulnerable > 0) return;
    const hit = this.cars.findIndex((c) => overlaps(me, c));
    if (hit < 0) return;
    const [car] = this.cars.splice(hit, 1);
    this.lives--;
    this.invulnerable = INVULNERABLE_S;
    this.speed *= 0.4;
    events.push({ type: 'crash', car: car! });
  }
}
