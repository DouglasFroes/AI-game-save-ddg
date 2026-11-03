/**
 * "Torre de Hanói" — pure rules. Move the whole tower to the last peg, one disc at a time,
 * never putting a bigger disc on a smaller one.
 */
export type Pegs = number[][];

export function discsFor(level: number): number {
  return Math.min(8, 2 + level);
}

/** The fewest moves possible for `n` discs. */
export function par(n: number): number {
  return 2 ** n - 1;
}

export function newGame(n: number): Pegs {
  return [Array.from({ length: n }, (_, i) => n - i), [], []];
}

/** Moves the top disc of peg `from` to peg `to`. Null if that is not allowed. */
export function move(p: Pegs, from: number, to: number): Pegs | null {
  const disc = p[from]?.[p[from]!.length - 1];
  if (disc === undefined || from === to) return null;
  const top = p[to]?.[p[to]!.length - 1];
  if (!p[to] || (top !== undefined && top < disc)) return null;
  const next = p.map((peg) => peg.slice());
  next[from]!.pop();
  next[to]!.push(disc);
  return next;
}

export function isSolved(p: Pegs, n: number): boolean {
  return p[2]!.length === n;
}

/** The optimal sequence of [from, to] moves. */
export function solve(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const go = (k: number, a: number, b: number, c: number) => {
    if (k === 0) return;
    go(k - 1, a, c, b);
    out.push([a, c]);
    go(k - 1, b, a, c);
  };
  go(n, 0, 1, 2);
  return out;
}
