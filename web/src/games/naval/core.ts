import type { Rnd } from '@/platform/rnd';

/** Battleship rules and the CPU's hunt: pure, no Phaser. */
export const SIZE = 10;
export const CELLS = SIZE * SIZE;
export const FLEET = [5, 4, 3, 3, 2] as const;
export const SHIP_NAMES: Readonly<Record<number, string>> = {
  5: 'Porta-aviões',
  4: 'Encouraçado',
  3: 'Cruzador',
  2: 'Destróier',
};

export const row = (i: number) => Math.floor(i / SIZE);
export const col = (i: number) => i % SIZE;

export interface Ship {
  readonly size: number;
  readonly cells: readonly number[];
  readonly horizontal: boolean;
}

export interface ShotResult {
  /** The shot was already taken: nothing happens and the turn is kept. */
  repeat: boolean;
  hit: boolean;
  sunk: Ship | null;
}

/** One side's fleet and the shots received (0 none · 1 miss · 2 hit). */
export class Fleet {
  readonly ships: Ship[] = [];
  readonly shots = new Uint8Array(CELLS);
  private readonly shipAt = new Int8Array(CELLS).fill(-1);
  private readonly hits: number[] = [];

  /** A random legal layout: every ship inside the grid, none overlapping. */
  static random(rnd: Rnd): Fleet {
    const f = new Fleet();
    for (const size of FLEET) {
      for (;;) {
        const horizontal = rnd() < 0.5;
        const r = Math.floor(rnd() * (horizontal ? SIZE : SIZE - size + 1));
        const c = Math.floor(rnd() * (horizontal ? SIZE - size + 1 : SIZE));
        const cells = Array.from({ length: size }, (_, k) =>
          horizontal ? r * SIZE + c + k : (r + k) * SIZE + c,
        );
        if (cells.some((i) => f.shipAt[i] !== -1)) continue;
        f.add({ size, cells, horizontal });
        break;
      }
    }
    return f;
  }

  private add(ship: Ship): void {
    this.ships.push(ship);
    this.hits.push(0);
    for (const i of ship.cells) this.shipAt[i] = this.ships.length - 1;
  }

  shipIndexAt(i: number): number {
    return this.shipAt[i]!;
  }

  isSunk(ship: Ship): boolean {
    return this.hits[this.ships.indexOf(ship)] === ship.size;
  }

  shoot(i: number): ShotResult {
    if (this.shots[i] !== 0) return { repeat: true, hit: false, sunk: null };
    const s = this.shipAt[i]!;
    if (s < 0) {
      this.shots[i] = 1;
      return { repeat: false, hit: false, sunk: null };
    }
    this.shots[i] = 2;
    this.hits[s] = this.hits[s]! + 1;
    const ship = this.ships[s]!;
    return { repeat: false, hit: true, sunk: this.hits[s] === ship.size ? ship : null };
  }

  get allSunk(): boolean {
    return this.ships.every((s) => this.isSunk(s));
  }

  get sunkCount(): number {
    return this.ships.filter((s) => this.isSunk(s)).length;
  }

  get shotsTaken(): number {
    return this.shots.reduce((n, v) => n + (v === 0 ? 0 : 1), 0);
  }
}

/**
 * The CPU: it only knows its own shots. It weighs every way each surviving ship could still fit
 * (more weight when it covers an unsunk hit), so it hunts in a pattern and finishes ships fast.
 */
export class Hunter {
  private readonly known = new Uint8Array(CELLS); // 0 unknown · 1 miss · 2 hit (afloat) · 3 sunk
  private readonly afloat: number[] = [...FLEET];

  /** `skill` 0..1: the chance to follow the best cell instead of a random unknown one. */
  constructor(private readonly skill: number) {}

  nextShot(rnd: Rnd): number {
    const unknown: number[] = [];
    for (let i = 0; i < CELLS; i++) if (this.known[i] === 0) unknown.push(i);
    if (rnd() > this.skill) return unknown[Math.floor(rnd() * unknown.length)]!;
    const weight = new Float64Array(CELLS);
    const open = new Set<number>();
    for (const size of this.afloat) {
      for (const horizontal of [true, false]) {
        const rMax = horizontal ? SIZE : SIZE - size + 1;
        const cMax = horizontal ? SIZE - size + 1 : SIZE;
        for (let r = 0; r < rMax; r++) {
          for (let c = 0; c < cMax; c++) {
            let ok = true;
            let hits = 0;
            const cells: number[] = [];
            for (let k = 0; k < size; k++) {
              const i = horizontal ? r * SIZE + c + k : (r + k) * SIZE + c;
              const v = this.known[i]!;
              if (v === 1 || v === 3) {
                ok = false;
                break;
              }
              if (v === 2) hits++;
              cells.push(i);
            }
            if (!ok) continue;
            const w = hits > 0 ? 40 * hits * hits : 1;
            for (const i of cells) {
              if (this.known[i] === 0) {
                weight[i] = weight[i]! + w;
                open.add(i);
              }
            }
          }
        }
      }
    }
    let best = -1;
    let bestW = -1;
    for (const i of open) {
      const w = weight[i]! + rnd() * 0.5;
      if (w > bestW) {
        bestW = w;
        best = i;
      }
    }
    return best >= 0 ? best : unknown[Math.floor(rnd() * unknown.length)]!;
  }

  /** Tells the hunter what its shot did. */
  observe(i: number, result: ShotResult): void {
    if (!result.hit) {
      this.known[i] = 1;
      return;
    }
    this.known[i] = 2;
    if (result.sunk) {
      for (const c of result.sunk.cells) this.known[c] = 3;
      this.afloat.splice(this.afloat.indexOf(result.sunk.size), 1);
    }
  }
}

/** The CPU's accuracy for the player's n-th win. */
export function hunterSkill(wins: number): number {
  return Math.min(1, 0.45 + wins * 0.18);
}

/** Points for sinking the fleet: fewer shots and surviving ships pay more. */
export function winPoints(round: number, shots: number, myShipsLeft: number): number {
  const speed = Math.max(0, 70 - shots) * 4;
  return 100 + round * 30 + speed + myShipsLeft * 25;
}
