import { randInt, shuffle, type Rnd } from '@/platform/rnd';

/** 0 = right, 1 = down, 2 = left, 3 = up. */
export type Heading = 0 | 1 | 2 | 3;
const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

/** '/' and '\\' mirrors, or an empty cell. */
export type Cell = '' | '/' | '\\';

export interface Level {
  size: number;
  /** Row the laser enters from, on the left edge, heading right. */
  entryRow: number;
  grid: Cell[][];
  crystals: Array<{ x: number; y: number }>;
}

export interface Trace {
  /** Corner points of the beam, starting outside the left edge. */
  points: Array<{ x: number; y: number }>;
  /** Indexes into `level.crystals` that the beam passes through. */
  hit: Set<number>;
  /** True when the beam ran into a cycle instead of leaving the board. */
  looped: boolean;
}

/** '/' sends right→up, down→left, left→down, up→right. */
function bounce(heading: Heading, mirror: '/' | '\\'): Heading {
  if (mirror === '/') return ([3, 2, 1, 0] as const)[heading];
  return ([1, 0, 3, 2] as const)[heading];
}

export function traceBeam(level: Level): Trace {
  const points = [{ x: -1, y: level.entryRow }];
  const hit = new Set<number>();
  const seen = new Set<number>();
  let x = 0;
  let y = level.entryRow;
  let h: Heading = 0;
  let looped = false;
  for (let guard = 0; guard < level.size * level.size * 4 + 8; guard++) {
    if (x < 0 || y < 0 || x >= level.size || y >= level.size) {
      points.push({ x, y });
      return { points, hit, looped };
    }
    const key = (y * level.size + x) * 4 + h;
    if (seen.has(key)) {
      looped = true;
      break;
    }
    seen.add(key);
    const idx = level.crystals.findIndex((c) => c.x === x && c.y === y);
    if (idx >= 0) hit.add(idx);
    const m = level.grid[y]![x]!;
    if (m !== '') {
      h = bounce(h, m);
      points.push({ x, y });
    }
    x += DX[h];
    y += DY[h];
  }
  return { points, hit, looped };
}

export function solved(level: Level): boolean {
  return traceBeam(level).hit.size === level.crystals.length;
}

export function levelSpec(level: number): { size: number; turns: number; crystals: number } {
  const size = Math.min(5 + Math.floor((level - 1) / 3), 8);
  return {
    size,
    turns: Math.min(2 + Math.floor((level + 1) / 2), size),
    crystals: Math.min(2 + Math.floor(level / 2), 7),
  };
}

/**
 * Builds a beam path with the requested number of turns, puts crystals on it and then scrambles the
 * mirrors by flipping some of them — so a solution always exists (flip them back).
 */
export function generateLevel(index: number, rnd: Rnd): Level {
  const { size, turns, crystals } = levelSpec(index);
  // Hard boards rarely hit the exact turn count, so remember the twistiest valid one as a fallback.
  let best: { level: Level; made: number } | null = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const grid: Cell[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => '' as Cell),
    );
    const entryRow = randInt(rnd, 0, size - 1);
    const visited = new Set<number>();
    const free = (cx: number, cy: number) =>
      cx >= 0 && cy >= 0 && cx < size && cy < size && grid[cy]![cx] === '';
    let x = 0;
    let y = entryRow;
    let h: Heading = 0;
    let made = 0;
    let ok = true;
    // Walk the beam cell by cell, turning now and then. Straight crossings of plain cells are allowed,
    // but the beam never steps onto a mirror it didn't just place, so the traced path stays this one.
    for (let step = 0; step < size * size * 2; step++) {
      const k = y * size + x;
      const first = !visited.has(k);
      visited.add(k);
      if (first && made < turns && rnd() < 0.45) {
        const options: Heading[] = ([(h + 3) % 4, (h + 1) % 4] as Heading[]).filter((nh) =>
          free(x + DX[nh], y + DY[nh]),
        );
        if (options.length > 0) {
          const nh: Heading = options[randInt(rnd, 0, options.length - 1)]!;
          grid[y]![x] = mirrorFor(h, nh);
          h = nh;
          made++;
        }
      }
      const nx = x + DX[h];
      const ny = y + DY[h];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) break; // the beam leaves the board: done
      if (grid[ny]![nx] !== '') {
        ok = false; // would run into an existing mirror
        break;
      }
      x = nx;
      y = ny;
    }
    if (!ok || made < 1) continue;
    const mirrors: Array<{ x: number; y: number }> = [];
    grid.forEach((row, yy) => row.forEach((c, xx) => c !== '' && mirrors.push({ x: xx, y: yy })));
    const plain = [...visited]
      .map((k) => ({ x: k % size, y: Math.floor(k / size) }))
      .filter((p) => grid[p.y]![p.x] === '');
    if (plain.length < crystals) continue;
    const chosen = shuffle(rnd, [...plain]).slice(0, crystals);
    const level: Level = { size, entryRow, grid, crystals: chosen };
    if (!solved(level)) continue;

    // Scramble: flip at least half of the mirrors, and always at least one.
    const flips = shuffle(rnd, [...mirrors]);
    const count = Math.max(1, Math.ceil(flips.length * 0.6));
    for (const m of flips.slice(0, count)) {
      grid[m.y]![m.x] = grid[m.y]![m.x] === '/' ? '\\' : '/';
    }
    // Rare: the scramble landed on a solution again — try another board.
    if (solved(level)) continue;
    if (made >= turns - 1) return level;
    if (!best || made > best.made) best = { level, made };
  }
  if (best) return best.level;
  // Fallback: the simplest possible puzzle.
  const grid: Cell[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => '' as Cell),
  );
  grid[2]![2] = '\\';
  return { size: 5, entryRow: 2, grid, crystals: [{ x: 2, y: 4 }] };
}

/** The mirror that turns a beam heading `from` into heading `to`. */
function mirrorFor(from: Heading, to: Heading): '/' | '\\' {
  for (const m of ['/', '\\'] as const) if (bounce(from, m) === to) return m;
  return '/';
}

export function rotate(level: Level, x: number, y: number): boolean {
  const c = level.grid[y]?.[x];
  if (c === undefined || c === '') return false;
  level.grid[y]![x] = c === '/' ? '\\' : '/';
  return true;
}

export type EspelhosEvent =
  | { type: 'rotate'; x: number; y: number }
  | { type: 'solved'; points: number; bonusTime: number; taps: number }
  | { type: 'timeUp' };

/** "Espelhos": turn the mirrors so the laser lights every crystal. The clock is a bank. */
export class EspelhosSim {
  index = 1;
  time = 75;
  score = 0;
  levelsDone = 0;
  taps = 0;
  over = false;
  level: Level;
  trace: Trace;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.level = generateLevel(this.index, rnd);
    this.trace = traceBeam(this.level);
  }

  step(dt: number): EspelhosEvent[] {
    if (this.over) return [];
    this.time = Math.max(0, this.time - dt);
    if (this.time > 0) return [];
    this.over = true;
    return [{ type: 'timeUp' }];
  }

  tap(x: number, y: number): EspelhosEvent[] {
    if (this.over || !rotate(this.level, x, y)) return [];
    this.taps++;
    this.trace = traceBeam(this.level);
    const events: EspelhosEvent[] = [{ type: 'rotate', x, y }];
    if (this.trace.hit.size === this.level.crystals.length) {
      const points = 100 + this.index * 25 + Math.max(0, 40 - this.taps * 3);
      const bonusTime = 14 + Math.min(8, this.index);
      this.score += points;
      this.time += bonusTime;
      this.levelsDone++;
      events.push({ type: 'solved', points, bonusTime, taps: this.taps });
    }
    return events;
  }

  nextLevel(): void {
    this.index++;
    this.taps = 0;
    this.level = generateLevel(this.index, this.rnd);
    this.trace = traceBeam(this.level);
  }
}
