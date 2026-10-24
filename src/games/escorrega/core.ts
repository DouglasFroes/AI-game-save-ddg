import { randInt, type Rnd } from '@/platform/rnd';

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Readonly<Record<Dir, { dx: number; dy: number }>> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
const ALL_DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

export interface Pos {
  x: number;
  y: number;
}

export interface Level {
  w: number;
  h: number;
  /** rocks[y][x] — a slide stops right before one. */
  rocks: boolean[][];
  start: Pos;
  /** Sliding onto the exit stops you there. */
  exit: Pos;
  /** Fewest moves needed. */
  par: number;
}

export interface SlideResult {
  /** Every cell passed through, ending where the slide stopped (empty if blocked). */
  path: Pos[];
  end: Pos;
  atExit: boolean;
}

/** Slides from `from` until a rock, the edge or the exit stops the movement. */
export function slide(
  level: Pick<Level, 'w' | 'h' | 'rocks' | 'exit'>,
  from: Pos,
  dir: Dir,
): SlideResult {
  const { dx, dy } = DIRS[dir];
  const path: Pos[] = [];
  let { x, y } = from;
  for (;;) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h || level.rocks[ny]![nx]) break;
    x = nx;
    y = ny;
    path.push({ x, y });
    if (x === level.exit.x && y === level.exit.y) break;
  }
  return { path, end: { x, y }, atExit: x === level.exit.x && y === level.exit.y };
}

interface Search {
  dist: Map<number, number>;
  prev: Map<number, { from: number; dir: Dir }>;
}

/** Breadth-first search over the places you can stop. */
function search(level: Pick<Level, 'w' | 'h' | 'rocks' | 'exit'>, start: Pos): Search {
  const key = (p: Pos) => p.y * level.w + p.x;
  const dist = new Map<number, number>([[key(start), 0]]);
  const prev = new Map<number, { from: number; dir: Dir }>();
  const queue: Pos[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const d = dist.get(key(cur))!;
    if (cur.x === level.exit.x && cur.y === level.exit.y) continue;
    for (const dir of ALL_DIRS) {
      const { end, path } = slide(level, cur, dir);
      if (path.length === 0 || dist.has(key(end))) continue;
      dist.set(key(end), d + 1);
      prev.set(key(end), { from: key(cur), dir });
      queue.push(end);
    }
  }
  return { dist, prev };
}

/** The shortest list of moves from `from` to the exit, or null when it can't be reached. */
export function solve(level: Pick<Level, 'w' | 'h' | 'rocks' | 'exit'>, from: Pos): Dir[] | null {
  const { dist, prev } = search(level, from);
  const goal = level.exit.y * level.w + level.exit.x;
  if (!dist.has(goal)) return null;
  const moves: Dir[] = [];
  const startKey = from.y * level.w + from.x;
  for (let k = goal; k !== startKey;) {
    const step = prev.get(k)!;
    moves.unshift(step.dir);
    k = step.from;
  }
  return moves;
}

/** Board size and the minimum solution length grow with the level. */
export function levelSpec(level: number): {
  w: number;
  h: number;
  minPar: number;
  density: number;
} {
  const size = Math.min(5 + Math.floor((level - 1) / 3), 8);
  return {
    w: size,
    h: Math.min(size + 2, 10),
    minPar: Math.min(3 + Math.floor((level + 1) / 2), 11),
    density: 0.17 + Math.min(level, 12) * 0.008,
  };
}

/** Builds a level that is always solvable and at least `minPar` moves long. */
export function generateLevel(level: number, rnd: Rnd): Level {
  const spec = levelSpec(level);
  let best: Level | null = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    const rocks = Array.from({ length: spec.h }, () =>
      Array.from({ length: spec.w }, () => rnd() < spec.density),
    );
    const start = { x: randInt(rnd, 0, spec.w - 1), y: randInt(rnd, 0, spec.h - 1) };
    rocks[start.y]![start.x] = false;
    const base = { w: spec.w, h: spec.h, rocks, exit: { x: -1, y: -1 } };
    const open = search(base, start);
    // The farthest stopping places make the best exits.
    const far = [...open.dist.entries()]
      .filter(([, d]) => d >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    for (const [k] of far) {
      const exit = { x: k % spec.w, y: Math.floor(k / spec.w) };
      const moves = solve({ ...base, exit }, start);
      if (!moves) continue;
      const candidate: Level = { w: spec.w, h: spec.h, rocks, start, exit, par: moves.length };
      if (moves.length >= spec.minPar) return candidate;
      if (!best || candidate.par > best.par) best = candidate;
    }
  }
  // Extremely unlikely: settle for the longest one we saw.
  if (best) return best;
  const rocks = Array.from({ length: spec.h }, () => Array.from({ length: spec.w }, () => false));
  return {
    w: spec.w,
    h: spec.h,
    rocks,
    start: { x: 0, y: 0 },
    exit: { x: spec.w - 1, y: 0 },
    par: 1,
  };
}

export type EscorregaEvent =
  | { type: 'slide'; result: SlideResult }
  | { type: 'blocked' }
  | {
      type: 'solved';
      moves: number;
      par: number;
      perfect: boolean;
      points: number;
      bonusTime: number;
    }
  | { type: 'timeUp' };

/** "Escorrega": the clock is a bank — each solved level refills it, perfect solutions refill more. */
export class EscorregaSim {
  level = 1;
  levelsDone = 0;
  time = 60;
  score = 0;
  moves = 0;
  pos: Pos;
  data: Level;
  over = false;
  hintsUsed = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.data = generateLevel(this.level, this.rnd);
    this.pos = { ...this.data.start };
  }

  get solved(): boolean {
    return this.pos.x === this.data.exit.x && this.pos.y === this.data.exit.y;
  }

  step(dt: number): EscorregaEvent[] {
    if (this.over) return [];
    this.time = Math.max(0, this.time - dt);
    if (this.time > 0) return [];
    this.over = true;
    return [{ type: 'timeUp' }];
  }

  move(dir: Dir): EscorregaEvent[] {
    if (this.over || this.solved) return [];
    const result = slide(this.data, this.pos, dir);
    if (result.path.length === 0) return [{ type: 'blocked' }];
    this.pos = result.end;
    this.moves++;
    const events: EscorregaEvent[] = [{ type: 'slide', result }];
    if (result.atExit) {
      const perfect = this.moves <= this.data.par;
      const points = 100 + this.level * 20 + (perfect ? 60 : 0);
      const bonusTime = perfect ? 16 : 9;
      this.score += points;
      this.time += bonusTime;
      this.levelsDone++;
      events.push({
        type: 'solved',
        moves: this.moves,
        par: this.data.par,
        perfect,
        points,
        bonusTime,
      });
    }
    return events;
  }

  /** Back to the start of the level; the clock keeps running. */
  restart(): void {
    if (this.over) return;
    this.pos = { ...this.data.start };
    this.moves = 0;
  }

  /** Costs time, returns the next move of a shortest solution from where you stand. */
  hint(): Dir | null {
    if (this.over || this.solved || this.time <= 7) return null;
    const moves = solve(this.data, this.pos);
    if (!moves || moves.length === 0) return null;
    this.time -= 6;
    this.hintsUsed++;
    return moves[0]!;
  }

  nextLevel(): void {
    this.level++;
    this.data = generateLevel(this.level, this.rnd);
    this.pos = { ...this.data.start };
    this.moves = 0;
  }
}
