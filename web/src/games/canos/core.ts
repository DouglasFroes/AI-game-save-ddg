export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 4;
export const DIR_W = 8;

export interface PipeCell {
  r: number;
  c: number;
  mask: number;
  readonly solvedMask: number;
  readonly isSource: boolean;
  readonly isTarget: boolean;
  watered: boolean;
}

export function rotateMask90(mask: number): number {
  let out = 0;
  if (mask & DIR_N) out |= DIR_E;
  if (mask & DIR_E) out |= DIR_S;
  if (mask & DIR_S) out |= DIR_W;
  if (mask & DIR_W) out |= DIR_N;
  return out;
}

const STEPS: ReadonlyArray<{ dr: number; dc: number; bit: number; opp: number }> = [
  { dr: -1, dc: 0, bit: DIR_N, opp: DIR_S },
  { dr: 0, dc: 1, bit: DIR_E, opp: DIR_W },
  { dr: 1, dc: 0, bit: DIR_S, opp: DIR_N },
  { dr: 0, dc: -1, bit: DIR_W, opp: DIR_E },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generatePipeGrid(size: number, seed = Date.now()): PipeCell[][] {
  const rng = mulberry32(seed);
  const masks: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0),
  );
  const visited: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  // Randomized DFS spanning tree from (0, 0)
  const stack: Array<{ r: number; c: number }> = [{ r: 0, c: 0 }];
  visited[0]![0] = true;

  while (stack.length > 0) {
    const cur = stack[stack.length - 1]!;
    const neighbors = STEPS.map((s) => ({
      nr: cur.r + s.dr,
      nc: cur.c + s.dc,
      bit: s.bit,
      opp: s.opp,
    })).filter(
      (n) => n.nr >= 0 && n.nr < size && n.nc >= 0 && n.nc < size && !visited[n.nr]![n.nc],
    );

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const pick = neighbors[Math.floor(rng() * neighbors.length)]!;
    visited[pick.nr]![pick.nc] = true;
    masks[cur.r]![cur.c]! |= pick.bit;
    masks[pick.nr]![pick.nc]! |= pick.opp;
    stack.push({ r: pick.nr, c: pick.nc });
  }

  // Pick leaf nodes (excluding source) as crystal targets
  const grid: PipeCell[][] = [];
  let targetCount = 0;
  for (let r = 0; r < size; r++) {
    const row: PipeCell[] = [];
    for (let c = 0; c < size; c++) {
      const sm = masks[r]![c]!;
      const isSource = r === 0 && c === 0;
      const isLeaf = !isSource && (sm === DIR_N || sm === DIR_E || sm === DIR_S || sm === DIR_W);
      const isCornerFar = r === size - 1 && c === size - 1;
      const isTarget = isLeaf || isCornerFar;
      if (isTarget) targetCount++;

      let m = sm;
      const spins = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < spins; i++) m = rotateMask90(m);

      row.push({
        r,
        c,
        mask: m,
        solvedMask: sm,
        isSource,
        isTarget,
        watered: false,
      });
    }
    grid.push(row);
  }

  if (targetCount === 0) {
    const last = grid[size - 1]![size - 1]!;
    grid[size - 1]![size - 1] = { ...last, isTarget: true };
  }

  propagateWater(grid);
  // Ensure it doesn't start already solved
  if (isPipeGridSolved(grid)) {
    grid[0]![0]!.mask = rotateMask90(grid[0]![0]!.mask);
    propagateWater(grid);
  }
  return grid;
}

export function propagateWater(grid: PipeCell[][]): void {
  const size = grid.length;
  for (const row of grid) for (const cell of row) cell.watered = false;

  const q: Array<{ r: number; c: number }> = [{ r: 0, c: 0 }];
  grid[0]![0]!.watered = true;

  while (q.length > 0) {
    const { r, c } = q.shift()!;
    const cell = grid[r]![c]!;
    for (const s of STEPS) {
      if ((cell.mask & s.bit) === 0) continue;
      const nr = r + s.dr;
      const nc = c + s.dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const next = grid[nr]![nc]!;
      if (!next.watered && (next.mask & s.opp) !== 0) {
        next.watered = true;
        q.push({ r: nr, c: nc });
      }
    }
  }
}

export function rotateCell(grid: PipeCell[][], r: number, c: number): boolean {
  const cell = grid[r]?.[c];
  if (!cell) return false;
  cell.mask = rotateMask90(cell.mask);
  propagateWater(grid);
  return true;
}

export function isPipeGridSolved(grid: readonly (readonly PipeCell[])[]): boolean {
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isTarget && !cell.watered) return false;
    }
  }
  return true;
}
