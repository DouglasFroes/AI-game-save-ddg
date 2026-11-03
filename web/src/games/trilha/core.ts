/**
 * "Trilha" — pure rules of Nine Men's Morris. Three nested squares give 24 points; each player has
 * nine men. First everyone places men one by one, then men slide along the lines (a player left with
 * exactly three men may "fly" anywhere). Three in a row (a mill) lets you remove an enemy man that
 * isn't in a mill. You lose with fewer than three men or with no move left.
 *
 * Point `ring * 8 + k`: k runs round the square (0 top-left, 1 top, 2 top-right, 3 right, 4 bottom-
 * right, 5 bottom, 6 bottom-left, 7 left); rings go from the outer square (0) to the inner (2).
 */
export const POINTS = 24;
export const MEN = 9;
export type Who = 1 | 2;
export type Cell = 0 | Who;

export const ADJ: readonly (readonly number[])[] = Array.from({ length: POINTS }, (_, i) => {
  const ring = Math.floor(i / 8);
  const k = i % 8;
  const out = [ring * 8 + ((k + 1) % 8), ring * 8 + ((k + 7) % 8)];
  if (k % 2 === 1) {
    if (ring > 0) out.push((ring - 1) * 8 + k);
    if (ring < 2) out.push((ring + 1) * 8 + k);
  }
  return out;
});

export const MILLS: readonly (readonly [number, number, number])[] = [
  ...[0, 1, 2].flatMap((ring) =>
    [0, 2, 4, 6].map((k) => [ring * 8 + k, ring * 8 + k + 1, ring * 8 + ((k + 2) % 8)] as const),
  ),
  ...[1, 3, 5, 7].map((k) => [k, 8 + k, 16 + k] as const),
];

export type Action =
  | { readonly kind: 'place'; readonly to: number }
  | { readonly kind: 'move'; readonly from: number; readonly to: number }
  | { readonly kind: 'remove'; readonly at: number };

export interface State {
  readonly board: readonly Cell[];
  /** Men still to place, [player, CPU]. */
  readonly hand: readonly [number, number];
  readonly turn: Who;
  /** True while `turn` must remove an enemy man (after closing a mill). */
  readonly removing: boolean;
  readonly plies: number;
}

export const MAX_PLIES = 160;

export function newGame(): State {
  return {
    board: Array.from({ length: POINTS }, () => 0 as Cell),
    hand: [MEN, MEN],
    turn: 1,
    removing: false,
    plies: 0,
  };
}

const other = (w: Who): Who => (w === 1 ? 2 : 1);

export function inMill(board: readonly Cell[], p: number, who: Who): boolean {
  return MILLS.some((m) => m.includes(p) && m.every((q) => board[q] === who));
}

export function menOf(s: State, who: Who): number {
  return s.board.filter((c) => c === who).length + s.hand[who - 1]!;
}

const onBoard = (b: readonly Cell[], who: Who) => b.filter((c) => c === who).length;

export function legal(s: State): Action[] {
  const { board, turn } = s;
  const out: Action[] = [];
  if (s.removing) {
    const foe = other(turn);
    const loose: number[] = [];
    const all: number[] = [];
    for (let i = 0; i < POINTS; i++) {
      if (board[i] !== foe) continue;
      all.push(i);
      if (!inMill(board, i, foe)) loose.push(i);
    }
    for (const at of loose.length > 0 ? loose : all) out.push({ kind: 'remove', at });
    return out;
  }
  if (s.hand[turn - 1]! > 0) {
    for (let i = 0; i < POINTS; i++) if (board[i] === 0) out.push({ kind: 'place', to: i });
    return out;
  }
  const flying = onBoard(board, turn) === 3;
  for (let from = 0; from < POINTS; from++) {
    if (board[from] !== turn) continue;
    if (flying) {
      for (let to = 0; to < POINTS; to++) if (board[to] === 0) out.push({ kind: 'move', from, to });
    } else {
      for (const to of ADJ[from]!) if (board[to] === 0) out.push({ kind: 'move', from, to });
    }
  }
  return out;
}

/** Applies a legal action. */
export function apply(s: State, a: Action): State {
  const board = [...s.board];
  const hand: [number, number] = [s.hand[0], s.hand[1]];
  const turn = s.turn;
  if (a.kind === 'remove') {
    board[a.at] = 0;
    return { board, hand, turn: other(turn), removing: false, plies: s.plies + 1 };
  }
  let to: number;
  if (a.kind === 'place') {
    board[a.to] = turn;
    hand[turn - 1]!--;
    to = a.to;
  } else {
    board[a.from] = 0;
    board[a.to] = turn;
    to = a.to;
  }
  const mill = inMill(board, to, turn);
  return { board, hand, turn: mill ? turn : other(turn), removing: mill, plies: s.plies + 1 };
}

/** 0 while playing, otherwise the winner, or 3 for a draw (too many moves). */
export function result(s: State): 0 | Who | 3 {
  if (s.removing) return 0;
  for (const w of [1, 2] as const) {
    if (s.hand[w - 1] === 0 && onBoard(s.board, w) < 3) return other(w);
  }
  if (s.plies >= MAX_PLIES) return 3;
  if (legal(s).length === 0) return other(s.turn);
  return 0;
}

function evaluate(s: State, me: Who): number {
  const foe = other(me);
  const res = result(s);
  if (res === me) return 10000;
  if (res === foe) return -10000;
  if (res === 3) return 0;
  let value = (menOf(s, me) - menOf(s, foe)) * 12;
  for (const m of MILLS) {
    const mine = m.filter((p) => s.board[p] === me).length;
    const theirs = m.filter((p) => s.board[p] === foe).length;
    if (mine === 3) value += 5;
    if (theirs === 3) value -= 5;
    if (mine === 2 && theirs === 0) value += 3;
    if (theirs === 2 && mine === 0) value -= 3;
  }
  // Mobility: men that can still slide somewhere.
  for (let i = 0; i < POINTS; i++) {
    if (s.board[i] === 0) continue;
    const free = ADJ[i]!.filter((j) => s.board[j] === 0).length;
    value += (s.board[i] === me ? 1 : -1) * free * 0.6;
  }
  return value;
}

function search(s: State, depth: number, alpha: number, beta: number, me: Who): number {
  if (depth === 0 || result(s) !== 0) return evaluate(s, me) + (result(s) !== 0 ? depth : 0);
  const list = legal(s);
  const maximize = s.turn === me;
  let best = maximize ? -Infinity : Infinity;
  for (const a of list) {
    const v = search(apply(s, a), depth - 1, alpha, beta, me);
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

/** The CPU's action for the side to move; deeper and sharper as `level` grows. */
export function cpuMove(s: State, level: number, rng: () => number = Math.random): Action {
  const list = legal(s);
  const noise = Math.max(0, 0.3 - 0.12 * (level - 1));
  if (rng() < noise) return list[Math.floor(rng() * list.length)]!;
  const depth = Math.min(4, level + 1);
  let best = list[0]!;
  let bestValue = -Infinity;
  for (const a of list) {
    const v = search(apply(s, a), depth - 1, -Infinity, Infinity, s.turn) + rng() * 0.2;
    if (v > bestValue) {
      bestValue = v;
      best = a;
    }
  }
  return best;
}
