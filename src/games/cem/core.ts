/** "100 Metros Rasos": tap the left and right pads one after the other to run. Wait for the gun! */
import type { Rnd } from '@/platform/rnd';

export const TRACK_M = 100;
const GAIN = 0.62;
const DECAY = 0.4;
const MAX_V = 12.5;
const STUMBLE = 0.88;

export type Side = 'L' | 'R';
export type SprintPhase = 'wait' | 'run' | 'done' | 'false';

export interface Rival {
  readonly name: string;
  /** Seconds it takes to run the 100 m. */
  readonly time: number;
}

const RIVALS = ['Bolt Jr.', 'Flash', 'Tornado'];

/** Where a rival is after `t` seconds (metres). */
export const rivalAt = (r: Rival, t: number): number => TRACK_M * Math.min(1, t / r.time) ** 1.15;

export class SprintSim {
  phase: SprintPhase = 'wait';
  /** Seconds since the gun. */
  time = 0;
  x = 0;
  v = 0;
  last: Side | null = null;
  taps = 0;
  stumbles = 0;
  /** Seconds of waiting before the gun fires. */
  private gun: number;
  private waited = 0;
  readonly rivals: Rival[];
  finish = 0;

  constructor(rnd: Rnd = Math.random) {
    this.gun = 1.4 + rnd() * 1.8;
    this.rivals = RIVALS.map((name, i) => ({ name, time: 11.6 + i * 0.9 + rnd() * 0.8 }));
  }

  /** Alternating sides push the runner; the same side twice makes him stumble. */
  tap(side: Side): void {
    if (this.phase === 'wait') {
      this.phase = 'false';
      return;
    }
    if (this.phase !== 'run') return;
    this.taps++;
    if (side === this.last) {
      this.v *= STUMBLE;
      this.stumbles++;
    } else this.v = Math.min(MAX_V, this.v + GAIN);
    this.last = side;
  }

  /** True the moment the gun goes off. */
  step(dt: number): 'gun' | 'finish' | null {
    if (this.phase === 'wait') {
      this.waited += dt;
      if (this.waited >= this.gun) {
        this.phase = 'run';
        return 'gun';
      }
      return null;
    }
    if (this.phase !== 'run') return null;
    this.time += dt;
    this.v = Math.max(0, this.v - DECAY * this.v * dt);
    this.x += this.v * dt;
    if (this.x >= TRACK_M) {
      this.finish = this.time;
      this.phase = 'done';
      return 'finish';
    }
    return null;
  }

  get place(): number {
    return 1 + this.rivals.filter((r) => r.time < this.finish).length;
  }

  get score(): number {
    if (this.phase !== 'done') return 0;
    const bonus = [0, 500, 300, 150][this.place] ?? 0;
    return Math.max(0, 2000 - Math.round(this.finish * 100)) + bonus;
  }
}
