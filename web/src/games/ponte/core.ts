import type { Rnd } from '@/platform/rnd';

export const MAX_STICK = 640;
const GROW_PER_SEC = 380;
const PERFECT_HALF = 8;

export interface BridgeResult {
  ok: boolean;
  perfect: boolean;
  /** Stick length when released. */
  reach: number;
}

/** "Ponte Certa": hold to grow a stick, release to drop it across the gap. */
export class BridgeSim {
  score = 0;
  perfects = 0;
  /** Width of the platform the hero stands on. */
  curW = 130;
  gap = 0;
  nextW = 0;
  stick = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.roll();
  }

  private roll(): void {
    const w = Math.max(34, 110 - this.score * 3.5);
    this.nextW = Math.round(w + this.rnd() * 40);
    const maxGap = Math.min(430, 190 + this.score * 6);
    this.gap = Math.round(70 + this.rnd() * (maxGap - 70));
  }

  grow(dt: number): void {
    this.stick = Math.min(MAX_STICK, this.stick + GROW_PER_SEC * dt);
  }

  release(): BridgeResult {
    const reach = this.stick;
    const ok = reach >= this.gap && reach <= this.gap + this.nextW;
    const perfect = ok && Math.abs(reach - (this.gap + this.nextW / 2)) <= PERFECT_HALF;
    if (ok) {
      this.score += perfect ? 2 : 1;
      if (perfect) this.perfects++;
    }
    return { ok, perfect, reach };
  }

  /** The hero crossed: the next platform becomes the current one. */
  advance(): void {
    this.curW = this.nextW;
    this.stick = 0;
    this.roll();
  }
}
