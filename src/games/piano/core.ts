/**
 * "Toque Rápido" (Piano Tiles-like) — pure rules. Rows scroll down; each row has one tile to tap,
 * in order from the bottom. Tapping an empty cell or letting a tile pass the bottom ends the run.
 * Positions are in row units: a row at `y` covers [y, y+1) and the screen shows rows 0..VISIBLE.
 */

export type Rng = () => number;

export const COLS = 4;
export const VISIBLE = 4;
const START_SPEED = 2.2;
const MAX_SPEED = 7.5;

export interface Row {
  readonly id: number;
  readonly col: number;
  y: number;
  done: boolean;
}

export type PianoEvent =
  { type: 'hit'; row: Row } | { type: 'over'; reason: 'wrong' | 'missed'; col: number; y: number };

export class PianoSim {
  readonly rows: Row[] = [];
  score = 0;
  started = false;
  over: 'wrong' | 'missed' | null = null;
  private ids = 0;
  private lastCol = -1;

  constructor(private readonly rng: Rng = Math.random) {
    // Start tile on the second row from the bottom, then fill upwards.
    for (let y = VISIBLE - 2; y >= -1; y--) this.addRow(y);
  }

  get speed(): number {
    return Math.min(MAX_SPEED, START_SPEED + this.score * 0.045);
  }

  private addRow(y: number): void {
    let col: number;
    do col = Math.floor(this.rng() * COLS);
    while (col === this.lastCol && this.rng() < 0.6);
    this.lastCol = col;
    this.rows.push({ id: ++this.ids, col, y, done: false });
  }

  /** The tile that must be tapped next. */
  get next(): Row | undefined {
    return this.rows.find((r) => !r.done);
  }

  step(dt: number): PianoEvent[] {
    if (!this.started || this.over) return [];
    const dy = this.speed * dt;
    for (const r of this.rows) r.y += dy;
    while (Math.min(...this.rows.map((r) => r.y)) > -1)
      this.addRow(Math.min(...this.rows.map((r) => r.y)) - 1);
    const next = this.next;
    if (next && next.y >= VISIBLE) {
      this.over = 'missed';
      return [{ type: 'over', reason: 'missed', col: next.col, y: next.y }];
    }
    for (let i = this.rows.length - 1; i >= 0; i--)
      if (this.rows[i]!.y > VISIBLE + 1) this.rows.splice(i, 1);
    return [];
  }

  /** A tap on column `col` at height `y` (row units from the top of the screen). */
  tap(col: number, y: number): PianoEvent[] {
    if (this.over) return [];
    const row = this.rows.find((r) => y >= r.y && y < r.y + 1);
    if (!row) return [];
    const next = this.next;
    if (row.done) return [];
    if (row.col === col && row === next) {
      row.done = true;
      this.started = true;
      this.score++;
      return [{ type: 'hit', row }];
    }
    if (row.col === col) return []; // a tile further up: wait your turn
    this.over = 'wrong';
    return [{ type: 'over', reason: 'wrong', col, y: row.y }];
  }
}
