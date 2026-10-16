import type { Rnd } from '@/platform/rnd';

/** A square grid of lamps; pressing one flips it and its 4 neighbours. */
export class LightsGrid {
  readonly cells: boolean[];

  constructor(readonly n: number) {
    this.cells = new Array<boolean>(n * n).fill(false);
  }

  toggle(i: number): void {
    const { n } = this;
    const r = Math.floor(i / n);
    const c = i % n;
    const flip = (rr: number, cc: number) => {
      if (rr >= 0 && rr < n && cc >= 0 && cc < n)
        this.cells[rr * n + cc] = !this.cells[rr * n + cc];
    };
    flip(r, c);
    flip(r - 1, c);
    flip(r + 1, c);
    flip(r, c - 1);
    flip(r, c + 1);
  }

  get lit(): number {
    return this.cells.filter(Boolean).length;
  }

  get solved(): boolean {
    return this.lit === 0;
  }
}

/** Starts from "all off" and presses random lamps, so it is always solvable. */
export function generateLights(n: number, presses: number, rnd: Rnd): LightsGrid {
  const grid = new LightsGrid(n);
  const total = n * n;
  const picked = new Set<number>();
  while (picked.size < Math.min(presses, total)) picked.add(Math.floor(rnd() * total));
  for (const i of picked) grid.toggle(i);
  // Distinct presses can still cancel out to an empty board; press once more if so.
  if (grid.solved) grid.toggle(Math.floor(rnd() * total));
  return grid;
}

export function levelSize(level: number): number {
  return level < 3 ? 3 : level < 8 ? 4 : 5;
}

export function levelPresses(level: number): number {
  const n = levelSize(level);
  return Math.min(2 + Math.floor(level / 2), n * n - 3);
}

/** "Acende Tudo": turn every lamp off before the clock runs out; each board adds time. */
export class LightsSim {
  level = 0;
  time = 40;
  moves = 0;
  totalMoves = 0;
  grid: LightsGrid;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.grid = generateLights(levelSize(0), levelPresses(0), rnd);
  }

  get dead(): boolean {
    return this.time <= 0;
  }

  step(dt: number): void {
    if (!this.dead) this.time -= dt;
  }

  /** Returns true when this press solved the board (a new one is ready). */
  press(i: number): boolean {
    if (this.dead) return false;
    this.grid.toggle(i);
    this.moves++;
    this.totalMoves++;
    if (!this.grid.solved) return false;
    this.level++;
    this.time += Math.max(5, 9 - Math.floor(this.level / 3));
    this.moves = 0;
    this.grid = generateLights(levelSize(this.level), levelPresses(this.level), this.rnd);
    return true;
  }
}
