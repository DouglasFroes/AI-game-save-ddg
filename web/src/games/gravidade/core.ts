/**
 * "Gravidade" — pure rules. A runner races through a tunnel; tap to flip gravity and fall to the
 * opposite wall. Spikes grow from the floor and the ceiling and the run gets faster, so every flip
 * has to be timed: flip too late (or while still flying) and the spike gets you.
 */
export const RUNNER_X = 190;
export const RADIUS = 34;
export const CEIL = 340;
export const FLOOR = 1060;
export const SPIKE_W = 84;
export const SPIKE_H = 190;
/** Flight speed between the walls (px/s). */
const FLIP_SPEED = 2300;

export interface Spike {
  /** Centre x. */
  x: number;
  /** -1 grows from the ceiling, +1 from the floor. */
  side: -1 | 1;
  passed: boolean;
}

export class GravitySim {
  t = 0;
  score = 0;
  alive = true;
  /** Wall the runner is heading to / standing on (+1 floor, -1 ceiling). */
  side: -1 | 1 = 1;
  y = FLOOR - RADIUS;
  spikes: Spike[] = [];
  /** A tap that arrived mid-flight, applied on landing. */
  private queued = false;
  private nextSpike = 900;

  constructor(private readonly rng: () => number = Math.random) {}

  /** Scroll speed (px/s): ramps up with time. */
  speed(): number {
    return Math.min(820, 430 + this.t * 9);
  }

  private get restY(): number {
    return this.side === 1 ? FLOOR - RADIUS : CEIL + RADIUS;
  }

  /** True when the runner is touching a wall and can flip. */
  grounded(): boolean {
    return Math.abs(this.y - this.restY) < 1;
  }

  flip(): void {
    if (!this.alive) return;
    if (!this.grounded()) {
      this.queued = true;
      return;
    }
    this.side = this.side === 1 ? -1 : 1;
  }

  step(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    const sp = this.speed();
    const goal = this.restY;
    const dy = goal - this.y;
    const move = FLIP_SPEED * dt;
    this.y = Math.abs(dy) <= move ? goal : this.y + Math.sign(dy) * move;
    if (this.grounded() && this.queued) {
      this.queued = false;
      this.side = this.side === 1 ? -1 : 1;
    }
    for (const s of this.spikes) s.x -= sp * dt;
    this.nextSpike -= sp * dt;
    if (this.nextSpike <= 0) {
      const last = this.spikes.at(-1);
      // Alternate walls more often than not so the runner is always flipping; a repeat is allowed.
      const side: -1 | 1 = last && this.rng() < 0.7 ? ((-last.side) as -1 | 1) : this.rng() < 0.5 ? -1 : 1;
      this.spikes.push({ x: 800, side, passed: false });
      // Time between spikes: at least 0.75 s so a flip always fits, sometimes tight.
      this.nextSpike = sp * (0.75 + this.rng() * 0.55);
    }
    for (const s of this.spikes) {
      if (!s.passed && s.x + SPIKE_W / 2 < RUNNER_X - RADIUS) {
        s.passed = true;
        this.score++;
      }
      if (this.hits(s)) this.alive = false;
    }
    this.spikes = this.spikes.filter((s) => s.x > -SPIKE_W);
  }

  private hits(s: Spike): boolean {
    // A forgiving hitbox: a slightly smaller circle against the spike's rectangle.
    const r = RADIUS - 6;
    const left = s.x - SPIKE_W / 2 + 8;
    const right = s.x + SPIKE_W / 2 - 8;
    const top = s.side === -1 ? CEIL : FLOOR - SPIKE_H;
    const bottom = s.side === -1 ? CEIL + SPIKE_H : FLOOR;
    const cx = Math.max(left, Math.min(RUNNER_X, right));
    const cy = Math.max(top, Math.min(this.y, bottom));
    return Math.hypot(RUNNER_X - cx, this.y - cy) < r;
  }

  /** Bot policy: flip when the next spike on this wall is about to arrive. */
  botAct(): void {
    const lookahead = this.speed() * 0.34 + SPIKE_W;
    const danger = this.spikes.some(
      (s) => s.side === this.side && s.x > RUNNER_X - SPIKE_W && s.x - RUNNER_X < lookahead,
    );
    if (danger && this.grounded()) this.flip();
  }
}
