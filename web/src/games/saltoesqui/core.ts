/**
 * "Salto de Esqui" — pure rules of a three-tap ski jump. 1) Take-off: tap as the skier reaches
 * the edge of the ramp (the closer, the stronger the jump). 2) Flight: hold and release to keep
 * the balance needle in the green while the wind pushes it — time in the green is lift.
 * 3) Landing: tap in the window just before touchdown for a clean telemark (style points);
 * miss it and the skier falls. Five jumps, each with different wind; the score is the total.
 */
export const JUMPS = 5;
export const INRUN_TIME = 2.2;
export const FLIGHT_TIME = 3.2;
export const LAND_WINDOW = 0.35;

export type Phase = 'inrun' | 'flight' | 'landing' | 'done';

export interface JumpResult {
  readonly distance: number;
  readonly style: number;
  readonly fell: boolean;
  readonly points: number;
}

export class SkiJump {
  jump = 1;
  phase: Phase = 'inrun';
  t = 0;
  /** 0..1 quality of the take-off tap. */
  takeoff = 0;
  /** Balance needle: -1..1, green zone is |needle| < 0.3. */
  needle = 0;
  needleV = 0;
  lift = 0;
  holding = false;
  wind = 0;
  total = 0;
  results: JumpResult[] = [];
  private landT = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.newJump();
  }

  get over(): boolean {
    return this.jump > JUMPS;
  }

  private newJump(): void {
    this.phase = 'inrun';
    this.t = 0;
    this.takeoff = 0;
    this.needle = 0;
    this.needleV = 0;
    this.lift = 0;
    this.wind = (this.rng() - 0.5) * 2 * (0.6 + this.jump * 0.15);
  }

  /** Progress down the ramp (0 top, 1 edge). */
  get inrunProgress(): number {
    return Math.min(1.2, this.t / INRUN_TIME);
  }

  tap(): JumpResult | null {
    if (this.phase === 'inrun') {
      const off = Math.abs(1 - this.inrunProgress);
      this.takeoff = Math.max(0, 1 - off * 4);
      this.phase = 'flight';
      this.t = 0;
      return null;
    }
    if (this.phase === 'landing') return this.land(true);
    return null;
  }

  step(dt: number): JumpResult | null {
    if (this.over) return null;
    this.t += dt;
    if (this.phase === 'inrun') {
      // Too late: the skier just drops off the edge with no push.
      if (this.inrunProgress >= 1.2) {
        this.takeoff = 0;
        this.phase = 'flight';
        this.t = 0;
      }
      return null;
    }
    if (this.phase === 'flight') {
      // Wind and wobble push the needle; holding pushes it right, releasing lets it fall left.
      const push = (this.holding ? 2.6 : -2.6) + this.wind * 1.4 + Math.sin(this.t * 5.3) * 0.8;
      this.needleV += push * dt;
      this.needleV *= Math.exp(-1.5 * dt);
      this.needle = Math.max(-1, Math.min(1, this.needle + this.needleV * dt));
      if (Math.abs(this.needle) === 1) this.needleV = 0;
      if (Math.abs(this.needle) < 0.3) this.lift += dt;
      if (this.t >= FLIGHT_TIME) {
        this.phase = 'landing';
        this.landT = 0;
      }
      return null;
    }
    if (this.phase === 'landing') {
      this.landT += dt;
      if (this.landT > LAND_WINDOW) return this.land(false);
    }
    return null;
  }

  private land(clean: boolean): JumpResult {
    const distance =
      Math.round((78 + this.takeoff * 28 + (this.lift / FLIGHT_TIME) * 38 + this.wind * 4) * 10) /
      10;
    const fell = !clean;
    const style = fell ? 0 : Math.round(12 + this.takeoff * 4 + (this.lift / FLIGHT_TIME) * 4);
    const points = Math.round(distance * 1.8 + style * 3);
    const r = { distance, style, fell, points };
    this.results.push(r);
    this.total += points;
    this.phase = 'done';
    return r;
  }

  next(): void {
    if (this.phase !== 'done') return;
    this.jump++;
    if (!this.over) this.newJump();
  }
}
