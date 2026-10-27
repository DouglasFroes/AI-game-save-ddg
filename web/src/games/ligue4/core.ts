import type { Rnd } from '@/platform/rnd';

export const COLS = 7;
export const ROWS = 6;
export type Disc = 0 | 1 | 2;

const ORDER = [3, 2, 4, 1, 5, 0, 6];
const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

const at = (c: number, r: number) => r * COLS + c;

/** Connect Four. Row 0 is the top; discs fall to the highest row index that is free. */
export class Connect4 {
  cells: Disc[] = new Array<Disc>(COLS * ROWS).fill(0);
  turn: 1 | 2;
  winner: Disc = 0;
  line: number[] = [];
  moves = 0;

  constructor(first: 1 | 2 = 1) {
    this.turn = first;
  }

  get full(): boolean {
    return this.moves >= COLS * ROWS;
  }

  get over(): boolean {
    return this.winner !== 0 || this.full;
  }

  rowFor(col: number): number {
    for (let r = ROWS - 1; r >= 0; r--) if (this.cells[at(col, r)] === 0) return r;
    return -1;
  }

  legalCols(): number[] {
    return ORDER.filter((c) => this.rowFor(c) >= 0);
  }

  /** Drops the current player's disc; returns the cell index or -1 when illegal. */
  drop(col: number): number {
    if (this.over || col < 0 || col >= COLS) return -1;
    const r = this.rowFor(col);
    if (r < 0) return -1;
    const idx = at(col, r);
    const player = this.turn;
    this.cells[idx] = player;
    this.moves++;
    const line = this.winLine(col, r, player);
    if (line) {
      this.winner = player;
      this.line = line;
    } else this.turn = player === 1 ? 2 : 1;
    return idx;
  }

  private winLine(col: number, row: number, p: Disc): number[] | null {
    for (const [dx, dy] of DIRS) {
      const cells = [at(col, row)];
      for (const s of [1, -1]) {
        let c = col + dx * s;
        let r = row + dy * s;
        while (c >= 0 && c < COLS && r >= 0 && r < ROWS && this.cells[at(c, r)] === p) {
          cells.push(at(c, r));
          c += dx * s;
          r += dy * s;
        }
      }
      if (cells.length >= 4) return cells;
    }
    return null;
  }

  clone(): Connect4 {
    const g = new Connect4(this.turn);
    g.cells = [...this.cells];
    g.winner = this.winner;
    g.moves = this.moves;
    return g;
  }

  /** Static score of the position for `me` (windows of four plus a taste for the centre). */
  evaluate(me: 1 | 2): number {
    const foe = me === 1 ? 2 : 1;
    let score = 0;
    for (let r = 0; r < ROWS; r++) if (this.cells[at(3, r)] === me) score += 3;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        for (const [dx, dy] of DIRS) {
          const ec = c + dx * 3;
          const er = r + dy * 3;
          if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
          let mine = 0;
          let theirs = 0;
          for (let k = 0; k < 4; k++) {
            const v = this.cells[at(c + dx * k, r + dy * k)];
            if (v === me) mine++;
            else if (v === foe) theirs++;
          }
          if (mine && theirs) continue;
          if (mine) score += mine === 3 ? 6 : mine === 2 ? 2 : 0;
          if (theirs) score -= theirs === 3 ? 8 : theirs === 2 ? 2 : 0;
        }
      }
    }
    return score;
  }

  /** Alpha-beta pick for whoever's turn it is; `skill` is the chance of really thinking. */
  bestMove(rnd: Rnd, depth = 4, skill = 1): number {
    const cols = this.legalCols();
    if (rnd() > skill) return cols[Math.floor(rnd() * cols.length)]!;
    const me = this.turn;
    let bestScore = -Infinity;
    let best = cols[0]!;
    for (const col of cols) {
      const next = this.clone();
      next.drop(col);
      const v = negaSearch(next, depth - 1, me, -Infinity, Infinity);
      if (v > bestScore) {
        bestScore = v;
        best = col;
      }
    }
    return best;
  }
}

function negaSearch(g: Connect4, depth: number, me: 1 | 2, alpha: number, beta: number): number {
  if (g.winner) return g.winner === me ? 10000 + depth : -(10000 + depth);
  if (g.full) return 0;
  if (depth === 0) return g.evaluate(me);
  const maximizing = g.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const col of g.legalCols()) {
    const next = g.clone();
    next.drop(col);
    const v = negaSearch(next, depth - 1, me, alpha, beta);
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** Search depth and chance of a good move, both growing with the player's wins. */
export const robotLevel = (wins: number): { depth: number; skill: number } => ({
  depth: Math.min(6, 2 + Math.floor(wins / 2)),
  skill: Math.min(1, 0.55 + wins * 0.15),
});
