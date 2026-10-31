/**
 * "Binário" — pure rules of Takuzu (binary puzzle). Fill the grid with 0s and 1s so that no
 * three equal digits are adjacent in a line, every row and column has as many 0s as 1s, and no
 * two rows (or two columns) are identical. Puzzles are generated with a unique solution.
 */
export type Cell = 0 | 1 | null;

export const sizeFor = (level: number): number => (level <= 3 ? 6 : 8);

/** Whether placing `v` at (r, c) keeps the partial grid legal. */
export function canPlace(g: readonly Cell[], n: number, r: number, c: number, v: 0 | 1): boolean {
  const at = (rr: number, cc: number) => (rr === r && cc === c ? v : g[rr * n + cc]);
  // No three in a row (horizontally or vertically) through this cell.
  for (let k = -2; k <= 0; k++) {
    if (c + k >= 0 && c + k + 2 < n && [0, 1, 2].every((d) => at(r, c + k + d) === v)) return false;
    if (r + k >= 0 && r + k + 2 < n && [0, 1, 2].every((d) => at(r + k + d, c) === v)) return false;
  }
  // At most n/2 of each digit per line.
  let row = 0;
  let col = 0;
  for (let i = 0; i < n; i++) {
    if (at(r, i) === v) row++;
    if (at(i, c) === v) col++;
  }
  if (row > n / 2 || col > n / 2) return false;
  // A completed line must differ from every other completed line.
  const rowFull = Array.from({ length: n }, (_, i) => at(r, i));
  if (rowFull.every((x) => x !== null)) {
    for (let rr = 0; rr < n; rr++) {
      if (rr === r) continue;
      if (Array.from({ length: n }, (_, i) => at(rr, i)).every((x, i) => x === rowFull[i]))
        return false;
    }
  }
  const colFull = Array.from({ length: n }, (_, i) => at(i, c));
  if (colFull.every((x) => x !== null)) {
    for (let cc = 0; cc < n; cc++) {
      if (cc === c) continue;
      if (Array.from({ length: n }, (_, i) => at(i, cc)).every((x, i) => x === colFull[i]))
        return false;
    }
  }
  return true;
}

/** Counts solutions (stops at `cap`). `order` decides the digit tried first per cell. */
export function solve(
  g: Cell[],
  n: number,
  cap = 2,
  rng?: () => number,
): { count: number; first: Cell[] | null } {
  const grid = [...g];
  let count = 0;
  let first: Cell[] | null = null;
  const empties = grid.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0);
  const step = (k: number): void => {
    if (count >= cap) return;
    if (k === empties.length) {
      count++;
      if (!first) first = [...grid];
      return;
    }
    const i = empties[k]!;
    const r = Math.floor(i / n);
    const c = i % n;
    const vals: Array<0 | 1> = rng && rng() < 0.5 ? [1, 0] : [0, 1];
    for (const v of vals) {
      if (!canPlace(grid, n, r, c, v)) continue;
      grid[i] = v;
      step(k + 1);
      grid[i] = null;
      if (count >= cap) return;
    }
  };
  step(0);
  return { count, first };
}

export interface Puzzle {
  readonly n: number;
  readonly given: readonly Cell[];
  readonly solution: readonly (0 | 1)[];
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const n = sizeFor(level);
  const full = solve(new Array<Cell>(n * n).fill(null), n, 1, rng).first! as (0 | 1)[];
  const given: Cell[] = [...full];
  // Early puzzles keep a few extra clues; later ones are stripped down to a unique minimum.
  const keepExtra = Math.max(0, 6 - level) * 2;
  const order = [...given.keys()].sort(() => rng() - 0.5);
  let removed = 0;
  const maxRemove = n * n - keepExtra;
  for (const i of order) {
    if (removed >= maxRemove) break;
    const v = given[i]!;
    given[i] = null;
    if (solve(given, n, 2).count === 1) removed++;
    else given[i] = v;
  }
  return { n, given, solution: full };
}

export class BinaryBoard {
  cells: Cell[];
  mistakes = 0;

  constructor(readonly puzzle: Puzzle) {
    this.cells = [...puzzle.given];
  }

  locked(i: number): boolean {
    return this.puzzle.given[i] !== null;
  }

  /** Empty → 0 → 1 → empty. */
  cycle(i: number): void {
    if (this.locked(i)) return;
    const v = this.cells[i];
    this.cells[i] = v === null ? 0 : v === 0 ? 1 : null;
  }

  get filled(): number {
    return this.cells.filter((c) => c !== null).length;
  }

  get solved(): boolean {
    return this.cells.every((c, i) => c === this.puzzle.solution[i]);
  }

  /** Cells breaking a rule right now (for red highlights). */
  conflicts(): Set<number> {
    const n = this.puzzle.n;
    const bad = new Set<number>();
    this.cells.forEach((v, i) => {
      if (v === null) return;
      const rest = [...this.cells];
      rest[i] = null;
      if (!canPlace(rest, n, Math.floor(i / n), i % n, v)) bad.add(i);
    });
    return bad;
  }
}

export const boardPoints = (level: number, n: number): number => n * n * 8 + level * 60;
export const timeFor = (n: number): number => (n === 6 ? 60 : 120);
