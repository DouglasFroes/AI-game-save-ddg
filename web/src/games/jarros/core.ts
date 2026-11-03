/**
 * "Jarros" — pure rules (water jugs). Jugs have no markings: you can fill one from the tap, empty
 * one, or pour one into another until the target is full or the source is empty. Get exactly the
 * target amount in any jug.
 */
export interface Puzzle {
  caps: number[];
  target: number;
  /** Fewest moves. */
  par: number;
}
export type Move =
  | { kind: 'fill'; i: number }
  | { kind: 'empty'; i: number }
  | { kind: 'pour'; i: number; j: number };

export function apply(caps: readonly number[], a: readonly number[], m: Move): number[] | null {
  const next = a.slice();
  if (m.kind === 'fill') {
    if (a[m.i] === caps[m.i]) return null;
    next[m.i] = caps[m.i]!;
  } else if (m.kind === 'empty') {
    if (a[m.i] === 0) return null;
    next[m.i] = 0;
  } else {
    const room = caps[m.j]! - a[m.j]!;
    const amount = Math.min(a[m.i]!, room);
    if (m.i === m.j || amount <= 0) return null;
    next[m.i] = a[m.i]! - amount;
    next[m.j] = a[m.j]! + amount;
  }
  return next;
}

export function moves(n: number): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ kind: 'fill', i }, { kind: 'empty', i });
    for (let j = 0; j < n; j++) if (i !== j) out.push({ kind: 'pour', i, j });
  }
  return out;
}

/** Fewest moves to reach each amount in some jug (breadth-first from all-empty). */
export function distances(caps: readonly number[]): Map<number, number> {
  const start = caps.map(() => 0);
  const seen = new Set([start.join(',')]);
  const best = new Map<number, number>();
  let frontier = [start];
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: number[][] = [];
    for (const s of frontier) {
      for (const v of s) if (v > 0 && !best.has(v)) best.set(v, depth);
      for (const m of moves(caps.length)) {
        const t = apply(caps, s, m);
        if (t && !seen.has(t.join(','))) {
          seen.add(t.join(','));
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return best;
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const jugs = level <= 2 ? 2 : 3;
  const need = Math.min(8, 3 + level);
  for (let attempt = 0; attempt < 300; attempt++) {
    const caps = Array.from({ length: jugs }, () => 3 + Math.floor(rng() * 10)).sort(
      (a, b) => a - b,
    );
    if (new Set(caps).size < jugs) continue;
    const best = distances(caps);
    const options = [...best.entries()].filter(
      ([v, d]) => !caps.includes(v) && d >= Math.min(need, 5),
    );
    if (options.length === 0) continue;
    const [target, par] = options[Math.floor(rng() * options.length)]!;
    return { caps, target, par };
  }
  return { caps: [3, 5], target: 4, par: 6 };
}
