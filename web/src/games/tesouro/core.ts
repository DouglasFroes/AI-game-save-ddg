/**
 * "Caça ao Tesouro" — pure rules of a deduction dig. Treasures are buried on an 8×8 beach; each
 * dig shows how many steps (in straight moves) it is to the nearest treasure still buried. Find
 * them all before the shovels run out. Later islands hide more treasures with fewer spare shovels.
 */
export const N = 8;

export interface IslandSpec {
  readonly treasures: number;
  readonly shovels: number;
}

export function islandSpec(level: number): IslandSpec {
  const treasures = Math.min(5, 1 + Math.floor((level - 1) / 2));
  return { treasures, shovels: treasures * 3 + Math.max(2, 7 - level) };
}

export const distance = (a: number, b: number): number =>
  Math.abs(Math.floor(a / N) - Math.floor(b / N)) + Math.abs((a % N) - (b % N));

export type DigResult =
  | { kind: 'already' }
  | { kind: 'clue'; distance: number }
  | { kind: 'treasure'; left: number }
  | { kind: 'cleared'; points: number };

export class Island {
  readonly treasures: Set<number>;
  readonly found = new Set<number>();
  /** Dug cells and the clue each showed (-1 = treasure). */
  readonly dug = new Map<number, number>();
  shovels: number;

  constructor(
    readonly level: number,
    rng: () => number = Math.random,
  ) {
    const spec = islandSpec(level);
    this.shovels = spec.shovels;
    this.treasures = new Set();
    while (this.treasures.size < spec.treasures) this.treasures.add(Math.floor(rng() * N * N));
  }

  get outOfShovels(): boolean {
    return this.shovels <= 0 && this.found.size < this.treasures.size;
  }

  /** Distance from a cell to the nearest treasure not found yet. */
  nearest(cell: number): number {
    let best = Infinity;
    for (const t of this.treasures)
      if (!this.found.has(t)) best = Math.min(best, distance(cell, t));
    return best;
  }

  dig(cell: number): DigResult {
    if (this.dug.has(cell) || this.shovels <= 0) return { kind: 'already' };
    this.shovels--;
    if (this.treasures.has(cell)) {
      this.found.add(cell);
      this.dug.set(cell, -1);
      // Clues already on the beach now point at the treasures still buried.
      for (const [c, v] of this.dug) if (v >= 0) this.dug.set(c, this.nearest(c));
      const left = this.treasures.size - this.found.size;
      if (left === 0) return { kind: 'cleared', points: this.points() };
      return { kind: 'treasure', left };
    }
    const d = this.nearest(cell);
    this.dug.set(cell, d);
    return { kind: 'clue', distance: d };
  }

  /** Points for clearing the island: spare shovels are worth the most. */
  points(): number {
    return this.treasures.size * 150 + this.shovels * 80 + this.level * 40;
  }
}
