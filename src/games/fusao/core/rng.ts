/** Seeded randomness: the same seed replays the same run. */

export type Rng = () => number;

/** mulberry32: small, fast and good enough for gameplay. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a text (seed typed by the player, or the daily date). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;

/** Picks one item by weight (weights ≤ 0 are skipped). */
export function weighted<T>(rng: Rng, items: readonly { w: number; v: T }[]): T | undefined {
  const total = items.reduce((s, i) => s + Math.max(0, i.w), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const i of items) {
    if (i.w <= 0) continue;
    r -= i.w;
    if (r <= 0) return i.v;
  }
  return items[items.length - 1]?.v;
}
