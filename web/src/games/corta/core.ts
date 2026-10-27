import type { Rnd } from '@/platform/rnd';

export const FIELD_W = 720;
export const FIELD_H = 1280;
const GRAVITY = 1500;

export interface Flyer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: 'fruit' | 'bomb';
  variant: number;
}

/** Distance from point p to the segment a–b. */
export function segDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export interface SliceResult {
  fruits: Flyer[];
  bombs: Flyer[];
}

/** "Corta Frutas": slice the flying fruit, never the bombs; 3 missed fruits end the run. */
export class SliceSim {
  items: Flyer[] = [];
  lives = 3;
  score = 0;
  sliced = 0;
  bestCombo = 0;
  exploded = false;
  time = 0;
  private waveIn = 0.5;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get dead(): boolean {
    return this.exploded || this.lives <= 0;
  }

  /** Cuts everything touching the segment. A swipe through 3+ fruits scores a bonus. */
  slice(ax: number, ay: number, bx: number, by: number): SliceResult {
    const res: SliceResult = { fruits: [], bombs: [] };
    if (this.dead) return res;
    for (const it of this.items) {
      if (segDistance(ax, ay, bx, by, it.x, it.y) > it.r) continue;
      (it.kind === 'fruit' ? res.fruits : res.bombs).push(it);
    }
    const cut = new Set<Flyer>([...res.fruits, ...res.bombs]);
    this.items = this.items.filter((it) => !cut.has(it));
    if (res.bombs.length) this.exploded = true;
    this.score += res.fruits.length;
    this.sliced += res.fruits.length;
    if (res.fruits.length >= 3) this.score += res.fruits.length;
    this.bestCombo = Math.max(this.bestCombo, res.fruits.length);
    return res;
  }

  /** Returns the fruits that fell off the bottom this step. */
  step(dt: number): Flyer[] {
    const missed: Flyer[] = [];
    if (this.dead) return missed;
    this.time += dt;
    this.waveIn -= dt;
    if (this.waveIn <= 0) {
      this.launchWave();
      this.waveIn = Math.max(0.9, 1.9 - this.time * 0.02);
    }
    for (const it of this.items) {
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
    }
    this.items = this.items.filter((it) => {
      if (it.y > FIELD_H + 90 && it.vy > 0) {
        if (it.kind === 'fruit') {
          this.lives--;
          missed.push(it);
        }
        return false;
      }
      return true;
    });
    return missed;
  }

  private launchWave(): void {
    const count = 1 + Math.floor(this.rnd() * Math.min(4, 1 + this.time / 18));
    for (let i = 0; i < count; i++) {
      const x = 110 + this.rnd() * (FIELD_W - 220);
      const bomb = this.rnd() < Math.min(0.28, 0.1 + this.time * 0.003);
      this.items.push({
        x,
        y: FIELD_H + 60,
        vx: (FIELD_W / 2 - x) * (0.25 + this.rnd() * 0.5),
        vy: -(1620 + this.rnd() * 260),
        r: 62,
        kind: bomb ? 'bomb' : 'fruit',
        variant: Math.floor(this.rnd() * 6),
      });
    }
  }
}
