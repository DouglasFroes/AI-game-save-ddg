import type { Rnd } from '@/platform/rnd';

export const COL_W = 20;
export const COLS = 38;
export const PLAYER_X = 190;
export const PLAYER_R = 24;
export const TOP_LIMIT = 130;
export const BOTTOM_LIMIT = 1230;

export interface CaveCol {
  top: number;
  bottom: number;
}

/** "Balão": hold to rise, release to sink, fly through a cave that narrows. */
export class CaveSim {
  y = 680;
  vy = 0;
  holding = false;
  cols: CaveCol[] = [];
  /** Columns scrolled so far. */
  scrolled = 0;
  /** Pixels scrolled inside the current column (0..COL_W). */
  frac = 0;
  time = 0;
  dead = false;
  private center = 680;
  private target = 680;
  private left = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    for (let i = 0; i < COLS + 2; i++) this.cols.push(this.makeCol(true));
  }

  get speed(): number {
    return 260 + Math.min(220, this.time * 4);
  }

  get score(): number {
    return Math.floor((this.scrolled * COL_W) / 60);
  }

  /** Gap height at the current distance. */
  get gap(): number {
    return Math.max(300, 600 - this.scrolled * 0.35);
  }

  step(dt: number): boolean {
    if (this.dead) return false;
    this.time += dt;
    this.vy += (this.holding ? -1500 : 1100) * dt;
    this.vy = Math.max(-430, Math.min(520, this.vy));
    this.y += this.vy * dt;
    this.frac += this.speed * dt;
    while (this.frac >= COL_W) {
      this.frac -= COL_W;
      this.cols.shift();
      this.cols.push(this.makeCol(false));
      this.scrolled++;
    }
    // Check the columns under the balloon.
    const first = Math.floor((PLAYER_X - PLAYER_R + this.frac) / COL_W);
    const last = Math.floor((PLAYER_X + PLAYER_R + this.frac) / COL_W);
    let hit = this.y - PLAYER_R < TOP_LIMIT || this.y + PLAYER_R > BOTTOM_LIMIT;
    for (let i = first; i <= last && !hit; i++) {
      const c = this.cols[i];
      if (c && (this.y - PLAYER_R < c.top || this.y + PLAYER_R > c.bottom)) hit = true;
    }
    if (hit) this.dead = true;
    return hit;
  }

  private makeCol(initial: boolean): CaveCol {
    const gap = initial ? 620 : this.gap;
    if (this.left-- <= 0) {
      this.left = 8 + Math.floor(this.rnd() * 14);
      const lo = TOP_LIMIT + gap / 2 + 20;
      const hi = BOTTOM_LIMIT - gap / 2 - 20;
      this.target = initial ? 680 : lo + this.rnd() * (hi - lo);
    }
    // Slope-limited drift toward the target keeps every turn flyable.
    const maxStep = 5 + Math.min(4, this.scrolled * 0.01);
    this.center += Math.max(-maxStep, Math.min(maxStep, this.target - this.center));
    return { top: this.center - gap / 2, bottom: this.center + gap / 2 };
  }
}
