import type { Rnd } from '@/platform/rnd';

export const FIELD_W = 720;
export const PLAYER_X = 150;
export const PLAYER_R = 26;
const FLIP_SECONDS = 0.2;

export interface Spike {
  /** Left edge on screen. */
  x: number;
  w: number;
  /** 0 = on the floor, 1 = on the ceiling. */
  lane: 0 | 1;
}

/** "Inverte": the hero runs on the floor or the ceiling; tap to flip gravity and dodge spikes. */
export class FlipSim {
  /** 0 = on the floor … 1 = on the ceiling. */
  p = 0;
  target: 0 | 1 = 0;
  spikes: Spike[] = [];
  distance = 0;
  time = 0;
  dead = false;
  private lastEnd = 700;
  private lastLane: 0 | 1 = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.fill();
  }

  get speed(): number {
    return Math.min(640, 340 + this.time * 8);
  }

  get score(): number {
    return Math.floor(this.distance / 40);
  }

  tap(): void {
    if (!this.dead) this.target = this.target === 0 ? 1 : 0;
  }

  /** Whether a spike on `lane` can touch the hero right now. */
  threatens(lane: 0 | 1): boolean {
    return lane === 0 ? this.p < 0.2 : this.p > 0.8;
  }

  step(dt: number): boolean {
    if (this.dead) return false;
    this.time += dt;
    const move = this.speed * dt;
    this.distance += move;
    const dp = dt / FLIP_SECONDS;
    this.p = this.target === 1 ? Math.min(1, this.p + dp) : Math.max(0, this.p - dp);
    for (const s of this.spikes) s.x -= move;
    this.lastEnd -= move;
    this.spikes = this.spikes.filter((s) => s.x + s.w > -50);
    this.fill();
    const left = PLAYER_X - PLAYER_R + 10;
    const right = PLAYER_X + PLAYER_R - 10;
    for (const s of this.spikes) {
      if (s.x < right && s.x + s.w > left && this.threatens(s.lane)) {
        this.dead = true;
        return true;
      }
    }
    return false;
  }

  private fill(): void {
    while (this.lastEnd < FIELD_W + 300) {
      const lane: 0 | 1 = this.rnd() < 0.5 ? 0 : 1;
      // Switching lanes needs time to flip: keep the gap reachable at the current speed.
      const gap =
        lane !== this.lastLane ? this.speed * 0.6 + this.rnd() * 180 : 120 + this.rnd() * 260;
      const w = 60 + Math.floor(this.rnd() * 110);
      const x = this.lastEnd + gap;
      this.spikes.push({ x, w, lane });
      this.lastEnd = x + w;
      this.lastLane = lane;
    }
  }
}
