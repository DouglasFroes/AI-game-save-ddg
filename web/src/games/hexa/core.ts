import { randInt, type Rnd } from '@/platform/rnd';

/** Hexagon board in axial coordinates: every cell within `RADIUS` of the centre. */
export const RADIUS = 2;
export const CLEAR_AT = 10;
export const MAX_STACK = 24;
export const COLOR_COUNT = 5;

export interface Axial {
  q: number;
  r: number;
}

const DIRS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const CELLS: readonly Axial[] = (() => {
  const out: Axial[] = [];
  for (let r = -RADIUS; r <= RADIUS; r++)
    for (let q = -RADIUS; q <= RADIUS; q++) if (Math.abs(q + r) <= RADIUS) out.push({ q, r });
  return out;
})();

const indexOf = (q: number, r: number): number => CELLS.findIndex((c) => c.q === q && c.r === r);

/** For every cell, the indices of its (up to 6) neighbours. */
export const NEIGHBOURS: readonly (readonly number[])[] = CELLS.map((c) =>
  DIRS.map((d) => indexOf(c.q + d.q, c.r + d.r)).filter((i) => i >= 0),
);

/** A stack is a list of colour ids, bottom first. */
export type Stack = number[];

/** Number of chips of the top colour (the "run" that moves and clears together). */
export function topRun(stack: readonly number[]): number {
  if (stack.length === 0) return 0;
  const top = stack[stack.length - 1]!;
  let n = 0;
  for (let i = stack.length - 1; i >= 0 && stack[i] === top; i--) n++;
  return n;
}

export interface HexaEvents {
  /** Chips cleared by 10-in-a-row during the move. */
  cleared: number;
  /** How many merge/clear passes the move triggered (combo). */
  chain: number;
}

/** "Hexa Pilhas": place stacks, same-colour tops flow together, 10 in a row vanish. */
export class HexaSim {
  readonly board: (Stack | null)[] = CELLS.map(() => null);
  hand: Stack[] = [];
  score = 0;
  placed = 0;
  bestChain = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.refill();
  }

  /** Colours in play grow with progress, so the board gets harder. */
  get colors(): number {
    return Math.min(COLOR_COUNT, 3 + Math.floor(this.placed / 12));
  }

  private makeStack(): Stack {
    const parts = randInt(this.rnd, 1, this.placed < 6 ? 2 : 3);
    const stack: Stack = [];
    let last = -1;
    for (let p = 0; p < parts; p++) {
      let c = randInt(this.rnd, 0, this.colors - 1);
      if (c === last) c = (c + 1) % this.colors;
      last = c;
      const size = randInt(this.rnd, 2, 5);
      for (let i = 0; i < size; i++) stack.push(c);
    }
    return stack;
  }

  private refill(): void {
    this.hand = [this.makeStack(), this.makeStack(), this.makeStack()];
  }

  get full(): boolean {
    return this.board.every((s) => s !== null);
  }

  get dead(): boolean {
    return this.full && !this.canMerge();
  }

  private canMerge(): boolean {
    return this.board.some((s, i) => {
      if (!s) return false;
      return NEIGHBOURS[i]!.some((j) => {
        const o = this.board[j];
        return !!o && o[o.length - 1] === s[s.length - 1];
      });
    });
  }

  /** Puts hand stack `h` on empty cell `cell` and resolves merges. Null if the move is illegal. */
  place(h: number, cell: number): HexaEvents | null {
    const stack = this.hand[h];
    if (!stack || stack.length === 0 || this.board[cell]) return null;
    this.board[cell] = stack;
    this.hand[h] = [];
    this.placed++;
    this.score += stack.length;
    const events = this.resolve();
    if (this.hand.every((s) => s.length === 0)) this.refill();
    return events;
  }

  /** Repeats "merge equal tops, then clear full runs" until nothing changes. */
  private resolve(): HexaEvents {
    const events: HexaEvents = { cleared: 0, chain: 0 };
    for (let guard = 0; guard < 200; guard++) {
      let changed = false;
      for (let i = 0; i < this.board.length; i++) {
        if (this.mergeInto(i)) changed = true;
      }
      for (let i = 0; i < this.board.length; i++) {
        const s = this.board[i];
        if (s && topRun(s) >= CLEAR_AT) {
          const n = topRun(s);
          s.length -= n;
          if (s.length === 0) this.board[i] = null;
          events.cleared += n;
          this.score += n * 3;
          changed = true;
        }
      }
      if (!changed) break;
      events.chain++;
    }
    if (events.chain > 1) this.score += (events.chain - 1) * 20;
    this.bestChain = Math.max(this.bestChain, events.chain);
    return events;
  }

  /** Merges the top run of cell `i` with equal-coloured neighbours; the bigger run absorbs. */
  private mergeInto(i: number): boolean {
    let moved = false;
    for (const j of NEIGHBOURS[i]!) {
      const here = this.board[i];
      const other = this.board[j];
      if (!here || !other) continue;
      const color = here[here.length - 1]!;
      if (other[other.length - 1] !== color) continue;
      const [from, to, fromIdx] =
        topRun(here) >= topRun(other) ? [other, here, j] : [here, other, i];
      const n = Math.min(topRun(from), MAX_STACK - to.length);
      if (n <= 0) continue;
      from.length -= n;
      for (let k = 0; k < n; k++) to.push(color);
      if (from.length === 0) this.board[fromIdx] = null;
      moved = true;
    }
    return moved;
  }
}
