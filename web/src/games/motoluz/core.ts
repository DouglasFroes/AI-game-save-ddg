/**
 * "Moto de Luz" — pure rules (light cycles). Every bike leaves a wall behind it; touching any wall
 * ends that bike. The player (bike 0) races CPU bikes that look ahead with a flood fill to pick
 * the roomiest way. Outlast them all to win the round; the next round has more, faster rivals.
 */
export const COLS = 36;
export const ROWS = 50;

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export interface Bike {
  readonly id: number;
  x: number;
  y: number;
  dir: Dir;
  alive: boolean;
}

export type TronEvent =
  | { type: 'crash'; id: number; x: number; y: number }
  | { type: 'round'; round: number; bonus: number }
  | { type: 'over' };

export const opposite = (a: Dir, b: Dir): boolean => (a + 2) % 4 === b;

export class TronSim {
  round = 1;
  score = 0;
  kills = 0;
  bikes: Bike[] = [];
  /** 0 = empty, id + 1 = trail of that bike. */
  grid = new Uint8Array(COLS * ROWS);
  state: 'playing' | 'between' | 'over' = 'playing';
  private wanted: Dir = 0;
  private acc = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.startRound();
  }

  get rivals(): number {
    return Math.min(5, 1 + this.round);
  }

  get tickTime(): number {
    return Math.max(0.045, 0.085 - this.round * 0.005);
  }

  startRound(): void {
    this.grid.fill(0);
    this.bikes = [{ id: 0, x: Math.floor(COLS / 2), y: ROWS - 6, dir: 0, alive: true }];
    const spots: Array<[number, number, Dir]> = [
      [Math.floor(COLS / 2), 5, 2],
      [5, Math.floor(ROWS / 2), 1],
      [COLS - 6, Math.floor(ROWS / 2), 3],
      [6, 8, 1],
      [COLS - 7, 8, 3],
    ];
    for (let i = 0; i < this.rivals; i++) {
      const [x, y, dir] = spots[i]!;
      this.bikes.push({ id: i + 1, x, y, dir, alive: true });
    }
    for (const b of this.bikes) this.grid[b.y * COLS + b.x] = b.id + 1;
    this.wanted = 0;
    this.acc = 0;
    this.state = 'playing';
  }

  /** The player asks to turn; reversing into your own trail is ignored. */
  steer(dir: Dir): void {
    const me = this.bikes[0]!;
    if (!opposite(me.dir, dir)) this.wanted = dir;
  }

  private free(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS && this.grid[y * COLS + x] === 0;
  }

  /** Cells reachable from (x, y), capped. */
  private room(x: number, y: number, cap = 160): number {
    if (!this.free(x, y)) return 0;
    const seen = new Set([y * COLS + x]);
    const queue = [y * COLS + x];
    while (queue.length && seen.size < cap) {
      const c = queue.shift()!;
      const cx = c % COLS;
      const cy = Math.floor(c / COLS);
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d]!;
        const ny = cy + DY[d]!;
        const k = ny * COLS + nx;
        if (this.free(nx, ny) && !seen.has(k)) {
          seen.add(k);
          queue.push(k);
        }
      }
    }
    return seen.size;
  }

  private think(b: Bike): void {
    const options: Dir[] = [b.dir, ((b.dir + 1) % 4) as Dir, ((b.dir + 3) % 4) as Dir];
    // Now and then a rival turns on a whim (fewer whims in later rounds).
    if (this.rng() < Math.max(0.02, 0.1 - this.round * 0.015)) {
      const safe = options.filter((d) => this.free(b.x + DX[d]!, b.y + DY[d]!));
      if (safe.length) {
        b.dir = safe[Math.floor(this.rng() * safe.length)]!;
        return;
      }
    }
    let best = b.dir;
    let bestScore = -1;
    for (const d of options) {
      const s = this.room(b.x + DX[d]!, b.y + DY[d]!) + (d === b.dir ? 3 : 0) + this.rng() * 2;
      if (s > bestScore) {
        bestScore = s;
        best = d;
      }
    }
    b.dir = best;
  }

  step(dt: number): TronEvent[] {
    if (this.state !== 'playing') return [];
    this.acc += dt;
    const events: TronEvent[] = [];
    while (this.acc >= this.tickTime && this.state === 'playing') {
      this.acc -= this.tickTime;
      events.push(...this.tick());
    }
    return events;
  }

  private tick(): TronEvent[] {
    const events: TronEvent[] = [];
    const me = this.bikes[0]!;
    if (!opposite(me.dir, this.wanted)) me.dir = this.wanted;
    for (const b of this.bikes) if (b.alive && b.id !== 0) this.think(b);

    const heads = new Map<number, Bike[]>();
    for (const b of this.bikes) {
      if (!b.alive) continue;
      b.x += DX[b.dir]!;
      b.y += DY[b.dir]!;
      const k = b.y * COLS + b.x;
      heads.set(k, [...(heads.get(k) ?? []), b]);
    }
    for (const b of this.bikes) {
      if (!b.alive) continue;
      const k = b.y * COLS + b.x;
      const headOn = (heads.get(k)?.length ?? 0) > 1;
      if (!this.free(b.x, b.y) || headOn) {
        b.alive = false;
        events.push({ type: 'crash', id: b.id, x: b.x, y: b.y });
        if (b.id !== 0 && me.alive) {
          this.kills++;
          this.score += 250 * this.round;
        }
      }
    }
    for (const b of this.bikes) if (b.alive) this.grid[b.y * COLS + b.x] = b.id + 1;

    if (!me.alive) {
      this.state = 'over';
      events.push({ type: 'over' });
      return events;
    }
    this.score += 1;
    if (this.bikes.every((b) => b.id === 0 || !b.alive)) {
      const bonus = 500 * this.round;
      this.score += bonus;
      this.state = 'between';
      events.push({ type: 'round', round: this.round, bonus });
    }
    return events;
  }

  nextRound(): void {
    if (this.state !== 'between') return;
    this.round++;
    this.startRound();
  }
}
