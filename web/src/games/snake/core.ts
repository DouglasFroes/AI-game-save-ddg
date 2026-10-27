/** Snake rules — pure, tick based, deterministic with an injected RNG. */

export const COLS = 18;
export const ROWS = 24;
export const FOOD_POINTS = 10;
export const BONUS_POINTS = 50;
export const BONUS_EVERY = 5;
export const BONUS_TICKS = 45;

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Rng = () => number;

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export type SnakeEvent = 'eat' | 'bonus' | 'bonus-spawn' | 'die';

const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export class SnakeGame {
  /** Head first. */
  body: Cell[];
  dir: Dir = 'right';
  food: Cell;
  bonus: { cell: Cell; ticks: number } | null = null;
  score = 0;
  eaten = 0;
  alive = true;
  private readonly queue: Dir[] = [];
  private grow = 0;

  constructor(private readonly rng: () => number = Math.random) {
    const cy = Math.floor(ROWS / 2);
    this.body = [
      { x: 6, y: cy },
      { x: 5, y: cy },
      { x: 4, y: cy },
    ];
    this.food = this.randomFreeCell();
  }

  /** Milliseconds between moves: faster as the snake eats. */
  get interval(): number {
    return Math.max(65, 150 - this.eaten * 3);
  }

  get head(): Cell {
    return this.body[0]!;
  }

  /** Buffers up to 2 turns so quick swipes are not lost; ignores reversals. */
  turn(dir: Dir): void {
    const last = this.queue[this.queue.length - 1] ?? this.dir;
    if (dir === last || dir === OPPOSITE[last] || this.queue.length >= 2) return;
    this.queue.push(dir);
  }

  tick(): SnakeEvent[] {
    if (!this.alive) return [];
    const events: SnakeEvent[] = [];
    this.dir = this.queue.shift() ?? this.dir;
    const d = DELTA[this.dir];
    const next = { x: this.head.x + d.x, y: this.head.y + d.y };

    const tailMoves = this.grow === 0;
    const hitsBody = this.body.some(
      (c, i) => same(c, next) && !(tailMoves && i === this.body.length - 1),
    );
    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS || hitsBody) {
      this.alive = false;
      return ['die'];
    }

    this.body.unshift(next);
    if (this.grow > 0) this.grow--;
    else this.body.pop();

    if (same(next, this.food)) {
      this.score += FOOD_POINTS;
      this.eaten++;
      this.grow += 1;
      events.push('eat');
      this.food = this.randomFreeCell();
      if (this.eaten % BONUS_EVERY === 0 && !this.bonus) {
        this.bonus = { cell: this.randomFreeCell(), ticks: BONUS_TICKS };
        events.push('bonus-spawn');
      }
    }
    if (this.bonus) {
      if (same(next, this.bonus.cell)) {
        this.score += BONUS_POINTS;
        this.grow += 2;
        this.bonus = null;
        events.push('bonus');
      } else if (--this.bonus.ticks <= 0) {
        this.bonus = null;
      }
    }
    return events;
  }

  private randomFreeCell(): Cell {
    const taken = (c: Cell) =>
      this.body.some((b) => same(b, c)) ||
      (this.food !== undefined && same(this.food, c)) ||
      (this.bonus !== null && same(this.bonus.cell, c));
    for (let i = 0; i < 500; i++) {
      const c = { x: Math.floor(this.rng() * COLS), y: Math.floor(this.rng() * ROWS) };
      if (!taken(c)) return c;
    }
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) if (!taken({ x, y })) return { x, y };
    return { x: 0, y: 0 };
  }
}
