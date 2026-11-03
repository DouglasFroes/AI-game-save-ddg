/**
 * "Mancala" — pure rules of Kalah. Six pits and a store per side, four seeds in every pit. A turn
 * picks one of your pits and sows its seeds counter-clockwise (skipping the opponent's store):
 * ending in your store gives another turn; ending in an empty pit of yours captures the seeds
 * opposite. When one side runs out of seeds, the other keeps what is left on its side.
 *
 * Pits 0-5 are the player's (left to right), 6 is the player's store, 7-12 the CPU's (right to
 * left, as seen by the player) and 13 the CPU's store. The CPU sits across the board.
 */
export const PITS = 6;
export const SEEDS = 4;
export const STORE: readonly [number, number] = [6, 13];

export interface State {
  readonly pits: readonly number[];
  /** 0 = player, 1 = CPU. */
  readonly turn: 0 | 1;
}

export function newGame(): State {
  const pits = Array.from({ length: 14 }, (_, i) => (i === 6 || i === 13 ? 0 : SEEDS));
  return { pits, turn: 0 };
}

const sideOf = (i: number): 0 | 1 | null => (i < 6 ? 0 : i > 6 && i < 13 ? 1 : null);

/** Pits the side to move can sow from. */
export function moves(s: State): number[] {
  const out: number[] = [];
  const from = s.turn === 0 ? 0 : 7;
  for (let i = from; i < from + PITS; i++) if (s.pits[i]! > 0) out.push(i);
  return out;
}

export function isOver(s: State): boolean {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 6; i++) a += s.pits[i]!;
  for (let i = 7; i < 13; i++) b += s.pits[i]!;
  return a === 0 || b === 0;
}

export interface Played {
  readonly state: State;
  /** Pits touched, in order, for the animation. */
  readonly path: readonly number[];
  readonly extra: boolean;
  readonly captured: number;
}

/** Sows `pit` for the side to move. Null when the pit isn't playable. */
export function play(s: State, pit: number): Played | null {
  if (!moves(s).includes(pit)) return null;
  const pits = [...s.pits];
  const me = s.turn;
  const enemyStore = STORE[1 - me];
  let seeds = pits[pit]!;
  pits[pit] = 0;
  let i = pit;
  const path: number[] = [];
  while (seeds > 0) {
    i = (i + 1) % 14;
    if (i === enemyStore) continue;
    pits[i]!++;
    seeds--;
    path.push(i);
  }
  let captured = 0;
  if (sideOf(i) === me && pits[i] === 1 && pits[12 - i]! > 0) {
    captured = pits[12 - i]! + 1;
    pits[STORE[me]]! += captured;
    pits[i] = 0;
    pits[12 - i] = 0;
  }
  const extra = i === STORE[me];
  let next: State = { pits, turn: extra ? me : ((1 - me) as 0 | 1) };
  if (isOver(next)) {
    // The side that still has seeds keeps them.
    for (let k = 0; k < 6; k++) {
      pits[6]! += pits[k]!;
      pits[k] = 0;
    }
    for (let k = 7; k < 13; k++) {
      pits[13]! += pits[k]!;
      pits[k] = 0;
    }
    next = { pits, turn: next.turn };
  }
  return { state: next, path, extra, captured };
}

/** Final seeds: [player, CPU]. */
export function score(s: State): [number, number] {
  return [s.pits[6]!, s.pits[13]!];
}

function evaluate(s: State, me: 0 | 1): number {
  const other = (1 - me) as 0 | 1;
  const diff = s.pits[STORE[me]]! - s.pits[STORE[other]]!;
  if (isOver(s)) return diff * 100;
  let mine = 0;
  let theirs = 0;
  for (let i = 0; i < 6; i++) {
    mine += s.pits[me === 0 ? i : i + 7]!;
    theirs += s.pits[me === 0 ? i + 7 : i]!;
  }
  return diff * 10 + (mine - theirs) * 0.5;
}

function search(s: State, depth: number, alpha: number, beta: number, me: 0 | 1): number {
  if (depth === 0 || isOver(s)) return evaluate(s, me);
  const list = moves(s);
  if (s.turn === me) {
    let best = -Infinity;
    for (const m of list) {
      const v = search(play(s, m)!.state, depth - 1, alpha, beta, me);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of list) {
    const v = search(play(s, m)!.state, depth - 1, alpha, beta, me);
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** The CPU's pit for the side to move: deeper search and fewer slips as `level` grows. */
export function cpuMove(s: State, level: number, rng: () => number = Math.random): number {
  const list = moves(s);
  if (list.length === 0) return -1;
  const noise = Math.max(0, 0.35 - 0.08 * (level - 1));
  if (rng() < noise) return list[Math.floor(rng() * list.length)]!;
  const depth = Math.min(8, 1 + level);
  let best = list[0]!;
  let bestValue = -Infinity;
  for (const m of list) {
    const v = search(play(s, m)!.state, depth - 1, -Infinity, Infinity, s.turn);
    if (v > bestValue) {
      bestValue = v;
      best = m;
    }
  }
  return best;
}
