/**
 * "Hex" — pure rules of Hex on a 7×7 board. The player (1) joins the top and bottom edges, the CPU
 * (2) joins left and right; a stone can't be removed and there are no draws, so someone always wins.
 * The CPU rates a position by shortest-path "resistance" (cells still needed to connect).
 */
export const N = 7;
export type Cell = 0 | 1 | 2;
export type Board = readonly Cell[];

export const newBoard = (): Cell[] => Array.from({ length: N * N }, () => 0 as Cell);

const idx = (r: number, c: number) => r * N + c;
const NEIGH = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [1, -1],
] as const;

export function neighbours(i: number): number[] {
  const r = Math.floor(i / N);
  const c = i % N;
  const out: number[] = [];
  for (const [dr, dc] of NEIGH) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(idx(nr, nc));
  }
  return out;
}

export function place(b: Board, i: number, who: 1 | 2): Cell[] | null {
  if (b[i] !== 0) return null;
  const next = [...b];
  next[i] = who;
  return next;
}

/** Cells still to fill for `who` to connect their two edges (0 = connected; Infinity = blocked). */
export function distance(b: Board, who: 1 | 2): number {
  const other = who === 1 ? 2 : 1;
  const dist = new Array<number>(N * N).fill(Infinity);
  // 0-1 style relaxation with a simple queue (the board is tiny).
  const queue: number[] = [];
  const startsHere = (i: number) => (who === 1 ? Math.floor(i / N) === 0 : i % N === 0);
  const endsHere = (i: number) => (who === 1 ? Math.floor(i / N) === N - 1 : i % N === N - 1);
  const cost = (i: number) => (b[i] === who ? 0 : 1);
  for (let i = 0; i < N * N; i++) {
    if (startsHere(i) && b[i] !== other) {
      dist[i] = cost(i);
      queue.push(i);
    }
  }
  while (queue.length > 0) {
    // Pick the smallest tentative distance (N*N = 49, so a scan is fine).
    let bi = 0;
    for (let k = 1; k < queue.length; k++) if (dist[queue[k]!]! < dist[queue[bi]!]!) bi = k;
    const cur = queue.splice(bi, 1)[0]!;
    for (const nb of neighbours(cur)) {
      if (b[nb] === other) continue;
      const d = dist[cur]! + cost(nb);
      if (d < dist[nb]!) {
        dist[nb] = d;
        queue.push(nb);
      }
    }
  }
  let best = Infinity;
  for (let i = 0; i < N * N; i++) if (endsHere(i) && dist[i]! < best) best = dist[i]!;
  return best;
}

export function winner(b: Board): 0 | 1 | 2 {
  if (distance(b, 1) === 0) return 1;
  if (distance(b, 2) === 0) return 2;
  return 0;
}

/** Positive when `who` is ahead in the race to connect. */
function rate(b: Board, who: 1 | 2): number {
  const other = who === 1 ? 2 : 1;
  const mine = distance(b, who);
  const theirs = distance(b, other);
  if (mine === 0) return 1000;
  if (theirs === 0) return -1000;
  return theirs - mine;
}

/** The cell `who` plays: shallow search, with more care and fewer slips as `level` grows. */
export function cpuMove(
  b: Board,
  who: 1 | 2,
  level: number,
  rng: () => number = Math.random,
): number {
  const free: number[] = [];
  for (let i = 0; i < N * N; i++) if (b[i] === 0) free.push(i);
  if (free.length === 0) return -1;
  const other = who === 1 ? 2 : 1;
  const noise = Math.max(0, 0.45 - 0.1 * (level - 1));
  if (rng() < noise) return free[Math.floor(rng() * free.length)]!;
  const scored = free.map((i) => ({ i, v: rate(place(b, i, who)!, who) + rng() * 0.3 }));
  scored.sort((a, c) => c.v - a.v);
  if (level < 3) return scored[0]!.i;
  // Two plies: the best few candidates, each answered by the opponent's strongest reply.
  let best = scored[0]!.i;
  let bestValue = -Infinity;
  for (const cand of scored.slice(0, 8)) {
    const after = place(b, cand.i, who)!;
    let worst = Infinity;
    for (let j = 0; j < N * N; j++) {
      if (after[j] !== 0) continue;
      const v = rate(place(after, j, other)!, who);
      if (v < worst) worst = v;
    }
    if (worst > bestValue) {
      bestValue = worst;
      best = cand.i;
    }
  }
  return best;
}
