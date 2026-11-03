/**
 * "Pontinhos" — pure rules of Dots and Boxes on a 4×4 box grid (5×5 dots). Players take turns
 * drawing one line between two neighbouring dots; whoever draws the fourth side of a box owns it
 * and plays again. The most boxes wins.
 *
 * Edge ids: horizontal edge (r, c) with r 0..4, c 0..3 is `r * 4 + c` (0..19); vertical edge
 * (r, c) with r 0..3, c 0..4 is `20 + r * 5 + c` (20..39). Box (r, c) is `r * 4 + c`.
 */
export const BOXES = 4;
export const EDGES = 2 * BOXES * (BOXES + 1);
export type Who = 1 | 2;

export const hEdge = (r: number, c: number) => r * BOXES + c;
export const vEdge = (r: number, c: number) => BOXES * (BOXES + 1) + r * (BOXES + 1) + c;

/** The four edges around box `b`. */
export function boxEdges(b: number): [number, number, number, number] {
  const r = Math.floor(b / BOXES);
  const c = b % BOXES;
  return [hEdge(r, c), hEdge(r + 1, c), vEdge(r, c), vEdge(r, c + 1)];
}

const BOX_COUNT = BOXES * BOXES;
/** Boxes touched by each edge. */
const TOUCHES: readonly (readonly number[])[] = Array.from({ length: EDGES }, (_, e) =>
  Array.from({ length: BOX_COUNT }, (_, b) => b).filter((b) => boxEdges(b).includes(e)),
);

export interface State {
  readonly edges: readonly boolean[];
  /** Owner of each box: 0 free, otherwise the player. */
  readonly owner: readonly (0 | Who)[];
  readonly turn: Who;
}

export function newGame(): State {
  return {
    edges: Array.from({ length: EDGES }, () => false),
    owner: Array.from({ length: BOX_COUNT }, () => 0 as 0 | Who),
    turn: 1,
  };
}

const sidesDrawn = (edges: readonly boolean[], b: number) =>
  boxEdges(b).filter((e) => edges[e]).length;

export function freeEdges(s: State): number[] {
  const out: number[] = [];
  for (let e = 0; e < EDGES; e++) if (!s.edges[e]) out.push(e);
  return out;
}

export interface Played {
  readonly state: State;
  /** Boxes this line closed (the same player moves again if any). */
  readonly closed: readonly number[];
}

export function play(s: State, e: number): Played | null {
  if (e < 0 || e >= EDGES || s.edges[e]) return null;
  const edges = [...s.edges];
  edges[e] = true;
  const owner = [...s.owner];
  const closed: number[] = [];
  for (const b of TOUCHES[e]!) {
    if (owner[b] === 0 && sidesDrawn(edges, b) === 4) {
      owner[b] = s.turn;
      closed.push(b);
    }
  }
  const turn: Who = closed.length > 0 ? s.turn : s.turn === 1 ? 2 : 1;
  return { state: { edges, owner, turn }, closed };
}

export function isOver(s: State): boolean {
  return s.owner.every((o) => o !== 0);
}

export function scores(s: State): [number, number] {
  return [s.owner.filter((o) => o === 1).length, s.owner.filter((o) => o === 2).length];
}

/** Boxes the player to move could grab in a row by always closing a box. */
function grabAll(s: State): number {
  let cur = s;
  let total = 0;
  for (;;) {
    let took = false;
    for (const e of freeEdges(cur)) {
      const r = play(cur, e)!;
      if (r.closed.length > 0 && r.state.turn === cur.turn) {
        cur = r.state;
        total += r.closed.length;
        took = true;
        break;
      }
    }
    if (!took) return total;
  }
}

/** The line the side to move draws: grab boxes, avoid giving them away, else give the fewest. */
export function cpuMove(s: State, level: number, rng: () => number = Math.random): number {
  const free = freeEdges(s);
  if (free.length === 0) return -1;
  const pick = (list: number[]) => list[Math.floor(rng() * list.length)]!;
  const closing = free.filter((e) => play(s, e)!.closed.length > 0);
  // A beginner sometimes misses a free box.
  if (closing.length > 0 && !(level === 1 && rng() < 0.3)) return pick(closing);
  if (level === 1 && rng() < 0.35) return pick(free);
  const safe = free.filter((e) => {
    const next = play(s, e)!.state;
    return next.owner.every((o, b) => o !== 0 || sidesDrawn(next.edges, b) < 3);
  });
  if (safe.length > 0) return pick(safe);
  // Every line gives something away: give the smallest chain.
  let best = free[0]!;
  let fewest = Infinity;
  for (const e of free) {
    const given = grabAll(play(s, e)!.state);
    if (given < fewest) {
      fewest = given;
      best = e;
    }
  }
  return best;
}
