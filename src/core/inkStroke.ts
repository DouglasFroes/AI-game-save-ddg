import { distance, lerp, polylineLength, type Vec } from './geometry';

/** Returns true when the segment from→to may NOT be drawn (crosses terrain, the dog, a hive…). */
export type SegmentGuard = (from: Vec, to: Vec) => boolean;

export type ExtendResult = 'added' | 'too-close' | 'blocked' | 'exhausted';

/**
 * The player's single stroke, limited by an ink budget (in world pixels).
 * Pure state: rendering and physics live in the game layer.
 */
export class InkStroke {
  private readonly pts: Vec[] = [];
  private usedInk = 0;

  constructor(
    readonly maxInk: number,
    private readonly minSpacing = 10,
  ) {}

  get points(): readonly Vec[] {
    return this.pts;
  }

  get used(): number {
    return this.usedInk;
  }

  get remaining(): number {
    return Math.max(0, this.maxInk - this.usedInk);
  }

  /** Fraction of the budget already spent, 0..1. */
  get ratio(): number {
    return this.maxInk > 0 ? Math.min(1, this.usedInk / this.maxInk) : 1;
  }

  /** A stroke needs at least one segment to become a physical barrier. */
  get isDrawable(): boolean {
    return this.pts.length >= 2 && this.usedInk >= this.minSpacing;
  }

  start(p: Vec, guard?: SegmentGuard): boolean {
    if (this.pts.length > 0) return false;
    if (guard?.(p, p)) return false;
    this.pts.push(p);
    return true;
  }

  extend(p: Vec, guard?: SegmentGuard): ExtendResult {
    const last = this.pts[this.pts.length - 1];
    if (!last) return this.start(p, guard) ? 'added' : 'blocked';
    if (this.remaining <= 0) return 'exhausted';

    const d = distance(last, p);
    if (d < this.minSpacing) return 'too-close';

    const target = d > this.remaining ? lerp(last, p, this.remaining / d) : p;
    if (guard?.(last, target)) return 'blocked';

    this.pts.push(target);
    this.usedInk = polylineLength(this.pts);
    return this.remaining <= 0 ? 'exhausted' : 'added';
  }

  clear(): void {
    this.pts.length = 0;
    this.usedInk = 0;
  }
}
