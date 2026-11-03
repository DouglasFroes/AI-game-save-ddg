/**
 * "Muralha" — pure rules of a walls-and-pawns race (Quoridor) on a 9×9 board. Each side has one
 * pawn and ten walls. A turn either steps the pawn one square (jumping an adjacent enemy pawn) or
 * places a two-square wall to slow the opponent; a wall may never close off the only way to the
 * goal. The player starts at the bottom and runs to the top row; the CPU does the opposite.
 */
export const N = 9;
export const WALLS = 10;
export type Who = 0 | 1;

export interface Pawn {
  readonly r: number;
  readonly c: number;
}

/** A wall anchored at (r, c) with r, c in 0..7: horizontal blocks the edge between rows r and r+1
 *  over columns c and c+1; vertical blocks the edge between columns c and c+1 over rows r and r+1. */
export interface Wall {
  readonly o: 'h' | 'v';
  readonly r: number;
  readonly c: number;
}

export interface State {
  readonly pawns: readonly [Pawn, Pawn];
  readonly walls: readonly Wall[];
  readonly left: readonly [number, number];
  readonly turn: Who;
}

export function newGame(): State {
  return {
    pawns: [
      { r: N - 1, c: 4 },
      { r: 0, c: 4 },
    ],
    walls: [],
    left: [WALLS, WALLS],
    turn: 0,
  };
}

export const goalRow = (who: Who): number => (who === 0 ? 0 : N - 1);

/** True when a wall blocks the step from (r, c) by (dr, dc) (one of the four directions). */
export function blocked(
  walls: readonly Wall[],
  r: number,
  c: number,
  dr: number,
  dc: number,
): boolean {
  for (const w of walls) {
    if (dr !== 0) {
      // Moving vertically crosses a horizontal wall between rows min(r, r+dr) and +1.
      const row = dr > 0 ? r : r - 1;
      if (w.o === 'h' && w.r === row && (w.c === c || w.c === c - 1)) return true;
    } else {
      const col = dc > 0 ? c : c - 1;
      if (w.o === 'v' && w.c === col && (w.r === r || w.r === r - 1)) return true;
    }
  }
  return false;
}

const inside = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N;
const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** Squares the pawn of `who` can step to (with jumps over the other pawn). */
export function pawnMoves(s: State, who: Who): Pawn[] {
  const me = s.pawns[who];
  const foe = s.pawns[1 - who]!;
  const out: Pawn[] = [];
  for (const [dr, dc] of DIRS) {
    const r = me.r + dr;
    const c = me.c + dc;
    if (!inside(r, c) || blocked(s.walls, me.r, me.c, dr, dc)) continue;
    if (r !== foe.r || c !== foe.c) {
      out.push({ r, c });
      continue;
    }
    const jr = r + dr;
    const jc = c + dc;
    if (inside(jr, jc) && !blocked(s.walls, r, c, dr, dc)) {
      out.push({ r: jr, c: jc });
      continue;
    }
    // Straight jump blocked: step diagonally round the enemy pawn.
    for (const [sr, sc] of DIRS) {
      if ((sr === 0) === (dr === 0)) continue;
      const nr = r + sr;
      const nc = c + sc;
      if (inside(nr, nc) && !blocked(s.walls, r, c, sr, sc)) out.push({ r: nr, c: nc });
    }
  }
  return out;
}

/** Shortest number of steps for `who` to the goal row, ignoring the other pawn (Infinity: sealed). */
export function pathLength(walls: readonly Wall[], from: Pawn, who: Who): number {
  const goal = goalRow(who);
  const dist = new Array<number>(N * N).fill(-1);
  const queue: number[] = [from.r * N + from.c];
  dist[queue[0]!] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    const r = Math.floor(cur / N);
    const c = cur % N;
    if (r === goal) return dist[cur]!;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inside(nr, nc) || blocked(walls, r, c, dr, dc)) continue;
      const ni = nr * N + nc;
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[cur]! + 1;
      queue.push(ni);
    }
  }
  return Infinity;
}

export function canWall(s: State, w: Wall): boolean {
  if (s.left[s.turn]! <= 0 || w.r < 0 || w.r > N - 2 || w.c < 0 || w.c > N - 2) return false;
  for (const o of s.walls) {
    if (o.o === w.o) {
      if (w.o === 'h' && o.r === w.r && Math.abs(o.c - w.c) <= 1) return false;
      if (w.o === 'v' && o.c === w.c && Math.abs(o.r - w.r) <= 1) return false;
    } else if (o.r === w.r && o.c === w.c) return false;
  }
  const walls = [...s.walls, w];
  return (
    pathLength(walls, s.pawns[0], 0) !== Infinity && pathLength(walls, s.pawns[1], 1) !== Infinity
  );
}

export type Move =
  { readonly kind: 'step'; readonly to: Pawn } | { readonly kind: 'wall'; readonly wall: Wall };

export function apply(s: State, m: Move): State {
  const turn = (1 - s.turn) as Who;
  if (m.kind === 'step') {
    const pawns: [Pawn, Pawn] = [s.pawns[0], s.pawns[1]];
    pawns[s.turn] = m.to;
    return { ...s, pawns, turn };
  }
  const left: [number, number] = [s.left[0], s.left[1]];
  left[s.turn]!--;
  return { ...s, walls: [...s.walls, m.wall], left, turn };
}

export function winner(s: State): Who | null {
  if (s.pawns[0].r === goalRow(0)) return 0;
  if (s.pawns[1].r === goalRow(1)) return 1;
  return null;
}

export function wallMoves(s: State): Wall[] {
  const out: Wall[] = [];
  for (const o of ['h', 'v'] as const)
    for (let r = 0; r < N - 1; r++)
      for (let c = 0; c < N - 1; c++) if (canWall(s, { o, r, c })) out.push({ o, r, c });
  return out;
}

/** How far ahead `who` is in the race (opponent's path minus own), plus a little for spare walls. */
function lead(s: State, who: Who): number {
  const mine = pathLength(s.walls, s.pawns[who], who);
  const theirs = pathLength(s.walls, s.pawns[1 - who]!, (1 - who) as Who);
  return theirs - mine + (s.left[who]! - s.left[1 - who]!) * 0.15;
}

/** The move for the side to move: greedy on the race, one reply deep from level 3. */
export function cpuMove(s: State, level: number, rng: () => number = Math.random): Move {
  const who = s.turn;
  const steps = pawnMoves(s, who).map((to): Move => ({ kind: 'step', to }));
  const noise = Math.max(0, 0.35 - 0.1 * (level - 1));
  if (rng() < noise) return steps[Math.floor(rng() * steps.length)]!;
  const foePath = pathLength(s.walls, s.pawns[1 - who]!, (1 - who) as Who);
  const candidates: Move[] = [...steps];
  if (s.left[who]! > 0 && foePath < Infinity) {
    for (const wall of wallMoves(s)) {
      const after = pathLength([...s.walls, wall], s.pawns[1 - who]!, (1 - who) as Who);
      if (after > foePath) candidates.push({ kind: 'wall', wall });
    }
  }
  let scored = candidates.map((m) => ({ m, v: lead(apply(s, m), who) + rng() * 0.2 }));
  if (level >= 3) {
    scored.sort((a, b) => b.v - a.v);
    scored = scored.slice(0, 6).map(({ m }) => {
      const next = apply(s, m);
      let worst = Infinity;
      const replies: Move[] = pawnMoves(next, next.turn).map((to) => ({ kind: 'step', to }));
      for (const r of replies) worst = Math.min(worst, lead(apply(next, r), who));
      return { m, v: Math.min(worst, lead(next, who)) + rng() * 0.2 };
    });
  }
  scored.sort((a, b) => b.v - a.v);
  return scored[0]!.m;
}
