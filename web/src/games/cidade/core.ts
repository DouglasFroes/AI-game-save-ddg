/**
 * "Cidade" — pure rules. Twenty-four turns on a 6×6 map: each turn you are offered three
 * buildings and place one. Neighbours matter — parks please houses, factories annoy them.
 */
export const SIZE = 6;
export const TURNS = 24;
export type Building = 'casa' | 'fazenda' | 'fabrica' | 'loja' | 'parque';
export const BUILDINGS: readonly Building[] = ['casa', 'fazenda', 'fabrica', 'loja', 'parque'];
export const EMOJI: Readonly<Record<Building, string>> = {
  casa: '🏠',
  fazenda: '🌾',
  fabrica: '🏭',
  loja: '🏪',
  parque: '🌳',
};
export const NAMES: Readonly<Record<Building, string>> = {
  casa: 'Casa',
  fazenda: 'Fazenda',
  fabrica: 'Fábrica',
  loja: 'Loja',
  parque: 'Parque',
};
export const RULES: Readonly<Record<Building, string>> = {
  casa: '+3 · +2 por parque · +1 por loja · −2 por fábrica',
  fazenda: '+2 · +1 por fazenda · +1 por casa',
  fabrica: '+6 · +1 por fábrica · −1 por casa',
  loja: '+2 · +2 por casa · −1 por loja',
  parque: '+1 · +1 por parque · +1 por casa',
};

export interface CityState {
  cells: Array<Building | null>;
  turn: number;
  offers: Building[];
}

export function neighbours(i: number): number[] {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const out: number[] = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}

function around(cells: ReadonlyArray<Building | null>, i: number, b: Building): number {
  return neighbours(i).filter((n) => cells[n] === b).length;
}

/** Points a building at cell `i` is worth given its neighbours. */
export function worth(cells: ReadonlyArray<Building | null>, i: number): number {
  const b = cells[i];
  if (!b) return 0;
  switch (b) {
    case 'casa':
      return (
        3 +
        2 * around(cells, i, 'parque') +
        around(cells, i, 'loja') -
        2 * around(cells, i, 'fabrica')
      );
    case 'fazenda':
      return 2 + around(cells, i, 'fazenda') + around(cells, i, 'casa');
    case 'fabrica':
      return 6 + around(cells, i, 'fabrica') - around(cells, i, 'casa');
    case 'loja':
      return 2 + 2 * around(cells, i, 'casa') - around(cells, i, 'loja');
    case 'parque':
      return 1 + around(cells, i, 'parque') + around(cells, i, 'casa');
  }
}

export function score(cells: ReadonlyArray<Building | null>): number {
  return cells.reduce((a, _, i) => a + worth(cells, i), 0);
}

function roll(rng: () => number): Building[] {
  return Array.from({ length: 3 }, () => BUILDINGS[Math.floor(rng() * BUILDINGS.length)]!);
}

export function newGame(rng: () => number = Math.random): CityState {
  return { cells: Array.from({ length: SIZE * SIZE }, () => null), turn: 0, offers: roll(rng) };
}

export function isOver(s: CityState): boolean {
  return s.turn >= TURNS;
}

/** Places offer `offer` at cell `cell`. Returns the new state, or null if illegal. */
export function place(
  s: CityState,
  cell: number,
  offer: number,
  rng: () => number = Math.random,
): CityState | null {
  const b = s.offers[offer];
  if (isOver(s) || !b || s.cells[cell]) return null;
  const cells = s.cells.slice();
  cells[cell] = b;
  return { cells, turn: s.turn + 1, offers: roll(rng) };
}

/** Greedy: the placement that raises the city's score the most. */
export function bestPlacement(s: CityState): { cell: number; offer: number } {
  let best = { cell: s.cells.findIndex((c) => !c), offer: 0 };
  let bestV = -Infinity;
  const base = score(s.cells);
  s.offers.forEach((b, offer) => {
    s.cells.forEach((c, cell) => {
      if (c) return;
      const cells = s.cells.slice();
      cells[cell] = b;
      const v = score(cells) - base;
      if (v > bestV) {
        bestV = v;
        best = { cell, offer };
      }
    });
  });
  return best;
}
