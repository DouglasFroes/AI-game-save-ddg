/**
 * "Dar grau": an endless wheelie through city streets — pure simulation (no Phaser, no Three).
 *
 * Units are meters and seconds. The bike rides along the current street segment; `s` is the distance
 * along it and `x` the lateral offset (positive = right). At the end of a segment there is a crossing:
 * the lane you are in decides where you go (left lane = turn left, right lane = turn right).
 */

export type Rng = () => number;

export const LANE_W = 3.4;
/** Lanes are -1 (left), 0 (middle) and 1 (right). */
export const ROAD_HALF = LANE_W * 1.5;
export const SIDEWALK_W = 3;
/** Width of the cross street at each intersection. */
export const CROSS_W = 2 * ROAD_HALF;

export const BIKE_LEN = 2;
export const BIKE_W = 0.8;
export const CAR_LEN = 4.3;
export const CAR_W = 1.9;
export const POTHOLE_R = 0.9;

export const START_SPEED = 13;
export const MAX_SPEED = 31;

const deg = (d: number) => (d * Math.PI) / 180;
/** Front wheel counts as "up" from this pitch. */
export const WHEELIE_MIN = deg(12);
/** High wheelie: scores more. */
export const GRAU_ALTO = deg(50);
/** Past this the bike flips over backwards. */
export const LOOP = deg(92);
/** Clearing a pothole needs at least this much pitch. */
export const POTHOLE_SAFE = deg(14);

/** Pitch dynamics (rad/s²): holding the throttle lifts, letting go brings the front down. */
const BALANCE = deg(80);
const GRAVITY = 8.5;
const THROTTLE = 10;
const DROP = 2.2;
const DAMPING = 3.5;
const BUMP_KICK = 2.3;

const ACCEL = 4;
const LATERAL_SPEED = 10;
const TURN_SLOWDOWN = 0.85;
const COMBO_STEP_S = 2;
export const MAX_COMBO = 8;
/** Short touches of the front wheel don't break the combo. */
const COMBO_GRACE_S = 0.3;
const SPAWN_AHEAD = 110;
const CAR_FOLLOW_GAP = 3;
/** Obstacle-free run-up at the start of the game and after each crossing. */
const SAFE_START = 60;
const SAFE_AFTER_CORNER = 28;

export type Heading = 0 | 1 | 2 | 3;
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}
/** Heading 0 faces -z (Three's default forward); each step turns 90° to the right. */
export const HEADINGS: readonly Vec2[] = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];
export const forwardOf = (h: Heading): Vec2 => HEADINGS[h]!;
export const rightOf = (h: Heading): Vec2 => HEADINGS[(h + 1) % 4]!;
export const turn = (h: Heading, dir: number): Heading => ((((h + dir) % 4) + 4) % 4) as Heading;

export type StreetKind = 'rua' | 'avenida';
export interface Street {
  readonly name: string;
  readonly kind: StreetKind;
}

export interface Pothole {
  readonly id: number;
  readonly s: number;
  readonly lane: number;
}

export interface Segment {
  readonly id: number;
  readonly street: Street;
  readonly heading: Heading;
  /** World position where the segment starts (center of the previous crossing). */
  readonly origin: Vec2;
  /** Distance to the center of the next crossing. */
  readonly length: number;
  readonly potholes: readonly Pothole[];
  readonly bumps: readonly number[];
  /** Streets you can turn into at the end of this segment. */
  readonly left: Street;
  readonly right: Street;
}

export interface Car {
  readonly id: number;
  s: number;
  readonly lane: number;
  readonly x: number;
  speed: number;
  /** Palette index, chosen by the renderer. */
  readonly paint: number;
  passed: boolean;
}

export type CrashReason = 'car' | 'loop' | 'pothole';

export type GrauEvent =
  | { type: 'street'; dir: -1 | 0 | 1; segment: Segment; bonus: number }
  | { type: 'pass'; car: Car; bonus: number }
  | { type: 'pothole'; pothole: Pothole; bonus: number }
  | { type: 'bump' }
  | { type: 'combo'; combo: number }
  | { type: 'crash'; reason: CrashReason };

/** World position of a point on a segment. */
export function worldPos(seg: Segment, s: number, x: number): Vec2 {
  const f = forwardOf(seg.heading);
  const r = rightOf(seg.heading);
  return { x: seg.origin.x + f.x * s + r.x * x, z: seg.origin.z + f.z * s + r.z * x };
}

export const laneX = (lane: number) => lane * LANE_W;
export const speedFor = (meters: number) => Math.min(MAX_SPEED, START_SPEED + meters * 0.004);
export const comboFor = (wheelieSeconds: number) =>
  Math.min(MAX_COMBO, 1 + Math.floor(wheelieSeconds / COMBO_STEP_S));
/** Wheelie points per meter: more for a high wheelie, multiplied by the combo. */
export const wheeliePointsPerMeter = (pitch: number, combo: number) =>
  pitch < WHEELIE_MIN ? 0 : (pitch >= GRAU_ALTO ? 5 : 2) * combo;

const RUAS = [
  'Rua das Flores',
  'Rua do Grau',
  'Rua da Paz',
  'Rua Sete',
  'Rua do Sol',
  'Rua da Laje',
  'Rua Bela Vista',
  'Rua das Palmeiras',
  'Rua do Campo',
  'Rua da Esperança',
  'Rua do Morro',
  'Rua Nova',
];
const AVENIDAS = [
  'Av. Brasil',
  'Av. Paulista',
  'Av. Central',
  'Av. Atlântica',
  'Av. das Nações',
  'Av. do Contorno',
  'Av. Ipiranga',
  'Av. Beira-Mar',
];

export class GrauSim {
  speed = START_SPEED;
  /** Distance along the current segment. */
  s = 0;
  x = 0;
  lane = 0;
  pitch = 0;
  omega = 0;
  meters = 0;
  combo = 1;
  turns = 0;
  passed = 0;
  bestWheelie = 0;
  crashed: CrashReason | null = null;
  segment: Segment;
  readonly cars: Car[] = [];

  private points = 0;
  private wheelieTime = 0;
  private groundTime = 0;
  private currentWheelie = 0;
  private nextCarS = SAFE_START;
  private ids = 0;

  constructor(private readonly rng: Rng = Math.random) {
    this.segment = this.makeSegment(
      { name: 'Rua do Grau', kind: 'rua' },
      0,
      { x: 0, z: 0 },
      SAFE_START,
    );
  }

  get score(): number {
    return Math.floor(this.points);
  }

  get wheelie(): boolean {
    return this.pitch >= WHEELIE_MIN;
  }

  get grauAlto(): boolean {
    return this.pitch >= GRAU_ALTO;
  }

  /** Meters to the center of the next crossing. */
  get toCorner(): number {
    return this.segment.length - this.s;
  }

  /** Where the current lane leads at the next crossing. */
  get exitDir(): -1 | 0 | 1 {
    return this.lane as -1 | 0 | 1;
  }

  steer(dir: -1 | 1): void {
    if (!this.crashed) this.lane = Math.max(-1, Math.min(1, this.lane + dir));
  }

  step(dt: number, throttle: boolean): GrauEvent[] {
    if (this.crashed) return [];
    const events: GrauEvent[] = [];

    // Speed: ramps up with distance; a turn costs some of it.
    const target = speedFor(this.meters);
    this.speed = Math.min(target, this.speed + ACCEL * dt);

    // Pitch: a damped inverted pendulum around the balance point.
    const alpha =
      (throttle ? THROTTLE : -DROP) -
      GRAVITY * Math.sin(BALANCE - this.pitch) -
      DAMPING * this.omega;
    this.omega += alpha * dt;
    this.pitch += this.omega * dt;
    if (this.pitch <= 0) {
      this.pitch = 0;
      this.omega = Math.max(0, this.omega);
    }
    if (this.pitch > LOOP) return this.crash('loop', events);

    const tx = laneX(this.lane);
    const maxMove = LATERAL_SPEED * dt;
    this.x += Math.max(-maxMove, Math.min(maxMove, tx - this.x));

    const prevS = this.s;
    const ds = this.speed * dt;
    this.s += ds;
    this.meters += ds;
    this.scoreDistance(dt, ds, events);

    for (const b of this.segment.bumps) {
      if (prevS < b && b <= this.s) {
        this.omega += BUMP_KICK;
        events.push({ type: 'bump' });
      }
    }

    const front = BIKE_LEN / 2;
    for (const p of this.segment.potholes) {
      if (!(prevS + front < p.s && p.s <= this.s + front)) continue;
      if (Math.abs(this.x - laneX(p.lane)) >= POTHOLE_R + BIKE_W / 2) continue;
      if (this.pitch < POTHOLE_SAFE) return this.crash('pothole', events);
      const bonus = 50 * this.combo;
      this.points += bonus;
      events.push({ type: 'pothole', pothole: p, bonus });
    }

    this.moveTraffic(dt, events);
    if (this.crashed) return events;

    if (this.s >= this.segment.length) this.cross(events);
    return events;
  }

  private scoreDistance(dt: number, ds: number, events: GrauEvent[]): void {
    this.points += ds;
    if (this.wheelie) {
      this.groundTime = 0;
      this.wheelieTime += dt;
      this.currentWheelie += ds;
      this.bestWheelie = Math.max(this.bestWheelie, this.currentWheelie);
      const combo = comboFor(this.wheelieTime);
      if (combo > this.combo) events.push({ type: 'combo', combo });
      this.combo = combo;
      this.points += ds * wheeliePointsPerMeter(this.pitch, this.combo);
    } else {
      this.groundTime += dt;
      if (this.groundTime > COMBO_GRACE_S) {
        this.wheelieTime = 0;
        this.currentWheelie = 0;
        this.combo = 1;
      }
    }
  }

  private moveTraffic(dt: number, events: GrauEvent[]): void {
    const seg = this.segment;
    while (this.nextCarS <= this.s + SPAWN_AHEAD && this.nextCarS <= seg.length - 20) {
      this.spawnWave(Math.max(this.nextCarS, this.s + SPAWN_AHEAD * 0.8));
    }

    for (const car of this.cars) car.s += car.speed * dt;
    this.keepDistance();

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i]!;
      const dz = Math.abs(car.s - this.s);
      const dx = Math.abs(car.x - this.x);
      if (dz < (CAR_LEN + BIKE_LEN) / 2 - 0.25 && dx < (CAR_W + BIKE_W) / 2 - 0.15) {
        this.crash('car', events);
        return;
      }
      if (!car.passed && car.s + CAR_LEN / 2 < this.s - BIKE_LEN / 2) {
        car.passed = true;
        this.passed++;
        const bonus = this.wheelie ? 25 * this.combo : 5;
        this.points += bonus;
        events.push({ type: 'pass', car, bonus });
      }
      // Cars behind the camera or past the crossing (they turned off) are dropped.
      if (car.s < this.s - 30 || car.s > seg.length + 8) this.cars.splice(i, 1);
    }
  }

  /** One or two cars side by side, always leaving a free lane. */
  private spawnWave(at: number): void {
    const avenue = this.segment.street.kind === 'avenida';
    const lanes = [-1, 0, 1].sort(() => this.rng() - 0.5);
    const count = this.rng() < (avenue ? 0.45 : 0.2) ? 2 : 1;
    for (const lane of lanes.slice(0, count)) {
      const free = this.cars.every(
        (c) => c.lane !== lane || Math.abs(c.s - at) > CAR_LEN + CAR_FOLLOW_GAP,
      );
      if (!free) continue;
      this.cars.push({
        id: ++this.ids,
        s: at,
        lane,
        x: laneX(lane),
        speed: (avenue ? 8 : 5) + this.rng() * 4,
        paint: Math.floor(this.rng() * 1000),
        passed: false,
      });
    }
    this.nextCarS = at + (avenue ? 22 + this.rng() * 22 : 34 + this.rng() * 30);
  }

  /** Cars never drive through the one ahead in their lane. */
  private keepDistance(): void {
    const byFront = [...this.cars].sort((a, b) => b.s - a.s);
    for (let j = 1; j < byFront.length; j++) {
      const car = byFront[j]!;
      for (let i = 0; i < j; i++) {
        const lead = byFront[i]!;
        if (lead.lane !== car.lane) continue;
        const maxS = lead.s - CAR_LEN - CAR_FOLLOW_GAP;
        if (car.s > maxS) {
          car.s = maxS;
          car.speed = Math.min(car.speed, lead.speed);
        }
      }
    }
  }

  /** Reached the center of the crossing: follow the lane's direction into the next segment. */
  private cross(events: GrauEvent[]): void {
    const seg = this.segment;
    const dir = this.exitDir;
    const street = dir === -1 ? seg.left : dir === 1 ? seg.right : seg.street;
    const next = this.makeSegment(
      street,
      turn(seg.heading, dir),
      worldPos(seg, seg.length, 0),
      SAFE_AFTER_CORNER,
    );
    this.segment = next;
    this.s -= seg.length;

    let bonus = 0;
    if (dir === 0) {
      // Same line continues: keep the traffic ahead, in the new segment's coordinates.
      for (const car of this.cars) car.s -= seg.length;
      this.nextCarS -= seg.length;
    } else {
      this.cars.length = 0;
      this.nextCarS = SAFE_AFTER_CORNER;
      this.speed *= TURN_SLOWDOWN;
      this.turns++;
      bonus = this.wheelie ? 100 * this.combo : 20;
      this.points += bonus;
    }
    events.push({ type: 'street', dir, segment: next, bonus });
  }

  private crash(reason: CrashReason, events: GrauEvent[]): GrauEvent[] {
    this.crashed = reason;
    events.push({ type: 'crash', reason });
    return events;
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rng() * list.length)]!;
  }

  private randomStreet(...avoid: string[]): Street {
    const kind: StreetKind = this.rng() < 0.4 ? 'avenida' : 'rua';
    const names = (kind === 'avenida' ? AVENIDAS : RUAS).filter((n) => !avoid.includes(n));
    return { name: this.pick(names), kind };
  }

  private makeSegment(street: Street, heading: Heading, origin: Vec2, safe: number): Segment {
    const avenue = street.kind === 'avenida';
    const length = avenue ? 160 + this.rng() * 80 : 110 + this.rng() * 60;
    const end = length - 25;

    const potholes: Pothole[] = [];
    for (let s = safe + 10 + this.rng() * 30; s < end; s += (avenue ? 70 : 38) + this.rng() * 40)
      potholes.push({ id: ++this.ids, s, lane: Math.floor(this.rng() * 3) - 1 });

    const bumps: number[] = [];
    const bumpCount = Math.floor(this.rng() * (avenue ? 2 : 3));
    for (let i = 0; i < bumpCount; i++) {
      const s = safe + 15 + this.rng() * (end - safe - 15);
      if (potholes.every((p) => Math.abs(p.s - s) > 12) && bumps.every((b) => Math.abs(b - s) > 20))
        bumps.push(s);
    }
    bumps.sort((a, b) => a - b);

    const left = this.randomStreet(street.name);
    const right = this.randomStreet(street.name, left.name);
    return { id: ++this.ids, street, heading, origin, length, potholes, bumps, left, right };
  }
}
