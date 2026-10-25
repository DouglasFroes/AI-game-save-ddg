/** "Corrida com Barreiras": 110 m with ten hurdles. Tap to jump; hitting one slows you down. */
export const TRACK_M = 110;
export const FIRST_M = 13.7;
export const SPACING_M = 9.14;
export const HURDLES = 10;
export const JUMP_S = 0.56;
const BASE_V = 8.4;
const MAX_V = 10.6;
const STUMBLE_S = 0.9;
/** A hurdle is cleared when the jump is at least this high over it. */
const CLEAR = 0.2;

export const hurdleAt = (i: number): number => FIRST_M + i * SPACING_M;

/** Height of a jump 0–1 over its duration (a parabola). */
const arc = (t: number): number => Math.max(0, 1 - ((t / JUMP_S) * 2 - 1) ** 2);

export class HurdleSim {
  time = 0;
  x = 0;
  v = BASE_V;
  /** Seconds since the jump started, or -1 on the ground. */
  air = -1;
  /** Seconds of stumbling left. */
  stumble = 0;
  next = 0;
  cleared = 0;
  hits = 0;
  perfect = 0;
  done = false;

  get height(): number {
    return this.air < 0 ? 0 : arc(this.air);
  }

  jump(): void {
    if (this.done || this.air >= 0 || this.stumble > 0) return;
    this.air = 0;
  }

  /** Events: 'clear' | 'perfect' | 'hit' when a hurdle is passed, 'finish' at the line. */
  step(dt: number): Array<'clear' | 'perfect' | 'hit' | 'finish'> {
    const events: Array<'clear' | 'perfect' | 'hit' | 'finish'> = [];
    if (this.done) return events;
    this.time += dt;
    if (this.air >= 0) {
      this.air += dt;
      if (this.air >= JUMP_S) this.air = -1;
    }
    this.stumble = Math.max(0, this.stumble - dt);
    const target =
      this.stumble > 0
        ? BASE_V * 0.45
        : Math.min(MAX_V, BASE_V + this.cleared * 0.12 + this.perfect * 0.08);
    this.v += (target - this.v) * Math.min(1, dt * 5);
    const before = this.x;
    this.x += this.v * dt;
    while (this.next < HURDLES && this.x >= hurdleAt(this.next)) {
      const h = this.height;
      if (h >= CLEAR) {
        this.cleared++;
        // Over the top of the arc: a perfect clearance, and a little speed.
        if (h >= 0.85) {
          this.perfect++;
          events.push('perfect');
        } else events.push('clear');
      } else {
        this.hits++;
        this.stumble = STUMBLE_S;
        this.air = -1;
        events.push('hit');
      }
      this.next++;
    }
    if (this.x >= TRACK_M && before < TRACK_M) {
      this.done = true;
      events.push('finish');
    }
    return events;
  }

  get score(): number {
    return this.done ? Math.max(0, 3500 - Math.round(this.time * 100)) : 0;
  }
}
