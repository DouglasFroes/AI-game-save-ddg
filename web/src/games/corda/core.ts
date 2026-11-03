/**
 * "Pular Corda" — pure rules. The rope spins; jump so you are in the air when it sweeps the
 * ground. Every few turns the rope changes speed. How many can you clear?
 */
const TAU = Math.PI * 2;
const GRAVITY = 3000;
const JUMP_V = 900;
/** Height (px) above which the rope passes under the jumper. */
export const CLEAR = 26;
export const AIR_TIME = (2 * JUMP_V) / GRAVITY;

export class RopeSim {
  /** Rope angle: 0 is the instant it sweeps the ground, then it goes round to TAU. */
  theta = 0;
  /** Seconds per turn for the current turn. */
  period = 1.3;
  y = 0;
  vy = 0;
  jumps = 0;
  alive = true;
  t = 0;
  /** Set for one step when the rope has just passed under the jumper. */
  passed = false;
  private turns = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.theta = 0.0001;
  }

  get score(): number {
    return this.jumps;
  }

  get grounded(): boolean {
    return this.y <= 0 && this.vy <= 0;
  }

  /** Seconds until the rope sweeps the ground again. */
  untilSweep(): number {
    return ((TAU - this.theta) / TAU) * this.period;
  }

  jump(): boolean {
    if (!this.alive || !this.grounded) return false;
    this.vy = JUMP_V;
    return true;
  }

  private nextPeriod(): void {
    this.turns++;
    const hard = Math.min(1, this.jumps / 60);
    const fastest = 1.1 - 0.3 * hard;
    const slowest = 1.45 - 0.2 * hard;
    // Mostly steady, with now and then a sudden change.
    this.period = this.turns % 4 === 0 ? fastest + this.rng() * (slowest - fastest) : this.period;
    this.period = Math.min(slowest, Math.max(fastest, this.period - 0.012));
  }

  step(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    this.passed = false;
    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    this.theta += (TAU / this.period) * dt;
    if (this.theta >= TAU) {
      this.theta -= TAU;
      if (this.y > CLEAR) {
        this.jumps++;
        this.passed = true;
        this.nextPeriod();
      } else this.alive = false;
    }
  }
}

/** Jumps so that the middle of the air time lands on the sweep. */
export function botAct(s: RopeSim): void {
  if (s.grounded && s.untilSweep() < AIR_TIME * 0.5 + 0.02) s.jump();
}
