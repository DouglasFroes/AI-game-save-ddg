/** "Tiro com Arco": the sight sways, the wind pushes; tap to loose each of ten arrows. */
import type { Rnd } from '@/platform/rnd';

export const ARROWS = 10;
/** Rings are 0.1 of the target radius wide: ring 10 in the middle, 1 at the edge. */
export const RING_W = 0.1;

export const ringOf = (dist: number): number => (dist >= 1 ? 0 : 10 - Math.floor(dist / RING_W));

export interface Shot {
  /** Where it landed, in target radii from the centre. */
  readonly x: number;
  readonly y: number;
  readonly ring: number;
}

export class ArcherySim {
  /** Seconds the sight has been swaying. */
  t = 0;
  shots: Shot[] = [];
  /** Wind (target radii of drift): negative pushes left. */
  wind = 0;
  private readonly phase: number;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.phase = rnd() * Math.PI * 2;
    this.newWind();
  }

  get done(): boolean {
    return this.shots.length >= ARROWS;
  }

  get score(): number {
    const tens = this.shots.filter((s) => s.ring === 10).length;
    return this.shots.reduce((n, s) => n + s.ring * 10, 0) + tens * 5;
  }

  /** The sweep of the sight grows as the arrows go. */
  get sway(): number {
    return 0.55 + this.shots.length * 0.035;
  }

  /** Where the sight points right now (target radii from the centre). */
  aim(t = this.t): { x: number; y: number } {
    const k = 1 + this.shots.length * 0.06;
    return {
      x: this.sway * Math.sin(t * 1.35 * k + this.phase),
      y: this.sway * 0.8 * Math.sin(t * 1.9 * k + this.phase * 1.7),
    };
  }

  step(dt: number): void {
    if (!this.done) this.t += dt;
  }

  /** Looses an arrow: it lands where the sight was, pushed by the wind. */
  shoot(): Shot | null {
    if (this.done) return null;
    const a = this.aim();
    const x = a.x + this.wind;
    const y = a.y + Math.abs(this.wind) * 0.15;
    const shot = { x, y, ring: ringOf(Math.hypot(x, y)) };
    this.shots.push(shot);
    this.newWind();
    return shot;
  }

  private newWind(): void {
    const strength = Math.min(0.28, 0.06 + this.shots.length * 0.025);
    this.wind = Math.round((this.rnd() * 2 - 1) * strength * 100) / 100;
  }
}
