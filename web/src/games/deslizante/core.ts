/**
 * "Quebra-Cabeça Deslizante" — pure rules of the sliding puzzle (8/15/24-puzzle). Tapping a tile
 * in the blank's row or column slides that whole line. Boards are shuffled with random legal
 * moves from the solved state, so every board can be solved.
 */
export const sizeFor = (level: number): number => (level <= 2 ? 3 : level <= 6 ? 4 : 5);

export class SlideBoard {
  /** Tile numbers 1..n²-1, 0 = blank. Solved = 1,2,…,0. */
  tiles: number[];
  moves = 0;

  constructor(readonly n: number) {
    this.tiles = [...Array(n * n).keys()].map((i) => (i + 1) % (n * n));
  }

  get blank(): number {
    return this.tiles.indexOf(0);
  }

  get solved(): boolean {
    return this.tiles.every((t, i) => t === (i + 1) % (this.n * this.n));
  }

  /** Tiles already in their final place. */
  get placed(): number {
    return this.tiles.filter((t, i) => t !== 0 && t === i + 1).length;
  }

  /** Slides the tiles between `i` and the blank (same row or column). Returns how many moved. */
  tap(i: number): number {
    const n = this.n;
    const b = this.blank;
    const [br, bc] = [Math.floor(b / n), b % n];
    const [r, c] = [Math.floor(i / n), i % n];
    if (i === b || (r !== br && c !== bc)) return 0;
    const d = r === br ? (c > bc ? 1 : -1) : r > br ? n : -n;
    let at = b;
    let count = 0;
    while (at !== i) {
      this.tiles[at] = this.tiles[at + d]!;
      at += d;
      count++;
    }
    this.tiles[i] = 0;
    this.moves++;
    return count;
  }

  /** Random legal moves from the solved board (never undoing the previous one). */
  shuffle(steps: number, rng: () => number): void {
    const n = this.n;
    let prev = -1;
    for (let s = 0; s < steps; s++) {
      const b = this.blank;
      const opts = [b - n, b + n, b % n ? b - 1 : -1, b % n < n - 1 ? b + 1 : -1].filter(
        (k) => k >= 0 && k < n * n && k !== prev,
      );
      const k = opts[Math.floor(rng() * opts.length)]!;
      prev = b;
      this.tiles[b] = this.tiles[k]!;
      this.tiles[k] = 0;
    }
    if (this.solved) this.shuffle(steps, rng);
    this.moves = 0;
  }
}

export function generate(level: number, rng: () => number = Math.random): SlideBoard {
  const board = new SlideBoard(sizeFor(level));
  board.shuffle(40 + level * 25, rng);
  return board;
}

/** Points for a solved board; faster (fewer moves) pays more. */
export function boardPoints(level: number, board: SlideBoard): number {
  const n2 = board.n * board.n;
  return n2 * 15 + level * 40 + Math.max(0, n2 * 12 - board.moves) * 5;
}

/** Seconds added to the clock when a board is solved. */
export const timeBonus = (n: number): number => n * n * 2;
