import type { Rnd } from '@/platform/rnd';

/**
 * Brazilian draughts on an 8×8 board. Pure rules: men capture forwards and backwards, a king
 * ("dama") flies along the diagonals, capturing is mandatory and the sequence taking the most
 * pieces must be played (lei da maioria). Side 1 is the player (bottom, moving up), side 2 the CPU.
 */
export const N = 8;
export type Side = 1 | 2;
/** 0 empty · 1/2 man of that side · 3/4 king of side 1/2. */
export type Cell = 0 | 1 | 2 | 3 | 4;

export const MAN_VALUE = 100;
export const KING_VALUE = 300;
/** Plies of king moves without a capture before the game is declared drawn. */
export const DRAW_PLIES = 40;

export const row = (i: number) => i >> 3;
export const col = (i: number) => i & 7;
export const sq = (r: number, c: number) => r * N + c;
const inside = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N;
export const isDark = (r: number, c: number) => (r + c) % 2 === 1;
export const sideOf = (c: number): 0 | Side => (c === 0 ? 0 : c === 1 || c === 3 ? 1 : 2);
export const isKing = (c: number) => c >= 3;
const other = (s: Side): Side => (s === 1 ? 2 : 1);
const DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

export interface Move {
  from: number;
  to: number;
  /** Every square the piece lands on, `from` first. */
  path: number[];
  /** Squares of the pieces taken (empty for a plain move). */
  captured: number[];
}

export type Outcome = 0 | Side | 3;

export class Checkers {
  cells: Cell[];
  turn: Side;
  /** Plies since the last capture or man move. */
  quiet = 0;

  constructor(first: Side = 1, cells?: readonly number[]) {
    this.turn = first;
    if (cells) this.cells = [...cells] as Cell[];
    else {
      this.cells = new Array<Cell>(N * N).fill(0);
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          if (!isDark(r, c)) continue;
          if (r < 3) this.cells[sq(r, c)] = 2;
          else if (r > 4) this.cells[sq(r, c)] = 1;
        }
    }
  }

  clone(): Checkers {
    const g = new Checkers(this.turn, this.cells);
    g.quiet = this.quiet;
    return g;
  }

  count(side: Side): number {
    return this.cells.filter((c) => sideOf(c) === side).length;
  }

  /** Capture sequences of one piece (every maximal chain; taken pieces stay as blockers). */
  private capturesFrom(from: number): Move[] {
    const cells = this.cells;
    const piece = cells[from]!;
    const side = sideOf(piece) as Side;
    const king = isKing(piece);
    const out: Move[] = [];
    const taken = new Set<number>();
    const path = [from];
    const free = (s: number) => cells[s] === 0 || s === from;

    const walk = (pos: number): void => {
      let any = false;
      for (const [dr, dc] of DIRS) {
        let r = row(pos) + dr;
        let c = col(pos) + dc;
        if (king) {
          while (inside(r, c) && free(sq(r, c))) {
            r += dr;
            c += dc;
          }
        }
        if (!inside(r, c)) continue;
        const victim = sq(r, c);
        if (sideOf(cells[victim]!) !== other(side) || taken.has(victim)) continue;
        let lr = r + dr;
        let lc = c + dc;
        while (inside(lr, lc) && free(sq(lr, lc))) {
          any = true;
          taken.add(victim);
          path.push(sq(lr, lc));
          walk(sq(lr, lc));
          path.pop();
          taken.delete(victim);
          if (!king) break;
          lr += dr;
          lc += dc;
        }
      }
      if (!any && path.length > 1) {
        out.push({ from, to: pos, path: [...path], captured: [...taken] });
      }
    };
    walk(from);
    return out;
  }

  private quietFrom(from: number): Move[] {
    const piece = this.cells[from]!;
    const king = isKing(piece);
    const fwd = sideOf(piece) === 1 ? -1 : 1;
    const out: Move[] = [];
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== fwd) continue;
      let r = row(from) + dr;
      let c = col(from) + dc;
      while (inside(r, c) && this.cells[sq(r, c)] === 0) {
        out.push({ from, to: sq(r, c), path: [from, sq(r, c)], captured: [] });
        if (!king) break;
        r += dr;
        c += dc;
      }
    }
    return out;
  }

  /** The legal moves of the side to move (captures only when there is one, and the longest). */
  moves(): Move[] {
    const mine: number[] = [];
    this.cells.forEach((c, i) => {
      if (sideOf(c) === this.turn) mine.push(i);
    });
    let caps: Move[] = [];
    for (const i of mine) caps = caps.concat(this.capturesFrom(i));
    if (caps.length > 0) {
      const best = Math.max(...caps.map((m) => m.captured.length));
      return caps.filter((m) => m.captured.length === best);
    }
    let out: Move[] = [];
    for (const i of mine) out = out.concat(this.quietFrom(i));
    return out;
  }

  /** Plays a move returned by `moves()`. */
  apply(m: Move): void {
    const piece = this.cells[m.from]!;
    const side = sideOf(piece) as Side;
    this.cells[m.from] = 0;
    for (const s of m.captured) this.cells[s] = 0;
    const promote = !isKing(piece) && row(m.to) === (side === 1 ? 0 : N - 1);
    this.cells[m.to] = (promote ? piece + 2 : piece) as Cell;
    this.quiet = m.captured.length > 0 || !isKing(piece) ? 0 : this.quiet + 1;
    this.turn = other(side);
  }

  /** 0 while playing, the winner's side, or 3 for a draw. */
  outcome(): Outcome {
    if (this.quiet >= DRAW_PLIES) return 3;
    if (this.moves().length === 0) return other(this.turn);
    return 0;
  }
}

// ---------------------------------------------------------------- CPU

const CENTER = [18, 19, 20, 21, 26, 27, 28, 29, 34, 35, 36, 37, 42, 43, 44, 45];

/** Static score of a position from `side`'s point of view. */
export function evaluate(g: Checkers, side: Side): number {
  let score = 0;
  g.cells.forEach((c, i) => {
    const s = sideOf(c);
    if (s === 0) return;
    let v = isKing(c) ? KING_VALUE : MAN_VALUE;
    if (!isKing(c)) {
      const progress = s === 1 ? N - 1 - row(i) : row(i);
      v += progress * 5;
      if (progress === 0) v += 12;
    }
    if (CENTER.includes(i)) v += 4;
    score += s === side ? v : -v;
  });
  return score;
}

const WIN = 100_000;

/** Score for the side to move. `budget` counts nodes and cuts the search short when spent. */
function negamax(
  g: Checkers,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  budget: { n: number },
): number {
  budget.n--;
  const moves = g.moves();
  if (moves.length === 0) return -WIN + ply;
  if (g.quiet >= DRAW_PLIES) return 0;
  // Never stop in the middle of an exchange: keep searching while a capture is pending.
  if ((depth <= 0 && moves[0]!.captured.length === 0) || depth < -4 || budget.n <= 0) {
    return evaluate(g, g.turn);
  }
  let best = -Infinity;
  for (const m of moves) {
    const next = g.clone();
    next.apply(m);
    const v = -negamax(next, depth - 1, -beta, -alpha, ply + 1, budget);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export interface RobotLevel {
  depth: number;
  /** Random wobble added to each move's score. */
  noise: number;
  /** Chance of playing a random legal move instead of the best one. */
  blunder: number;
}

/** The CPU gets sharper with each win. */
export function robotLevel(wins: number): RobotLevel {
  return {
    depth: Math.min(8, 2 + wins),
    noise: Math.max(0, 60 - wins * 15),
    blunder: Math.max(0, 0.22 - wins * 0.07),
  };
}

/** Picks the CPU's move. `budget` caps the work so a slow phone never freezes. */
export function chooseMove(g: Checkers, level: RobotLevel, rnd: Rnd, budget = 40_000): Move {
  const moves = g.moves();
  if (moves.length === 1) return moves[0]!;
  if (rnd() < level.blunder) return moves[Math.floor(rnd() * moves.length)]!;
  let best = moves[0]!;
  let bestScore = -Infinity;
  const spent = { n: budget };
  for (const m of moves) {
    const next = g.clone();
    next.apply(m);
    const v =
      -negamax(next, level.depth - 1, -Infinity, Infinity, 1, spent) + (rnd() - 0.5) * level.noise;
    if (v > bestScore) {
      bestScore = v;
      best = m;
    }
  }
  return best;
}

/** Points for a win: more for later rounds, a little extra for a clean sweep. */
export function winPoints(round: number, myPieces: number, theirPieces: number): number {
  return 100 + round * 40 + myPieces * 8 + (theirPieces === 0 ? 30 : 0);
}
