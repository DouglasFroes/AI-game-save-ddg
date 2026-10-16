import type { Rnd } from '@/platform/rnd';

/** One minesweeper board. Mines are placed on the first reveal so it is never a mine. */
export class Minefield {
  readonly mine: boolean[];
  readonly open: boolean[];
  readonly flag: boolean[];
  readonly count: number[];
  placed = false;
  exploded = false;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly mines: number,
    private readonly rnd: Rnd = Math.random,
  ) {
    const n = cols * rows;
    this.mine = new Array<boolean>(n).fill(false);
    this.open = new Array<boolean>(n).fill(false);
    this.flag = new Array<boolean>(n).fill(false);
    this.count = new Array<number>(n).fill(0);
  }

  neighbors(i: number): number[] {
    const x = i % this.cols;
    const y = Math.floor(i / this.cols);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < this.cols && ny < this.rows)
          out.push(ny * this.cols + nx);
      }
    return out;
  }

  get flags(): number {
    return this.flag.filter(Boolean).length;
  }

  get won(): boolean {
    return !this.exploded && this.open.every((o, i) => o || this.mine[i]);
  }

  toggleFlag(i: number): void {
    if (!this.open[i]) this.flag[i] = !this.flag[i];
  }

  private place(safe: number): void {
    this.placed = true;
    const banned = new Set([safe, ...this.neighbors(safe)]);
    let pool = this.mine.map((_, i) => i).filter((i) => !banned.has(i));
    // Tiny boards: give up the safe ring and protect only the tapped cell.
    if (pool.length < this.mines) pool = this.mine.map((_, i) => i).filter((i) => i !== safe);
    for (let k = 0; k < this.mines; k++) {
      const j = Math.floor(this.rnd() * pool.length);
      this.mine[pool[j]!] = true;
      pool.splice(j, 1);
    }
    for (let i = 0; i < this.mine.length; i++)
      this.count[i] = this.neighbors(i).filter((n) => this.mine[n]).length;
  }

  /** Opens a cell (flood-filling empty areas). Returns the cells that changed. */
  reveal(i: number): number[] {
    if (this.exploded || this.flag[i] || this.open[i]) return [];
    if (!this.placed) this.place(i);
    if (this.mine[i]) {
      this.open[i] = true;
      this.exploded = true;
      return [i];
    }
    const changed: number[] = [];
    const stack = [i];
    while (stack.length) {
      const c = stack.pop()!;
      if (this.open[c] || this.flag[c]) continue;
      this.open[c] = true;
      changed.push(c);
      if (this.count[c] === 0) stack.push(...this.neighbors(c));
    }
    return changed;
  }

  /** Tapping a satisfied number opens all its other neighbours. */
  chord(i: number): number[] {
    if (!this.open[i] || this.count[i] === 0) return [];
    const around = this.neighbors(i);
    if (around.filter((n) => this.flag[n]).length !== this.count[i]) return [];
    const changed: number[] = [];
    for (const n of around) changed.push(...this.reveal(n));
    return changed;
  }
}

export interface BoardSpec {
  cols: number;
  rows: number;
  mines: number;
}

export function boardSpec(level: number): BoardSpec {
  const cols = level >= 3 ? 8 : 7;
  const rows = 9 + Math.min(2, Math.floor(level / 2));
  const mines = Math.round(cols * rows * Math.min(0.2, 0.12 + level * 0.012));
  return { cols, rows, mines };
}

/** "Campo Minado": clear board after board; each is bigger and denser. One mine ends the run. */
export class MinesSim {
  level = 0;
  score = 0;
  seconds = 0;
  field: Minefield;

  constructor(private readonly rnd: Rnd = Math.random) {
    const s = boardSpec(0);
    this.field = new Minefield(s.cols, s.rows, s.mines, rnd);
  }

  step(dt: number): void {
    if (this.field.placed && !this.field.won && !this.field.exploded) this.seconds += dt;
  }

  /** Call after each reveal; when the board is cleared, scores it and returns true. */
  checkWin(): boolean {
    if (!this.field.won) return false;
    this.score += 100 * (this.level + 1) + Math.max(0, 90 - Math.floor(this.seconds)) * 2;
    this.level++;
    return true;
  }

  nextBoard(): void {
    const s = boardSpec(this.level);
    this.field = new Minefield(s.cols, s.rows, s.mines, this.rnd);
    this.seconds = 0;
  }
}
