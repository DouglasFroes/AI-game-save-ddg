/**
 * "Escudo" — pure rules. A core sits in the middle; shots fly in from every direction. Turn the
 * shield arc to block them: each one that gets through costs a life.
 */
export const CORE = { x: 360, y: 720 } as const;
export const CORE_R = 44;
export const SHIELD_R = 112;
/** Half the shield's angular width (rad). */
export const SHIELD_HALF = 0.7;
const SPAWN_R = 620;
const TAU = Math.PI * 2;

export interface Shot {
  angle: number;
  /** Distance from the core. */
  d: number;
  speed: number;
  /** Already past the shield ring (so it can no longer be blocked). */
  past: boolean;
}

export function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

export class ShieldSim {
  /** Where the shield points now, and where it is turning to. */
  angle = -Math.PI / 2;
  target = -Math.PI / 2;
  shots: Shot[] = [];
  lives = 3;
  blocked = 0;
  combo = 0;
  bestCombo = 0;
  t = 0;
  private spawnIn = 1;

  constructor(private readonly rng: () => number = Math.random) {}

  get alive(): boolean {
    return this.lives > 0;
  }

  get score(): number {
    return this.blocked * 10 + this.bestCombo * 5;
  }

  /** Steps the game; returns the number of shots blocked and of hits taken. */
  step(dt: number): { blocked: number; hits: number } {
    if (!this.alive) return { blocked: 0, hits: 0 };
    this.t += dt;
    // Turn toward the target by the shortest way, at a limited speed.
    let diff = (this.target - this.angle) % TAU;
    if (diff > Math.PI) diff -= TAU;
    if (diff < -Math.PI) diff += TAU;
    const maxTurn = 11 * dt;
    this.angle += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const pace = Math.min(1, this.t / 80);
      const burst = this.rng() < 0.15 + 0.2 * pace ? 2 : 1;
      for (let i = 0; i < burst; i++) {
        this.shots.push({
          angle: this.rng() * TAU,
          d: SPAWN_R,
          speed: 190 + 190 * pace + this.rng() * 40,
          past: false,
        });
      }
      this.spawnIn = 1.1 - 0.65 * pace + this.rng() * 0.25;
    }
    let blocked = 0;
    let hits = 0;
    for (const sh of this.shots) {
      const before = sh.d;
      sh.d -= sh.speed * dt;
      if (!sh.past && before > SHIELD_R && sh.d <= SHIELD_R) {
        if (angDiff(sh.angle, this.angle) <= SHIELD_HALF) {
          blocked++;
          sh.d = -1;
          this.combo++;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
        } else sh.past = true;
      }
      if (sh.d >= 0 && sh.d <= CORE_R) {
        hits++;
        this.lives--;
        this.combo = 0;
        sh.d = -1;
      }
    }
    this.blocked += blocked;
    this.shots = this.shots.filter((s) => s.d >= 0);
    return { blocked, hits };
  }
}

/** Aims at the unblocked shot that will reach the shield ring first. */
export function botAim(s: ShieldSim): void {
  let best: Shot | null = null;
  let bestT = Infinity;
  for (const sh of s.shots) {
    if (sh.past) continue;
    const t = (sh.d - SHIELD_R) / sh.speed;
    if (t < bestT) {
      bestT = t;
      best = sh;
    }
  }
  if (best) s.target = best.angle;
}
