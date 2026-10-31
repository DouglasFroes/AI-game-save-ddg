/**
 * "Soma Dez" — pure rules. A grid of digits 1–9: drag a rectangle whose digits add up to exactly
 * 10 and they vanish (one point per digit). Empty cells inside the box count as zero, so cleared
 * space lets far-apart digits pair up. Two minutes on the clock.
 */
export const COLS = 10;
export const ROWS = 15;
export const TIME = 120;

export interface Rect {
  readonly r0: number;
  readonly c0: number;
  readonly r1: number;
  readonly c1: number;
}

export const normRect = (r0: number, c0: number, r1: number, c1: number): Rect => ({
  r0: Math.min(r0, r1),
  c0: Math.min(c0, c1),
  r1: Math.max(r0, r1),
  c1: Math.max(c0, c1),
});

export class SumBoard {
  /** 0 = cleared. */
  cells: number[];
  score = 0;
  clears = 0;
  timeLeft = TIME;

  constructor(rng: () => number = Math.random) {
    this.cells = Array.from({ length: COLS * ROWS }, () => 1 + Math.floor(rng() * 9));
  }

  get over(): boolean {
    return this.timeLeft <= 0;
  }

  at(r: number, c: number): number {
    return this.cells[r * COLS + c]!;
  }

  sum(rect: Rect): number {
    let s = 0;
    for (let r = rect.r0; r <= rect.r1; r++)
      for (let c = rect.c0; c <= rect.c1; c++) s += this.at(r, c);
    return s;
  }

  /** Clears the box if it adds up to 10. Returns how many digits went (0 = not a ten). */
  clear(rect: Rect): number {
    if (this.over || this.sum(rect) !== 10) return 0;
    let n = 0;
    for (let r = rect.r0; r <= rect.r1; r++)
      for (let c = rect.c0; c <= rect.c1; c++) {
        if (this.at(r, c)) n++;
        this.cells[r * COLS + c] = 0;
      }
    this.score += n;
    this.clears++;
    return n;
  }

  tick(dt: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
  }

  /** Whether any box still adds up to 10 (when not, the board is reshuffled by the scene). */
  hasMove(): boolean {
    for (let r0 = 0; r0 < ROWS; r0++)
      for (let c0 = 0; c0 < COLS; c0++)
        for (let r1 = r0; r1 < ROWS; r1++)
          for (let c1 = c0; c1 < COLS; c1++) {
            const s = this.sum({ r0, c0, r1, c1 });
            if (s === 10 && (r1 > r0 || c1 > c0)) return true;
            if (s > 10) break;
          }
    return false;
  }

  /** Refills the cleared cells with new digits (used when no ten is left). */
  refill(rng: () => number = Math.random): void {
    this.cells = this.cells.map((v) => v || 1 + Math.floor(rng() * 9));
  }
}
