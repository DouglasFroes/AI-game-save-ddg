/**
 * "Moeda Falsa" — pure rules. One coin is heavier than the others. With a balance scale and a
 * limited number of weighings, find it. Each side of a weighing must hold the same number of coins.
 */
export const COUNTS = [3, 5, 9, 12, 20, 27] as const;

export const coinsFor = (level: number): number => COUNTS[Math.min(level, COUNTS.length) - 1]!;

/** Weighings needed in the worst case: the smallest w with 3^w >= n. */
export function weighsFor(n: number): number {
  let w = 0;
  for (let p = 1; p < n; p *= 3) w++;
  return w;
}

export type Result = 'left' | 'right' | 'equal';

export function weigh(odd: number, left: readonly number[], right: readonly number[]): Result {
  return left.includes(odd) ? 'left' : right.includes(odd) ? 'right' : 'equal';
}

export function validWeighing(left: readonly number[], right: readonly number[]): boolean {
  return left.length > 0 && left.length === right.length && left.every((c) => !right.includes(c));
}

/** The optimal strategy (thirds): returns the coin it finds and the weighings it used. */
export function solve(n: number, odd: number): { guess: number; weighings: number } {
  let cand = Array.from({ length: n }, (_, i) => i);
  let weighings = 0;
  while (cand.length > 1) {
    const s = Math.ceil(cand.length / 3);
    const a = cand.slice(0, s);
    const b = cand.slice(s, 2 * s);
    const c = cand.slice(2 * s);
    const r = weigh(odd, a, b);
    weighings++;
    cand = r === 'left' ? a : r === 'right' ? b : c;
  }
  return { guess: cand[0]!, weighings };
}
