/**
 * "Encaixe" — pure rules. Fill the whole board with the given pieces (polyominoes). Pieces can be
 * rotated. Boards are made by cutting a rectangle into pieces, so a solution always exists.
 */
export type Shape = Array<[number, number]>;

export interface Puzzle {
  w: number;
  h: number;
  /** The pieces where they sit in the solution (absolute cells). */
  solution: Shape[];
  /** The same pieces, normalised to the top-left and rotated at random, for the tray. */
  tray: Shape[];
}

export const sizeFor = (level: number): { w: number; h: number } => {
  const s = Math.min(6, 3 + Math.ceil(level / 2));
  return { w: s, h: Math.min(6, s + (level % 2 === 0 ? 1 : 0)) };
};

export function normalize(s: Shape): Shape {
  const r0 = Math.min(...s.map((c) => c[0]));
  const c0 = Math.min(...s.map((c) => c[1]));
  return s
    .map(([r, c]): [number, number] => [r - r0, c - c0])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Quarter turn clockwise. */
export const rotate = (s: Shape): Shape => normalize(s.map(([r, c]): [number, number] => [c, -r]));

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const { w, h } = sizeFor(level);
  const owner = Array.from({ length: w * h }, () => -1);
  const pieces: number[][] = [];
  const near = (i: number) => {
    const r = Math.floor(i / w);
    const c = i % w;
    const out: number[] = [];
    if (r > 0) out.push(i - w);
    if (r < h - 1) out.push(i + w);
    if (c > 0) out.push(i - 1);
    if (c < w - 1) out.push(i + 1);
    return out;
  };
  for (let start = 0; start < w * h; start++) {
    if (owner[start]! >= 0) continue;
    const want = 3 + Math.floor(rng() * 3);
    const cells = [start];
    owner[start] = pieces.length;
    while (cells.length < want) {
      const open = cells.flatMap(near).filter((i) => owner[i]! < 0);
      if (open.length === 0) break;
      const next = open[Math.floor(rng() * open.length)]!;
      owner[next] = pieces.length;
      cells.push(next);
    }
    pieces.push(cells);
  }
  // A leftover piece smaller than 3 joins a neighbouring piece.
  for (let k = pieces.length - 1; k >= 0; k--) {
    const cells = pieces[k]!;
    if (cells.length >= 3) continue;
    const nb = cells
      .flatMap(near)
      .map((i) => owner[i]!)
      .find((o) => o !== k && o >= 0);
    if (nb === undefined) continue;
    for (const i of cells) owner[i] = nb;
    pieces[nb]!.push(...cells);
    pieces.splice(k, 1);
    for (let i = 0; i < owner.length; i++) if (owner[i]! > k) owner[i]!--;
  }
  const solution: Shape[] = pieces.map((cells) =>
    cells.map((i): [number, number] => [Math.floor(i / w), i % w]),
  );
  const tray = solution.map((s) => {
    let t = normalize(s);
    for (let k = Math.floor(rng() * 4); k > 0; k--) t = rotate(t);
    return t;
  });
  // Shuffle the tray order.
  const order = tray.map((_, i) => i).sort(() => rng() - 0.5);
  return { w, h, solution: order.map((i) => solution[i]!), tray: order.map((i) => tray[i]!) };
}

/** Board occupancy: the index of the piece on each cell, or -1. */
export type Owner = number[];
export const emptyBoard = (p: Puzzle): Owner => Array.from({ length: p.w * p.h }, () => -1);

/** Puts piece `i` (in the given orientation) with its top-left corner at (r, c). Null if it does not fit. */
export function place(
  p: Puzzle,
  owner: Owner,
  i: number,
  shape: Shape,
  r: number,
  c: number,
): Owner | null {
  if (owner.includes(i)) return null;
  const next = owner.slice();
  for (const [dr, dc] of shape) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr >= p.h || cc < 0 || cc >= p.w || next[rr * p.w + cc]! >= 0) return null;
    next[rr * p.w + cc] = i;
  }
  return next;
}

export const remove = (owner: Owner, i: number): Owner => owner.map((o) => (o === i ? -1 : o));
export const isSolved = (owner: Owner): boolean => owner.every((o) => o >= 0);
