/**
 * "Pontes" (Hashi) — pure rules. Join the islands with bridges (one or two between a pair, only
 * straight, never crossing) so every island has exactly as many bridges as its number and all
 * islands end up connected. Puzzles are made by building a random bridge network first.
 */
export interface Island {
  r: number;
  c: number;
  n: number;
}
export interface Puzzle {
  size: number;
  islands: Island[];
  /** Pairs of islands in line of sight, which may be joined. */
  links: Array<[number, number]>;
  /** One valid answer: bridges (0–2) for each link. */
  solution: number[];
}

function lineLinks(size: number, islands: Island[]): Array<[number, number]> {
  const links: Array<[number, number]> = [];
  const at = new Map(islands.map((is, i) => [is.r * size + is.c, i]));
  islands.forEach((a, i) => {
    // Next island to the right and below, if any, in line of sight.
    for (let c = a.c + 1; c < size; c++) {
      const j = at.get(a.r * size + c);
      if (j !== undefined) {
        links.push([i, j]);
        break;
      }
    }
    for (let r = a.r + 1; r < size; r++) {
      const j = at.get(r * size + a.c);
      if (j !== undefined) {
        links.push([i, j]);
        break;
      }
    }
  });
  return links;
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const size = level <= 3 ? 6 : 7;
  const target = Math.min(11, 4 + level);
  for (let attempt = 0; attempt < 100; attempt++) {
    const islands: Island[] = [{ r: Math.floor(rng() * size), c: Math.floor(rng() * size), n: 0 }];
    const used = new Set<number>([islands[0]!.r * size + islands[0]!.c]);
    const bridges: Array<{ a: number; b: number; count: number }> = [];
    for (let tries = 0; islands.length < target && tries < 400; tries++) {
      const from = islands[Math.floor(rng() * islands.length)]!;
      const d = Math.floor(rng() * 4);
      const dr = [-1, 1, 0, 0][d]!;
      const dc = [0, 0, -1, 1][d]!;
      const dist = 2 + Math.floor(rng() * 3);
      const tr = from.r + dr * dist;
      const tc = from.c + dc * dist;
      if (tr < 0 || tr >= size || tc < 0 || tc >= size) continue;
      let clear = true;
      for (let k = 1; k <= dist; k++) {
        if (used.has((from.r + dr * k) * size + from.c + dc * k)) clear = false;
      }
      if (!clear) continue;
      for (let k = 1; k <= dist; k++) used.add((from.r + dr * k) * size + from.c + dc * k);
      islands.push({ r: tr, c: tc, n: 0 });
      bridges.push({
        a: islands.indexOf(from),
        b: islands.length - 1,
        count: 1 + Math.floor(rng() * 2),
      });
    }
    if (islands.length < Math.min(target, 5)) continue;
    // Order islands row by row so links point right/down, then count the bridges on each.
    const order = islands
      .map((_, i) => i)
      .sort((x, y) => islands[x]!.r - islands[y]!.r || islands[x]!.c - islands[y]!.c);
    const rank = new Map(order.map((old, k) => [old, k]));
    const sorted = order.map((old) => ({ ...islands[old]! }));
    for (const b of bridges) {
      sorted[rank.get(b.a)!]!.n += b.count;
      sorted[rank.get(b.b)!]!.n += b.count;
    }
    const links = lineLinks(size, sorted);
    const solution = links.map(([i, j]) => {
      const hit = bridges.find(
        (b) =>
          (rank.get(b.a) === i && rank.get(b.b) === j) ||
          (rank.get(b.a) === j && rank.get(b.b) === i),
      );
      return hit ? hit.count : 0;
    });
    return { size, islands: sorted, links, solution };
  }
  const islands = [
    { r: 0, c: 0, n: 1 },
    { r: 0, c: 3, n: 1 },
  ];
  return { size, islands, links: [[0, 1]], solution: [1] };
}

function crosses(p: Puzzle, x: number, y: number): boolean {
  const [a, b] = p.links[x]!;
  const [c, d] = p.links[y]!;
  const A = [p.islands[a]!, p.islands[b]!];
  const B = [p.islands[c]!, p.islands[d]!];
  const horizontalA = A[0]!.r === A[1]!.r;
  const horizontalB = B[0]!.r === B[1]!.r;
  if (horizontalA === horizontalB) return false;
  const [h, v] = horizontalA ? [A, B] : [B, A];
  const row = h[0]!.r;
  const col = v[0]!.c;
  const c1 = Math.min(h[0]!.c, h[1]!.c);
  const c2 = Math.max(h[0]!.c, h[1]!.c);
  const r1 = Math.min(v[0]!.r, v[1]!.r);
  const r2 = Math.max(v[0]!.r, v[1]!.r);
  return col > c1 && col < c2 && row > r1 && row < r2;
}

/** Cycles the bridges of link `k` (0 → 1 → 2 → 0). Null if the new bridge would cross another. */
export function toggle(p: Puzzle, counts: number[], k: number): number[] | null {
  const next = (counts[k]! + 1) % 3;
  if (next > 0) {
    for (let o = 0; o < p.links.length; o++) {
      if (o !== k && counts[o]! > 0 && crosses(p, k, o)) return null;
    }
  }
  const out = counts.slice();
  out[k] = next;
  return out;
}

export function degree(p: Puzzle, counts: number[], island: number): number {
  let n = 0;
  p.links.forEach(([a, b], k) => {
    if (a === island || b === island) n += counts[k]!;
  });
  return n;
}

export function isSolved(p: Puzzle, counts: number[]): boolean {
  if (!p.islands.every((is, i) => degree(p, counts, i) === is.n)) return false;
  const seen = new Set([0]);
  let grew = true;
  while (grew) {
    grew = false;
    p.links.forEach(([a, b], k) => {
      if (counts[k]! > 0 && seen.has(a) !== seen.has(b)) {
        seen.add(a);
        seen.add(b);
        grew = true;
      }
    });
  }
  return seen.size === p.islands.length;
}
