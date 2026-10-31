/**
 * "Apaga Luzes" — pure rules of Lights Out. Tapping a light flips it and its four neighbours;
 * turn every light off. Boards are made by pressing random cells on a dark board, so each one is
 * solvable in at most `par` taps. The run has a clock: every board solved buys more time.
 */
export interface LightsSpec {
  readonly n: number;
  readonly presses: number;
}

export function levelSpec(level: number): LightsSpec {
  const n = Math.min(7, 3 + Math.floor((level - 1) / 2));
  return { n, presses: Math.min(n * n - 2, 2 + level) };
}

export class LightsBoard {
  readonly cells: boolean[];
  moves = 0;

  constructor(
    readonly n: number,
    readonly par: number,
    cells?: boolean[],
  ) {
    this.cells = cells ?? new Array<boolean>(n * n).fill(false);
  }

  /** Flips a cell and its orthogonal neighbours. */
  flip(i: number): void {
    const n = this.n;
    const r = Math.floor(i / n);
    const c = i % n;
    const hit = [
      [r, c],
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    for (const [rr, cc] of hit)
      if (rr! >= 0 && cc! >= 0 && rr! < n && cc! < n)
        this.cells[rr! * n + cc!] = !this.cells[rr! * n + cc!];
  }

  press(i: number): void {
    this.flip(i);
    this.moves++;
  }

  get solved(): boolean {
    return this.cells.every((on) => !on);
  }

  get lit(): number {
    return this.cells.filter(Boolean).length;
  }
}

/** A board built by pressing `presses` distinct random cells of a dark grid. */
export function generate(spec: LightsSpec, rng: () => number = Math.random): LightsBoard {
  for (;;) {
    const board = new LightsBoard(spec.n, spec.presses);
    const cells = [...Array(spec.n * spec.n).keys()].sort(() => rng() - 0.5).slice(0, spec.presses);
    for (const i of cells) board.flip(i);
    if (!board.solved) return board;
  }
}

/** Points for a solved board: bigger boards and staying within par pay more. */
export function boardPoints(level: number, board: LightsBoard): number {
  const n = board.n;
  const within = board.moves <= board.par;
  return n * n * 10 + level * 50 + (within ? 200 : 0);
}

/** Seconds added to the clock for solving a board. */
export const timeBonus = (spec: LightsSpec): number => 8 + spec.n * 2;
