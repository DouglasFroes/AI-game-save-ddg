/**
 * "Passeio do Cavalo" — pure rules (knight's tour). Visit every square of the board exactly once
 * with a knight. Every level starts on a square that is known to allow a complete tour.
 */
const KR = [-2, -2, -1, -1, 1, 1, 2, 2] as const;
const KC = [-1, 1, -2, 2, -2, 2, -1, 1] as const;

export function sizeFor(level: number): number {
  return Math.min(7, 4 + Math.ceil(level / 2));
}

export function jumps(size: number, i: number): number[] {
  const r = Math.floor(i / size);
  const c = i % size;
  const out: number[] = [];
  for (let k = 0; k < 8; k++) {
    const rr = r + KR[k]!;
    const cc = c + KC[k]!;
    if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
  }
  return out;
}

/** A complete tour from `from` (cells in order), or null. Warnsdorff's rule with backtracking. */
export function tour(size: number, from: number, budget = 200000): number[] | null {
  const seen = Array.from({ length: size * size }, () => false);
  const path: number[] = [];
  let left = budget;
  const go = (i: number): boolean => {
    if (left-- <= 0) return false;
    seen[i] = true;
    path.push(i);
    if (path.length === size * size) return true;
    const next = jumps(size, i)
      .filter((j) => !seen[j])
      .map((j) => ({ j, deg: jumps(size, j).filter((k) => !seen[k]).length }))
      .sort((a, b) => a.deg - b.deg);
    for (const { j } of next) if (go(j)) return true;
    seen[i] = false;
    path.pop();
    return false;
  };
  return go(from) ? path : null;
}

/** A start square that has a complete tour. */
export function generate(
  level: number,
  rng: () => number = Math.random,
): { size: number; start: number } {
  const size = sizeFor(level);
  const order = Array.from({ length: size * size }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  for (const s of order) if (tour(size, s, 20000)) return { size, start: s };
  return { size: 5, start: 0 };
}

/** The path walked so far (first element is the start). */
export type Walk = number[];

export function canJump(size: number, walk: Walk, to: number): boolean {
  const here = walk[walk.length - 1]!;
  return jumps(size, here).includes(to) && !walk.includes(to);
}

export function isSolved(size: number, walk: Walk): boolean {
  return walk.length === size * size;
}

export function isStuck(size: number, walk: Walk): boolean {
  const here = walk[walk.length - 1]!;
  return !isSolved(size, walk) && jumps(size, here).every((j) => walk.includes(j));
}
