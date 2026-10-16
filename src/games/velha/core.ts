import type { Rnd } from '@/platform/rnd';

export type Mark = 0 | 1 | 2;

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

const MAX_MOVES = 40;

/** Tic-tac-toe where each player keeps only 3 marks: the 4th one erases their oldest. */
export class InfiniteTicTacToe {
  board: Mark[] = new Array<Mark>(9).fill(0);
  queues: [number[], number[]] = [[], []];
  turn: 1 | 2 = 1;
  winner: Mark = 0;
  moves = 0;

  constructor(first: 1 | 2 = 1) {
    this.turn = first;
  }

  get draw(): boolean {
    return this.winner === 0 && this.moves >= MAX_MOVES;
  }

  get over(): boolean {
    return this.winner !== 0 || this.draw;
  }

  empties(): number[] {
    return this.board.map((m, i) => (m === 0 ? i : -1)).filter((i) => i >= 0);
  }

  /** The cell that will vanish when `player` places the next mark (-1 if none yet). */
  oldest(player: 1 | 2): number {
    const q = this.queues[player - 1]!;
    return q.length >= 3 ? q[0]! : -1;
  }

  play(cell: number): boolean {
    if (this.over || this.board[cell] !== 0) return false;
    const player = this.turn;
    const q = this.queues[player - 1]!;
    this.board[cell] = player;
    q.push(cell);
    if (q.length > 3) this.board[q.shift()!] = 0;
    this.moves++;
    if (LINES.some((l) => l.every((i) => this.board[i] === player))) this.winner = player;
    else this.turn = player === 1 ? 2 : 1;
    return true;
  }

  clone(): InfiniteTicTacToe {
    const c = new InfiniteTicTacToe(this.turn);
    c.board = [...this.board];
    c.queues = [[...this.queues[0]], [...this.queues[1]]];
    c.winner = this.winner;
    c.moves = this.moves;
    return c;
  }

  /** Minimax pick for whoever's turn it is; `skill` (0–1) is the chance of playing it well. */
  bestMove(rnd: Rnd, skill = 1, depth = 6): number {
    const empties = this.empties();
    if (rnd() > skill) return empties[Math.floor(rnd() * empties.length)]!;
    const me = this.turn;
    let bestScore = -Infinity;
    let best: number[] = [];
    for (const cell of empties) {
      const next = this.clone();
      next.play(cell);
      const v = search(next, depth - 1, me, -Infinity, Infinity);
      if (v > bestScore) {
        bestScore = v;
        best = [cell];
      } else if (v === bestScore) best.push(cell);
    }
    return best[Math.floor(rnd() * best.length)]!;
  }
}

function search(
  g: InfiniteTicTacToe,
  depth: number,
  me: 1 | 2,
  alpha: number,
  beta: number,
): number {
  if (g.winner) return g.winner === me ? 100 + depth : -(100 + depth);
  if (depth === 0 || g.draw) return 0;
  const maximizing = g.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const cell of g.empties()) {
    const next = g.clone();
    next.play(cell);
    const v = search(next, depth - 1, me, alpha, beta);
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

/** Chance that the robot plays its best move, growing with the player's win streak. */
export const robotSkill = (wins: number): number => Math.min(0.95, 0.3 + wins * 0.13);
