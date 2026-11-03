/**
 * "Rainhas" — pure rules. Put exactly one queen in every row, every column and every coloured
 * region, with no two queens touching (not even diagonally).
 */
export interface Puzzle {
  n: number;
  /** Region (0..n-1) of every cell. */
  regions: number[];
  /** One valid answer: the column of the queen in each row. */
  solution: number[];
}

export function sizeFor(level: number): number {
  return Math.min(8, 4 + level);
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const n = sizeFor(level);
  let solution: number[] = [];
  // A permutation whose neighbouring rows are at least two columns apart.
  for (let tries = 0; tries < 5000; tries++) {
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [perm[i], perm[j]] = [perm[j]!, perm[i]!];
    }
    if (perm.every((c, r) => r === 0 || Math.abs(c - perm[r - 1]!) >= 2)) {
      solution = perm;
      break;
    }
  }
  const regions = Array.from({ length: n * n }, () => -1);
  const frontier: number[] = [];
  solution.forEach((c, r) => {
    regions[r * n + c] = r;
    frontier.push(r * n + c);
  });
  while (frontier.length > 0) {
    const at = Math.floor(rng() * frontier.length);
    const cell = frontier[at]!;
    const r = Math.floor(cell / n);
    const c = cell % n;
    const free = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ]
      .filter(
        ([rr, cc]) =>
          rr! >= 0 && rr! < n && cc! >= 0 && cc! < n && (regions[rr! * n + cc!] ?? 0) < 0,
      )
      .map(([rr, cc]) => rr! * n + cc!);
    if (free.length === 0) {
      frontier.splice(at, 1);
      continue;
    }
    const next = free[Math.floor(rng() * free.length)]!;
    regions[next] = regions[cell]!;
    frontier.push(next);
  }
  return { n, regions, solution };
}

/** Cells whose queen breaks a rule (shares a row, column or region with another, or touches one). */
export function conflicts(p: Puzzle, queens: boolean[]): Set<number> {
  const cells = queens.map((q, i) => (q ? i : -1)).filter((i) => i >= 0);
  const bad = new Set<number>();
  for (let x = 0; x < cells.length; x++) {
    for (let y = x + 1; y < cells.length; y++) {
      const a = cells[x]!;
      const b = cells[y]!;
      const ar = Math.floor(a / p.n);
      const br = Math.floor(b / p.n);
      const ac = a % p.n;
      const bc = b % p.n;
      if (
        ar === br ||
        ac === bc ||
        p.regions[a] === p.regions[b] ||
        (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)
      ) {
        bad.add(a);
        bad.add(b);
      }
    }
  }
  return bad;
}

export function isSolved(p: Puzzle, queens: boolean[]): boolean {
  return queens.filter(Boolean).length === p.n && conflicts(p, queens).size === 0;
}
