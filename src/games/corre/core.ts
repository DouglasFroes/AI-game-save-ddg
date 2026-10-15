/**
 * Endless lane runner ("Corre Turma") — pure simulation (no Phaser). The kid runs forward on three
 * lanes; `z` is the distance ahead of the kid in meters. Swipes change lane, jump or slide.
 * Rows of obstacles always leave a way through.
 */

export type Rng = () => number;

export const LANES = 3;
export const START_SPEED = 13;
export const MAX_SPEED = 30;
const SPEED_GAIN = 0.12; // m/s per second
const LANE_SPEED = 9; // lanes per second
const JUMP_VY = 9.5;
const GRAVITY = 30;
const DIVE_VY = -22;
const SLIDE_S = 0.65;
const SPAWN_AHEAD = 90;
const DESPAWN_BEHIND = -6;
const MAGNET_S = 9;
const MAGNET_REACH = 7;
/** Feet must be this high to clear a fence. */
export const FENCE_CLEAR = 0.85;
const HIT_HALF = 0.45;

export type ObstacleKind = 'cerca' | 'faixa' | 'onibus';
export type PowerKind = 'ima' | 'escudo';

export interface Obstacle {
  readonly id: number;
  readonly kind: ObstacleKind;
  readonly lane: number;
  /** Near edge, then length along the lane. */
  z: number;
  readonly len: number;
}

export interface Coin {
  readonly id: number;
  lane: number;
  z: number;
  readonly y: number;
  /** Pulled by the magnet: flies to the kid. */
  pulled: boolean;
}

export interface Power {
  readonly id: number;
  readonly kind: PowerKind;
  readonly lane: number;
  z: number;
}

export type RunEvent =
  | { type: 'coin' }
  | { type: 'power'; kind: PowerKind }
  | { type: 'shield' }
  | { type: 'crash'; kind: ObstacleKind }
  | { type: 'jump' }
  | { type: 'slide' };

export type Move = 'left' | 'right' | 'up' | 'down';

export const OBSTACLE_LEN: Record<ObstacleKind, number> = { cerca: 0.6, faixa: 0.6, onibus: 9 };

export class RunSim {
  speed = START_SPEED;
  meters = 0;
  coins = 0;
  lane = 0;
  /** Lateral position in lanes (smoothly follows `lane`). */
  x = 0;
  y = 0;
  vy = 0;
  slide = 0;
  magnet = 0;
  shield = false;
  crashed: ObstacleKind | null = null;
  readonly obstacles: Obstacle[] = [];
  readonly coinList: Coin[] = [];
  readonly powers: Power[] = [];
  private nextRow = 40;
  private ids = 0;
  private lastPower = 0;

  constructor(private readonly rng: Rng = Math.random) {}

  get score(): number {
    return Math.floor(this.meters) + this.coins * 10;
  }

  get airborne(): boolean {
    return this.y > 0 || this.vy > 0;
  }

  move(m: Move): RunEvent[] {
    if (this.crashed) return [];
    switch (m) {
      case 'left':
      case 'right':
        this.lane = Math.max(-1, Math.min(1, this.lane + (m === 'left' ? -1 : 1)));
        return [];
      case 'up':
        if (this.airborne) return [];
        this.vy = JUMP_VY;
        this.slide = 0;
        return [{ type: 'jump' }];
      case 'down':
        // In the air: dive down fast and slide on landing.
        if (this.airborne) this.vy = Math.min(this.vy, DIVE_VY);
        this.slide = SLIDE_S;
        return [{ type: 'slide' }];
    }
  }

  step(dt: number): RunEvent[] {
    if (this.crashed) return [];
    const events: RunEvent[] = [];
    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_GAIN * dt);
    const dz = this.speed * dt;
    this.meters += dz;

    const step = LANE_SPEED * dt;
    this.x += Math.max(-step, Math.min(step, this.lane - this.x));
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.vy = 0;
    }
    if (!this.airborne) this.slide = Math.max(0, this.slide - dt);
    this.magnet = Math.max(0, this.magnet - dt);

    for (const o of this.obstacles) o.z -= dz;
    for (const c of this.coinList) c.z -= dz;
    for (const p of this.powers) p.z -= dz;

    while (this.nextRow - this.meters < SPAWN_AHEAD) this.spawnRow(this.nextRow - this.meters);

    this.collectCoins(events);
    this.collectPowers(events);
    this.collide(events);

    this.prune();
    return events;
  }

  private inLane(lane: number, width = HIT_HALF): boolean {
    return Math.abs(this.x - lane) < width;
  }

  private collide(events: RunEvent[]): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i]!;
      if (o.z > 0.4 || o.z + o.len < -0.4 || !this.inLane(o.lane)) continue;
      const cleared =
        (o.kind === 'cerca' && this.y >= FENCE_CLEAR) || (o.kind === 'faixa' && this.slide > 0);
      if (cleared) continue;
      if (this.shield) {
        // The shield breaks and takes the obstacle with it.
        this.shield = false;
        this.obstacles.splice(i, 1);
        events.push({ type: 'shield' });
        continue;
      }
      this.crashed = o.kind;
      events.push({ type: 'crash', kind: o.kind });
      return;
    }
  }

  private collectCoins(events: RunEvent[]): void {
    for (let i = this.coinList.length - 1; i >= 0; i--) {
      const c = this.coinList[i]!;
      if (this.magnet > 0 && c.z < MAGNET_REACH && c.z > -1) c.pulled = true;
      if (c.pulled) {
        c.lane += (this.x - c.lane) * 0.35;
        c.z *= 0.6;
      }
      const near = Math.abs(c.z) < 0.7 && this.inLane(c.lane, 0.5) && Math.abs(this.y - c.y) < 1.1;
      if (near || (c.pulled && Math.abs(c.z) < 0.3)) {
        this.coinList.splice(i, 1);
        this.coins++;
        events.push({ type: 'coin' });
      }
    }
  }

  private collectPowers(events: RunEvent[]): void {
    for (let i = this.powers.length - 1; i >= 0; i--) {
      const p = this.powers[i]!;
      if (Math.abs(p.z) > 0.7 || !this.inLane(p.lane, 0.5)) continue;
      this.powers.splice(i, 1);
      if (p.kind === 'ima') this.magnet = MAGNET_S;
      else this.shield = true;
      events.push({ type: 'power', kind: p.kind });
    }
  }

  private prune(): void {
    const keep = <T extends { z: number }>(list: T[], len: (item: T) => number = () => 0) => {
      for (let i = list.length - 1; i >= 0; i--)
        if (list[i]!.z + len(list[i]!) < DESPAWN_BEHIND) list.splice(i, 1);
    };
    keep(this.obstacles, (o) => o.len);
    keep(this.coinList);
    keep(this.powers);
  }

  /**
   * One row of the course at distance `z` ahead. At most two lanes get a bus, and the third one is
   * then left open (maybe with a jumpable fence or coins), so there is always a way through.
   */
  private spawnRow(z: number): void {
    const progress = Math.min(1, this.meters / 2500);
    const lanes = [-1, 0, 1].sort(() => this.rng() - 0.5);
    const r = this.rng();
    const obstacle = (kind: ObstacleKind, lane: number, at = z) =>
      this.obstacles.push({ id: ++this.ids, kind, lane, z: at, len: OBSTACLE_LEN[kind] });
    const coinLine = (lane: number, from: number, n: number, y = 0.6) => {
      for (let i = 0; i < n; i++)
        this.coinList.push({ id: ++this.ids, lane, z: from + i * 2.2, y, pulled: false });
    };

    if (r < 0.25 + progress * 0.15) {
      // Two buses, the third lane open with coins (or a fence to jump).
      obstacle('onibus', lanes[0]!);
      obstacle('onibus', lanes[1]!);
      if (this.rng() < 0.4 + progress * 0.3) obstacle('cerca', lanes[2]!, z + 3);
      else coinLine(lanes[2]!, z, 5);
    } else if (r < 0.55) {
      // A fence or a banner across one or two lanes, coins arcing over a fence.
      const kind: ObstacleKind = this.rng() < 0.5 ? 'cerca' : 'faixa';
      obstacle(kind, lanes[0]!);
      if (this.rng() < 0.35 + progress * 0.4)
        obstacle(this.rng() < 0.5 ? 'cerca' : 'faixa', lanes[1]!);
      if (kind === 'cerca')
        for (let i = 0; i < 4; i++)
          coinLine(lanes[0]!, z - 3 + i * 2, 1, 0.6 + Math.sin((i / 3) * Math.PI) * 1.3);
      else coinLine(lanes[2]!, z - 2, 4);
    } else if (r < 0.8) {
      obstacle('onibus', lanes[0]!);
      coinLine(lanes[1]!, z, 6);
    } else {
      coinLine(lanes[0]!, z, 8);
    }

    // Now and then a power-up in an open lane.
    if (this.meters - this.lastPower > 260 && this.rng() < 0.3) {
      const free = [-1, 0, 1].find(
        (l) => !this.obstacles.some((o) => o.lane === l && Math.abs(o.z - z) < 12),
      );
      if (free !== undefined) {
        this.lastPower = this.meters;
        const kind: PowerKind = this.rng() < 0.5 ? 'ima' : 'escudo';
        this.powers.push({ id: ++this.ids, kind, lane: free, z: z + 6 });
      }
    }
    // Rows come closer as the run speeds up, but leave time to react.
    this.nextRow += Math.max(16, 30 - progress * 12) + this.rng() * 10;
  }
}
