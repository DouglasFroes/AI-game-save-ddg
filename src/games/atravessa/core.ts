/**
 * "Atravessa" (Crossy Road-like) — pure rules. The kid hops across rows of grass (trees block),
 * roads (cars kill) and rivers (stand on logs or fall in). Standing still too long brings the eagle.
 * Rows are numbered upwards from 0; columns 0..COLS-1. The score is the farthest row reached.
 */

export type Rng = () => number;

export const COLS = 9;
const EAGLE_S = 7;
/** How far back the kid may go from their best row. */
const MAX_BACK = 3;

export type RowKind = 'grass' | 'road' | 'river';
export type Hop = 'up' | 'down' | 'left' | 'right';

export interface Mover {
  /** Left edge in columns (may run off-screen; wraps around). */
  x: number;
  readonly len: number;
}

export interface Lane {
  readonly row: number;
  readonly kind: RowKind;
  /** Grass: blocked columns. */
  readonly trees: readonly number[];
  /** Road/river: cars or logs and their shared velocity (columns per second). */
  readonly movers: Mover[];
  readonly speed: number;
}

export type CrossEvent =
  | { type: 'hop'; row: number; best: boolean }
  | { type: 'over'; reason: 'carro' | 'agua' | 'aguia' };

const SPAN = COLS + 6; // movers wrap over this width (3 columns off each side)

export class CrossSim {
  row = 0;
  /** Column (float on a log). */
  x = Math.floor(COLS / 2);
  best = 0;
  idle = 0;
  over: 'carro' | 'agua' | 'aguia' | null = null;
  private readonly lanes = new Map<number, Lane>();

  constructor(private readonly rng: Rng = Math.random) {
    this.ensure(20);
  }

  get score(): number {
    return this.best;
  }

  lane(row: number): Lane {
    this.ensure(row);
    return this.lanes.get(row)!;
  }

  private ensure(upTo: number): void {
    for (let r = this.lanes.size === 0 ? -6 : Math.max(...this.lanes.keys()) + 1; r <= upTo; r++)
      this.lanes.set(r, this.makeLane(r));
  }

  private makeLane(row: number): Lane {
    if (row <= 2) {
      const trees = row < 0 ? [...Array(COLS).keys()] : row === 0 ? [] : [0, COLS - 1];
      return { row, kind: 'grass', trees, movers: [], speed: 0 };
    }
    const prev = this.lanes.get(row - 1);
    const difficulty = Math.min(1, row / 150);
    const r = this.rng();
    const kind: RowKind =
      prev?.kind === 'river' && r < 0.5
        ? 'river'
        : r < 0.42
          ? 'road'
          : r < 0.68
            ? 'river'
            : 'grass';
    if (kind === 'grass') {
      const trees: number[] = [];
      for (let c = 0; c < COLS; c++) if (this.rng() < 0.22) trees.push(c);
      // Never a full wall.
      if (trees.length >= COLS - 1) trees.length = 3;
      return { row, kind, trees, movers: [], speed: 0 };
    }
    const dir = this.rng() < 0.5 ? -1 : 1;
    const movers: Mover[] = [];
    if (kind === 'road') {
      const speed = dir * (1.6 + this.rng() * 1.6 + difficulty * 2);
      for (let x = this.rng() * 3; x < SPAN; x += 4 + this.rng() * 4)
        movers.push({ x: x - 3, len: this.rng() < 0.25 ? 2 : 1 });
      return { row, kind, trees: [], movers, speed };
    }
    // River: long logs with small gaps so there is always a way to hop on.
    const speed = dir * (1 + this.rng() * 1.2 + difficulty);
    for (let x = this.rng() * 2; x < SPAN;) {
      const len = 2 + Math.floor(this.rng() * 2);
      movers.push({ x: x - 3, len });
      x += len + 1 + this.rng() * 1.6;
    }
    return { row, kind, trees: [], movers, speed };
  }

  hop(dir: Hop): CrossEvent[] {
    if (this.over) return [];
    let row = this.row;
    let x = this.x;
    if (dir === 'up') row++;
    else if (dir === 'down') row--;
    else x += dir === 'left' ? -1 : 1;
    if (row < this.best - MAX_BACK || row < 0) return [];
    // Hopping onto a grass row snaps to the grid; trees and edges block.
    const target = this.lane(row);
    const snapped = target.kind === 'river' ? x : Math.round(x);
    if (snapped < 0 || snapped > COLS - 1) return [];
    if (target.kind === 'grass' && target.trees.includes(snapped)) return [];
    this.row = row;
    this.x = snapped;
    this.idle = 0;
    const isBest = row > this.best;
    this.best = Math.max(this.best, row);
    this.ensure(this.best + 20);
    const events: CrossEvent[] = [{ type: 'hop', row, best: isBest }];
    events.push(...this.check());
    return events;
  }

  step(dt: number): CrossEvent[] {
    if (this.over) return [];
    for (let r = this.best - 6; r <= this.best + 20; r++) {
      const lane = this.lanes.get(r);
      if (!lane || !lane.speed) continue;
      for (const m of lane.movers) {
        m.x += lane.speed * dt;
        if (m.x > SPAN - 3) m.x -= SPAN;
        if (m.x + m.len < -3) m.x += SPAN;
      }
    }
    // Riding a log.
    const here = this.lane(this.row);
    if (here.kind === 'river') this.x += here.speed * dt;
    this.idle += dt;
    if (this.idle > EAGLE_S) {
      this.over = 'aguia';
      return [{ type: 'over', reason: 'aguia' }];
    }
    return this.check();
  }

  private check(): CrossEvent[] {
    const lane = this.lane(this.row);
    if (
      lane.kind === 'road' &&
      lane.movers.some((m) => this.x > m.x - 0.75 && this.x < m.x + m.len - 0.25)
    ) {
      this.over = 'carro';
      return [{ type: 'over', reason: 'carro' }];
    }
    if (lane.kind === 'river') {
      const onLog = lane.movers.some((m) => this.x > m.x - 0.55 && this.x < m.x + m.len - 0.45);
      if (!onLog || this.x < -0.4 || this.x > COLS - 0.6) {
        this.over = 'agua';
        return [{ type: 'over', reason: 'agua' }];
      }
    }
    return [];
  }
}
