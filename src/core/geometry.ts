/** Pure 2D vector helpers. No Phaser imports so they can be unit-tested in Node. */

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export const distance = (a: Vec, b: Vec): number => Math.hypot(b.x - a.x, b.y - a.y);

export const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const rotate = (v: Vec, angle: number): Vec => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

export function polylineLength(points: readonly Vec[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!);
  return total;
}

/** Evenly spaced samples along the segment a→b (both ends included). */
export function sampleSegment(a: Vec, b: Vec, step: number): Vec[] {
  const n = Math.max(1, Math.ceil(distance(a, b) / step));
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) out.push(lerp(a, b, i / n));
  return out;
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));
