/** "Skeet": 25 clay pigeons fly out one after another; tap them before they fall. */
import type { Rnd } from '@/platform/rnd';

export const CLAYS = 25;
export const HIT_R = 78;
export const FIELD_W = 720;
export const GROUND = 1000;

export interface Clay {
  readonly id: number;
  /** Seconds since launch. */
  age: number;
  readonly x0: number;
  readonly y0: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
  state: 'flying' | 'hit' | 'missed';
}

export const GRAVITY = 520;
export const clayPos = (c: Clay, age = c.age) => ({
  x: c.x0 + c.vx * age,
  y: c.y0 + c.vy * age + 0.5 * GRAVITY * age * age,
});

export class SkeetSim {
  readonly clays: Clay[] = [];
  launched = 0;
  hits = 0;
  shots = 0;
  streak = 0;
  bestStreak = 0;
  score = 0;
  private timer = 0.8;
  private ids = 0;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get done(): boolean {
    return this.launched >= CLAYS && this.clays.every((c) => c.state !== 'flying');
  }

  /** The clays speed up a little with each launch. */
  private get speedUp(): number {
    return 1 + this.launched * 0.018;
  }

  step(dt: number): Clay[] {
    const lost: Clay[] = [];
    this.timer -= dt;
    if (this.timer <= 0 && this.launched < CLAYS) {
      this.launch();
      this.timer = Math.max(0.65, 1.25 - this.launched * 0.02) + this.rnd() * 0.35;
    }
    for (const c of this.clays) {
      if (c.state !== 'flying') continue;
      c.age += dt;
      const p = clayPos(c);
      if (c.age >= c.life || p.y > GROUND || p.x < -80 || p.x > FIELD_W + 80) {
        c.state = 'missed';
        this.streak = 0;
        lost.push(c);
      }
    }
    return lost;
  }

  private launch(): void {
    const fromLeft = this.launched % 2 === 0 ? this.rnd() < 0.7 : this.rnd() < 0.3;
    const sp = this.speedUp;
    const vx = (240 + this.rnd() * 200) * sp * (fromLeft ? 1 : -1);
    const vy = -(620 + this.rnd() * 260) * Math.min(1.25, sp);
    this.clays.push({
      id: ++this.ids,
      age: 0,
      x0: fromLeft ? -30 : FIELD_W + 30,
      y0: 760 + this.rnd() * 160,
      vx,
      vy,
      life: 2.4,
      state: 'flying',
    });
    this.launched++;
  }

  /** A shot at (x, y): hits the closest flying clay within reach. */
  tap(x: number, y: number): Clay | null {
    this.shots++;
    let best: Clay | null = null;
    let bestD = HIT_R;
    for (const c of this.clays) {
      if (c.state !== 'flying') continue;
      const p = clayPos(c);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (!best) {
      this.streak = 0;
      return null;
    }
    best.state = 'hit';
    this.hits++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += 100 + Math.max(0, this.streak - 2) * 25;
    return best;
  }
}
