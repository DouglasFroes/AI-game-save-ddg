/**
 * "Paraquedas" — pure rules of a skydive. Steer left and right through rings while birds, planes
 * and storm clouds rush up at you; then open the chute as late as you dare — the lower, the more
 * points — but never below the ground. Each jump falls faster with a busier sky.
 */
export const LEFT = 60;
export const RIGHT = 660;
export const DIVER_Y = 420;
export const DIVER_R = 30;
export const START_ALT = 2400;
/** The chute must open above this altitude. */
export const SAFE_ALT = 25;
/** Opening below this altitude starts to pay a "late open" bonus. */
export const BONUS_ALT = 600;
export const LIVES = 3;

export interface Thing {
  readonly id: number;
  readonly kind: 'ring' | 'bird' | 'plane' | 'cloud';
  x: number;
  /** Altitude (metres; 1 m = 1 px on screen). */
  readonly alt: number;
  vx: number;
  done: boolean;
}

export type SkyEvent =
  | { type: 'ring'; points: number; combo: number }
  | { type: 'hit'; kind: Thing['kind']; livesLeft: number }
  | { type: 'opened'; alt: number; points: number }
  | { type: 'landed'; jump: number }
  | { type: 'crash' };

export const radiusOf = (k: Thing['kind']): number =>
  k === 'ring' ? 56 : k === 'plane' ? 60 : k === 'cloud' ? 70 : 30;

export class SkySim {
  jump = 1;
  alt = START_ALT;
  x = 360;
  targetX = 360;
  things: Thing[] = [];
  lives = LIVES;
  score = 0;
  rings = 0;
  combo = 0;
  state: 'fall' | 'open' | 'landed' | 'dead' = 'fall';
  private hurt = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.spawn();
  }

  get fallSpeed(): number {
    return this.state === 'open' ? 110 : Math.min(620, 330 + this.jump * 45);
  }

  private spawn(): void {
    this.things = [];
    let id = 0;
    const hazardChance = Math.min(0.6, 0.25 + this.jump * 0.06);
    for (let alt = START_ALT - 380; alt > BONUS_ALT + 120; alt -= 120 + this.rng() * 90) {
      const roll = this.rng();
      const kind: Thing['kind'] =
        roll < 1 - hazardChance
          ? 'ring'
          : roll < 1 - hazardChance / 2
            ? 'bird'
            : this.rng() < 0.5
              ? 'plane'
              : 'cloud';
      const moving = kind === 'bird' || kind === 'plane';
      this.things.push({
        id: id++,
        kind,
        x: LEFT + 50 + this.rng() * (RIGHT - LEFT - 100),
        alt,
        vx: moving ? (this.rng() < 0.5 ? -1 : 1) * (80 + this.jump * 20 + this.rng() * 80) : 0,
        done: false,
      });
    }
  }

  aim(x: number): void {
    this.targetX = Math.max(LEFT, Math.min(RIGHT, x));
  }

  /** Opens the parachute (only once, while falling). */
  open(): SkyEvent[] {
    if (this.state !== 'fall') return [];
    this.state = 'open';
    const late = Math.max(0, BONUS_ALT - this.alt);
    const points = Math.round(late * 2 * (1 + this.jump * 0.2));
    this.score += points;
    return [{ type: 'opened', alt: this.alt, points }];
  }

  step(dt: number): SkyEvent[] {
    const ev: SkyEvent[] = [];
    if (this.state === 'landed' || this.state === 'dead') return ev;
    this.hurt = Math.max(0, this.hurt - dt);
    this.x += (this.targetX - this.x) * Math.min(1, dt * (this.state === 'open' ? 4 : 9));
    this.alt -= this.fallSpeed * dt;
    for (const t of this.things) {
      if (t.done) continue;
      t.x += t.vx * dt;
      if (t.x < LEFT || t.x > RIGHT) t.vx = -t.vx;
      if (
        Math.abs(t.alt - this.alt) > radiusOf(t.kind) ||
        Math.abs(t.x - this.x) > radiusOf(t.kind) + DIVER_R
      ) {
        // A ring left above unflown breaks the combo.
        if (t.kind === 'ring' && t.alt > this.alt + radiusOf('ring')) {
          t.done = true;
          this.combo = 0;
        }
        continue;
      }
      t.done = true;
      if (t.kind === 'ring') {
        this.combo++;
        this.rings++;
        const points = 50 * Math.min(this.combo, 10) * this.jump;
        this.score += points;
        ev.push({ type: 'ring', points, combo: this.combo });
      } else if (this.hurt === 0) {
        this.lives--;
        this.combo = 0;
        this.hurt = 1;
        ev.push({ type: 'hit', kind: t.kind, livesLeft: this.lives });
        if (this.lives <= 0) {
          this.state = 'dead';
          ev.push({ type: 'crash' });
          return ev;
        }
      }
    }
    if (this.alt <= SAFE_ALT && this.state === 'fall') {
      this.state = 'dead';
      ev.push({ type: 'crash' });
    } else if (this.alt <= 0 && this.state === 'open') {
      this.alt = 0;
      this.state = 'landed';
      this.score += 150 * this.jump;
      ev.push({ type: 'landed', jump: this.jump });
    }
    return ev;
  }

  /** Next jump, from the plane again. */
  next(): void {
    if (this.state !== 'landed') return;
    this.jump++;
    this.alt = START_ALT;
    this.state = 'fall';
    this.combo = 0;
    this.spawn();
  }
}
