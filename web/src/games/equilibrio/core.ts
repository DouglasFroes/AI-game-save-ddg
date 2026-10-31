/**
 * "Equilíbrio" — pure rules of balancing a stick on a fingertip (an inverted pendulum on a cart).
 * Moving the finger accelerates the base; the stick tips the other way. Gusts of wind push it,
 * and the stick slowly gets shorter (shorter sticks fall faster). Keep it up as long as you can.
 */
export const LIMIT = (75 * Math.PI) / 180;
const G = 9.8;
/** World px per metre. */
const PX = 260;

export type BalanceEvent = { type: 'gust'; dir: number } | { type: 'fell' };

export class BalanceSim {
  /** Base (fingertip) position and velocity, in px. */
  x = 360;
  vx = 0;
  /** Stick angle from vertical (radians, + leans right) and angular velocity. */
  angle = 0.03;
  omega = 0;
  time = 0;
  alive = true;
  wind = 0;
  private gustIn = 4;

  constructor(private readonly rng: () => number = Math.random) {}

  /** Stick length in metres: 1.6 m shrinking to 0.9 m. */
  get length(): number {
    return Math.max(0.9, 1.6 - this.time * 0.01);
  }

  get score(): number {
    return Math.floor(this.time * 10);
  }

  /** `target`: where the finger is; the base follows it like a stiff spring. */
  step(dt: number, target: number): BalanceEvent[] {
    const ev: BalanceEvent[] = [];
    if (!this.alive) return ev;
    this.time += dt;
    this.gustIn -= dt;
    if (this.gustIn <= 0) {
      this.gustIn = Math.max(1.4, 4 - this.time * 0.04) * (0.6 + this.rng() * 0.8);
      const dir = this.rng() < 0.5 ? -1 : 1;
      this.wind = dir * Math.min(2.2, 0.6 + this.time * 0.02);
      ev.push({ type: 'gust', dir });
    }
    this.wind *= Math.exp(-1.6 * dt);

    const prevVx = this.vx;
    const k = 1600;
    const damp = 2 * Math.sqrt(k);
    const ax = k * (target - this.x) - damp * this.vx;
    this.vx += ax * dt;
    this.x += this.vx * dt;
    const a = (this.vx - prevVx) / dt / PX; // base acceleration in m/s²
    const L = this.length;
    // θ'' = (g sinθ − a cosθ) / L, plus wind torque and a little air drag.
    const alpha =
      (G * Math.sin(this.angle) - a * Math.cos(this.angle) + this.wind) / L - 0.6 * this.omega;
    this.omega += alpha * dt;
    this.angle += this.omega * dt;
    if (Math.abs(this.angle) > LIMIT) {
      this.alive = false;
      ev.push({ type: 'fell' });
    }
    return ev;
  }

  /** Top of the stick in screen px (the base sits at `baseY`). */
  tip(baseY: number): { x: number; y: number } {
    const len = this.length * PX * 0.62;
    return { x: this.x + Math.sin(this.angle) * len, y: baseY - Math.cos(this.angle) * len };
  }
}
