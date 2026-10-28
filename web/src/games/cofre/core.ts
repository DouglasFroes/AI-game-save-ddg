export const HIT_TOLERANCE = 0.22; // ~12.6 deg
export const PERFECT_TOLERANCE = 0.085; // ~4.8 deg

export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((a % twoPi) + twoPi) % twoPi;
}

export function shortestAngleDiff(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, Math.PI * 2 - d);
}

export type CofreTapResult =
  | {
      readonly kind: 'hit';
      readonly perfect: boolean;
      readonly points: number;
      readonly vaultCracked: boolean;
    }
  | { readonly kind: 'miss'; readonly livesLeft: number };

export class CofreSim {
  needleAngle = 0;
  targetAngle = Math.PI * 0.65;
  dir: 1 | -1 = 1;
  vault = 1;
  pinsTotal = 4;
  pinsLeft = 4;
  lives = 3;
  score = 0;
  vaultsCracked = 0;
  streak = 0;
  bestStreak = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.setupVault(1);
  }

  get angularSpeed(): number {
    return Math.min(4.6, 2.0 + (this.vault - 1) * 0.24 + (this.pinsTotal - this.pinsLeft) * 0.08);
  }

  setupVault(v: number): void {
    this.vault = v;
    this.pinsTotal = Math.min(10, 3 + v);
    this.pinsLeft = this.pinsTotal;
    this.dir = 1;
    this.spawnNextTarget();
  }

  private spawnNextTarget(): void {
    const step = 1.25 + this.rng() * 2.2;
    this.targetAngle = normalizeAngle(this.needleAngle + this.dir * step);
  }

  step(dt: number): void {
    if (this.lives <= 0) return;
    this.needleAngle = normalizeAngle(this.needleAngle + this.dir * this.angularSpeed * dt);
  }

  tap(): CofreTapResult {
    const diff = shortestAngleDiff(this.needleAngle, this.targetAngle);
    if (diff <= HIT_TOLERANCE) {
      const perfect = diff <= PERFECT_TOLERANCE;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      this.pinsLeft--;
      this.dir = this.dir === 1 ? -1 : 1;

      const basePts = perfect ? 120 : 60;
      const streakBonus = Math.min(200, (this.streak - 1) * 15);
      let points = basePts + streakBonus;
      const vaultCracked = this.pinsLeft <= 0;

      if (vaultCracked) {
        this.vaultsCracked++;
        points += 300 * this.vault;
        this.setupVault(this.vault + 1);
      } else {
        this.spawnNextTarget();
      }

      this.score += points;
      return { kind: 'hit', perfect, points, vaultCracked };
    }

    this.lives--;
    this.streak = 0;
    return { kind: 'miss', livesLeft: this.lives };
  }
}
