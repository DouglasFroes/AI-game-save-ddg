export type Disc = 0 | 1 | 2; // 0 = empty, 1 = player (white/cyan), 2 = AI (dark/pink)

export interface Pos {
  readonly r: number;
  readonly c: number;
}

export const BOARD_SIZE = 8;

const DIRS: readonly Pos[] = [
  { r: -1, c: -1 },
  { r: -1, c: 0 },
  { r: -1, c: 1 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
  { r: 1, c: -1 },
  { r: 1, c: 0 },
  { r: 1, c: 1 },
];

/** Positional weights for AI evaluation (corners are huge, X-squares are risky). */
const WEIGHTS: readonly (readonly number[])[] = [
  [100, -20, 12, 6, 6, 12, -20, 100],
  [-20, -40, -4, -3, -3, -4, -40, -20],
  [12, -4, 8, 2, 2, 8, -4, 12],
  [6, -3, 2, 1, 1, 2, -3, 6],
  [6, -3, 2, 1, 1, 2, -3, 6],
  [12, -4, 8, 2, 2, 8, -4, 12],
  [-20, -40, -4, -3, -3, -4, -40, -20],
  [100, -20, 12, 6, 6, 12, -20, 100],
];

export function createInitialBoard(): Disc[][] {
  const b: Disc[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => 0 as Disc),
  );
  b[3]![3] = 2;
  b[3]![4] = 1;
  b[4]![3] = 1;
  b[4]![4] = 2;
  return b;
}

export function cloneBoard(board: readonly (readonly Disc[])[]): Disc[][] {
  return board.map((row) => [...row]);
}

export function flipsForMove(
  board: readonly (readonly Disc[])[],
  r: number,
  c: number,
  who: 1 | 2,
): Pos[] {
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return [];
  if (board[r]![c] !== 0) return [];
  const opp: 1 | 2 = who === 1 ? 2 : 1;
  const allFlips: Pos[] = [];

  for (const d of DIRS) {
    const line: Pos[] = [];
    let nr = r + d.r;
    let nc = c + d.c;
    while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr]![nc] === opp) {
      line.push({ r: nr, c: nc });
      nr += d.r;
      nc += d.c;
    }
    if (
      line.length > 0 &&
      nr >= 0 &&
      nr < BOARD_SIZE &&
      nc >= 0 &&
      nc < BOARD_SIZE &&
      board[nr]![nc] === who
    ) {
      allFlips.push(...line);
    }
  }
  return allFlips;
}

export function validMoves(board: readonly (readonly Disc[])[], who: 1 | 2): Pos[] {
  const out: Pos[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (flipsForMove(board, r, c, who).length > 0) {
        out.push({ r, c });
      }
    }
  }
  return out;
}

export function applyMove(
  board: readonly (readonly Disc[])[],
  r: number,
  c: number,
  who: 1 | 2,
): { board: Disc[][]; flipped: Pos[] } | null {
  const flipped = flipsForMove(board, r, c, who);
  if (flipped.length === 0) return null;
  const next = cloneBoard(board);
  next[r]![c] = who;
  for (const p of flipped) next[p.r]![p.c] = who;
  return { board: next, flipped };
}

export function countDiscs(board: readonly (readonly Disc[])[]): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r]![c] === 1) p1++;
      else if (board[r]![c] === 2) p2++;
    }
  }
  return { p1, p2 };
}

/** Picks the AI move using positional weights + mobility + flip count. */
export function chooseAiMove(
  board: readonly (readonly Disc[])[],
  level = 1,
): { pos: Pos; flipped: Pos[] } | null {
  const moves = validMoves(board, 2);
  if (moves.length === 0) return null;
  let best = moves[0]!;
  let bestScore = -Infinity;

  for (const m of moves) {
    const res = applyMove(board, m.r, m.c, 2)!;
    const posWeight = WEIGHTS[m.r]![m.c]!;
    const flipBonus = res.flipped.length * 3;
    const oppMoves = validMoves(res.board, 1).length;
    const mobilityBonus = -oppMoves * (level >= 2 ? 4 : 2);
    const total = posWeight + flipBonus + mobilityBonus;
    if (total > bestScore) {
      bestScore = total;
      best = m;
    }
  }

  return { pos: best, flipped: flipsForMove(board, best.r, best.c, 2) };
}
