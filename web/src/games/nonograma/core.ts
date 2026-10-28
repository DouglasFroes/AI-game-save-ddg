export type CellState = 'unknown' | 'filled' | 'marked';

export interface NonogramTemplate {
  readonly name: string;
  readonly emoji: string;
  readonly color: number;
  readonly grid: readonly (readonly (0 | 1)[])[];
}

export const TEMPLATES: readonly NonogramTemplate[] = [
  {
    name: 'Coração',
    emoji: '❤️',
    color: 0xf43f5e,
    grid: [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ],
  },
  {
    name: 'Coroa Real',
    emoji: '👑',
    color: 0xfbbf24,
    grid: [
      [1, 0, 1, 0, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
    ],
  },
  {
    name: 'Foguete',
    emoji: '🚀',
    color: 0x38bdf8,
    grid: [
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],
    ],
  },
  {
    name: 'Troféu',
    emoji: '🏆',
    color: 0xf59e0b,
    grid: [
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
    ],
  },
  {
    name: 'Espada',
    emoji: '⚔️',
    color: 0xa855f7,
    grid: [
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 0, 1, 0],
    ],
  },
  {
    name: 'Gatinho',
    emoji: '🐱',
    color: 0xfb923c,
    grid: [
      [1, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 0, 1, 1, 0, 1],
      [1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 0, 0],
    ],
  },
  {
    name: 'Fantasma',
    emoji: '👻',
    color: 0x22d3ee,
    grid: [
      [0, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1],
      [1, 0, 1, 1, 0, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 0, 1, 1, 0, 1],
    ],
  },
  {
    name: 'Âncora',
    emoji: '⚓',
    color: 0x60a5fa,
    grid: [
      [0, 0, 1, 1, 0, 0],
      [0, 0, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 0],
      [1, 0, 1, 1, 0, 1],
      [1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 0],
    ],
  },
];

export function computeLineClues(line: readonly (0 | 1)[]): number[] {
  const clues: number[] = [];
  let run = 0;
  for (const bit of line) {
    if (bit === 1) run++;
    else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }
  if (run > 0) clues.push(run);
  return clues.length > 0 ? clues : [0];
}

export function computeAllClues(grid: readonly (readonly (0 | 1)[])[]): {
  rows: number[][];
  cols: number[][];
} {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const rows = grid.map((r) => computeLineClues(r));
  const cols: number[][] = [];
  for (let c = 0; c < w; c++) {
    const col: (0 | 1)[] = [];
    for (let r = 0; r < h; r++) col.push(grid[r]![c]!);
    cols.push(computeLineClues(col));
  }
  return { rows, cols };
}

export class NonogramaBoard {
  readonly size: number;
  readonly target: readonly (readonly (0 | 1)[])[];
  readonly rowClues: readonly (readonly number[])[];
  readonly colClues: readonly (readonly number[])[];
  readonly cells: CellState[][];
  readonly totalFilled: number;
  filledCount = 0;
  mistakes = 0;

  constructor(readonly template: NonogramTemplate) {
    this.target = template.grid;
    this.size = template.grid.length;
    const clues = computeAllClues(this.target);
    this.rowClues = clues.rows;
    this.colClues = clues.cols;
    this.cells = Array.from({ length: this.size }, () =>
      Array.from({ length: this.size }, () => 'unknown' as CellState),
    );
    let total = 0;
    for (const r of this.target) for (const b of r) if (b === 1) total++;
    this.totalFilled = total;
  }

  get solved(): boolean {
    return this.filledCount >= this.totalFilled;
  }

  isRowComplete(r: number): boolean {
    for (let c = 0; c < this.size; c++) {
      if (this.target[r]![c] === 1 && this.cells[r]![c] !== 'filled') return false;
    }
    return true;
  }

  isColComplete(c: number): boolean {
    for (let r = 0; r < this.size; r++) {
      if (this.target[r]![c] === 1 && this.cells[r]![c] !== 'filled') return false;
    }
    return true;
  }

  /**
   * Applies a player action in `'fill'` or `'mark'` mode.
   * Returns `'hit'` when a target cell is revealed, `'mistake'` when an empty cell was painted in
   * fill mode, `'marked'` when toggled to X, or `'noop'` when already resolved.
   */
  act(r: number, c: number, mode: 'fill' | 'mark'): 'hit' | 'mistake' | 'marked' | 'noop' {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return 'noop';
    const cur = this.cells[r]![c]!;
    if (cur === 'filled') return 'noop';

    if (mode === 'mark') {
      this.cells[r]![c] = cur === 'marked' ? 'unknown' : 'marked';
      return 'marked';
    }

    if (cur === 'marked') return 'noop';
    if (this.target[r]![c] === 1) {
      this.cells[r]![c] = 'filled';
      this.filledCount++;
      this.autoMarkCompleted(r, c);
      return 'hit';
    } else {
      this.cells[r]![c] = 'marked';
      this.mistakes++;
      return 'mistake';
    }
  }

  private autoMarkCompleted(r: number, c: number): void {
    if (this.isRowComplete(r)) {
      for (let x = 0; x < this.size; x++) {
        if (this.cells[r]![x] === 'unknown') this.cells[r]![x] = 'marked';
      }
    }
    if (this.isColComplete(c)) {
      for (let y = 0; y < this.size; y++) {
        if (this.cells[y]![c] === 'unknown') this.cells[y]![c] = 'marked';
      }
    }
  }
}
