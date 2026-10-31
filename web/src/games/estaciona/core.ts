/**
 * "Estacionamento" — pure rules of a sliding-car puzzle (Rush Hour style) on a 6×6 lot.
 * Cars only slide along their own axis; the red car (id 0, row 2) must reach the exit on the right.
 * Levels are random lots checked with a breadth-first solver, so each one is solvable and its
 * minimum number of moves (one move = one car slid any distance) is known.
 */
export const N = 6;
export const EXIT_ROW = 2;

export interface Car {
  readonly id: number;
  readonly len: 2 | 3;
  readonly horiz: boolean;
  /** Top-left cell. */
  r: number;
  c: number;
}

export type Lot = Car[];

export const cloneLot = (lot: Lot): Lot => lot.map((c) => ({ ...c }));

export function cells(car: Car): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < car.len; i++) out.push(car.horiz ? [car.r, car.c + i] : [car.r + i, car.c]);
  return out;
}

export function grid(lot: Lot): number[] {
  const g = new Array<number>(N * N).fill(-1);
  for (const car of lot) for (const [r, c] of cells(car)) g[r * N + c] = car.id;
  return g;
}

/** How far a car can slide: [most negative, most positive] steps. */
export function slideRange(lot: Lot, id: number): [number, number] {
  const g = grid(lot);
  const car = lot.find((c) => c.id === id)!;
  let lo = 0;
  let hi = 0;
  if (car.horiz) {
    while (car.c + lo - 1 >= 0 && g[car.r * N + car.c + lo - 1] === -1) lo--;
    while (car.c + car.len + hi < N && g[car.r * N + car.c + car.len + hi] === -1) hi++;
  } else {
    while (car.r + lo - 1 >= 0 && g[(car.r + lo - 1) * N + car.c] === -1) lo--;
    while (car.r + car.len + hi < N && g[(car.r + car.len + hi) * N + car.c] === -1) hi++;
  }
  return [lo, hi];
}

export const solved = (lot: Lot): boolean => lot.find((c) => c.id === 0)!.c === N - 2;

const key = (lot: Lot): string => lot.map((c) => (c.horiz ? c.c : c.r)).join(',');

/** Minimum moves to free the red car, or -1 (search capped for speed). */
export function solve(start: Lot, cap = 40000): number {
  if (solved(start)) return 0;
  const seen = new Set([key(start)]);
  let frontier: Lot[] = [start];
  for (let depth = 1; frontier.length && seen.size < cap; depth++) {
    const next: Lot[] = [];
    for (const lot of frontier)
      for (const car of lot) {
        const [lo, hi] = slideRange(lot, car.id);
        for (let d = lo; d <= hi; d++) {
          if (d === 0) continue;
          const moved = cloneLot(lot);
          const m = moved.find((c) => c.id === car.id)!;
          if (m.horiz) m.c += d;
          else m.r += d;
          const k = key(moved);
          if (seen.has(k)) continue;
          if (solved(moved)) return depth;
          seen.add(k);
          next.push(moved);
        }
      }
    frontier = next;
  }
  return -1;
}

/** Minimum moves wanted for a level (grows, then plateaus). */
export const targetMoves = (level: number): number => Math.min(14, 3 + Math.floor(level * 1.2));

/** A random solvable lot whose solution is as close as possible to the level's target. */
export function generate(
  level: number,
  rng: () => number = Math.random,
): { lot: Lot; par: number } {
  const want = targetMoves(level);
  let best: { lot: Lot; par: number } | null = null;
  for (let attempt = 0; attempt < 260; attempt++) {
    const lot: Lot = [{ id: 0, len: 2, horiz: true, r: EXIT_ROW, c: Math.floor(rng() * 2) }];
    const count = 7 + Math.floor(rng() * 4) + Math.min(3, Math.floor(level / 3));
    for (let tries = 0; lot.length < count && tries < 120; tries++) {
      const horiz = rng() < 0.5;
      const len: 2 | 3 = rng() < 0.3 ? 3 : 2;
      const r = Math.floor(rng() * (horiz ? N : N - len + 1));
      const c = Math.floor(rng() * (horiz ? N - len + 1 : N));
      // No other horizontal car on the exit row: the red car could never get past it.
      if (horiz && r === EXIT_ROW) continue;
      const car: Car = { id: lot.length, len, horiz, r, c };
      const g = grid(lot);
      if (cells(car).some(([cr, cc]) => g[cr * N + cc] !== -1)) continue;
      lot.push(car);
    }
    const par = solve(lot);
    if (par < 2) continue;
    if (!best || Math.abs(par - want) < Math.abs(best.par - want)) best = { lot, par };
    if (par >= want) break;
  }
  return (
    best ?? {
      lot: [
        { id: 0, len: 2, horiz: true, r: EXIT_ROW, c: 0 },
        { id: 1, len: 2, horiz: false, r: 1, c: 3 },
        { id: 2, len: 2, horiz: true, r: 0, c: 2 },
      ],
      par: 2,
    }
  );
}

/**
 * A run: every move burns one litre of fuel; freeing the red car refills it, more for doing it
 * close to the minimum. The run ends when the tank is empty.
 */
export class ParkingRun {
  level = 1;
  lot: Lot = [];
  par = 0;
  moves = 0;
  fuel = 30;
  score = 0;
  perfect = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.load();
  }

  get over(): boolean {
    return this.fuel <= 0 && !solved(this.lot);
  }

  private load(): void {
    const g = generate(this.level, this.rng);
    this.lot = g.lot;
    this.par = g.par;
    this.moves = 0;
  }

  /** Slides a car by `d` cells (clamped to what is free). Returns the steps actually moved. */
  slide(id: number, d: number): number {
    if (this.fuel <= 0 || solved(this.lot)) return 0;
    const [lo, hi] = slideRange(this.lot, id);
    const step = Math.max(lo, Math.min(hi, Math.round(d)));
    if (step === 0) return 0;
    const car = this.lot.find((c) => c.id === id)!;
    if (car.horiz) car.c += step;
    else car.r += step;
    this.moves++;
    this.fuel--;
    return step;
  }

  /** Call once the red car is out: scores the level and loads the next. */
  complete(): { points: number; refill: number; perfect: boolean } {
    const perfect = this.moves <= this.par;
    const extra = Math.max(0, this.moves - this.par);
    const points =
      this.level * 100 + this.par * 20 + (perfect ? 250 : Math.max(0, 120 - extra * 20));
    const refill = this.par + (perfect ? 8 : Math.max(2, 6 - extra));
    this.score += points;
    this.fuel += refill;
    if (perfect) this.perfect++;
    this.level++;
    this.load();
    return { points, refill, perfect };
  }
}
