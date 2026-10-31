/**
 * "Liga Pontos" — pure rules of a Flow-style puzzle: connect each pair of same-coloured dots with a
 * path; paths cannot cross. Puzzles are made from a random Hamiltonian path of the grid (shuffled
 * with "backbite" moves) cut into segments, so every puzzle has a solution that fills the board.
 */
export type Cell = number; // r * size + c

export interface Puzzle {
  readonly size: number;
  /** Endpoint pairs, one per colour. */
  readonly pairs: ReadonlyArray<readonly [Cell, Cell]>;
}

const neighbours = (size: number, cell: Cell): Cell[] => {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: Cell[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
};

export const adjacent = (size: number, a: Cell, b: Cell): boolean =>
  neighbours(size, a).includes(b);

/** A path visiting every cell once: a serpentine, then many random backbite moves. */
export function hamiltonian(size: number, rng: () => number): Cell[] {
  let path: Cell[] = [];
  for (let r = 0; r < size; r++)
    for (let i = 0; i < size; i++) path.push(r * size + (r % 2 ? size - 1 - i : i));
  const moves = size * size * 12;
  for (let m = 0; m < moves; m++) {
    if (rng() < 0.5) path.reverse();
    const end = path[0]!;
    const opts = neighbours(size, end).filter((n) => n !== path[1]);
    const n = opts[Math.floor(rng() * opts.length)];
    if (n === undefined) continue;
    const k = path.indexOf(n);
    path = [...path.slice(0, k).reverse(), ...path.slice(k)];
  }
  return path;
}

/** Cuts the path into segments of at least 3 cells: their ends are the dots. */
export function generate(size: number, colors: number, rng: () => number = Math.random): Puzzle {
  const path = hamiltonian(size, rng);
  const total = path.length;
  const k = Math.max(2, Math.min(colors, Math.floor(total / 3)));
  // Random cut points with every segment >= 3 long.
  const lengths = new Array<number>(k).fill(3);
  for (let left = total - 3 * k; left > 0; left--) lengths[Math.floor(rng() * k)]!++;
  const pairs: Array<[Cell, Cell]> = [];
  let at = 0;
  for (const len of lengths) {
    pairs.push([path[at]!, path[at + len - 1]!]);
    at += len;
  }
  return { size, pairs };
}

/** Board size and colour count for a level. */
export function levelSpec(level: number): { size: number; colors: number; time: number } {
  const size = Math.min(9, 5 + Math.floor((level - 1) / 2));
  const colors = Math.min(size + 2, size - 1 + ((level - 1) % 3));
  // About 0.6 s per cell, a second less every level, never under 20 s.
  const time = Math.max(20, Math.round(12 + size * size * 0.6 - level));
  return { size, colors, time };
}

/** The player's drawing on a puzzle. */
export class FlowBoard {
  /** One path per colour, starting at one of its dots. */
  paths: Cell[][];
  private readonly dotColor = new Map<Cell, number>();

  constructor(readonly puzzle: Puzzle) {
    this.paths = puzzle.pairs.map(() => []);
    puzzle.pairs.forEach(([a, b], i) => {
      this.dotColor.set(a, i);
      this.dotColor.set(b, i);
    });
  }

  get size(): number {
    return this.puzzle.size;
  }

  dotAt(cell: Cell): number | undefined {
    return this.dotColor.get(cell);
  }

  /** Colour of the path through a cell (or its dot), or -1. */
  colorAt(cell: Cell): number {
    const dot = this.dotColor.get(cell);
    if (dot !== undefined) return dot;
    return this.paths.findIndex((p) => p.includes(cell));
  }

  connected(color: number): boolean {
    const p = this.paths[color]!;
    const [a, b] = this.puzzle.pairs[color]!;
    return p.length >= 2 && ((p[0] === a && p.at(-1) === b) || (p[0] === b && p.at(-1) === a));
  }

  get solved(): boolean {
    return this.puzzle.pairs.every((_, i) => this.connected(i));
  }

  /** Share of the board covered by paths (1 = perfect fill). */
  get fill(): number {
    const used = new Set<Cell>();
    for (const p of this.paths) for (const c of p) used.add(c);
    for (const [a, b] of this.puzzle.pairs) used.add(a).add(b);
    return used.size / (this.size * this.size);
  }

  /** Starts drawing from a cell: a dot restarts its path, a path cell cuts it there. */
  begin(cell: Cell): number {
    const dot = this.dotColor.get(cell);
    if (dot !== undefined) {
      this.paths[dot] = [cell];
      return dot;
    }
    const color = this.paths.findIndex((p) => p.includes(cell));
    if (color < 0) return -1;
    const p = this.paths[color]!;
    this.paths[color] = p.slice(0, p.indexOf(cell) + 1);
    return color;
  }

  /** Extends the colour's path into `cell`. Returns true when something changed. */
  extend(color: number, cell: Cell): boolean {
    const p = this.paths[color];
    if (!p || !p.length) return false;
    const head = p.at(-1)!;
    if (head === cell) return false;
    const back = p.indexOf(cell);
    if (back >= 0) {
      this.paths[color] = p.slice(0, back + 1);
      return true;
    }
    if (!adjacent(this.size, head, cell) || this.connected(color)) return false;
    const dot = this.dotColor.get(cell);
    if (dot !== undefined && dot !== color) return false;
    // Drawing over another colour cuts that path.
    for (let i = 0; i < this.paths.length; i++) {
      if (i === color) continue;
      const q = this.paths[i]!;
      const at = q.indexOf(cell);
      if (at >= 0) this.paths[i] = q.slice(0, at);
    }
    p.push(cell);
    return true;
  }
}
