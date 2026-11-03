/**
 * "Fluxo" (Flow) — pure rules. Join each pair of same-coloured dots with a pipe, without crossing,
 * so that the pipes fill the whole board. Boards are made by cutting a path that visits every cell
 * into pieces, so a solution always exists.
 */
export interface Puzzle {
  size: number;
  /** One [from, to] pair of cells per colour. */
  ends: Array<[number, number]>;
  /** A full solution: the cells of each colour's pipe, from its first dot to its second. */
  solution: number[][];
}
/** The pipe drawn for each colour (cell indexes, in order from its first dot). */
export type Paths = number[][];

export function neighbours(size: number, i: number): number[] {
  const r = Math.floor(i / size);
  const c = i % size;
  const out: number[] = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
}

/** A random path through every cell (snake path, then "backbite" moves to shuffle it). */
function hamiltonian(size: number, rng: () => number): number[] {
  let path: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let k = 0; k < size; k++) path.push(r * size + (r % 2 === 0 ? k : size - 1 - k));
  }
  for (let it = 0; it < size * size * 12; it++) {
    if (rng() < 0.5) path.reverse();
    const head = path[path.length - 1]!;
    const options = neighbours(size, head).filter((n) => n !== path[path.length - 2]);
    const n = options[Math.floor(rng() * options.length)]!;
    const j = path.indexOf(n);
    path = [...path.slice(0, j + 1), ...path.slice(j + 1).reverse()];
  }
  return path;
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const size = level <= 2 ? 5 : level <= 4 ? 6 : 7;
  const k = size - 1;
  const path = hamiltonian(size, rng);
  // Cut the path into k pieces of at least 3 cells.
  const cuts: number[] = [];
  let spare = path.length - 3 * k;
  const extra = Array.from({ length: k }, () => 0);
  while (spare-- > 0) extra[Math.floor(rng() * k)]!++;
  let at = 0;
  const solution: number[][] = [];
  for (let i = 0; i < k; i++) {
    const len = 3 + extra[i]!;
    solution.push(path.slice(at, at + len));
    at += len;
    cuts.push(at);
  }
  return { size, ends: solution.map((s) => [s[0]!, s[s.length - 1]!]), solution };
}

export function newPaths(p: Puzzle): Paths {
  return p.ends.map(() => []);
}

/** Which colour has a dot at `cell` (and which of its two), or null. */
export function dotAt(p: Puzzle, cell: number): { color: number; which: 0 | 1 } | null {
  for (let c = 0; c < p.ends.length; c++) {
    if (p.ends[c]![0] === cell) return { color: c, which: 0 };
    if (p.ends[c]![1] === cell) return { color: c, which: 1 };
  }
  return null;
}

export function ownerAt(paths: Paths, cell: number): number {
  return paths.findIndex((path) => path.includes(cell));
}

/** Starts (or resumes) drawing at `cell`. Returns the colour being drawn, or -1. */
export function begin(p: Puzzle, paths: Paths, cell: number): number {
  const dot = dotAt(p, cell);
  if (dot) {
    // Pipes always run from the colour's first dot, so starting from the second one flips it.
    const other = p.ends[dot.color]![dot.which === 0 ? 1 : 0]!;
    const cur = paths[dot.color]!;
    if (cur.length > 0 && cur[cur.length - 1] === other && cur[0] === cell) return dot.color;
    paths[dot.color] = [cell];
    return dot.color;
  }
  const owner = ownerAt(paths, cell);
  if (owner >= 0) {
    paths[owner] = paths[owner]!.slice(0, paths[owner]!.indexOf(cell) + 1);
    return owner;
  }
  return -1;
}

/** Extends the pipe of `color` to the neighbouring `cell`. Returns whether anything changed. */
export function extend(p: Puzzle, paths: Paths, color: number, cell: number): boolean {
  const cur = paths[color]!;
  const head = cur[cur.length - 1];
  if (head === undefined || !neighbours(p.size, head).includes(cell)) return false;
  if (cur.length >= 2 && cell === cur[cur.length - 2]) {
    cur.pop();
    return true;
  }
  const goal = p.ends[color]!.find((e) => e !== cur[0])!;
  if (head === goal) return false;
  const dot = dotAt(p, cell);
  if (dot && dot.color !== color) return false;
  if (cur.includes(cell)) return false;
  if (dot && dot.color === color && cell !== goal) return false;
  const other = ownerAt(paths, cell);
  if (other >= 0 && other !== color)
    paths[other] = paths[other]!.slice(0, paths[other]!.indexOf(cell));
  cur.push(cell);
  return true;
}

export function isConnected(p: Puzzle, paths: Paths, color: number): boolean {
  const cur = paths[color]!;
  const [a, b] = p.ends[color]!;
  return cur.length >= 2 && cur[0] === a && cur[cur.length - 1] === b;
}

export function filled(paths: Paths): number {
  return paths.reduce((a, path) => a + path.length, 0);
}

export function isSolved(p: Puzzle, paths: Paths): boolean {
  return p.ends.every((_, c) => isConnected(p, paths, c)) && filled(paths) === p.size * p.size;
}
