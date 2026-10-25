/**
 * Shared, pure model of the "attempt" Olympic events (long jump, javelin, weightlifting, high
 * jump, free throws…): each attempt is a short chain of stages — a meter to stop, a bar to
 * mash — whose values the event's rules turn into a result. The scene (AttemptScene) only plays
 * the stages and shows the result.
 */
import type { Rnd } from '@/platform/rnd';

export type Stage =
  /** A marker sweeps back and forth; the tap stops it. `zone` is the sweet spot shown on the bar. */
  | { kind: 'meter'; label: string; hint: string; speed: number; zone: readonly [number, number] }
  /** The marker crosses the bar once (and ends at 1 if the player waits too long). */
  | { kind: 'sweep'; label: string; hint: string; seconds: number; zone: readonly [number, number] }
  /** Tap as fast as you can for `seconds`; the value is how full the bar got. */
  | { kind: 'mash'; label: string; hint: string; seconds: number };

export interface AttemptResult {
  /** The measured outcome (metres, kilos, points…), 0 for a miss. */
  readonly value: number;
  /** Points added to the run. */
  readonly points: number;
  readonly ok: boolean;
  /** Short text shown after the attempt ("8,12 m", "Falta!"). */
  readonly text: string;
  /** How far the flight animation goes, 0 (nothing) to 1 (best possible). */
  readonly progress: number;
}

export interface AttemptStart<C> {
  readonly stages: readonly Stage[];
  /** Line shown above the stages (wind, bar height, distance…). */
  readonly info: string;
  readonly ctx: C;
}

export interface AttemptSummary {
  readonly score: number;
  readonly title: string;
  readonly lines: string[];
  readonly details: Record<string, number>;
}

export interface AttemptRules<C> {
  readonly attempts: number;
  begin(attempt: number, history: readonly AttemptResult[], rnd: Rnd): AttemptStart<C>;
  /** `values` has one number (0–1) per stage, in order. */
  resolve(values: readonly number[], ctx: C, attempt: number): AttemptResult;
  /** False ends the run early (a failed lift, three misses at the same height…). */
  goesOn(history: readonly AttemptResult[]): boolean;
  summary(history: readonly AttemptResult[]): AttemptSummary;
}

/** Marker position (0–1) of a sweeping meter after `t` seconds at `speed` sweeps per second. */
export function pingPong(t: number, speed: number): number {
  const p = (t * speed) % 2;
  return p < 1 ? p : 2 - p;
}

/** 1 in the middle of [lo, hi], falling to 0 at `reach` away from its edges. */
export function zoneQuality(v: number, zone: readonly [number, number], reach = 0.3): number {
  const [lo, hi] = zone;
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? lo - v : v - hi;
  return Math.max(0, 1 - d / reach);
}

/** A number as metres with a decimal comma: 8.1 → "8,10 m". */
export const metres = (v: number, digits = 2): string => `${v.toFixed(digits).replace('.', ',')} m`;
