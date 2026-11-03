/**
 * "Resta Um" — pure rules of peg solitaire on the cross-shaped board (33 holes). Every hole but
 * the centre starts with a peg; a move jumps one peg over a neighbouring peg (up, down, left or
 * right) into the empty hole behind it, removing the jumped peg. Leave as few pegs as you can —
 * one peg, ideally in the centre, is the perfect game.
 */
export const SIZE = 7;
/** 0 = no hole there, 1 = empty hole, 2 = peg. */
export type Cell = 0 | 1 | 2;
export type Board = readonly Cell[];

/** True for the 33 cells of the cross. */
export const isHole = (r: number, c: number): boolean =>
  r >= 0 && r < SIZE && c >= 0 && c < SIZE && ((r >= 2 && r <= 4) || (c >= 2 && c <= 4));

export const CENTER = 3 * SIZE + 3;

export function newBoard(): Cell[] {
  const b: Cell[] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) b.push(!isHole(r, c) ? 0 : r === 3 && c === 3 ? 1 : 2);
  return b;
}

export interface Move {
  readonly from: number;
  readonly over: number;
  readonly to: number;
}

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export function movesFrom(b: Board, from: number): Move[] {
  const out: Move[] = [];
  if (b[from] !== 2) return out;
  const r = Math.floor(from / SIZE);
  const c = from % SIZE;
  for (const [dr, dc] of DIRS) {
    const orr = r + dr;
    const oc = c + dc;
    const tr = r + 2 * dr;
    const tc = c + 2 * dc;
    if (!isHole(tr, tc) || !isHole(orr, oc)) continue;
    if (b[orr * SIZE + oc] === 2 && b[tr * SIZE + tc] === 1) {
      out.push({ from, over: orr * SIZE + oc, to: tr * SIZE + tc });
    }
  }
  return out;
}

export function moves(b: Board): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < b.length; i++) out.push(...movesFrom(b, i));
  return out;
}

export function apply(b: Board, m: Move): Cell[] {
  const next = [...b];
  next[m.from] = 1;
  next[m.over] = 1;
  next[m.to] = 2;
  return next;
}

export const pegs = (b: Board): number => b.filter((c) => c === 2).length;

/** Points for a finished game: every peg removed counts, a single peg pays a bonus. */
export function score(b: Board): number {
  const left = pegs(b);
  const base = (32 - (left - 1)) * 60;
  if (left !== 1) return base;
  return base + 500 + (b[CENTER] === 2 ? 300 : 0);
}

/** Finds a sequence of moves that leaves one peg (depth-first with memory). */
export function solve(start: Board, maxNodes = 400_000): Move[] | null {
  const seen = new Set<string>();
  let nodes = 0;
  const path: Move[] = [];
  const dfs = (b: Board): boolean => {
    if (pegs(b) === 1) return true;
    if (++nodes > maxNodes) return false;
    const key = b.join('');
    if (seen.has(key)) return false;
    seen.add(key);
    for (const m of moves(b)) {
      path.push(m);
      if (dfs(apply(b, m))) return true;
      path.pop();
    }
    return false;
  };
  return dfs(start) ? path : null;
}
