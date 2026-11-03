/**
 * "Dado Rolante" — pure rules. A die rolls over the board one square at a time (it tips over an
 * edge, so the faces change). Reach the flag with the target number on top. Opposite faces add
 * up to 7. Puzzles come from a random roll sequence, so they can always be solved.
 */
export interface Die {
  top: number;
  north: number;
  east: number;
}
export const bottom = (d: Die): number => 7 - d.top;
export const south = (d: Die): number => 7 - d.north;
export const west = (d: Die): number => 7 - d.east;

/** Directions: 0 north, 1 south, 2 west, 3 east. */
export const DR = [-1, 1, 0, 0] as const;
export const DC = [0, 0, -1, 1] as const;

export function roll(d: Die, dir: number): Die {
  switch (dir) {
    case 0:
      return { top: south(d), north: d.top, east: d.east };
    case 1:
      return { top: d.north, north: bottom(d), east: d.east };
    case 2:
      return { top: d.east, north: d.north, east: bottom(d) };
    default:
      return { top: west(d), north: d.north, east: d.top };
  }
}

export interface Puzzle {
  size: number;
  walls: boolean[];
  start: number;
  goal: number;
  /** The number that must be on top at the goal. */
  target: number;
  /** Fewest rolls. */
  par: number;
}

export const START_DIE: Die = { top: 1, north: 2, east: 3 };
export const sizeFor = (level: number): number => Math.min(6, 3 + Math.ceil(level / 2));

export function step(size: number, walls: readonly boolean[], at: number, dir: number): number {
  const r = Math.floor(at / size) + DR[dir]!;
  const c = (at % size) + DC[dir]!;
  if (r < 0 || r >= size || c < 0 || c >= size || walls[r * size + c]) return -1;
  return r * size + c;
}

const key = (at: number, d: Die) => `${at}:${d.top}${d.north}${d.east}`;

/** Fewest rolls to put the die on `goal` with `target` on top, or null. */
export function solve(p: Omit<Puzzle, 'par'>): number | null {
  const seen = new Set([key(p.start, START_DIE)]);
  let frontier: Array<{ at: number; d: Die }> = [{ at: p.start, d: START_DIE }];
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const s of frontier) {
      if (s.at === p.goal && s.d.top === p.target) return depth;
      for (let dir = 0; dir < 4; dir++) {
        const at = step(p.size, p.walls, s.at, dir);
        if (at < 0) continue;
        const d = roll(s.d, dir);
        const k = key(at, d);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ at, d });
      }
    }
    frontier = next;
  }
  return null;
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const size = sizeFor(level);
  for (let attempt = 0; attempt < 200; attempt++) {
    const walls = Array.from({ length: size * size }, () => rng() < 0.12);
    const start = Math.floor(rng() * size * size);
    walls[start] = false;
    let at = start;
    let d = START_DIE;
    const want = 4 + level;
    for (let i = 0; i < want * 4 && i < 60; i++) {
      const dir = Math.floor(rng() * 4);
      const to = step(size, walls, at, dir);
      if (to < 0) continue;
      at = to;
      d = roll(d, dir);
    }
    if (at === start) continue;
    const base = { size, walls, start, goal: at, target: d.top };
    const par = solve(base);
    if (par !== null && par >= Math.min(4, want - 1)) return { ...base, par };
  }
  const walls = Array.from({ length: 9 }, () => false);
  const base = { size: 3, walls, start: 0, goal: 2, target: roll(roll(START_DIE, 3), 3).top };
  return { ...base, par: solve(base)! };
}
