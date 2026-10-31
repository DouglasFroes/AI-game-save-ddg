/**
 * "Biscoito Dalgona" — pure rules. Trace the shape stamped in the honeycomb candy with a needle:
 * straying off the line or scratching too fast cracks the biscuit (three cracks and it breaks).
 * Cover the whole outline before the time runs out; each new shape is trickier and faster.
 */
export const CX = 360;
export const CY = 700;
export const MAX_CRACKS = 3;
/** A point of the outline counts as traced when the needle passes this close. */
export const COVER_R = 18;

export type ShapeName = 'círculo' | 'triângulo' | 'estrela' | 'coração' | 'guarda-chuva';
export const SHAPES: readonly ShapeName[] = [
  'círculo',
  'triângulo',
  'estrela',
  'coração',
  'guarda-chuva',
];

type P = { x: number; y: number };

/** Resamples a closed polyline into points about `step` px apart. */
export function resample(poly: readonly P[], step = 8, closed = true): P[] {
  const out: P[] = [];
  const n = poly.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  return out;
}

export function shapePoints(name: ShapeName, r = 190): P[] {
  const poly: P[] = [];
  switch (name) {
    case 'círculo':
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        poly.push({ x: CX + Math.cos(a) * r * 0.85, y: CY + Math.sin(a) * r * 0.85 });
      }
      break;
    case 'triângulo':
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
        poly.push({ x: CX + Math.cos(a) * r, y: CY + 20 + Math.sin(a) * r });
      }
      break;
    case 'estrela':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 ? r * 0.45 : r;
        poly.push({ x: CX + Math.cos(a) * rr, y: CY + Math.sin(a) * rr });
      }
      break;
    case 'coração':
      for (let i = 0; i < 80; i++) {
        const t = (i / 80) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        poly.push({ x: CX + x * r * 0.065, y: CY + 10 + y * r * 0.065 });
      }
      break;
    case 'guarda-chuva': {
      // Canopy (half circle with scallops), then the handle down the middle and its hook.
      for (let i = 0; i <= 32; i++) {
        const a = Math.PI + (i / 32) * Math.PI;
        poly.push({ x: CX + Math.cos(a) * r, y: CY - 10 + Math.sin(a) * r * 0.8 });
      }
      for (let s = 0; s < 4; s++) {
        const x0 = CX + r - s * (r / 2);
        for (let i = 1; i <= 6; i++) {
          const a = (i / 6) * Math.PI;
          poly.push({ x: x0 - r / 4 + Math.cos(a) * (r / 4), y: CY - 10 - Math.sin(a) * 18 });
        }
        if (s === 1) {
          // The handle hangs from the middle: down the shaft, round the hook, and back up.
          const bottom = CY + r * 0.85;
          const hook: P[] = [];
          for (let i = 0; i <= 8; i++) {
            const a = (i / 8) * Math.PI;
            hook.push({ x: CX - 28 + Math.cos(a) * 28, y: bottom + Math.sin(a) * 28 });
          }
          poly.push({ x: CX, y: CY - 10 }, { x: CX, y: bottom }, ...hook);
          poly.push(...hook.reverse(), { x: CX, y: bottom }, { x: CX, y: CY - 10 });
        }
      }
      break;
    }
  }
  return resample(poly);
}

export interface RoundSpec {
  readonly shape: ShapeName;
  readonly time: number;
  /** How far off the line the needle may go before it cracks. */
  readonly tolerance: number;
  /** Fastest allowed scratch (px/s). */
  readonly maxSpeed: number;
}

export function roundSpec(level: number): RoundSpec {
  return {
    shape: SHAPES[(level - 1) % SHAPES.length]!,
    time: Math.max(14, 34 - level * 2),
    tolerance: Math.max(14, 30 - level * 1.5),
    maxSpeed: Math.max(650, 1200 - level * 50),
  };
}

export type TraceEvent = { type: 'crack'; cracks: number; why: 'off' | 'fast' } | { type: 'done' };

export class DalgonaRound {
  readonly points: P[];
  readonly covered: boolean[];
  cracks = 0;
  timeLeft: number;
  private last: { x: number; y: number; t: number } | null = null;
  private offSince = -1;
  private crackCooldown = 0;
  private devSum = 0;
  private devN = 0;

  constructor(readonly spec: RoundSpec) {
    this.points = shapePoints(spec.shape);
    this.covered = this.points.map(() => false);
    this.timeLeft = spec.time;
  }

  get progress(): number {
    return this.covered.filter(Boolean).length / this.covered.length;
  }

  get broken(): boolean {
    return this.cracks >= MAX_CRACKS;
  }

  get done(): boolean {
    return this.progress >= 0.96;
  }

  /** 0..1: how close to the line the needle stayed. */
  get accuracy(): number {
    return this.devN ? Math.max(0, 1 - this.devSum / this.devN / this.spec.tolerance) : 0;
  }

  tick(dt: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.crackCooldown = Math.max(0, this.crackCooldown - dt);
  }

  lift(): void {
    this.last = null;
    this.offSince = -1;
  }

  /** The needle moved to (x, y) at time t (seconds). */
  trace(x: number, y: number, t: number): TraceEvent[] {
    const ev: TraceEvent[] = [];
    if (this.broken || this.done) return ev;
    const prev = this.last;
    this.last = { x, y, t };
    if (!prev) return ev;
    const dist = Math.hypot(x - prev.x, y - prev.y);
    const dt = Math.max(1e-3, t - prev.t);
    if (dist / dt > this.spec.maxSpeed && dist > 25) this.crack('fast', ev);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let s = 1; s <= steps; s++) {
      const px = prev.x + ((x - prev.x) * s) / steps;
      const py = prev.y + ((y - prev.y) * s) / steps;
      let best = Infinity;
      this.points.forEach((p, i) => {
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < best) best = d;
        if (d <= COVER_R) this.covered[i] = true;
      });
      this.devSum += Math.min(best, this.spec.tolerance);
      this.devN++;
      if (best > this.spec.tolerance) {
        if (this.offSince < 0) this.offSince = t;
        // A brief slip is forgiven; staying off the line cracks it.
        if (t - this.offSince > 0.08) this.crack('off', ev);
      } else this.offSince = -1;
      if (this.broken) return ev;
    }
    if (this.done) ev.push({ type: 'done' });
    return ev;
  }

  private crack(why: 'off' | 'fast', ev: TraceEvent[]): void {
    if (this.crackCooldown > 0) return;
    this.cracks++;
    this.crackCooldown = 0.6;
    ev.push({ type: 'crack', cracks: this.cracks, why });
  }

  /** Points for a finished shape. */
  scoreFor(level: number): number {
    return Math.round(
      (400 + 1200 * this.accuracy + this.timeLeft * 25 + (this.cracks ? 0 : 300)) *
        (1 + level * 0.2),
    );
  }
}
