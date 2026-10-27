/** Flappy Bee simulation — pure, deterministic with an injected RNG. Units: px and seconds. */

export type Rng = () => number;

export const WORLD_W = 720;
export const GROUND_Y = 1130;
export const CEILING_Y = 150;
export const BEE_X = 220;
export const BEE_R = 24;
export const GRAVITY = 2300;
export const FLAP_VELOCITY = -740;
export const MAX_FALL = 1100;
export const PIPE_W = 124;
export const PIPE_SPACING = 380;

export interface Pipe {
  readonly id: number;
  x: number;
  readonly gapY: number;
  readonly gapH: number;
  passed: boolean;
}

export type FlappyEvent = 'flap' | 'score' | 'hit' | 'ground';

/** Speed and gap get harder with the score, up to a cap. */
export const speedFor = (score: number) => Math.min(380, 250 + score * 4);
export const gapFor = (score: number) => Math.max(250, 330 - score * 3);

export function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const nx = Math.max(x, Math.min(cx, x + w));
  const ny = Math.max(y, Math.min(cy, y + h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

export class FlappySim {
  y = 600;
  vy = 0;
  score = 0;
  started = false;
  dead = false;
  grounded = false;
  readonly pipes: Pipe[] = [];
  private ids = 0;
  private time = 0;

  constructor(private readonly rng: Rng = Math.random) {}

  flap(): FlappyEvent[] {
    if (this.dead) return [];
    this.started = true;
    this.vy = FLAP_VELOCITY;
    return ['flap'];
  }

  /** Bee tilt in degrees, for rendering. */
  get angle(): number {
    return Math.max(-25, Math.min(80, this.vy / 12));
  }

  step(dt: number): FlappyEvent[] {
    this.time += dt;
    if (!this.started) {
      this.y = 600 + Math.sin(this.time * 4) * 14;
      return [];
    }
    if (this.grounded) return [];
    const events: FlappyEvent[] = [];

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    this.y += this.vy * dt;
    if (this.y - BEE_R < CEILING_Y) {
      this.y = CEILING_Y + BEE_R;
      this.vy = 0;
    }
    if (this.y + BEE_R >= GROUND_Y) {
      this.y = GROUND_Y - BEE_R;
      this.grounded = true;
      if (!this.dead) events.push('hit');
      this.dead = true;
      events.push('ground');
      return events;
    }
    if (this.dead) return events;

    const speed = speedFor(this.score);
    for (const p of this.pipes) p.x -= speed * dt;
    while (this.pipes.length && this.pipes[0]!.x < -PIPE_W) this.pipes.shift();
    const last = this.pipes[this.pipes.length - 1];
    if (!last || last.x < WORLD_W - PIPE_SPACING)
      this.spawnPipe(last ? last.x + PIPE_SPACING : WORLD_W + 120);

    for (const p of this.pipes) {
      if (!p.passed && p.x + PIPE_W / 2 < BEE_X) {
        p.passed = true;
        this.score++;
        events.push('score');
      }
      const left = p.x - PIPE_W / 2;
      const top = p.gapY - p.gapH / 2;
      const bottom = p.gapY + p.gapH / 2;
      if (
        circleHitsRect(BEE_X, this.y, BEE_R - 3, left, 0, PIPE_W, top) ||
        circleHitsRect(BEE_X, this.y, BEE_R - 3, left, bottom, PIPE_W, GROUND_Y - bottom)
      ) {
        this.dead = true;
        this.vy = Math.max(this.vy, 200);
        events.push('hit');
        break;
      }
    }
    return events;
  }

  private spawnPipe(x: number): void {
    const gapH = gapFor(this.score);
    const min = CEILING_Y + 90 + gapH / 2;
    const max = GROUND_Y - 110 - gapH / 2;
    this.pipes.push({
      id: ++this.ids,
      x,
      gapY: min + this.rng() * (max - min),
      gapH,
      passed: false,
    });
  }
}
