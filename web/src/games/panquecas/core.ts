/**
 * "Panquecas" — pure rules (pancake sorting). Stack of different-sized pancakes; the only move is
 * to slide the spatula under one and flip it together with everything above. Get the biggest at
 * the bottom, in order. Index 0 is the top of the stack.
 */
export const sizeFor = (level: number): number => Math.min(9, 3 + level);

export const isSorted = (s: readonly number[]): boolean =>
  s.every((v, i) => i === 0 || v > s[i - 1]!);

/** Flips the top k+1 pancakes (the spatula goes under pancake k). */
export function flip(s: readonly number[], k: number): number[] {
  return [...s.slice(0, k + 1).reverse(), ...s.slice(k + 1)];
}

export function newGame(n: number, rng: () => number = Math.random): number[] {
  for (let tries = 0; tries < 100; tries++) {
    const a = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    if (!isSorted(a)) return a;
  }
  return Array.from({ length: n }, (_, i) => n - i);
}

/** The classic answer: bring the largest unsorted pancake up, then flip it down. At most 2n-3 flips. */
export function solve(start: readonly number[]): number[] {
  let s = start.slice();
  const out: number[] = [];
  for (let size = s.length; size > 1; size--) {
    const at = s.indexOf(size);
    if (at === size - 1) continue;
    if (at > 0) {
      out.push(at);
      s = flip(s, at);
    }
    out.push(size - 1);
    s = flip(s, size - 1);
  }
  return out;
}
