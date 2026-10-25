/**
 * "Galeria de Tiro" — pure rules of a fairground shooting gallery (screen pixels). Ducks and
 * targets ride three conveyor belts; tap them to shoot. A magazine holds six shots: swipe down
 * (or tap the crate) to reload, which takes a moment. Don't hit the bunnies. Golden ducks add
 * time, clowns pop up for a second. Hits in a row build a multiplier. One minute on the clock.
 */
import type { Rnd } from '@/platform/rnd';

export const LANES = [470, 690, 910] as const;
export const FIELD_W = 720;
export const MAGAZINE = 6;
export const RELOAD_TIME = 0.85;
export const START_TIME = 60;

export type Kind = 'duck' | 'target' | 'gold' | 'bunny' | 'clown';

export const KINDS: Record<Kind, { points: number; r: number; seconds: number; emoji: string }> = {
  duck: { points: 10, r: 46, seconds: 0, emoji: '🦆' },
  target: { points: 25, r: 34, seconds: 0, emoji: '🎯' },
  gold: { points: 50, r: 40, seconds: 3, emoji: '🐤' },
  bunny: { points: -50, r: 44, seconds: -3, emoji: '🐰' },
  clown: { points: 40, r: 50, seconds: 0, emoji: '🤡' },
};

export interface Item {
  readonly id: number;
  readonly kind: Kind;
  x: number;
  y: number;
  readonly vx: number;
  /** Clowns: seconds left above the counter. */
  life: number;
  hit: boolean;
}

export type GalleryEvent =
  | { type: 'hit'; item: Item; points: number; combo: number }
  | { type: 'friend'; item: Item }
  | { type: 'miss' }
  | { type: 'empty' }
  | { type: 'reloaded' }
  | { type: 'over' };

export class GallerySim {
  items: Item[] = [];
  clock = START_TIME;
  time = 0;
  ammo = MAGAZINE;
  reloading = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  hits = 0;
  shots = 0;
  friendsHit = 0;
  over = false;
  private ids = 0;
  private spawnIn = [0.2, 0.7, 1.2];
  private clownIn = 6;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get multiplier(): number {
    return Math.min(3, 1 + Math.floor(this.combo / 5) * 0.5);
  }

  /** Belts speed up through the minute. */
  get pace(): number {
    return 1 + Math.min(0.6, this.time / 100);
  }

  get accuracy(): number {
    return this.shots ? this.hits / this.shots : 0;
  }

  reload(): boolean {
    if (this.over || this.reloading > 0 || this.ammo === MAGAZINE) return false;
    this.reloading = RELOAD_TIME;
    return true;
  }

  shoot(x: number, y: number): GalleryEvent[] {
    if (this.over || this.reloading > 0) return [];
    if (this.ammo <= 0) return [{ type: 'empty' }];
    this.ammo--;
    this.shots++;
    // The closest item under the shot (front lanes first, as they cover the back ones).
    let best: Item | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (it.hit) continue;
      const d = Math.hypot(it.x - x, it.y - y);
      if (d <= KINDS[it.kind].r && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    if (!best) {
      this.combo = 0;
      return [{ type: 'miss' }];
    }
    best.hit = true;
    const k = KINDS[best.kind];
    if (best.kind === 'bunny') {
      this.combo = 0;
      this.friendsHit++;
      this.score = Math.max(0, this.score + k.points);
      this.clock = Math.max(0, this.clock + k.seconds);
      return [{ type: 'friend', item: best }];
    }
    this.combo++;
    this.hits++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const points = Math.round(k.points * this.multiplier);
    this.score += points;
    this.clock += k.seconds;
    return [{ type: 'hit', item: best, points, combo: this.combo }];
  }

  step(dt: number): GalleryEvent[] {
    const events: GalleryEvent[] = [];
    if (this.over) return events;
    this.time += dt;
    this.clock = Math.max(0, this.clock - dt);
    if (this.reloading > 0) {
      this.reloading = Math.max(0, this.reloading - dt);
      if (this.reloading === 0) {
        this.ammo = MAGAZINE;
        events.push({ type: 'reloaded' });
      }
    }
    for (let lane = 0; lane < LANES.length; lane++) {
      this.spawnIn[lane]! -= dt;
      if (this.spawnIn[lane]! <= 0) {
        this.spawn(lane);
        this.spawnIn[lane] = (0.8 + this.rnd() * 0.9) / this.pace;
      }
    }
    this.clownIn -= dt;
    if (this.clownIn <= 0) {
      this.items.push({ id: ++this.ids, kind: 'clown', x: 100 + this.rnd() * 360, y: 1080, vx: 0, life: 1.3, hit: false });
      this.clownIn = 4 + this.rnd() * 4;
    }
    for (const it of this.items) {
      it.x += it.vx * dt;
      if (it.kind === 'clown') it.life -= dt;
    }
    this.items = this.items.filter((it) => !it.hit && it.x > -80 && it.x < FIELD_W + 80 && (it.kind !== 'clown' || it.life > 0));
    if (this.clock <= 0) {
      this.over = true;
      events.push({ type: 'over' });
    }
    return events;
  }

  private spawn(lane: number): void {
    const r = this.rnd();
    const kind: Kind = r < 0.07 ? 'gold' : r < 0.25 ? 'bunny' : r < 0.47 ? 'target' : 'duck';
    const dir = lane === 1 ? -1 : 1;
    const speed = (110 + lane * 45) * this.pace * (kind === 'gold' ? 1.6 : 1);
    this.items.push({ id: ++this.ids, kind, x: dir > 0 ? -60 : FIELD_W + 60, y: LANES[lane]!, vx: dir * speed, life: 0, hit: false });
  }
}
