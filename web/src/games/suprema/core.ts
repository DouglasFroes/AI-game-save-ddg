/**
 * "Velha Suprema" — pure rules of Ultimate Tic-Tac-Toe. Nine small boards form one big board. Where
 * you play inside a small board decides which small board your opponent must play next (any, if
 * that one is already decided). Winning a small board claims it; three claimed boards in a row win.
 */
export type Who = 1 | 2;
export type Cell = 0 | Who;

export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export interface State {
  /** 81 cells: small board `b`, square `c` is `b * 9 + c`. */
  readonly cells: readonly Cell[];
  /** The small board the next move must be in, or -1 for any. */
  readonly next: number;
  readonly turn: Who;
}

export function newGame(): State {
  return { cells: Array.from({ length: 81 }, () => 0 as Cell), next: -1, turn: 1 };
}

/** Owner of small board `b`: 1 or 2, 3 for a full board nobody won, 0 while open. */
export function boardStatus(cells: readonly Cell[], b: number): 0 | Who | 3 {
  const at = (c: number) => cells[b * 9 + c]!;
  for (const [x, y, z] of LINES) {
    if (at(x) !== 0 && at(x) === at(y) && at(y) === at(z)) return at(x);
  }
  for (let c = 0; c < 9; c++) if (at(c) === 0) return 0;
  return 3;
}

export const statuses = (cells: readonly Cell[]): (0 | Who | 3)[] =>
  Array.from({ length: 9 }, (_, b) => boardStatus(cells, b));

export function legal(s: State): number[] {
  const st = statuses(s.cells);
  const out: number[] = [];
  for (let b = 0; b < 9; b++) {
    if (st[b] !== 0 || (s.next !== -1 && s.next !== b)) continue;
    for (let c = 0; c < 9; c++) if (s.cells[b * 9 + c] === 0) out.push(b * 9 + c);
  }
  return out;
}

export function play(s: State, i: number): State | null {
  if (!legal(s).includes(i)) return null;
  const cells = [...s.cells];
  cells[i] = s.turn;
  const target = i % 9;
  const next = boardStatus(cells, target) === 0 ? target : -1;
  return { cells, next, turn: s.turn === 1 ? 2 : 1 };
}

/** The big-board winner: 1, 2, 3 for a draw, 0 while playing. */
export function winner(s: State): 0 | Who | 3 {
  const st = statuses(s.cells);
  for (const [x, y, z] of LINES) {
    const a = st[x]!;
    if ((a === 1 || a === 2) && a === st[y] && a === st[z]) return a;
  }
  if (legal(s).length > 0) return 0;
  // No move left: most small boards wins.
  const mine = st.filter((v) => v === 1).length;
  const theirs = st.filter((v) => v === 2).length;
  return mine > theirs ? 1 : theirs > mine ? 2 : 3;
}

function lineValue(vals: readonly number[], me: number): number {
  let total = 0;
  for (const [x, y, z] of LINES) {
    const line = [vals[x]!, vals[y]!, vals[z]!];
    const mine = line.filter((v) => v === me).length;
    const theirs = line.filter((v) => v !== 0 && v !== me && v !== 3).length;
    if (mine > 0 && theirs > 0) continue;
    total += mine === 2 ? 3 : mine === 1 ? 1 : 0;
    total -= theirs === 2 ? 3 : theirs === 1 ? 1 : 0;
  }
  return total;
}

function evaluate(s: State, me: Who): number {
  const w = winner(s);
  if (w === me) return 10000;
  if (w === 3) return 0;
  if (w !== 0) return -10000;
  const st = statuses(s.cells);
  let value = lineValue(st, me) * 12;
  for (let b = 0; b < 9; b++) {
    if (st[b] === me) value += 30;
    else if (st[b] === 1 || st[b] === 2) value -= 30;
    else
      value +=
        lineValue(s.cells.slice(b * 9, b * 9 + 9), me) * 2 + (s.cells[b * 9 + 4] === me ? 1 : 0);
  }
  return value;
}

function search(s: State, depth: number, alpha: number, beta: number, me: Who): number {
  if (depth === 0 || winner(s) !== 0) return evaluate(s, me);
  const maximize = s.turn === me;
  let best = maximize ? -Infinity : Infinity;
  for (const i of legal(s)) {
    const v = search(play(s, i)!, depth - 1, alpha, beta, me);
    if (maximize) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

/** The square the side to move picks; deeper search and fewer slips as `level` grows. */
export function cpuMove(s: State, level: number, rng: () => number = Math.random): number {
  const list = legal(s);
  if (list.length === 0) return -1;
  const noise = Math.max(0, 0.4 - 0.1 * (level - 1));
  if (rng() < noise) return list[Math.floor(rng() * list.length)]!;
  const depth = Math.min(5, 1 + level);
  let best = list[0]!;
  let bestValue = -Infinity;
  for (const i of list) {
    const v = search(play(s, i)!, depth - 1, -Infinity, Infinity, s.turn) + rng() * 0.3;
    if (v > bestValue) {
      bestValue = v;
      best = i;
    }
  }
  return best;
}
