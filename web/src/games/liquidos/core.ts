import type { Rnd } from '@/platform/rnd';

export const TUBE_CAPACITY = 4;

export type LiquidosEvent =
  | { type: 'select'; index: number }
  | { type: 'deselect' }
  | { type: 'invalid'; from: number; to: number }
  | { type: 'pour'; from: number; to: number; color: number; count: number; tubeCompleted: boolean }
  | { type: 'levelClear'; level: number; bonus: number };

/** Returns the top color and how many contiguous units of it sit at the top of a tube. */
export function topGroup(tube: readonly number[]): { color: number; count: number } | null {
  if (tube.length === 0) return null;
  const color = tube[tube.length - 1]!;
  let count = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === color; i--) count++;
  return { color, count };
}

/** A tube is complete when it has 4 units of the same color. */
export function isTubeComplete(tube: readonly number[]): boolean {
  if (tube.length !== TUBE_CAPACITY) return false;
  const first = tube[0]!;
  return tube.every((c) => c === first);
}

/** A level is solved when every tube is either empty or complete. */
export function isLevelSolved(tubes: ReadonlyArray<readonly number[]>): boolean {
  return tubes.every((t) => t.length === 0 || isTubeComplete(t));
}

/** How many units can be poured from `src` into `dst` (0 when the move is illegal). */
export function pourableCount(src: readonly number[], dst: readonly number[]): number {
  if (src.length === 0 || dst.length >= TUBE_CAPACITY) return 0;
  const top = topGroup(src)!;
  if (dst.length > 0 && dst[dst.length - 1] !== top.color) return 0;
  return Math.min(top.count, TUBE_CAPACITY - dst.length);
}

/**
 * Generates a solvable tube configuration for `level` (1-based).
 * Always includes 2 empty helper tubes so every puzzle is guaranteed solvable.
 */
export function generateTubes(level: number, rnd: Rnd = Math.random): number[][] {
  const numColors = Math.min(9, 3 + Math.floor((level - 1) / 2));
  const emptyTubes = 2;
  const pool: number[] = [];
  for (let c = 0; c < numColors; c++) {
    for (let k = 0; k < TUBE_CAPACITY; k++) pool.push(c);
  }
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }

  const tubes: number[][] = [];
  for (let t = 0; t < numColors; t++) {
    tubes.push(pool.slice(t * TUBE_CAPACITY, (t + 1) * TUBE_CAPACITY));
  }
  // Ensure no tube starts already solved
  if (tubes.some((t) => isTubeComplete(t)) && numColors >= 2) {
    const a = tubes[0]!;
    const b = tubes[1]!;
    const tmp = a[TUBE_CAPACITY - 1]!;
    a[TUBE_CAPACITY - 1] = b[0]!;
    b[0] = tmp;
  }
  for (let e = 0; e < emptyTubes; e++) tubes.push([]);
  return tubes;
}

/** "Líquidos Mágicos": addictive water-sort puzzle with endless levels, undo, and extra tube helper. */
export class LiquidosSim {
  level = 1;
  score = 0;
  moves = 0;
  tubes: number[][] = [];
  selected: number | null = null;
  extraUsed = false;
  private history: number[][][] = [];

  constructor(private readonly rnd: Rnd = Math.random) {
    this.startLevel(1);
  }

  startLevel(lvl: number): void {
    this.level = lvl;
    this.tubes = generateTubes(lvl, this.rnd);
    this.selected = null;
    this.extraUsed = false;
    this.history = [];
  }

  tapTube(index: number): LiquidosEvent[] {
    if (index < 0 || index >= this.tubes.length) return [];
    const events: LiquidosEvent[] = [];

    if (this.selected === null) {
      const tube = this.tubes[index]!;
      if (tube.length === 0 || isTubeComplete(tube)) return [];
      this.selected = index;
      events.push({ type: 'select', index });
      return events;
    }

    if (this.selected === index) {
      this.selected = null;
      events.push({ type: 'deselect' });
      return events;
    }

    const from = this.selected;
    const src = this.tubes[from]!;
    const dst = this.tubes[index]!;
    const count = pourableCount(src, dst);

    if (count === 0) {
      // If tapping another non-empty tube, switch selection immediately for fast play
      if (dst.length > 0 && !isTubeComplete(dst)) {
        this.selected = index;
        events.push({ type: 'select', index });
      } else {
        this.selected = null;
        events.push({ type: 'invalid', from, to: index });
      }
      return events;
    }

    // Save snapshot for undo
    this.history.push(this.tubes.map((t) => [...t]));
    if (this.history.length > 25) this.history.shift();

    const color = src[src.length - 1]!;
    for (let i = 0; i < count; i++) {
      dst.push(src.pop()!);
    }
    this.selected = null;
    this.moves++;
    const completed = isTubeComplete(dst);
    this.score += count * 10 + (completed ? 50 : 0);
    events.push({
      type: 'pour',
      from,
      to: index,
      color,
      count,
      tubeCompleted: completed,
    });

    if (isLevelSolved(this.tubes)) {
      const bonus = 100 + this.level * 25;
      this.score += bonus;
      events.push({ type: 'levelClear', level: this.level, bonus });
    }

    return events;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.tubes = prev;
    this.selected = null;
    return true;
  }

  /** Adds one extra empty helper tube (up to once per level) so the player never gets stuck. */
  addExtraTube(): boolean {
    if (this.extraUsed) return false;
    this.extraUsed = true;
    this.tubes.push([]);
    this.selected = null;
    return true;
  }
}
