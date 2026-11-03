/**
 * "Travessia do Rio" — pure rules (missionaries and cannibals). Ferry everyone across; the boat
 * carries up to `cap` and needs a rower. On either bank, and in the boat, cannibals may never
 * outnumber the missionaries when at least one missionary is there.
 */
export interface Level {
  n: number;
  cap: number;
}
/** Missionaries (m) and cannibals (c) on the left bank, and which bank the boat is at. */
export interface State {
  m: number;
  c: number;
  boat: 0 | 1;
}

export const LEVELS: readonly Level[] = [
  { n: 2, cap: 2 },
  { n: 3, cap: 2 },
  { n: 4, cap: 3 },
  { n: 5, cap: 3 },
  { n: 6, cap: 4 },
];

export function levelFor(level: number): Level {
  return LEVELS[Math.min(level, LEVELS.length) - 1]!;
}

export function start(l: Level): State {
  return { m: l.n, c: l.n, boat: 0 };
}

export function safe(l: Level, s: { m: number; c: number }): boolean {
  const rm = l.n - s.m;
  const rc = l.n - s.c;
  return (s.m === 0 || s.m >= s.c) && (rm === 0 || rm >= rc);
}

/** Crosses with `m` missionaries and `c` cannibals. Null if the trip is not allowed. */
export function cross(l: Level, s: State, m: number, c: number): State | null {
  if (m < 0 || c < 0 || m + c < 1 || m + c > l.cap) return null;
  if (m > 0 && c > m) return null;
  const from = s.boat === 0 ? { m: s.m, c: s.c } : { m: l.n - s.m, c: l.n - s.c };
  if (m > from.m || c > from.c) return null;
  const dir = s.boat === 0 ? -1 : 1;
  const next: State = { m: s.m + dir * m, c: s.c + dir * c, boat: s.boat === 0 ? 1 : 0 };
  return safe(l, next) ? next : null;
}

export function isSolved(s: State): boolean {
  return s.m === 0 && s.c === 0;
}

const key = (s: State) => `${s.m},${s.c},${s.boat}`;

/** Fewest crossings (breadth-first), or null if the level cannot be solved. */
export function solve(l: Level): number | null {
  const seen = new Set([key(start(l))]);
  let frontier = [start(l)];
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: State[] = [];
    for (const s of frontier) {
      if (isSolved(s)) return depth;
      for (let m = 0; m <= l.cap; m++) {
        for (let c = 0; m + c <= l.cap; c++) {
          const t = cross(l, s, m, c);
          if (t && !seen.has(key(t))) {
            seen.add(key(t));
            next.push(t);
          }
        }
      }
    }
    frontier = next;
  }
  return null;
}
