/**
 * "Pula Pula" (Doodle Jump-like) — pure rules. The kid bounces automatically on platforms when
 * falling onto them; the player only steers left/right (wrapping around the screen edges).
 * World y grows upwards; the score is the best height reached.
 */

export type Rng = () => number;

export const WIDTH = 720;
const GRAVITY = 2300;
const JUMP_VY = 1180;
const SPRING_VY = 1950;
const STEER = 560;
export const PLATFORM_W = 124;
const KID_HALF = 30;
/** Highest gap the kid can jump: v²/2g, with a safety margin. */
export const MAX_GAP = Math.floor(((JUMP_VY * JUMP_VY) / (2 * GRAVITY)) * 0.82);

export type PlatformKind = 'normal' | 'moving' | 'fragile' | 'spring';

export interface Platform {
  readonly id: number;
  x: number;
  readonly y: number;
  readonly kind: PlatformKind;
  vx: number;
  broken: boolean;
}

export type PulaEvent =
  { type: 'bounce'; kind: PlatformKind } | { type: 'break' } | { type: 'over' };

export class PulaSim {
  x = WIDTH / 2;
  y = 40;
  vy = JUMP_VY;
  /** Best height reached; the camera bottom follows it. */
  top = 0;
  over = false;
  readonly platforms: Platform[] = [];
  private ids = 0;
  private highest = 0;

  constructor(private readonly rng: Rng = Math.random) {
    this.platforms.push({
      id: ++this.ids,
      x: WIDTH / 2,
      y: 0,
      kind: 'normal',
      vx: 0,
      broken: false,
    });
    this.fill(1400);
  }

  get score(): number {
    return Math.floor(this.top / 10);
  }

  /** Visible window: [camera, camera + 1280). */
  get camera(): number {
    return Math.max(0, this.top - 700);
  }

  private fill(upTo: number): void {
    while (this.highest < upTo) {
      const difficulty = Math.min(1, this.highest / 30000);
      const y = this.highest + 70 + this.rng() * (MAX_GAP * (0.45 + difficulty * 0.55) - 70);
      const r = this.rng();
      const kind: PlatformKind =
        r < 0.08 ? 'spring' : r < 0.08 + difficulty * 0.35 + 0.08 ? 'moving' : 'normal';
      const x = 70 + this.rng() * (WIDTH - 140);
      this.platforms.push({
        id: ++this.ids,
        x,
        y,
        kind,
        vx: kind === 'moving' ? (this.rng() < 0.5 ? -1 : 1) * (90 + difficulty * 160) : 0,
        broken: false,
      });
      this.highest = y;
      // Fragile decoys between the real ones (they never are the only way up).
      if (this.rng() < 0.15 + difficulty * 0.25)
        this.platforms.push({
          id: ++this.ids,
          x: 70 + this.rng() * (WIDTH - 140),
          y: y - 30 - this.rng() * 40,
          kind: 'fragile',
          vx: 0,
          broken: false,
        });
    }
  }

  /** `dir`: -1 left, 0 none, 1 right. */
  step(dt: number, dir: number): PulaEvent[] {
    if (this.over) return [];
    const events: PulaEvent[] = [];
    this.x += dir * STEER * dt;
    if (this.x < -KID_HALF) this.x += WIDTH + KID_HALF * 2;
    if (this.x > WIDTH + KID_HALF) this.x -= WIDTH + KID_HALF * 2;

    for (const p of this.platforms) {
      if (p.kind !== 'moving') continue;
      p.x += p.vx * dt;
      if (p.x < PLATFORM_W / 2 || p.x > WIDTH - PLATFORM_W / 2) p.vx *= -1;
    }

    const prevY = this.y;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.vy < 0) {
      // Landing: feet crossed a platform top this step.
      for (const p of this.platforms) {
        if (p.broken || prevY < p.y || this.y > p.y) continue;
        if (Math.abs(this.x - p.x) > PLATFORM_W / 2 + KID_HALF * 0.6) continue;
        if (p.kind === 'fragile') {
          p.broken = true;
          events.push({ type: 'break' });
          continue;
        }
        this.y = p.y;
        this.vy = p.kind === 'spring' ? SPRING_VY : JUMP_VY;
        events.push({ type: 'bounce', kind: p.kind });
        break;
      }
    }
    this.top = Math.max(this.top, this.y);
    this.fill(this.top + 1600);
    const bottom = this.camera - 120;
    for (let i = this.platforms.length - 1; i >= 0; i--)
      if (this.platforms[i]!.y < bottom - 200) this.platforms.splice(i, 1);
    if (this.y < bottom) {
      this.over = true;
      events.push({ type: 'over' });
    }
    return events;
  }
}
