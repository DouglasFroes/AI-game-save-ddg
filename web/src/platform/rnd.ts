/** Random source used by the pure cores (tests inject a seeded one). */
export type Rnd = () => number;

/** Integer in [lo, hi] (inclusive). */
export const randInt = (rnd: Rnd, lo: number, hi: number): number =>
  lo + Math.floor(rnd() * (hi - lo + 1));

export const pick = <T>(rnd: Rnd, items: readonly T[]): T =>
  items[Math.floor(rnd() * items.length)]!;

/** In-place Fisher–Yates. */
export function shuffle<T>(rnd: Rnd, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Tiny deterministic generator for tests. */
export function seeded(seed: number): Rnd {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
