/**
 * "Ciclismo" — pure rules of a hilly road race against three rivals (metres and seconds). Hold to
 * pedal: you go faster but burn energy, more on climbs. Let go to coast and recover (descents
 * are free speed). Riding right behind someone (in the draft) costs less. When the energy runs
 * out you "bonk" and crawl. The last 250 m are the sprint: holding then gives everything you have.
 */
import type { Rnd } from '@/platform/rnd';

export const RACE_M = 1000;
export const SPRINT_M = 250;
export const RIDER_MASS = 75;
const G = 9.8;
const DRAG = 0.0045;
const ROLL = 0.06;
const PEDAL_W = 400;
const SPRINT_W = 720;
const BONK_W = 110;
const DRAFT_MIN = 0.4;
const DRAFT_MAX = 4;
const DRAFT_CUT = 0.32;

/** Road height (m) at distance x for a given stage seed: rolling hills and one big climb. */
export function heightAt(x: number, seed = 1): number {
  const a = 0.6 + (seed % 5) * 0.08;
  const climb = 20 * Math.exp(-(((x - 540 - (seed % 3) * 40) / 170) ** 2));
  return 5 * Math.sin(x / 85 + seed) * a + 3.5 * Math.sin(x / 37 + seed * 2) + climb;
}

/** Gradient (rise over run) at x. */
export const slopeAt = (x: number, seed = 1): number =>
  (heightAt(x + 1, seed) - heightAt(x - 1, seed)) / 2;

export interface Rider {
  readonly name: string;
  readonly color: number;
  x: number;
  v: number;
  energy: number;
  /** Pedalling right now (for drawing and drain). */
  pedalling: boolean;
  drafting: boolean;
  bonked: boolean;
  finish: number | null;
  /** Rivals only: how hard and how smart they ride. */
  readonly power?: number;
  readonly smart?: number;
}

export type BikeEvent =
  | { type: 'draft'; on: boolean }
  | { type: 'bonk' }
  | { type: 'sprint' }
  | { type: 'finish'; name: string; place: number; time: number }
  | { type: 'over'; place: number; time: number };

export const RIVALS = [
  { name: 'Marcos', color: 0xef4444, power: 360, smart: 0.5 },
  { name: 'Lia', color: 0x22c55e, power: 385, smart: 0.7 },
  { name: 'Beto', color: 0xf59e0b, power: 405, smart: 0.85 },
] as const;

export class BikeSim {
  time = 0;
  readonly riders: Rider[];
  private places = 0;
  over = false;
  private sprintSaid = false;

  constructor(
    readonly seed = 1,
    private readonly rnd: Rnd = Math.random,
  ) {
    this.riders = [
      {
        name: 'Você',
        color: 0x3b82f6,
        x: 0,
        v: 5,
        energy: 100,
        pedalling: false,
        drafting: false,
        bonked: false,
        finish: null,
      },
      ...RIVALS.map((r, i) => ({
        ...r,
        x: -2 - i * 2.2,
        v: 5,
        energy: 100,
        pedalling: false,
        drafting: false,
        bonked: false,
        finish: null,
      })),
    ];
  }

  get me(): Rider {
    return this.riders[0]!;
  }

  /** Your place right now (1 = leading). */
  get place(): number {
    return 1 + this.riders.slice(1).filter((r) => r.finish !== null || r.x > this.me.x).length;
  }

  get inSprint(): boolean {
    return this.me.x >= RACE_M - SPRINT_M;
  }

  /** `holding` = your finger is down. */
  step(dt: number, holding: boolean): BikeEvent[] {
    const events: BikeEvent[] = [];
    if (this.over) return events;
    this.time += dt;
    const wasDraft = this.me.drafting;
    const wasBonk = this.me.bonked;
    for (const [i, r] of this.riders.entries()) {
      if (r.finish !== null) {
        r.v *= Math.exp(-1.5 * dt);
        r.x += r.v * dt;
        continue;
      }
      const want = i === 0 ? holding : this.rivalWants(r);
      this.ride(r, want, dt);
      if (r.x >= RACE_M) {
        r.finish = this.time;
        this.places++;
        events.push({ type: 'finish', name: r.name, place: this.places, time: this.time });
        if (i === 0) {
          this.over = true;
          events.push({ type: 'over', place: this.places, time: this.time });
        }
      }
    }
    if (this.me.drafting !== wasDraft) events.push({ type: 'draft', on: this.me.drafting });
    if (this.me.bonked && !wasBonk) events.push({ type: 'bonk' });
    if (this.inSprint && !this.sprintSaid) {
      this.sprintSaid = true;
      events.push({ type: 'sprint' });
    }
    return events;
  }

  /** A rival's choice: pedal on climbs and flats, coast on steep descents, attack near the end. */
  private rivalWants(r: Rider): boolean {
    const slope = slopeAt(r.x, this.seed);
    const left = RACE_M - r.x;
    if (r.bonked) return false;
    if (left < SPRINT_M + 60 * (r.smart ?? 0.5)) return true;
    if (slope < -0.04 && this.rnd() < 0.6 + (r.smart ?? 0.5) * 0.3) return false;
    // Smart riders save energy in the draft and when low.
    if (r.energy < 25 + 25 * (r.smart ?? 0.5) && slope <= 0.02) return false;
    return this.rnd() < 0.75 + (r.smart ?? 0.5) * 0.2;
  }

  private ride(r: Rider, want: boolean, dt: number): void {
    const sprint = r.x >= RACE_M - SPRINT_M;
    if (r.energy <= 0) r.bonked = true;
    if (r.bonked && r.energy > 18) r.bonked = false;
    const base = r.power ?? PEDAL_W;
    const watts = !want
      ? 0
      : r.bonked
        ? BONK_W
        : sprint
          ? Math.max(base * 1.8, base === PEDAL_W ? SPRINT_W : base * 1.8)
          : base;
    // Draft: just behind another rider.
    r.drafting = this.riders.some(
      (o) => o !== r && o.finish === null && o.x - r.x > DRAFT_MIN && o.x - r.x < DRAFT_MAX,
    );
    const slope = slopeAt(r.x, this.seed);
    const drive = watts / (RIDER_MASS * Math.max(r.v, 2.5));
    const air = DRAG * r.v * r.v * (r.drafting ? 1 - DRAFT_CUT : 1);
    const a = drive - G * slope - air - ROLL;
    r.v = Math.max(1.2, r.v + a * dt);
    r.x += r.v * dt;
    r.pedalling = want && watts > 0;
    // Energy: pedalling burns (more uphill, less in the draft), coasting recovers.
    if (r.pedalling) {
      const burn = (watts / PEDAL_W) * (1 + Math.max(0, slope) * 6) * (r.drafting ? 0.7 : 1) * 1.5;
      r.energy = Math.max(0, r.energy - burn * dt);
    } else r.energy = Math.min(100, r.energy + (r.drafting ? 10 : 7) * dt);
  }

  /** Points: by place, plus a bonus for a quick time. */
  score(place: number, time: number): number {
    const byPlace = [0, 3000, 1800, 1000, 400][place] ?? 0;
    return byPlace + Math.max(0, Math.round((150 - time) * 20));
  }
}
