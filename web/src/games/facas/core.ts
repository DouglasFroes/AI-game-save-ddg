/**
 * "Lança Facas" — pure rules. A wooden target spins; throw knives at it from below. A knife that
 * lands too close to another one (including the ones already stuck when the stage starts) ends the run.
 */
export const TARGET = { x: 360, y: 500, r: 150 } as const;
/** Smallest angular distance (rad) between two knives. */
export const GAP = 0.32;
const TAU = Math.PI * 2;

export function angDist(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

export type ThrowResult = 'stuck' | 'clear' | 'dead';

export class KnifeSim {
  /** Rotation of the target (rad). */
  angle = 0;
  t = 0;
  stage = 1;
  score = 0;
  alive = true;
  /** Knife angles relative to the target. */
  stuck: number[] = [];
  /** Knives still to throw this stage. */
  left = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.startStage(1);
  }

  startStage(n: number): void {
    this.stage = n;
    this.left = 4 + Math.min(n, 6);
    this.stuck = [];
    const pre = Math.min(n - 1, 5);
    for (let tries = 0; this.stuck.length < pre && tries < 200; tries++) {
      const a = this.rng() * TAU;
      if (this.stuck.every((s) => angDist(s, a) > GAP * 1.6)) this.stuck.push(a);
    }
  }

  /** Angular speed (rad/s): steady at first, then it speeds up and even reverses. */
  omega(): number {
    const base = 1.7 + 0.2 * Math.min(this.stage, 8);
    return this.stage < 3 ? base : base * (0.3 + 1.1 * Math.cos(this.t * 0.8 + this.stage));
  }

  /** Where a knife thrown now would stick, relative to the target (it comes from straight below). */
  entry(): number {
    return (((Math.PI / 2 - this.angle) % TAU) + TAU) % TAU;
  }

  step(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    this.angle += this.omega() * dt;
  }

  /** Throws a knife now. */
  throwKnife(): ThrowResult {
    if (!this.alive) return 'dead';
    const a = this.entry();
    if (this.stuck.some((s) => angDist(s, a) < GAP)) {
      this.alive = false;
      return 'dead';
    }
    this.stuck.push(a);
    this.score++;
    this.left--;
    if (this.left > 0) return 'stuck';
    this.score += 5;
    this.startStage(this.stage + 1);
    return 'clear';
  }

  /** True when a knife thrown now would land clear of every other one. */
  isFree(margin = 0.12): boolean {
    const a = this.entry();
    return this.stuck.every((s) => angDist(s, a) > GAP + margin);
  }
}
