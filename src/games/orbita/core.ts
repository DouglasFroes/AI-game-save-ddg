import type { Rnd } from '@/platform/rnd';

const TAU = Math.PI * 2;

export interface OrbitItem {
  ring: 0 | 1;
  /** Angle in radians. */
  a: number;
  kind: 'rock' | 'star';
  age: number;
}

export type OrbitEvent = { type: 'star' } | { type: 'crash' };

/** Smallest signed difference between two angles. */
export function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** "Órbita": a ship circles; tap to hop between the inner and outer ring. */
export class OrbitSim {
  angle = 0;
  ring: 0 | 1 = 0;
  items: OrbitItem[] = [];
  score = 0;
  time = 0;
  dead = false;
  private spawnIn = 0.8;

  constructor(private readonly rnd: Rnd = Math.random) {}

  /** Angular speed of the ship (rad/s), grows with time. */
  get speed(): number {
    return Math.min(3.4, 1.7 + this.time * 0.02);
  }

  tap(): void {
    if (!this.dead) this.ring = this.ring === 0 ? 1 : 0;
  }

  step(dt: number): OrbitEvent[] {
    const events: OrbitEvent[] = [];
    if (this.dead) return events;
    this.time += dt;
    const prev = this.angle;
    this.angle = (this.angle + this.speed * dt) % TAU;
    const drift = 0.25 * dt;
    for (const it of this.items) {
      it.age += dt;
      it.a = (it.a - drift + TAU) % TAU;
    }
    const reach = 0.17 + this.speed * dt;
    const mid = this.angle - (this.angle - prev) / 2;
    for (const it of [...this.items]) {
      if (it.ring !== this.ring) continue;
      if (Math.abs(angDiff(it.a, mid)) > reach) continue;
      if (it.kind === 'star') {
        this.score++;
        this.items.splice(this.items.indexOf(it), 1);
        events.push({ type: 'star' });
      } else {
        this.dead = true;
        events.push({ type: 'crash' });
        return events;
      }
    }
    this.items = this.items.filter((it) => it.age < (it.kind === 'rock' ? 9 : 7));
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      this.spawnIn = Math.max(0.45, 1.15 - this.time * 0.012);
    }
    return events;
  }

  private spawn(): void {
    const ahead = this.angle + 1.1 + this.rnd() * 1.6;
    const a = ((ahead % TAU) + TAU) % TAU;
    const rocks = this.items.filter((i) => i.kind === 'rock');
    if (this.rnd() < 0.62 && rocks.length < 7) {
      const ring = this.rnd() < 0.5 ? 0 : 1;
      // Never wall off both rings at the same angle: there must always be a way through.
      const blocked = rocks.some((r) => r.ring !== ring && Math.abs(angDiff(r.a, a)) < 0.7);
      if (!blocked) {
        this.items.push({ ring, a, kind: 'rock', age: 0 });
        // A star on the other ring tempts the player into the hop.
        if (this.rnd() < 0.5)
          this.items.push({ ring: ring === 0 ? 1 : 0, a, kind: 'star', age: 0 });
        return;
      }
    }
    this.items.push({ ring: this.rnd() < 0.5 ? 0 : 1, a, kind: 'star', age: 0 });
  }
}
