import type { Rnd } from '@/platform/rnd';

export const COLS = 7;
export const ROWS = 9;
export type Dir = 'up' | 'down' | 'left' | 'right';

const STEP: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export interface IceLevel {
  walls: boolean[];
  start: number;
  goal: number;
  /** Fewest swipes that solve it. */
  min: number;
}

/** Slides from `from` until a wall or the edge; the goal stops the slide too. */
export function slide(
  walls: readonly boolean[],
  goal: number,
  from: number,
  dir: Dir,
): { to: number; path: number[] } {
  const [dx, dy] = STEP[dir];
  let x = from % COLS;
  let y = Math.floor(from / COLS);
  const path: number[] = [];
  for (;;) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || walls[ny * COLS + nx]) break;
    x = nx;
    y = ny;
    path.push(y * COLS + x);
    if (y * COLS + x === goal) break;
  }
  return { to: y * COLS + x, path };
}

/** Breadth-first search over stopping cells; -1 when the goal is unreachable. */
export function solveMoves(walls: readonly boolean[], start: number, goal: number): number {
  const dist = new Array<number>(COLS * ROWS).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    const pos = queue[h]!;
    if (pos === goal) return dist[pos]!;
    for (const d of DIRS) {
      const { to } = slide(walls, goal, pos, d);
      if (dist[to] === -1) {
        dist[to] = dist[pos]! + 1;
        queue.push(to);
      }
    }
  }
  return -1;
}

export function generateIce(levelNo: number, rnd: Rnd): IceLevel {
  const lo = Math.min(2 + Math.floor(levelNo / 2), 9);
  const hi = lo + 3;
  let best: IceLevel | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const density = 0.14 + rnd() * 0.12;
    const walls = Array.from({ length: COLS * ROWS }, () => rnd() < density);
    const free = walls.map((w, i) => (w ? -1 : i)).filter((i) => i >= 0);
    if (free.length < 10) continue;
    const start = free[Math.floor(rnd() * free.length)]!;
    const goal = free[Math.floor(rnd() * free.length)]!;
    if (start === goal) continue;
    const min = solveMoves(walls, start, goal);
    if (min < 1) continue;
    const level = { walls, start, goal, min };
    if (min >= lo && min <= hi) return level;
    if (!best || Math.abs(min - lo) < Math.abs(best.min - lo)) best = level;
  }
  return (
    best ?? { walls: new Array<boolean>(COLS * ROWS).fill(false), start: 0, goal: COLS - 1, min: 1 }
  );
}

/** "Gelo": slide across the ice until you stop on the flag; boards keep coming against the clock. */
export class IceSim {
  level = 0;
  time = 60;
  moves = 0;
  totalMoves = 0;
  perfect = 0;
  board: IceLevel;
  pos: number;
  /** True between reaching the flag and calling `nextBoard`. */
  solved = false;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.board = generateIce(0, rnd);
    this.pos = this.board.start;
  }

  get score(): number {
    return this.level * 10 + this.perfect * 5;
  }

  get dead(): boolean {
    return this.time <= 0;
  }

  step(dt: number): void {
    if (!this.dead && !this.solved) this.time -= dt;
  }

  swipe(dir: Dir): { path: number[]; reached: boolean } | null {
    if (this.dead || this.solved) return null;
    const { to, path } = slide(this.board.walls, this.board.goal, this.pos, dir);
    if (path.length === 0) return null;
    this.pos = to;
    this.moves++;
    this.totalMoves++;
    const reached = to === this.board.goal;
    if (reached) {
      this.solved = true;
      this.level++;
      if (this.moves <= this.board.min) this.perfect++;
      this.time += 14;
    }
    return { path, reached };
  }

  restart(): void {
    if (this.solved) return;
    this.pos = this.board.start;
    this.moves = 0;
  }

  nextBoard(): void {
    this.board = generateIce(this.level, this.rnd);
    this.pos = this.board.start;
    this.moves = 0;
    this.solved = false;
  }
}
