/**
 * "Pássaro das Colinas" — pure rules (Tiny Wings style). A heavy little bird rolls over endless
 * hills. Holding makes it dive (much more gravity); releasing lets it float. Diving onto a
 * downhill slope and letting go at the bottom builds speed and launches it over the next crest.
 * A smooth landing along a slope is a "perfect" that adds time. Fly as far as you can before dusk.
 */
export const BASE_Y = 900;
export const START_TIME = 45;
const G = 900;
const DIVE = 3.2;
const MIN_SPEED = 160;

/** Ground height (screen y, larger is lower) at world x: a few sines make rolling hills. */
export function groundY(x: number): number {
  return (
    BASE_Y -
    90 * Math.sin(x / 260) -
    55 * Math.sin(x / 113 + 1.3) -
    30 * Math.sin(x / 57 + 0.4) * Math.min(1, x / 4000)
  );
}

export const slope = (x: number): number => (groundY(x + 1) - groundY(x - 1)) / 2;

export type BirdEvent = { type: 'perfect'; bonus: number } | { type: 'bump' } | { type: 'dusk' };

export class BirdSim {
  x = 0;
  y = groundY(0) - 20;
  vx = 260;
  vy = 0;
  onGround = false;
  holding = false;
  timeLeft = START_TIME;
  perfects = 0;
  maxHeight = 0;
  private airTime = 0;

  get over(): boolean {
    return this.timeLeft <= 0;
  }

  /** Metres flown: the score. */
  get score(): number {
    return Math.floor(this.x / 10) + this.perfects * 50;
  }

  step(dt: number): BirdEvent[] {
    const ev: BirdEvent[] = [];
    if (this.over) return ev;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      ev.push({ type: 'dusk' });
      return ev;
    }
    const g = G * (this.holding ? DIVE : 1);
    if (this.onGround) {
      // Slide along the slope: gravity speeds it up downhill and slows it uphill.
      const s = slope(this.x);
      const len = Math.hypot(1, s);
      const along = (g * s) / len; // + downhill
      let speed = Math.hypot(this.vx, this.vy) + along * dt;
      speed = Math.max(MIN_SPEED, speed * (1 - 0.05 * dt));
      this.vx = speed / len;
      this.vy = (speed * s) / len;
      this.x += this.vx * dt;
      const gy = groundY(this.x);
      // Over a crest (screen y grows downward, so the slope increases) a fast bird keeps its
      // upward momentum while the ground falls away: it takes off.
      if (!this.holding && this.vy < 0 && slope(this.x) > s + 0.002 && speed > 260) {
        this.onGround = false;
        this.y = gy;
      } else this.y = gy;
    } else {
      this.vy += g * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      this.maxHeight = Math.max(this.maxHeight, groundY(this.x) - this.y);
      const gy = groundY(this.x);
      if (this.y >= gy) {
        this.y = gy;
        // Landing: keep the part of the speed along the slope.
        const s = slope(this.x);
        const len = Math.hypot(1, s);
        const tx = 1 / len;
        const ty = s / len;
        const along = this.vx * tx + this.vy * ty;
        const speed = Math.hypot(this.vx, this.vy);
        const fit = speed ? along / speed : 1;
        if (fit > 0.93 && this.airTime > 0.35 && s > 0.05) {
          this.perfects++;
          this.timeLeft += 2;
          ev.push({ type: 'perfect', bonus: 2 });
        } else if (fit < 0.75) ev.push({ type: 'bump' });
        const keep = Math.max(MIN_SPEED, along * (fit > 0.93 ? 1.08 : 1));
        this.vx = keep * tx;
        this.vy = keep * ty;
        this.onGround = true;
        this.airTime = 0;
      }
    }
    return ev;
  }
}
