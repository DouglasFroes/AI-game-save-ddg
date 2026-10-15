/**
 * "Acerta o Alvo" (Knife Hit-like) — pure rules. A target spins; each tap throws a pencil from the
 * bottom. Pencils stick where they land; hitting a pencil already stuck ends the run. Throw all of
 * a level's pencils to break the target and move on. Apples on the rim are a bonus.
 */

export type Rng = () => number;

const TAU = Math.PI * 2;
/** Pencils hit at the bottom of the target (screen angle pointing down). */
export const IMPACT = Math.PI / 2;
/** Minimum angular gap between two pencils. */
export const MIN_GAP = 0.2;
const APPLE_GAP = 0.22;
export const FLIGHT_S = 0.09;

const norm = (a: number) => ((a % TAU) + TAU) % TAU;
const gap = (a: number, b: number) => {
  const d = Math.abs(norm(a) - norm(b));
  return Math.min(d, TAU - d);
};

export interface AlvoLevel {
  readonly pencils: number;
  readonly obstacles: number;
  readonly apples: number;
}

export const levelInfo = (level: number): AlvoLevel => ({
  pencils: Math.min(12, 5 + level),
  obstacles: Math.min(4, Math.floor((level - 1) / 2)),
  apples: level % 2 === 0 ? 1 : 0,
});

export type AlvoEvent =
  | { type: 'stick'; angle: number }
  | { type: 'apple' }
  | { type: 'level'; level: number }
  | { type: 'over' };

export class AlvoSim {
  level = 1;
  score = 0;
  apples = 0;
  angle = 0;
  left = 0;
  /** Angles (in target coordinates) of the pencils stuck in the target. */
  stuck: number[] = [];
  fruit: number[] = [];
  /** A pencil in flight: seconds until it lands. */
  flying: number | null = null;
  over = false;
  private t = 0;

  constructor(private readonly rng: Rng = Math.random) {
    this.startLevel();
  }

  private startLevel(): void {
    const info = levelInfo(this.level);
    this.left = info.pencils;
    this.stuck = [];
    this.fruit = [];
    this.t = 0;
    for (let i = 0; i < info.obstacles; i++) this.stuck.push(this.freeAngle());
    for (let i = 0; i < info.apples; i++) this.fruit.push(this.freeAngle());
  }

  private freeAngle(): number {
    for (let tries = 0; tries < 50; tries++) {
      const a = this.rng() * TAU;
      if ([...this.stuck, ...this.fruit].every((s) => gap(s, a) > MIN_GAP * 2)) return a;
    }
    return this.rng() * TAU;
  }

  /** Spin speed (rad/s): steady on some levels, wobbling back and forth on others. */
  spin(t: number): number {
    const base = 1.6 + Math.min(2.2, this.level * 0.18);
    switch (this.level % 3) {
      case 1:
        return base;
      case 2:
        return -base * 1.15;
      default:
        return base * 1.4 * Math.sin(t * 1.1);
    }
  }

  throw(): AlvoEvent[] {
    if (this.over || this.flying !== null || this.left <= 0) return [];
    this.flying = FLIGHT_S;
    return [];
  }

  step(dt: number): AlvoEvent[] {
    if (this.over) return [];
    this.t += dt;
    this.angle = norm(this.angle + this.spin(this.t) * dt);
    if (this.flying === null) return [];
    this.flying -= dt;
    if (this.flying > 0) return [];
    this.flying = null;
    return this.land();
  }

  private land(): AlvoEvent[] {
    const at = norm(IMPACT - this.angle);
    if (this.stuck.some((s) => gap(s, at) < MIN_GAP)) {
      this.over = true;
      return [{ type: 'over' }];
    }
    const events: AlvoEvent[] = [];
    const apple = this.fruit.findIndex((f) => gap(f, at) < APPLE_GAP);
    if (apple >= 0) {
      this.fruit.splice(apple, 1);
      this.apples++;
      this.score += 5;
      events.push({ type: 'apple' });
    }
    this.stuck.push(at);
    this.left--;
    this.score++;
    events.push({ type: 'stick', angle: at });
    if (this.left === 0) {
      this.score += 10 * this.level;
      this.level++;
      this.startLevel();
      events.push({ type: 'level', level: this.level });
    }
    return events;
  }
}
