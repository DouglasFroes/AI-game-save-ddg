/**
 * "Cubo Saltitante" — pure rules of a one-touch rhythm runner. The cube slides right on its own;
 * tap (or hold) to jump. Spikes kill; blocks can be landed on but kill when hit from the side.
 * Obstacles come in hand-made patterns placed at random, and the speed keeps rising.
 */
export const GROUND_Y = 1000;
export const CUBE = 56;
export const CUBE_X = 180;
const GRAVITY = 3300;
const JUMP_V = 1120;

export interface Obstacle {
  readonly kind: 'spike' | 'block';
  /** World x of the left edge. */
  readonly x: number;
  readonly w: number;
  readonly h: number;
  /** Bottom height above the ground (spikes can sit on blocks). */
  readonly base: number;
}

/** Patterns relative to their start (x offset, kind, width, height, base). */
const PATTERNS: ReadonlyArray<ReadonlyArray<[number, Obstacle['kind'], number, number, number]>> = [
  [[0, 'spike', 50, 52, 0]],
  [
    [0, 'spike', 50, 52, 0],
    [50, 'spike', 50, 52, 0],
  ],
  [[0, 'block', 120, 60, 0]],
  [
    [0, 'block', 100, 60, 0],
    [100, 'spike', 50, 52, 60],
  ],
  [
    [0, 'block', 90, 70, 0],
    [230, 'block', 90, 130, 0],
  ],
  [
    [0, 'spike', 50, 52, 0],
    [50, 'spike', 50, 52, 0],
    [100, 'spike', 50, 52, 0],
  ],
  [
    [0, 'block', 260, 60, 0],
    [130, 'spike', 50, 52, 60],
  ],
  [
    [0, 'block', 80, 60, 0],
    [200, 'block', 80, 120, 0],
    [400, 'block', 80, 180, 0],
  ],
];

export class CubeSim {
  dist = 0;
  y = 0; // height of the cube's bottom above the ground
  vy = 0;
  onGround = true;
  alive = true;
  angle = 0;
  obstacles: Obstacle[] = [];
  private nextAt = 900;
  jumps = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  get speed(): number {
    return Math.min(780, 430 + this.dist * 0.012);
  }

  /** Metres run: the score. */
  get score(): number {
    return Math.floor(this.dist / 10);
  }

  private spawn(): void {
    const tier = Math.min(PATTERNS.length, 3 + Math.floor(this.dist / 2500));
    const pattern = PATTERNS[Math.floor(this.rng() * tier)]!;
    let end = this.nextAt;
    for (const [dx, kind, w, h, base] of pattern) {
      this.obstacles.push({ kind, x: this.nextAt + dx, w, h, base });
      end = Math.max(end, this.nextAt + dx + w);
    }
    // Room to land and take off again, scaled with speed.
    this.nextAt = end + this.speed * (0.75 + this.rng() * 0.7);
  }

  jump(): boolean {
    if (!this.alive || !this.onGround) return false;
    this.vy = JUMP_V;
    this.onGround = false;
    this.jumps++;
    return true;
  }

  /** `holding`: jump again as soon as the cube lands. */
  step(dt: number, holding = false): 'dead' | null {
    if (!this.alive) return null;
    const prevY = this.y;
    this.dist += this.speed * dt;
    while (this.nextAt < this.dist + 1400) this.spawn();
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > this.dist - 200);

    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (!this.onGround) this.angle += dt * 6.3;

    // What can the cube stand on right now?
    const left = this.dist + CUBE_X;
    const right = left + CUBE;
    let floor = 0;
    for (const o of this.obstacles) {
      if (o.kind !== 'block' || o.x >= right || o.x + o.w <= left) continue;
      const top = o.base + o.h;
      if (prevY >= top - 6) floor = Math.max(floor, top);
    }
    if (this.y <= floor) {
      this.y = floor;
      this.vy = 0;
      if (!this.onGround) this.angle = Math.round(this.angle / (Math.PI / 2)) * (Math.PI / 2);
      this.onGround = true;
    } else this.onGround = false;

    // Spikes (with a forgiving hitbox) and the sides of blocks kill.
    for (const o of this.obstacles) {
      if (o.x >= right || o.x + o.w <= left) continue;
      if (o.kind === 'spike') {
        const inset = 12;
        if (
          o.x + inset < right &&
          o.x + o.w - inset > left &&
          this.y < o.base + o.h - inset &&
          this.y + CUBE > o.base
        ) {
          this.alive = false;
          return 'dead';
        }
      } else if (this.y < o.base + o.h - 6 && this.y + CUBE > o.base) {
        this.alive = false;
        return 'dead';
      }
    }
    if (holding && this.onGround) this.jump();
    return null;
  }
}
