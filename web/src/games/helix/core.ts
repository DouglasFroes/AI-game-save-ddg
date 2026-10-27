import { randInt, type Rnd } from '@/platform/rnd';

export const SECTORS = 12;
/** Width of one sector in the "unrolled" tower, in world pixels. */
export const SECTOR_W = 120;
export const PERIOD = SECTORS * SECTOR_W;
export const SPACING = 210;
export const BALL_R = 26;
export const BALL_X = 360;
const GRAVITY = 3200;
const BOUNCE = 1050;
/** Falling through this many platforms in one go makes the ball smash the next one. */
export const SMASH_AT = 3;

export type Sector = 'solid' | 'gap' | 'danger';

export interface Platform {
  /** Top surface y (world, grows downward). */
  y: number;
  sectors: Sector[];
  broken: boolean;
}

export function makePlatform(index: number, rnd: Rnd): Platform {
  const sectors: Sector[] = new Array<Sector>(SECTORS).fill('solid');
  const gapSize = Math.max(1, 3 - Math.floor(index / 14));
  const start = randInt(rnd, 0, SECTORS - 1);
  for (let g = 0; g < gapSize; g++) sectors[(start + g) % SECTORS] = 'gap';
  const dangers = Math.min(5, Math.floor(index / 4));
  for (let d = 0; d < dangers; d++) {
    const at = randInt(rnd, 0, SECTORS - 1);
    if (sectors[at] === 'solid') sectors[at] = 'danger';
  }
  return { y: 0, sectors, broken: false };
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export interface HelixEvents {
  passed: number;
  landed: boolean;
  smashed: boolean;
  died: boolean;
}

/** "Torre Helix": spin the tower so the bouncing ball drops through the gaps. */
export class HelixSim {
  /** Horizontal scroll of the unrolled tower (what dragging changes). */
  rot = 0;
  y = -BALL_R;
  vy = 0;
  /** Platforms passed in the current fall (drives the smash power). */
  streak = 0;
  passed = 0;
  score = 0;
  dead = false;
  platforms: Platform[] = [];
  private nextIndex = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    for (let i = 0; i < 8; i++) this.addPlatform();
    // The first platform has no hazards, so nobody dies on the very first bounce.
    const first = this.platforms[0]!;
    first.sectors = first.sectors.map((s) => (s === 'danger' ? 'solid' : s));
  }

  private addPlatform(): void {
    const p = makePlatform(this.nextIndex, this.rnd);
    p.y = (this.nextIndex + 1) * SPACING;
    this.platforms.push(p);
    this.nextIndex++;
  }

  get smashing(): boolean {
    return this.streak >= SMASH_AT;
  }

  /** The sector currently under the ball. */
  sectorUnderBall(p: Platform): Sector {
    const idx = Math.floor(mod(BALL_X - this.rot, PERIOD) / SECTOR_W);
    return p.sectors[idx]!;
  }

  spin(dx: number): void {
    if (!this.dead) this.rot += dx;
  }

  step(dt: number): HelixEvents {
    const ev: HelixEvents = { passed: 0, landed: false, smashed: false, died: false };
    if (this.dead) return ev;
    const prevBottom = this.y + BALL_R;
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    const bottom = this.y + BALL_R;
    for (const p of this.platforms) {
      if (p.broken || this.vy <= 0) continue;
      if (prevBottom > p.y || bottom < p.y) continue;
      const kind = this.sectorUnderBall(p);
      if (kind === 'gap') continue;
      if (this.smashing) {
        p.broken = true;
        ev.smashed = true;
        this.streak = 0;
        this.passed++;
        ev.passed++;
        this.score += 2;
        continue;
      }
      if (kind === 'danger') {
        this.dead = true;
        ev.died = true;
        return ev;
      }
      this.y = p.y - BALL_R;
      this.vy = -BOUNCE;
      this.streak = 0;
      ev.landed = true;
      break;
    }
    // A platform counts once the ball has dropped fully below it.
    for (const p of this.platforms) {
      if (p.broken || this.y - BALL_R <= p.y) continue;
      p.broken = true;
      this.streak++;
      this.passed++;
      ev.passed++;
      this.score += Math.min(this.streak, 5);
    }
    this.platforms = this.platforms.filter((p) => p.y > this.y - 700);
    while (this.platforms.length < 8) this.addPlatform();
    return ev;
  }
}
