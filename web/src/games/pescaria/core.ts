/**
 * "Pescaria" — pure rules. Each cast has two halves: on the way down the hook must dodge every
 * fish (touching one stops the dive right there); on the way up it hooks every fish it touches,
 * but jellyfish sting and make half of the catch escape. Deeper water holds rarer, richer fish.
 */
export const LEFT = 40;
export const RIGHT = 680;
export const HOOK_R = 22;
export const CASTS = 5;
export const CAPACITY = 14;

export interface FishKind {
  readonly name: string;
  readonly emoji: string;
  readonly value: number;
  readonly r: number;
  /** Shallowest depth (px) where it lives. */
  readonly from: number;
  readonly jelly?: boolean;
}

export const KINDS: readonly FishKind[] = [
  { name: 'Sardinha', emoji: '🐟', value: 10, r: 30, from: 150 },
  { name: 'Peixe-palhaço', emoji: '🐠', value: 25, r: 30, from: 700 },
  { name: 'Baiacu', emoji: '🐡', value: 40, r: 34, from: 1400 },
  { name: 'Lula', emoji: '🦑', value: 70, r: 36, from: 2200 },
  { name: 'Polvo', emoji: '🐙', value: 110, r: 38, from: 3200 },
  { name: 'Tubarão', emoji: '🦈', value: 200, r: 46, from: 4300 },
  { name: 'Água-viva', emoji: '🪼', value: 0, r: 32, from: 900, jelly: true },
];

export interface Fish {
  readonly id: number;
  readonly kind: FishKind;
  x: number;
  y: number;
  vx: number;
  caught: boolean;
}

export type Phase = 'down' | 'up' | 'done';

export type FishEvent =
  | { type: 'bump'; depth: number }
  | { type: 'turn'; depth: number }
  | { type: 'catch'; fish: Fish }
  | { type: 'sting'; lost: number }
  | { type: 'surface'; points: number; count: number; cast: number };

/** Length of the line for a cast (it grows a little each cast). */
export const lineLength = (cast: number): number => 2600 + cast * 700;

export class FishingSim {
  cast = 1;
  phase: Phase = 'down';
  hookX = 360;
  targetX = 360;
  depth = 0;
  deepest = 0;
  fish: Fish[] = [];
  catch: Fish[] = [];
  score = 0;
  totalFish = 0;
  private speed = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.spawn();
  }

  get over(): boolean {
    return this.cast > CASTS;
  }

  private spawn(): void {
    this.fish = [];
    const max = lineLength(this.cast) + 400;
    let id = 0;
    for (let y = 260; y < max; y += 70 + this.rng() * 70) {
      const pool = KINDS.filter((k) => k.from <= y);
      // The deepest kinds that already live here are a bit more common.
      const kind = pool[Math.floor(Math.pow(this.rng(), 0.7) * pool.length)]!;
      const dir = this.rng() < 0.5 ? -1 : 1;
      this.fish.push({
        id: id++,
        kind,
        x: LEFT + 40 + this.rng() * (RIGHT - LEFT - 80),
        y,
        vx: dir * (60 + this.rng() * 90 + y * 0.02),
        caught: false,
      });
    }
  }

  /** Where the finger wants the hook. */
  aim(x: number): void {
    this.targetX = Math.max(LEFT + HOOK_R, Math.min(RIGHT - HOOK_R, x));
  }

  step(dt: number): FishEvent[] {
    const events: FishEvent[] = [];
    if (this.phase === 'done' || this.over) return events;
    this.hookX += (this.targetX - this.hookX) * Math.min(1, dt * 12);
    for (const f of this.fish) {
      if (f.caught) continue;
      f.x += f.vx * dt;
      if (f.x < LEFT + f.kind.r || f.x > RIGHT - f.kind.r) {
        f.vx = -f.vx;
        f.x = Math.max(LEFT + f.kind.r, Math.min(RIGHT - f.kind.r, f.x));
      }
    }

    if (this.phase === 'down') {
      this.speed = Math.min(560, this.speed + dt * 500);
      this.depth += this.speed * dt;
      this.deepest = Math.max(this.deepest, this.depth);
      const hit = this.touching();
      if (hit) {
        this.phase = 'up';
        this.speed = 0;
        events.push({ type: 'bump', depth: this.depth });
      } else if (this.depth >= lineLength(this.cast)) {
        this.phase = 'up';
        this.speed = 0;
        events.push({ type: 'turn', depth: this.depth });
      }
    } else {
      this.speed = Math.min(780, this.speed + dt * 900);
      this.depth -= this.speed * dt;
      for (const f of this.fish) {
        if (f.caught || !this.touches(f)) continue;
        if (f.kind.jelly) {
          f.caught = true; // it drifts away after stinging
          const lost = Math.ceil(this.catch.length / 2);
          this.catch.splice(this.catch.length - lost, lost);
          events.push({ type: 'sting', lost });
        } else if (this.catch.length < CAPACITY) {
          f.caught = true;
          this.catch.push(f);
          events.push({ type: 'catch', fish: f });
        }
      }
      if (this.depth <= 0) {
        this.depth = 0;
        const base = this.catch.reduce((s, f) => s + f.kind.value, 0);
        // A full line of different kinds pays a variety bonus.
        const kinds = new Set(this.catch.map((f) => f.kind.name)).size;
        const points = Math.round(base * (1 + kinds * 0.1));
        this.score += points;
        this.totalFish += this.catch.length;
        events.push({ type: 'surface', points, count: this.catch.length, cast: this.cast });
        this.phase = 'done';
      }
    }
    return events;
  }

  /** Starts the next cast (after the surface celebration). */
  next(): void {
    if (this.phase !== 'done') return;
    this.cast++;
    this.catch = [];
    this.depth = 0;
    this.speed = 0;
    if (this.over) return;
    this.phase = 'down';
    this.spawn();
  }

  private touches(f: Fish): boolean {
    return Math.hypot(f.x - this.hookX, f.y - this.depth) < f.kind.r + HOOK_R;
  }

  private touching(): Fish | undefined {
    return this.fish.find((f) => !f.caught && this.touches(f));
  }
}
