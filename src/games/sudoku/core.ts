/** Sudoku generator, solver and scoring — pure, no Phaser. Grids are 81 numbers, 0 = empty. */

export type Grid = number[];
export type Rng = () => number;
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface DifficultyDef {
  readonly label: string;
  /** Numeric id stored in the ranking (1..4). */
  readonly level: number;
  /** How many cells to empty (fewer may remain if uniqueness would break). */
  readonly holes: number;
  readonly basePoints: number;
  /** Mistakes allowed before the game is lost. */
  readonly lives: number;
  /** Whether the hint button is available. */
  readonly hints: boolean;
}

export const DIFFICULTIES: Readonly<Record<Difficulty, DifficultyDef>> = {
  easy: { label: 'Fácil', level: 1, holes: 38, basePoints: 3000, lives: 3, hints: true },
  medium: { label: 'Médio', level: 2, holes: 47, basePoints: 6000, lives: 3, hints: true },
  hard: { label: 'Difícil', level: 3, holes: 54, basePoints: 10000, lives: 3, hints: true },
  // One life, no hints: the first mistake ends the run.
  expert: { label: 'Extremo', level: 4, holes: 58, basePoints: 16000, lives: 1, hints: false },
};
export const HINT_PENALTY = 400;
export const MISTAKE_PENALTY = 300;

export const row = (i: number) => Math.floor(i / 9);
export const col = (i: number) => i % 9;
export const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

/** Indexes sharing a row, column or box with i (excluding i). */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: 81 }, (_, i) =>
  Array.from({ length: 81 }, (_, j) => j).filter(
    (j) => j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i)),
  ),
);

export function candidates(grid: readonly number[], i: number): number[] {
  const used = new Set<number>();
  for (const j of PEERS[i]!) if (grid[j]) used.add(grid[j]!);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n));
}

export const isValidPlacement = (grid: readonly number[], i: number, n: number): boolean =>
  PEERS[i]!.every((j) => grid[j] !== n);

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Empty cell with the fewest candidates (MRV) — makes backtracking fast. */
function bestCell(grid: readonly number[]): { i: number; options: number[] } | null {
  let best: { i: number; options: number[] } | null = null;
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    const options = candidates(grid, i);
    if (!best || options.length < best.options.length) best = { i, options };
    if (options.length <= 1) break;
  }
  return best;
}

/** Counts solutions up to `limit` (2 is enough to check uniqueness). */
export function countSolutions(grid: readonly number[], limit = 2): number {
  const g = [...grid];
  let count = 0;
  const walk = (): void => {
    if (count >= limit) return;
    const cell = bestCell(g);
    if (!cell) {
      count++;
      return;
    }
    for (const n of cell.options) {
      g[cell.i] = n;
      walk();
      if (count >= limit) break;
    }
    g[cell.i] = 0;
  };
  walk();
  return count;
}

export function solve(grid: readonly number[], rng?: Rng): Grid | null {
  const g = [...grid];
  const walk = (): boolean => {
    const cell = bestCell(g);
    if (!cell) return true;
    const options = rng ? shuffle([...cell.options], rng) : cell.options;
    for (const n of options) {
      g[cell.i] = n;
      if (walk()) return true;
    }
    g[cell.i] = 0;
    return false;
  };
  return walk() ? g : null;
}

export interface Puzzle {
  readonly puzzle: Grid;
  readonly solution: Grid;
}

/** Random full grid, then remove cells while the solution stays unique. */
export function makePuzzle(difficulty: Difficulty, rng: Rng = Math.random): Puzzle {
  const solution = solve(new Array(81).fill(0), rng)!;
  const puzzle = [...solution];
  let removed = 0;
  for (const i of shuffle(
    Array.from({ length: 81 }, (_, k) => k),
    rng,
  )) {
    if (removed >= DIFFICULTIES[difficulty].holes) break;
    const keep = puzzle[i]!;
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) === 1) removed++;
    else puzzle[i] = keep;
  }
  return { puzzle, solution };
}

/** Faster and cleaner solves score more; never below 100. */
export function sudokuScore(
  difficulty: Difficulty,
  seconds: number,
  mistakes: number,
  hints: number,
): number {
  const base = DIFFICULTIES[difficulty].basePoints;
  const timePenalty = Math.floor(seconds) * 2;
  return Math.max(100, base - timePenalty - mistakes * MISTAKE_PENALTY - hints * HINT_PENALTY);
}

export const isComplete = (grid: readonly number[], solution: readonly number[]): boolean =>
  grid.every((n, i) => n === solution[i]);
