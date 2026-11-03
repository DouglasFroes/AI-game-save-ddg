/**
 * "Raposa e Gansos" — pure rules of Fox and Geese on the cross board. The player is the fox: it
 * steps one point in any straight direction, or jumps over a goose into the empty point behind it
 * (capturing it). The 13 geese only step forward or sideways. The fox wins by capturing enough
 * geese (the rest can no longer trap it) or when the geese have no move; the geese win by pinning
 * the fox so it can't move.
 */
import { isHole, SIZE } from '../restaum/core';

export const GEESE_START = 13;
/** The fox wins once fewer geese than this remain. */
export const GEESE_TO_TRAP = 8;
/** Moves (both sides together) before the game is settled on captures. */
export const MAX_PLIES = 100;
export const FOX_NEEDS = 3;
export type Turn = 'fox' | 'geese';

export interface State {
  readonly fox: number;
  readonly geese: readonly boolean[];
  readonly turn: Turn;
  readonly plies: number;
}

export function newGame(): State {
  const geese = Array.from({ length: SIZE * SIZE }, () => false);
  for (let r = 4; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (isHole(r, c)) geese[r * SIZE + c] = true;
  return { fox: 3 * SIZE + 3, geese, turn: 'fox', plies: 0 };
}

export const gooseCount = (s: State): number => s.geese.filter(Boolean).length;

export interface Move {
  readonly from: number;
  readonly to: number;
  /** The goose jumped over, if any. */
  readonly capture: number | null;
}

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

const free = (s: State, r: number, c: number) =>
  isHole(r, c) && !s.geese[r * SIZE + c] && s.fox !== r * SIZE + c;

export function foxMoves(s: State): Move[] {
  const out: Move[] = [];
  const r = Math.floor(s.fox / SIZE);
  const c = s.fox % SIZE;
  for (const [dr, dc] of DIRS) {
    if (free(s, r + dr, c + dc)) {
      out.push({ from: s.fox, to: (r + dr) * SIZE + c + dc, capture: null });
    } else if (isHole(r + dr, c + dc) && s.geese[(r + dr) * SIZE + c + dc]) {
      if (free(s, r + 2 * dr, c + 2 * dc)) {
        out.push({
          from: s.fox,
          to: (r + 2 * dr) * SIZE + c + 2 * dc,
          capture: (r + dr) * SIZE + c + dc,
        });
      }
    }
  }
  return out;
}

export function gooseMoves(s: State): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < s.geese.length; i++) {
    if (!s.geese[i]) continue;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    // Forward is up the board (towards row 0); sideways is allowed, backwards is not.
    for (const [dr, dc] of [
      [-1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      if (free(s, r + dr, c + dc))
        out.push({ from: i, to: (r + dr) * SIZE + c + dc, capture: null });
    }
  }
  return out;
}

export const moves = (s: State): Move[] => (s.turn === 'fox' ? foxMoves(s) : gooseMoves(s));

export function apply(s: State, m: Move): State {
  if (s.turn === 'fox') {
    const geese = [...s.geese];
    if (m.capture !== null) geese[m.capture] = false;
    return { fox: m.to, geese, turn: 'geese', plies: s.plies + 1 };
  }
  const geese = [...s.geese];
  geese[m.from] = false;
  geese[m.to] = true;
  return { fox: s.fox, geese, turn: 'fox', plies: s.plies + 1 };
}

/** 'fox' / 'geese' when decided, else null. */
export function winner(s: State): Turn | null {
  if (gooseCount(s) < GEESE_TO_TRAP) return 'fox';
  if (s.turn === 'fox' && foxMoves(s).length === 0) return 'geese';
  if (s.turn === 'geese' && gooseMoves(s).length === 0) return 'fox';
  if (s.plies >= MAX_PLIES) return GEESE_START - gooseCount(s) >= FOX_NEEDS ? 'fox' : 'geese';
  return null;
}

/** How good the position is for the geese (positive) — used by the search. */
function evaluate(s: State): number {
  const w = winner(s);
  if (w === 'geese') return 10000;
  if (w === 'fox') return -10000;
  let value = gooseCount(s) * 60;
  const fr = Math.floor(s.fox / SIZE);
  const fc = s.fox % SIZE;
  const foxOptions = foxMoves({ ...s, turn: 'fox' });
  value -= foxOptions.length * 6;
  // A goose the fox can jump right now is a goose about to be lost.
  value -= foxOptions.filter((m) => m.capture !== null).length * 70;
  for (let i = 0; i < s.geese.length; i++) {
    if (!s.geese[i]) continue;
    const r = Math.floor(i / SIZE);
    // Advance, and stay close to the fox so it has nowhere to roam.
    value += (SIZE - r) * 1.5 - (Math.abs(fr - r) + Math.abs(fc - (i % SIZE))) * 0.3;
  }
  return value;
}

function search(s: State, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || winner(s) !== null) return evaluate(s);
  const list = moves(s);
  const geeseToMove = s.turn === 'geese';
  let best = geeseToMove ? -Infinity : Infinity;
  for (const m of list) {
    const v = search(apply(s, m), depth - 1, alpha, beta);
    if (geeseToMove) {
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

/** The move for the side to move (geese or fox), deeper and sharper as `level` grows. */
export function cpuMove(s: State, level: number, rng: () => number = Math.random): Move | null {
  const list = moves(s);
  if (list.length === 0) return null;
  const noise = Math.max(0, 0.3 - 0.07 * (level - 1));
  if (rng() < noise) return list[Math.floor(rng() * list.length)]!;
  const depth = Math.min(4, 1 + Math.ceil(level / 2));
  const geeseToMove = s.turn === 'geese';
  let best = list[0]!;
  let bestValue = geeseToMove ? -Infinity : Infinity;
  for (const m of list) {
    const v = search(apply(s, m), depth - 1, -Infinity, Infinity) + rng() * 0.2;
    if (geeseToMove ? v > bestValue : v < bestValue) {
      bestValue = v;
      best = m;
    }
  }
  return best;
}
