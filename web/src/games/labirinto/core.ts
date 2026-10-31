/**
 * "Labirinto no Escuro" — pure rules. A random maze is dark except right around the player (and
 * the corridors already walked). A swipe runs along a corridor until the next junction. Reach the
 * exit before time runs out; coins on the way add points and a little time.
 */
export const WALL = { N: 1, E: 2, S: 4, W: 8 } as const;
export type Dir = 'N' | 'E' | 'S' | 'W';
const DR: Record<Dir, number> = { N: -1, E: 0, S: 1, W: 0 };
const DC: Record<Dir, number> = { N: 0, E: 1, S: 0, W: -1 };
const OPP: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };
const DIRS: Dir[] = ['N', 'E', 'S', 'W'];

export const sizeFor = (level: number): number => Math.min(14, 6 + level);
export const timeFor = (size: number): number => 8 + size * 3;

/** Walls per cell (bitmask of WALL), carved with a randomised depth-first search. */
export function carve(size: number, rng: () => number): number[] {
  const walls = new Array<number>(size * size).fill(15);
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const cell = stack[stack.length - 1]!;
    const r = Math.floor(cell / size);
    const c = cell % size;
    const opts = DIRS.filter((d) => {
      const rr = r + DR[d];
      const cc = c + DC[d];
      return rr >= 0 && cc >= 0 && rr < size && cc < size && !seen.has(rr * size + cc);
    });
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const d = opts[Math.floor(rng() * opts.length)]!;
    const next = (r + DR[d]) * size + c + DC[d];
    walls[cell]! &= ~WALL[d];
    walls[next]! &= ~WALL[OPP[d]];
    seen.add(next);
    stack.push(next);
  }
  return walls;
}

export type MoveResult = { cells: number[]; coins: number; exit: boolean };

export class Maze {
  readonly walls: number[];
  pos = 0;
  readonly exit: number;
  readonly coins: Set<number>;
  readonly seen = new Set<number>([0]);

  constructor(
    readonly size: number,
    rng: () => number = Math.random,
  ) {
    this.walls = carve(size, rng);
    this.exit = size * size - 1;
    this.coins = new Set();
    while (this.coins.size < Math.floor(size / 2)) {
      const c = 1 + Math.floor(rng() * (size * size - 2));
      this.coins.add(c);
    }
    this.reveal();
  }

  open(cell: number, d: Dir): boolean {
    return (this.walls[cell]! & WALL[d]) === 0;
  }

  exits(cell: number): Dir[] {
    return DIRS.filter((d) => this.open(cell, d));
  }

  /** Cells close to the player become known. */
  private reveal(): void {
    const r = Math.floor(this.pos / this.size);
    const c = this.pos % this.size;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < this.size && cc < this.size)
          this.seen.add(rr * this.size + cc);
      }
  }

  /** Runs in a direction until a junction, a dead end or the exit. */
  move(d: Dir): MoveResult {
    const out: MoveResult = { cells: [], coins: 0, exit: false };
    let dir = d;
    if (!this.open(this.pos, dir)) return out;
    for (let guard = 0; guard < this.size * this.size; guard++) {
      this.pos += DR[dir] * this.size + DC[dir];
      out.cells.push(this.pos);
      this.reveal();
      if (this.coins.delete(this.pos)) out.coins++;
      if (this.pos === this.exit) {
        out.exit = true;
        break;
      }
      // Follow bends in a corridor; stop where it branches or ends.
      const onward = this.exits(this.pos).filter((x) => x !== OPP[dir]);
      if (onward.length !== 1) break;
      dir = onward[0]!;
    }
    return out;
  }
}
