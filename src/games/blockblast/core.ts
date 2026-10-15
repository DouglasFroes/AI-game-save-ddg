/** Block Blast rules — pure, no Phaser. */

export const SIZE = 8;
export const PALETTE = [
  0xff5d5d, 0xffa62b, 0xffd23f, 0x5bd46f, 0x4da3ff, 0x9b5de5, 0x2ec4b6,
] as const;

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Shape {
  readonly id: string;
  readonly cells: readonly Cell[];
  readonly w: number;
  readonly h: number;
  readonly weight: number;
}

export interface Piece {
  readonly shape: Shape;
  /** Index into PALETTE. */
  readonly color: number;
}

export type Rng = () => number;

function normalize(cells: readonly Cell[]): Cell[] {
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  return cells
    .map((c) => ({ x: c.x - minX, y: c.y - minY }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

const rotate = (cells: readonly Cell[]): Cell[] =>
  normalize(cells.map((c) => ({ x: -c.y, y: c.x })));

const key = (cells: readonly Cell[]) => cells.map((c) => `${c.x},${c.y}`).join(';');

function fromArt(rows: readonly string[]): Cell[] {
  const cells: Cell[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && cells.push({ x, y })));
  return normalize(cells);
}

/** [id, ascii art, relative frequency] — every distinct rotation becomes its own shape. */
const BASE: ReadonlyArray<readonly [string, readonly string[], number]> = [
  ['dot', ['#'], 0.6],
  ['i2', ['##'], 1],
  ['i3', ['###'], 1.2],
  ['i4', ['####'], 1],
  ['i5', ['#####'], 0.6],
  ['o2', ['##', '##'], 1.2],
  ['o3', ['###', '###', '###'], 0.5],
  ['r23', ['##', '##', '##'], 0.6],
  ['l3', ['#.', '##'], 1.2],
  ['l4', ['#.', '#.', '##'], 1],
  ['j4', ['.#', '.#', '##'], 1],
  ['t', ['###', '.#.'], 1],
  ['s', ['.##', '##.'], 0.7],
  ['z', ['##.', '.##'], 0.7],
  ['bigL', ['#..', '#..', '###'], 0.6],
];

export const SHAPES: readonly Shape[] = BASE.flatMap(([id, art, freq]) => {
  const variants: Cell[][] = [];
  let cells = fromArt(art);
  for (let i = 0; i < 4; i++) {
    if (!variants.some((v) => key(v) === key(cells))) variants.push(cells);
    cells = rotate(cells);
  }
  return variants.map((v, i) => ({
    id: `${id}-${i}`,
    cells: v,
    w: Math.max(...v.map((c) => c.x)) + 1,
    h: Math.max(...v.map((c) => c.y)) + 1,
    weight: freq / variants.length,
  }));
});

export interface PlaceResult {
  readonly rows: readonly number[];
  readonly cols: readonly number[];
  /** Every cell removed by the clear (no duplicates). */
  readonly cleared: readonly Cell[];
}

export class Board {
  /** -1 = empty, otherwise a PALETTE index. */
  readonly cells: Int8Array;

  constructor(cells?: Int8Array) {
    this.cells = cells ? new Int8Array(cells) : new Int8Array(SIZE * SIZE).fill(-1);
  }

  /** Test helper: '#' filled, '.' empty. */
  static fromRows(rows: readonly string[]): Board {
    const b = new Board();
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && b.set(x, y, 0)));
    return b;
  }

  clone(): Board {
    return new Board(this.cells);
  }

  get(x: number, y: number): number {
    return this.cells[y * SIZE + x] ?? -1;
  }

  private set(x: number, y: number, v: number): void {
    this.cells[y * SIZE + x] = v;
  }

  get isEmpty(): boolean {
    return this.cells.every((c) => c === -1);
  }

  canPlace(shape: Shape, ox: number, oy: number): boolean {
    return shape.cells.every(({ x, y }) => {
      const cx = ox + x;
      const cy = oy + y;
      return cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && this.get(cx, cy) === -1;
    });
  }

  fitsAnywhere(shape: Shape): boolean {
    for (let y = 0; y <= SIZE - shape.h; y++) {
      for (let x = 0; x <= SIZE - shape.w; x++) if (this.canPlace(shape, x, y)) return true;
    }
    return false;
  }

  /** Places the piece (caller checks canPlace) and clears full rows and columns at once. */
  place(piece: Piece, ox: number, oy: number): PlaceResult {
    for (const { x, y } of piece.shape.cells) this.set(ox + x, oy + y, piece.color);
    const rows: number[] = [];
    const cols: number[] = [];
    for (let i = 0; i < SIZE; i++) {
      let rowFull = true;
      let colFull = true;
      for (let j = 0; j < SIZE; j++) {
        if (this.get(j, i) === -1) rowFull = false;
        if (this.get(i, j) === -1) colFull = false;
      }
      if (rowFull) rows.push(i);
      if (colFull) cols.push(i);
    }
    const cleared = new Map<number, Cell>();
    for (const y of rows) for (let x = 0; x < SIZE; x++) cleared.set(y * SIZE + x, { x, y });
    for (const x of cols) for (let y = 0; y < SIZE; y++) cleared.set(y * SIZE + x, { x, y });
    for (const c of cleared.values()) this.set(c.x, c.y, -1);
    return { rows, cols, cleared: [...cleared.values()] };
  }
}

export const PERFECT_CLEAR_BONUS = 300;

/**
 * Points for one placement: 1 per block placed, a growing bonus for clearing several lines at
 * once, multiplied by the combo (consecutive placements that cleared something).
 */
export function placementScore(
  blocks: number,
  lines: number,
  combo: number,
  perfect: boolean,
): number {
  const lineBonus = lines > 0 ? 10 * lines * (lines + 1) * (1 + 0.5 * combo) : 0;
  return blocks + Math.round(lineBonus) + (perfect ? PERFECT_CLEAR_BONUS : 0);
}

function pickShape(rng: Rng, pool: readonly Shape[] = SHAPES): Shape {
  const total = pool.reduce((s, sh) => s + sh.weight, 0);
  let r = rng() * total;
  for (const sh of pool) {
    r -= sh.weight;
    if (r <= 0) return sh;
  }
  return pool[pool.length - 1]!;
}

const randomPiece = (rng: Rng, pool?: readonly Shape[]): Piece => ({
  shape: pickShape(rng, pool),
  color: Math.floor(rng() * PALETTE.length),
});

/** Deals 3 pieces; guarantees at least one fits when any shape still fits the board. */
export function dealTray(board: Board, rng: Rng = Math.random): Piece[] {
  const tray = [randomPiece(rng), randomPiece(rng), randomPiece(rng)];
  if (tray.some((p) => board.fitsAnywhere(p.shape))) return tray;
  const fitting = SHAPES.filter((s) => board.fitsAnywhere(s));
  if (fitting.length) tray[Math.floor(rng() * 3)] = randomPiece(rng, fitting);
  return tray;
}

export const hasAnyMove = (board: Board, tray: readonly (Piece | null)[]): boolean =>
  tray.some((p) => p !== null && board.fitsAnywhere(p.shape));
