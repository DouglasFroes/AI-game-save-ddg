/** Stack rules — pure. A block slides over the tower; tapping drops it and trims the overhang. */

export const WIDTH = 720;
export const START_W = 400;
export const PERFECT_TOLERANCE = 8;
/** After this many perfect drops in a row the block grows back a little. */
export const GROW_STREAK = 3;
export const GROW_AMOUNT = 16;

export interface Layer {
  /** Left edge. */
  readonly x: number;
  readonly w: number;
}

export interface DropResult {
  /** Null when the block missed the tower entirely. */
  readonly placed: Layer | null;
  /** The part that falls off (null on a perfect drop). */
  readonly cut: Layer | null;
  readonly perfect: boolean;
}

export function dropLayer(prev: Layer, cur: Layer): DropResult {
  if (Math.abs(cur.x - prev.x) <= PERFECT_TOLERANCE) {
    return { placed: { x: prev.x, w: Math.min(cur.w, prev.w) }, cut: null, perfect: true };
  }
  const left = Math.max(prev.x, cur.x);
  const right = Math.min(prev.x + prev.w, cur.x + cur.w);
  if (right <= left) return { placed: null, cut: cur, perfect: false };
  const placed = { x: left, w: right - left };
  const cut =
    cur.x < prev.x ? { x: cur.x, w: prev.x - cur.x } : { x: right, w: cur.x + cur.w - right };
  return { placed, cut, perfect: false };
}

export const speedFor = (score: number) => Math.min(820, 260 + score * 11);

export class StackGame {
  readonly layers: Layer[] = [{ x: (WIDTH - START_W) / 2, w: START_W }];
  current: Layer & { dir: 1 | -1 };
  score = 0;
  perfects = 0;
  streak = 0;
  over = false;

  constructor() {
    this.current = this.spawn();
  }

  get top(): Layer {
    return this.layers[this.layers.length - 1]!;
  }

  /** Alternates sides; the block travels across the whole screen. */
  private spawn(): Layer & { dir: 1 | -1 } {
    const fromLeft = this.layers.length % 2 === 1;
    const w = this.top.w;
    return { x: fromLeft ? -w : WIDTH, w, dir: fromLeft ? 1 : -1 };
  }

  step(dt: number): void {
    if (this.over) return;
    const c = this.current;
    let x = c.x + c.dir * speedFor(this.score) * dt;
    let dir = c.dir;
    const min = -c.w * 0.6;
    const max = WIDTH - c.w * 0.4;
    if (x > max) {
      x = max;
      dir = -1;
    } else if (x < min) {
      x = min;
      dir = 1;
    }
    this.current = { x, w: c.w, dir };
  }

  drop(): DropResult {
    const result = dropLayer(this.top, this.current);
    if (!result.placed) {
      this.over = true;
      return result;
    }
    let placed = result.placed;
    if (result.perfect) {
      this.perfects++;
      this.streak++;
      if (this.streak >= GROW_STREAK && placed.w < START_W) {
        const w = Math.min(START_W, placed.w + GROW_AMOUNT);
        placed = { x: Math.max(0, Math.min(WIDTH - w, placed.x - (w - placed.w) / 2)), w };
      }
    } else {
      this.streak = 0;
    }
    this.layers.push(placed);
    this.score++;
    this.current = this.spawn();
    return { ...result, placed };
  }
}
