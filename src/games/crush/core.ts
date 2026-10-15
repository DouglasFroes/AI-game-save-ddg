/**
 * Match-3 with the turma's faces ("Turma Crush") — pure rules (no Phaser).
 * Swap two neighbours to line up 3+ of the same kid. Bigger matches create special pieces:
 * 4 in a row → striped (clears its row/column), L/T → bomb (3×3), 5 in a row → rainbow
 * (swapped with a piece, clears every piece of that kind). Clears cascade with a growing multiplier.
 */

export type Rng = () => number;

export const COLS = 7;
export const ROWS = 8;

export type Special = 'row' | 'col' | 'bomb' | 'rainbow';

export interface Piece {
  readonly id: number;
  /** Which kid (0..kinds-1); the rainbow keeps one but matches none. */
  readonly kind: number;
  special?: Special;
}

export type Cell = { x: number; y: number };
export type Board = (Piece | null)[][];
export type Placed = Cell & { piece: Piece };

/** One step of a resolution, for the renderer to animate in order. */
export interface Phase {
  /** Cells cleared this step (with the piece that was there). */
  readonly cleared: readonly Placed[];
  /** Special pieces created where the match was. */
  readonly created: readonly Placed[];
  /** Pieces that fell: from row → to row in a column. */
  readonly falls: readonly { id: number; x: number; from: number; to: number }[];
  /** New pieces dropped in from above (`from` is a negative row). */
  readonly spawned: readonly (Placed & { from: number })[];
  readonly points: number;
  /** 1 for the swap's own match, then 2, 3… for cascades. */
  readonly cascade: number;
}

export interface SwapResult {
  readonly ok: boolean;
  readonly phases: readonly Phase[];
  /** The board had no moves left and was reshuffled. */
  readonly shuffled: boolean;
}

export interface LevelGoal {
  readonly moves: number;
  readonly target: number;
  readonly kinds: number;
}

/** Each level asks for more points; a sixth kid joins from level 3 (harder to match). */
export const levelGoal = (level: number): LevelGoal => ({
  moves: 20,
  target: 1200 + (level - 1) * 700,
  kinds: level < 3 ? 5 : 6,
});

const POINTS_PER_PIECE = 20;
const POINTS_PER_SPECIAL = 60;

const key = (c: Cell) => `${c.x},${c.y}`;
const unkey = (k: string): Cell => {
  const [x, y] = k.split(',').map(Number);
  return { x: x!, y: y! };
};
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export class CrushGame {
  readonly board: Board = [];
  private ids = 0;

  constructor(
    readonly kinds = 5,
    private readonly rng: Rng = Math.random,
  ) {
    for (let y = 0; y < ROWS; y++) {
      const row: (Piece | null)[] = [];
      for (let x = 0; x < COLS; x++) {
        // No ready-made matches on a fresh board.
        let kind: number;
        do kind = this.randomKind();
        while (
          (x >= 2 && row[x - 1]?.kind === kind && row[x - 2]?.kind === kind) ||
          (y >= 2 && this.board[y - 1]![x]?.kind === kind && this.board[y - 2]![x]?.kind === kind)
        );
        row.push(this.newPiece(kind));
      }
      this.board.push(row);
    }
    if (!this.hasMove()) this.shuffle();
  }

  at(c: Cell): Piece | null {
    return this.board[c.y]?.[c.x] ?? null;
  }

  private set(c: Cell, p: Piece | null): void {
    this.board[c.y]![c.x] = p;
  }

  private randomKind(): number {
    return Math.floor(this.rng() * this.kinds);
  }

  private newPiece(kind: number, special?: Special): Piece {
    return special ? { id: ++this.ids, kind, special } : { id: ++this.ids, kind };
  }

  private *cells(): Generator<Cell> {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) yield { x, y };
  }

  /** Tries to swap two neighbouring cells. Invalid swaps (no match) change nothing. */
  swap(a: Cell, b: Cell): SwapResult {
    const pa = this.at(a);
    const pb = this.at(b);
    if (!pa || !pb || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1)
      return { ok: false, phases: [], shuffled: false };

    // Rainbow: clears every piece of the other one's kind (two rainbows: the whole board).
    if (pa.special === 'rainbow' || pb.special === 'rainbow') {
      const rainbow = pa.special === 'rainbow' ? a : b;
      const other = rainbow === a ? pb : pa;
      const targets = new Set<string>([key(rainbow)]);
      for (const c of this.cells()) {
        const p = this.at(c)!;
        if (other.special === 'rainbow' || (p.kind === other.kind && p.special !== 'rainbow'))
          targets.add(key(c));
      }
      // The rainbow itself is spent, not fired again.
      this.at(rainbow)!.special = undefined;
      return this.finish(this.resolve(targets, [], 1));
    }

    this.set(a, pb);
    this.set(b, pa);
    const matches = this.findMatches();
    // Two specials swapped together go off even without a match.
    if (!matches.length && !(pa.special && pb.special)) {
      this.set(a, pa);
      this.set(b, pb);
      return { ok: false, phases: [], shuffled: false };
    }
    const first = matches.length
      ? this.resolveMatches(matches, [a, b], 1)
      : this.resolve(new Set([key(a), key(b)]), [], 1);
    return this.finish(first);
  }

  /** Cascades after the first phase until the board is stable; reshuffles a dead board. */
  private finish(first: Phase): SwapResult {
    const phases = [first];
    for (let cascade = 2; ; cascade++) {
      const matches = this.findMatches();
      if (!matches.length) break;
      phases.push(this.resolveMatches(matches, [], cascade));
    }
    let shuffled = false;
    if (!this.hasMove()) {
      this.shuffle();
      shuffled = true;
    }
    return { ok: true, phases, shuffled };
  }

  /** Runs of 3+ (horizontal and vertical) of the same kind; rainbows never match. */
  findMatches(): Cell[][] {
    const runs: Cell[][] = [];
    const scan = (horizontal: boolean) => {
      const outer = horizontal ? ROWS : COLS;
      const inner = horizontal ? COLS : ROWS;
      for (let o = 0; o < outer; o++) {
        let run: Cell[] = [];
        let kind = -1;
        for (let i = 0; i <= inner; i++) {
          const c = horizontal ? { x: i, y: o } : { x: o, y: i };
          const p = i < inner ? this.at(c) : null;
          const k = p && p.special !== 'rainbow' ? p.kind : -1;
          if (k !== -1 && k === kind) run.push(c);
          else {
            if (run.length >= 3) runs.push(run);
            run = k === -1 ? [] : [c];
            kind = k;
          }
        }
      }
    };
    scan(true);
    scan(false);
    return runs;
  }

  /** Clears matched runs, turning big ones into a special piece. */
  private resolveMatches(runs: Cell[][], swapped: Cell[], cascade: number): Phase {
    const clear = new Set<string>();
    const created: Placed[] = [];
    const used = new Set<number>();
    // The special appears where the player swapped, or in the middle of the run.
    const where = (cells: Cell[]) =>
      swapped.find((s) => cells.some((c) => same(c, s))) ?? cells[Math.floor(cells.length / 2)]!;
    runs.forEach((run, i) => {
      run.forEach((c) => clear.add(key(c)));
      if (used.has(i)) return;
      const kind = this.at(run[0]!)!.kind;
      // L/T: a horizontal and a vertical run sharing a cell.
      const crossing = runs.findIndex(
        (other, j) => j !== i && !used.has(j) && other.some((c) => run.some((d) => same(c, d))),
      );
      if (crossing >= 0) {
        used.add(i).add(crossing);
        const shared = run.find((d) => runs[crossing]!.some((c) => same(c, d)))!;
        created.push({ ...shared, piece: this.newPiece(kind, 'bomb') });
      } else if (run.length >= 5) {
        created.push({ ...where(run), piece: this.newPiece(kind, 'rainbow') });
      } else if (run.length === 4) {
        const horizontal = run[0]!.y === run[1]!.y;
        created.push({ ...where(run), piece: this.newPiece(kind, horizontal ? 'row' : 'col') });
      }
    });
    return this.resolve(clear, created, cascade);
  }

  /**
   * Clears a set of cells (special pieces inside it go off and widen it), places the new specials,
   * then lets everything fall and refills from the top.
   */
  private resolve(clear: Set<string>, created: Placed[], cascade: number): Phase {
    // Specials caught in the clear explode in turn (chain reaction).
    const queue = [...clear];
    const fired = new Set<string>();
    while (queue.length) {
      const k = queue.pop()!;
      if (fired.has(k)) continue;
      const c = unkey(k);
      const p = this.at(c);
      if (!p?.special) continue;
      fired.add(k);
      for (const t of this.blast(c, p)) {
        const tk = key(t);
        if (clear.has(tk)) continue;
        clear.add(tk);
        queue.push(tk);
      }
    }
    const cleared: Placed[] = [];
    for (const k of clear) {
      const c = unkey(k);
      const p = this.at(c);
      if (!p) continue;
      cleared.push({ ...c, piece: p });
      this.set(c, null);
    }
    for (const c of created) this.set(c, c.piece);
    const points =
      (cleared.length * POINTS_PER_PIECE + created.length * POINTS_PER_SPECIAL) * cascade;

    // Gravity and refill, column by column.
    const falls: { id: number; x: number; from: number; to: number }[] = [];
    const spawned: (Placed & { from: number })[] = [];
    for (let x = 0; x < COLS; x++) {
      let write = ROWS - 1;
      for (let y = ROWS - 1; y >= 0; y--) {
        const p = this.board[y]![x];
        if (!p) continue;
        if (y !== write) {
          this.board[write]![x] = p;
          this.board[y]![x] = null;
          falls.push({ id: p.id, x, from: y, to: write });
        }
        write--;
      }
      for (let y = write, n = 1; y >= 0; y--, n++) {
        const piece = this.newPiece(this.randomKind());
        this.board[y]![x] = piece;
        spawned.push({ x, y, piece, from: -n });
      }
    }
    return { cleared, created, falls, spawned, points, cascade };
  }

  /** Cells a special piece clears when it goes off. */
  private blast(c: Cell, p: Piece): Cell[] {
    const out: Cell[] = [];
    if (p.special === 'row') for (let x = 0; x < COLS; x++) out.push({ x, y: c.y });
    else if (p.special === 'col') for (let y = 0; y < ROWS; y++) out.push({ x: c.x, y });
    else if (p.special === 'bomb') {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const t = { x: c.x + dx, y: c.y + dy };
          if (t.x >= 0 && t.y >= 0 && t.x < COLS && t.y < ROWS) out.push(t);
        }
    } else if (p.special === 'rainbow') {
      for (const t of this.cells()) if (this.at(t)?.kind === p.kind) out.push(t);
    }
    return out;
  }

  /** One valid swap (a hint), or null when the board is stuck. */
  hint(): [Cell, Cell] | null {
    for (const c of this.cells()) {
      if (this.at(c)?.special === 'rainbow') {
        const n = c.x + 1 < COLS ? { x: c.x + 1, y: c.y } : { x: c.x - 1, y: c.y };
        return [c, n];
      }
      for (const d of [
        { x: c.x + 1, y: c.y },
        { x: c.x, y: c.y + 1 },
      ]) {
        if (d.x >= COLS || d.y >= ROWS) continue;
        const pa = this.at(c);
        const pb = this.at(d);
        this.set(c, pb);
        this.set(d, pa);
        const found = this.findMatches().length > 0;
        this.set(c, pa);
        this.set(d, pb);
        if (found) return [c, d];
      }
    }
    return null;
  }

  hasMove(): boolean {
    return this.hint() !== null;
  }

  /** Reorders the pieces until there is no ready match and at least one move. */
  shuffle(): void {
    const pieces = [...this.cells()].map((c) => this.at(c)!);
    for (let tries = 0; tries < 300; tries++) {
      for (let i = pieces.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j]!, pieces[i]!];
      }
      let i = 0;
      for (const c of this.cells()) this.set(c, pieces[i++]!);
      if (!this.findMatches().length && this.hasMove()) return;
    }
  }
}
