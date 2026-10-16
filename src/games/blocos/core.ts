import type { Rnd } from '@/platform/rnd';
import { shuffle } from '@/platform/rnd';

export const COLS = 10;
export const ROWS = 20;
const LOCK_DELAY = 0.45;
const MAX_RESETS = 12;
const LINE_POINTS = [0, 100, 300, 500, 800];

/** I, O, T, S, Z, J, L — cells in a box of `n`×`n`, rotation 0. */
export const SHAPES: ReadonlyArray<{ n: number; cells: ReadonlyArray<readonly [number, number]> }> =
  [
    {
      n: 4,
      cells: [
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
      ],
    },
    {
      n: 2,
      cells: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
    },
    {
      n: 3,
      cells: [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    },
    {
      n: 3,
      cells: [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
      ],
    },
    {
      n: 3,
      cells: [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
      ],
    },
    {
      n: 3,
      cells: [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    },
    {
      n: 3,
      cells: [
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    },
  ];

export interface Piece {
  type: number;
  rot: number;
  x: number;
  y: number;
}

/** Absolute board cells [col, row] of a piece. */
export function pieceCells(p: Piece): Array<[number, number]> {
  const { n, cells } = SHAPES[p.type]!;
  return cells.map(([cx, cy]) => {
    let x = cx;
    let y = cy;
    for (let i = 0; i < p.rot % 4; i++) [x, y] = [n - 1 - y, x];
    return [p.x + x, p.y + y];
  });
}

/** "Blocos": falling tetrominoes on a 10×20 board. */
export class Tetris {
  board: number[][] = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
  piece: Piece;
  next: number;
  score = 0;
  lines = 0;
  over = false;
  private bag: number[] = [];
  private lockTimer = 0;
  private resets = 0;
  private acc = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.next = this.draw();
    this.piece = this.spawn();
  }

  get level(): number {
    return 1 + Math.floor(this.lines / 10);
  }

  private get interval(): number {
    return Math.max(0.05, 0.8 * Math.pow(0.85, this.level - 1));
  }

  private draw(): number {
    if (this.bag.length === 0) this.bag = shuffle(this.rnd, [0, 1, 2, 3, 4, 5, 6]);
    return this.bag.pop()!;
  }

  private spawn(): Piece {
    const type = this.next;
    this.next = this.draw();
    const p = { type, rot: 0, x: Math.floor((COLS - SHAPES[type]!.n) / 2), y: 0 };
    if (this.collides(p)) this.over = true;
    return p;
  }

  collides(p: Piece): boolean {
    return pieceCells(p).some(
      ([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && this.board[y]![x] !== 0),
    );
  }

  private touch(): void {
    if (this.collides({ ...this.piece, y: this.piece.y + 1 }) && this.resets < MAX_RESETS) {
      this.lockTimer = 0;
      this.resets++;
    }
  }

  move(dx: number): boolean {
    if (this.over) return false;
    const p = { ...this.piece, x: this.piece.x + dx };
    if (this.collides(p)) return false;
    this.piece = p;
    this.touch();
    return true;
  }

  /** Rotates clockwise, trying small sideways kicks near walls and stacks. */
  rotate(): boolean {
    if (this.over || this.piece.type === 1) return false;
    for (const kick of [0, -1, 1, -2, 2]) {
      const p = { ...this.piece, rot: (this.piece.rot + 1) % 4, x: this.piece.x + kick };
      if (!this.collides(p)) {
        this.piece = p;
        this.touch();
        return true;
      }
    }
    return false;
  }

  softDrop(): boolean {
    if (this.over) return false;
    const p = { ...this.piece, y: this.piece.y + 1 };
    if (this.collides(p)) return false;
    this.piece = p;
    this.score++;
    return true;
  }

  ghostY(): number {
    const p = { ...this.piece };
    while (!this.collides({ ...p, y: p.y + 1 })) p.y++;
    return p.y;
  }

  /** Drops to the floor and locks. Returns the number of lines cleared. */
  hardDrop(): number {
    if (this.over) return 0;
    const to = this.ghostY();
    this.score += 2 * (to - this.piece.y);
    this.piece = { ...this.piece, y: to };
    return this.lock();
  }

  /** Advances gravity and the lock delay; returns lines cleared when the piece locked. */
  step(dt: number): number | null {
    if (this.over) return null;
    const grounded = this.collides({ ...this.piece, y: this.piece.y + 1 });
    if (grounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) return this.lock();
      return null;
    }
    this.acc += dt;
    while (this.acc >= this.interval) {
      this.acc -= this.interval;
      const p = { ...this.piece, y: this.piece.y + 1 };
      if (this.collides(p)) break;
      this.piece = p;
    }
    return null;
  }

  private lock(): number {
    for (const [x, y] of pieceCells(this.piece)) {
      if (y < 0) {
        this.over = true;
        return 0;
      }
      this.board[y]![x] = this.piece.type + 1;
    }
    const keep = this.board.filter((row) => row.some((v) => v === 0));
    const cleared = ROWS - keep.length;
    if (cleared) {
      this.board = [
        ...Array.from({ length: cleared }, () => new Array<number>(COLS).fill(0)),
        ...keep,
      ];
      this.score += LINE_POINTS[cleared]! * this.level;
      this.lines += cleared;
    }
    this.lockTimer = 0;
    this.resets = 0;
    this.acc = 0;
    this.piece = this.spawn();
    return cleared;
  }
}
