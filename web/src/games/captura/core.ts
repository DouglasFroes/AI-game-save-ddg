/**
 * "Captura" — pure rules of capture Go on a 7×7 board. Players alternately place a stone on an
 * empty point. A group of stones with no empty neighbour (no "liberty") is captured and removed;
 * a move that would leave your own group without liberties is illegal unless it captures. The
 * first player to capture three stones wins.
 */
export const N = 7;
export const TO_WIN = 3;
export type Who = 1 | 2;
export type Cell = 0 | Who;

export interface State {
  readonly board: readonly Cell[];
  readonly turn: Who;
  /** Stones captured so far, [player, CPU]. */
  readonly caps: readonly [number, number];
}

export function newGame(): State {
  return { board: Array.from({ length: N * N }, () => 0 as Cell), turn: 1, caps: [0, 0] };
}

function neighbours(i: number): number[] {
  const r = Math.floor(i / N);
  const c = i % N;
  const out: number[] = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
}

/** The connected group at `i` and its liberties. */
export function groupAt(b: readonly Cell[], i: number): { stones: number[]; libs: Set<number> } {
  const who = b[i]!;
  const stones: number[] = [];
  const libs = new Set<number>();
  const seen = new Set<number>([i]);
  const stack = [i];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    stones.push(cur);
    for (const nb of neighbours(cur)) {
      if (b[nb] === 0) libs.add(nb);
      else if (b[nb] === who && !seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return { stones, libs };
}

export interface Played {
  readonly state: State;
  /** Points whose stones were captured. */
  readonly captured: readonly number[];
}

export function play(s: State, i: number): Played | null {
  if (i < 0 || i >= N * N || s.board[i] !== 0) return null;
  const board = [...s.board];
  board[i] = s.turn;
  const foe: Who = s.turn === 1 ? 2 : 1;
  const captured: number[] = [];
  for (const nb of neighbours(i)) {
    if (board[nb] !== foe) continue;
    const g = groupAt(board, nb);
    if (g.libs.size === 0) {
      for (const st of g.stones) {
        if (board[st] === foe) {
          board[st] = 0;
          captured.push(st);
        }
      }
    }
  }
  // No suicide: the new group must keep a liberty (or have just captured).
  if (captured.length === 0 && groupAt(board, i).libs.size === 0) return null;
  const caps: [number, number] = [s.caps[0], s.caps[1]];
  caps[s.turn - 1]! += captured.length;
  return { state: { board, turn: foe, caps }, captured };
}

export function legal(s: State): number[] {
  const out: number[] = [];
  for (let i = 0; i < N * N; i++) if (s.board[i] === 0 && play(s, i)) out.push(i);
  return out;
}

/** 0 while playing; the winner; 3 when the board is full of stalemate with equal captures. */
export function winner(s: State): 0 | Who | 3 {
  if (s.caps[0] >= TO_WIN) return 1;
  if (s.caps[1] >= TO_WIN) return 2;
  if (legal(s).length === 0) return s.caps[0] > s.caps[1] ? 1 : s.caps[1] > s.caps[0] ? 2 : 3;
  return 0;
}

/** Groups of `who` that are down to one liberty (about to be captured). */
export function inAtari(b: readonly Cell[], who: Who): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== who || seen.has(i)) continue;
    const g = groupAt(b, i);
    for (const st of g.stones) seen.add(st);
    if (g.libs.size === 1) out.push(g.stones);
  }
  return out;
}

/** The point the side to move picks: capture, save, threaten, stay safe. */
export function cpuMove(s: State, level: number, rng: () => number = Math.random): number {
  const list = legal(s);
  if (list.length === 0) return -1;
  const me = s.turn;
  const foe: Who = me === 1 ? 2 : 1;
  const mid = (N - 1) / 2;
  const saved = new Set(inAtari(s.board, me).flat());
  const scored = list.map((i) => {
    const res = play(s, i)!;
    const b = res.state.board;
    let v = res.captured.length * 220;
    v += inAtari(b, foe).length * 50;
    const mine = groupAt(b, i);
    v += mine.libs.size === 1 ? -140 : mine.libs.size * 5;
    if (mine.stones.some((st) => saved.has(st)) && mine.libs.size > 1) v += 110;
    const r = Math.floor(i / N);
    const c = i % N;
    v -= (Math.abs(r - mid) + Math.abs(c - mid)) * 2;
    if (level >= 3) {
      // Look one reply ahead: don't leave something the opponent can capture right away.
      let worst = 0;
      for (const j of legal(res.state)) {
        const reply = play(res.state, j);
        if (reply && reply.captured.length > worst) worst = reply.captured.length;
      }
      v -= worst * 200;
    }
    return { i, v: v + rng() * (70 / level) };
  });
  scored.sort((a, b) => b.v - a.v);
  if (level === 1 && rng() < 0.25) return scored[Math.min(scored.length - 1, 3)]!.i;
  return scored[0]!.i;
}
