/**
 * "Balança" — pure rules. Put every weight on one of the two pans so both sides weigh the same.
 * Levels are built from two pans that already balance, then shuffled.
 */
export type Side = -1 | 0 | 1; // -1 left pan, 1 right pan, 0 still on the table

export interface Puzzle {
  weights: number[];
  /** One valid split, for hints and tests. */
  solution: Side[];
}

export function countFor(level: number): number {
  return Math.min(10, 4 + Math.floor(level / 2));
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const n = countFor(level);
  const max = Math.min(40, 8 + level * 3);
  const weights: number[] = [];
  const solution: Side[] = [];
  let diff = 0;
  for (let i = 0; i < n - 1; i++) {
    const w = 1 + Math.floor(rng() * max);
    const side: Side = diff > 0 ? -1 : diff < 0 ? 1 : rng() < 0.5 ? -1 : 1;
    weights.push(w);
    solution.push(side);
    diff += side * w;
  }
  // The last weight cancels what is left, so a perfect split exists.
  if (diff === 0) {
    weights.push(1);
    solution.push(-1);
    weights.push(1);
    solution.push(1);
  } else {
    weights.push(Math.abs(diff));
    solution.push(diff > 0 ? -1 : 1);
  }
  // Shuffle weights and the matching solution together.
  const idx = weights.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return { weights: idx.map((i) => weights[i]!), solution: idx.map((i) => solution[i]!) };
}

export function newSides(p: Puzzle): Side[] {
  return p.weights.map(() => 0 as Side);
}

export function total(p: Puzzle, sides: readonly Side[], pan: -1 | 1): number {
  return p.weights.reduce((a, w, i) => a + (sides[i] === pan ? w : 0), 0);
}

/** Cycles a weight: table → left → right → table. */
export function cycle(sides: readonly Side[], i: number): Side[] {
  const next = sides.slice();
  next[i] = next[i] === 0 ? -1 : next[i] === -1 ? 1 : 0;
  return next;
}

export function isSolved(p: Puzzle, sides: readonly Side[]): boolean {
  return sides.every((s) => s !== 0) && total(p, sides, -1) === total(p, sides, 1);
}
