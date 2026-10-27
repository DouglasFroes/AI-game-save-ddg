/** 2048 rules — pure, no Phaser. Tiles keep ids so the scene can animate slides and merges. */

export const N = 4;
export const WIN_VALUE = 2048;

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Rng = () => number;

export interface Tile {
  readonly id: number;
  readonly value: number;
  readonly r: number;
  readonly c: number;
}

export interface Merge {
  /** The new tile created by the merge. */
  readonly tile: Tile;
  /** The two tiles that slid into it (with their final position) and disappear. */
  readonly from: readonly [Tile, Tile];
}

export interface MoveResult {
  readonly moved: boolean;
  readonly gained: number;
  /** Tiles that survive, at their new positions. */
  readonly slid: readonly Tile[];
  readonly merges: readonly Merge[];
}

/** Cells of each line, ordered from the side tiles slide toward. */
function lines(dir: Dir): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  for (let i = 0; i < N; i++) {
    const line: Array<[number, number]> = [];
    for (let k = 0; k < N; k++) {
      if (dir === 'left') line.push([i, k]);
      else if (dir === 'right') line.push([i, N - 1 - k]);
      else if (dir === 'up') line.push([k, i]);
      else line.push([N - 1 - k, i]);
    }
    out.push(line);
  }
  return out;
}

export class Game2048 {
  tiles: Tile[] = [];
  score = 0;
  private ids = 0;

  constructor(private readonly rng: Rng = Math.random) {}

  /** Test helper: 0 = empty. */
  static fromGrid(grid: readonly (readonly number[])[], rng?: Rng): Game2048 {
    const g = new Game2048(rng);
    grid.forEach((row, r) =>
      row.forEach((value, c) => value && g.tiles.push({ id: ++g.ids, value, r, c })),
    );
    return g;
  }

  start(): this {
    this.spawn();
    this.spawn();
    return this;
  }

  grid(): number[][] {
    const g = Array.from({ length: N }, () => new Array<number>(N).fill(0));
    for (const t of this.tiles) g[t.r]![t.c] = t.value;
    return g;
  }

  get maxTile(): number {
    return this.tiles.reduce((m, t) => Math.max(m, t.value), 0);
  }

  spawn(): Tile | null {
    const g = this.grid();
    const empty: Array<[number, number]> = [];
    g.forEach((row, r) => row.forEach((v, c) => v === 0 && empty.push([r, c])));
    if (!empty.length) return null;
    const [r, c] = empty[Math.floor(this.rng() * empty.length)]!;
    const tile = { id: ++this.ids, value: this.rng() < 0.9 ? 2 : 4, r, c };
    this.tiles.push(tile);
    return tile;
  }

  move(dir: Dir): MoveResult {
    const at = new Map(this.tiles.map((t) => [`${t.r},${t.c}`, t]));
    const slid: Tile[] = [];
    const merges: Merge[] = [];
    let moved = false;
    let gained = 0;

    for (const line of lines(dir)) {
      const row = line.map(([r, c]) => at.get(`${r},${c}`)).filter((t): t is Tile => !!t);
      let pos = 0;
      let last: Tile | null = null; // last placed tile that can still merge
      for (const t of row) {
        if (last && last.value === t.value) {
          const [r, c] = line[pos - 1]!;
          const merged: Tile = { id: ++this.ids, value: t.value * 2, r, c };
          slid.splice(slid.indexOf(last), 1);
          merges.push({ tile: merged, from: [last, { ...t, r, c }] });
          slid.push(merged);
          gained += merged.value;
          moved = true;
          last = null;
          continue;
        }
        const [r, c] = line[pos]!;
        if (r !== t.r || c !== t.c) moved = true;
        const placed = { ...t, r, c };
        slid.push(placed);
        last = placed;
        pos++;
      }
    }

    if (moved) {
      this.tiles = slid;
      this.score += gained;
    }
    return { moved, gained, slid, merges };
  }

  canMove(): boolean {
    if (this.tiles.length < N * N) return true;
    const g = this.grid();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (g[r]![c] === g[r]![c + 1] || g[r]![c] === g[r + 1]?.[c]) return true;
      }
    }
    return false;
  }
}
