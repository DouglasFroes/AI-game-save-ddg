import type { Rnd } from '@/platform/rnd';

export const COLS = 9;
export const R = 34;
export const LEFT = 37;
export const RIGHT = LEFT + COLS * 2 * R + R;
export const ROW0_Y = 210;
export const ROW_H = 59;
export const SHOOTER = { x: 360, y: 1100 };
export const LIMIT_ROW = 11;
export const NCOLORS = 5;
const STEP = 5;

export interface Vec {
  x: number;
  y: number;
}
export interface Cell {
  r: number;
  c: number;
}
export interface Trace {
  /** Corner points of the ball's route, ending at the landing cell's centre. */
  path: Vec[];
  cell: Cell;
}
export interface LandResult {
  color: number;
  popped: Cell[];
  dropped: Cell[];
  newRow: boolean;
  cleared: boolean;
  points: number;
}

/** "Atira Bolhas": hex-grid bubble shooter. Misses push the ceiling down. */
export class BubbleSim {
  rows: number[][] = [];
  /** Which rows are shifted half a bubble right: (r + parity) odd. */
  parity: 0 | 1 = 0;
  current = 0;
  next = 0;
  score = 0;
  popped = 0;
  shots = 0;
  misses = 0;
  dead = false;

  constructor(private readonly rnd: Rnd = Math.random) {
    for (let i = 0; i < 6; i++) this.rows.push(this.randomRow());
    this.current = this.pickColor();
    this.next = this.pickColor();
  }

  private randomRow(): number[] {
    return Array.from({ length: COLS }, () => Math.floor(this.rnd() * NCOLORS));
  }

  /** Colours still on the board, so the next bubble can always be used. */
  private pickColor(): number {
    const present = [...new Set(this.rows.flat().filter((v) => v >= 0))];
    return present.length
      ? present[Math.floor(this.rnd() * present.length)]!
      : Math.floor(this.rnd() * NCOLORS);
  }

  isOdd(r: number): boolean {
    return ((r + this.parity) & 1) === 1;
  }

  pos(r: number, c: number): Vec {
    return { x: LEFT + R + c * 2 * R + (this.isOdd(r) ? R : 0), y: ROW0_Y + r * ROW_H };
  }

  get(r: number, c: number): number {
    return this.rows[r]?.[c] ?? -1;
  }

  neighbors(r: number, c: number): Cell[] {
    const offs = this.isOdd(r)
      ? [
          [-1, 0],
          [-1, 1],
          [0, -1],
          [0, 1],
          [1, 0],
          [1, 1],
        ]
      : [
          [-1, -1],
          [-1, 0],
          [0, -1],
          [0, 1],
          [1, -1],
          [1, 0],
        ];
    return offs
      .map(([dr, dc]) => ({ r: r + dr!, c: c + dc! }))
      .filter((n) => n.r >= 0 && n.c >= 0 && n.c < COLS);
  }

  get count(): number {
    return this.rows.reduce((n, row) => n + row.filter((v) => v >= 0).length, 0);
  }

  swap(): void {
    [this.current, this.next] = [this.next, this.current];
  }

  /** Where a shot at `angle` (radians from straight up) would go. Does not change the board. */
  trace(angle: number): Trace {
    let { x, y } = SHOOTER;
    let dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    const path: Vec[] = [{ x, y }];
    for (let i = 0; i < 700; i++) {
      x += dx * STEP;
      y += dy * STEP;
      if (x < LEFT + R) {
        x = 2 * (LEFT + R) - x;
        dx = -dx;
        path.push({ x: LEFT + R, y });
      } else if (x > RIGHT - R) {
        x = 2 * (RIGHT - R) - x;
        dx = -dx;
        path.push({ x: RIGHT - R, y });
      }
      if (y <= ROW0_Y || this.touches(x, y)) break;
    }
    const cell = this.nearestFree(x, y);
    const p = this.pos(cell.r, cell.c);
    path.push(p);
    return { path, cell };
  }

  private touches(x: number, y: number): boolean {
    const mid = Math.round((y - ROW0_Y) / ROW_H);
    for (let r = Math.max(0, mid - 1); r <= Math.min(this.rows.length - 1, mid + 1); r++)
      for (let c = 0; c < COLS; c++) {
        if (this.get(r, c) < 0) continue;
        const p = this.pos(r, c);
        if ((p.x - x) ** 2 + (p.y - y) ** 2 < (2 * R * 0.9) ** 2) return true;
      }
    return false;
  }

  private nearestFree(x: number, y: number): Cell {
    let best: Cell = { r: 0, c: 0 };
    let bestD = Infinity;
    for (let r = 0; r <= this.rows.length; r++)
      for (let c = 0; c < COLS; c++) {
        if (this.get(r, c) >= 0) continue;
        if (r > 0 && !this.neighbors(r, c).some((n) => this.get(n.r, n.c) >= 0)) continue;
        const p = this.pos(r, c);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { r, c };
        }
      }
    return best;
  }

  /** Applies a shot: places the bubble, pops matches, drops orphans, maybe lowers the ceiling. */
  land(t: Trace): LandResult {
    const color = this.current;
    const { r, c } = t.cell;
    while (this.rows.length <= r) this.rows.push(new Array<number>(COLS).fill(-1));
    this.rows[r]![c] = color;
    this.shots++;

    const group = this.group(r, c);
    let popped: Cell[] = [];
    let dropped: Cell[] = [];
    if (group.length >= 3) {
      popped = group;
      for (const g of group) this.rows[g.r]![g.c] = -1;
      dropped = this.floating();
      for (const d of dropped) this.rows[d.r]![d.c] = -1;
      this.popped += popped.length + dropped.length;
      this.misses = 0;
    } else this.misses++;

    let newRow = false;
    if (this.misses >= Math.max(3, 6 - Math.floor(this.popped / 60))) {
      this.rows.unshift(this.randomRow());
      this.parity = this.parity === 0 ? 1 : 0;
      this.misses = 0;
      newRow = true;
    }
    while (this.rows.length > 1 && this.rows[this.rows.length - 1]!.every((v) => v < 0))
      this.rows.pop();

    let points = popped.length * 10 + dropped.length * 25;
    const cleared = this.count === 0;
    if (cleared) {
      for (let i = 0; i < 4; i++) this.rows.push(this.randomRow());
      points += 500;
    }
    this.score += points;
    this.dead = this.rows.some((row, ri) => ri >= LIMIT_ROW && row.some((v) => v >= 0));
    this.current = this.next;
    this.next = this.pickColor();
    return { color, popped, dropped, newRow, cleared, points };
  }

  private group(r: number, c: number): Cell[] {
    const color = this.get(r, c);
    const seen = new Set<string>([`${r},${c}`]);
    const out: Cell[] = [{ r, c }];
    for (let i = 0; i < out.length; i++) {
      const cur = out[i]!;
      for (const n of this.neighbors(cur.r, cur.c)) {
        const k = `${n.r},${n.c}`;
        if (seen.has(k) || this.get(n.r, n.c) !== color) continue;
        seen.add(k);
        out.push(n);
      }
    }
    return out;
  }

  /** Occupied cells not connected to the ceiling. */
  private floating(): Cell[] {
    const seen = new Set<string>();
    const queue: Cell[] = [];
    for (let c = 0; c < COLS; c++)
      if (this.get(0, c) >= 0) {
        seen.add(`0,${c}`);
        queue.push({ r: 0, c });
      }
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i]!;
      for (const n of this.neighbors(cur.r, cur.c)) {
        const k = `${n.r},${n.c}`;
        if (seen.has(k) || this.get(n.r, n.c) < 0) continue;
        seen.add(k);
        queue.push(n);
      }
    }
    const out: Cell[] = [];
    this.rows.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v >= 0 && !seen.has(`${r},${c}`)) out.push({ r, c });
      }),
    );
    return out;
  }
}
