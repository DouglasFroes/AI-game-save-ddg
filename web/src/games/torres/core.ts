/**
 * "Torres" (Skyscrapers) — pure rules. Fill the grid with building heights 1..n, none repeated in
 * any row or column. The numbers outside say how many buildings you can see from that side: taller
 * ones hide the shorter ones behind them. Puzzles come from a random Latin square.
 */
export interface Puzzle {
  n: number;
  solution: number[][];
  /** Visible-count clues per side and line; 0 means the clue is hidden. */
  top: number[];
  bottom: number[];
  left: number[];
  right: number[];
}
export type Grid = number[][];

export const sizeFor = (level: number): number => Math.min(6, 3 + Math.ceil(level / 2));

/** How many buildings are visible along a line, looking from its start. */
export function visible(line: readonly number[]): number {
  let max = 0;
  let seen = 0;
  for (const v of line) {
    if (v > max) {
      max = v;
      seen++;
    }
  }
  return seen;
}

function shuffled(n: number, rng: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const n = sizeFor(level);
  const rows = shuffled(n, rng);
  const cols = shuffled(n, rng);
  const sym = shuffled(n, rng);
  const solution = rows.map((r) => cols.map((c) => sym[(r + c) % n]! + 1));
  const hide = Math.min(0.5, 0.05 + level * 0.06);
  const clue = (line: number[]) => (rng() < hide ? 0 : visible(line));
  const col = (c: number) => solution.map((row) => row[c]!);
  return {
    n,
    solution,
    left: solution.map((r) => clue(r)),
    right: solution.map((r) => clue([...r].reverse())),
    top: Array.from({ length: n }, (_, c) => clue(col(c))),
    bottom: Array.from({ length: n }, (_, c) => clue(col(c).reverse())),
  };
}

export const newGrid = (n: number): Grid =>
  Array.from({ length: n }, () => Array<number>(n).fill(0));

/** Cells that repeat a height in their row or column. */
export function duplicates(g: Grid): Set<number> {
  const n = g.length;
  const bad = new Set<number>();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = g[r]![c]!;
      if (!v) continue;
      for (let k = 0; k < n; k++) {
        if (k !== c && g[r]![k] === v) bad.add(r * n + c);
        if (k !== r && g[k]![c] === v) bad.add(r * n + c);
      }
    }
  }
  return bad;
}

/** Clues ("t0", "b2", "l1", "r3") whose line is full but shows the wrong count. */
export function badClues(p: Puzzle, g: Grid): Set<string> {
  const bad = new Set<string>();
  const full = (line: number[]) => line.every((v) => v > 0);
  for (let i = 0; i < p.n; i++) {
    const row = g[i]!;
    const col = g.map((r) => r[i]!);
    if (full(row)) {
      if (p.left[i] && visible(row) !== p.left[i]) bad.add(`l${i}`);
      if (p.right[i] && visible([...row].reverse()) !== p.right[i]) bad.add(`r${i}`);
    }
    if (full(col)) {
      if (p.top[i] && visible(col) !== p.top[i]) bad.add(`t${i}`);
      if (p.bottom[i] && visible([...col].reverse()) !== p.bottom[i]) bad.add(`b${i}`);
    }
  }
  return bad;
}

export function isSolved(p: Puzzle, g: Grid): boolean {
  return (
    g.every((r) => r.every((v) => v > 0)) && duplicates(g).size === 0 && badClues(p, g).size === 0
  );
}
