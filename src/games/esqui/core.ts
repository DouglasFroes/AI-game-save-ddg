/**
 * "Slalom" — pure rules of a downhill ski run seen from above (pixels; y grows downhill). The
 * skier points where your finger is: straight down the slope he speeds up, carving across it he
 * slows. Pass every gate between its two poles (a missed gate costs 3 seconds), mind the trees
 * (a crash stops you) and the edges of the piste.
 */
import type { Rnd } from '@/platform/rnd';

export const PISTE_L = 40;
export const PISTE_R = 680;
export const GATES = 28;
export const GATE_W = 150;
export const PENALTY = 3;
const GRAVITY = 520;
const DRAG = 0.00055;
const CARVE = 0.75;
const TURN_RATE = 3.4;
const MAX_HEADING = 1.4;
const TREE_R = 26;
const SKIER_R = 14;
const CRASH_TIME = 1.1;

export interface Gate {
  readonly y: number;
  /** Centre between the poles. */
  readonly x: number;
  readonly color: 'red' | 'blue';
  state: 'ahead' | 'passed' | 'missed';
}

export interface Tree {
  readonly x: number;
  readonly y: number;
}

export interface Course {
  readonly gates: Gate[];
  readonly trees: readonly Tree[];
  readonly finishY: number;
}

/** A course: gates swing from side to side, getting tighter; trees line the piste and creep in. */
export function makeCourse(rnd: Rnd): Course {
  const gates: Gate[] = [];
  let y = 700;
  let side = rnd() < 0.5 ? -1 : 1;
  for (let i = 0; i < GATES; i++) {
    const swing = 110 + rnd() * 120 + Math.min(60, i * 3);
    gates.push({ y, x: 360 + side * swing, color: i % 2 ? 'blue' : 'red', state: 'ahead' });
    y += 430 - Math.min(110, i * 5) + rnd() * 60;
    side = -side;
  }
  const finishY = y + 200;
  const trees: Tree[] = [];
  for (let ty = 300; ty < finishY; ty += 90) {
    trees.push({ x: 18 + rnd() * 20, y: ty + rnd() * 40 });
    trees.push({ x: 702 - rnd() * 20, y: ty + rnd() * 40 });
  }
  // A few trees inside the piste, never on a gate's line.
  for (let i = 0; i < 14; i++) {
    const ty = 1200 + rnd() * (finishY - 1600);
    const near = gates.some((g) => Math.abs(g.y - ty) < 170);
    if (near) continue;
    trees.push({ x: 120 + rnd() * 480, y: ty });
  }
  return { gates, trees, finishY };
}

export type SkiEvent =
  | { type: 'gate'; color: Gate['color']; index: number }
  | { type: 'missed'; index: number }
  | { type: 'pole' }
  | { type: 'crash' }
  | { type: 'edge' }
  | { type: 'finish'; time: number; missed: number };

export class SkiSim {
  x = 360;
  y = 380;
  heading = 0;
  v = 120;
  time = 0;
  missed = 0;
  passed = 0;
  /** Seconds left lying in the snow. */
  down = 0;
  done = false;
  readonly course: Course;
  private target = 0;

  constructor(rnd: Rnd = Math.random) {
    this.course = makeCourse(rnd);
  }

  /** Steer towards a heading (radians, 0 = straight downhill; negative = to the left). */
  steer(heading: number): void {
    this.target = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, heading));
  }

  /** The time with penalties. */
  get total(): number {
    return this.time + this.missed * PENALTY;
  }

  get score(): number {
    return Math.max(0, Math.round((120 - this.total) * 100)) + this.passed * 20;
  }

  /** Next gate still ahead. */
  get nextGate(): Gate | undefined {
    return this.course.gates.find((g) => g.state === 'ahead');
  }

  step(dt: number): SkiEvent[] {
    const events: SkiEvent[] = [];
    if (this.done) return events;
    this.time += dt;
    if (this.down > 0) {
      this.down = Math.max(0, this.down - dt);
      return events;
    }
    // Turn towards the finger, at a limited rate.
    const d = this.target - this.heading;
    this.heading += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, d));
    // Gravity pulls along the fall line; carving across the slope scrubs speed.
    const along = GRAVITY * Math.cos(this.heading);
    const scrub = CARVE * Math.abs(Math.sin(this.heading)) * this.v + Math.abs(d) * 40;
    this.v = Math.max(60, this.v + (along - scrub - DRAG * this.v * this.v) * dt);
    const prevY = this.y;
    this.x += Math.sin(this.heading) * this.v * dt;
    this.y += Math.cos(this.heading) * this.v * dt;
    // Piste edges.
    if (this.x < PISTE_L || this.x > PISTE_R) {
      this.x = Math.max(PISTE_L, Math.min(PISTE_R, this.x));
      this.v *= 0.6;
      this.heading = -this.heading * 0.3;
      events.push({ type: 'edge' });
    }
    // Gates: judged when the skier crosses their line.
    for (const [i, g] of this.course.gates.entries()) {
      if (g.state !== 'ahead' || !(prevY < g.y && this.y >= g.y)) continue;
      const off = Math.abs(this.x - g.x);
      if (off <= GATE_W / 2 - 4) {
        g.state = 'passed';
        this.passed++;
        events.push({ type: 'gate', color: g.color, index: i });
      } else {
        g.state = 'missed';
        this.missed++;
        events.push({ type: 'missed', index: i });
        if (off < GATE_W / 2 + 14) {
          this.v *= 0.8;
          events.push({ type: 'pole' });
        }
      }
    }
    // Trees.
    for (const t of this.course.trees) {
      if (Math.abs(t.y - this.y) > 40) continue;
      if (Math.hypot(t.x - this.x, t.y - this.y) < TREE_R + SKIER_R) {
        this.down = CRASH_TIME;
        this.v = 60;
        this.heading = 0;
        this.target = 0;
        this.y = t.y + TREE_R + SKIER_R + 2;
        events.push({ type: 'crash' });
        break;
      }
    }
    if (this.y >= this.course.finishY) {
      // Any gate not reached counts as missed.
      for (const g of this.course.gates)
        if (g.state === 'ahead') {
          g.state = 'missed';
          this.missed++;
        }
      this.done = true;
      events.push({ type: 'finish', time: this.total, missed: this.missed });
    }
    return events;
  }
}
