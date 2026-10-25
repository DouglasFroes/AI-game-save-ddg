/** "Natação": 50 m crawl. Tap on the beat: each good stroke pushes you; flip at the wall. */
export const POOL_M = 50;
export const TURN_M = 25;
export const BEAT = 0.82;
const PERFECT = 0.08;
const GOOD = 0.17;
const STROKE: Record<Judge, number> = { perfect: 2.5, good: 1.8, miss: 0.35 };

export type Judge = 'perfect' | 'good' | 'miss';

export class SwimSim {
  /** Seconds since the start. */
  time = 0;
  x = 0;
  /** Seconds until the beat the player has to hit (negative once it passed). */
  private nextBeat = BEAT * 1.5;
  streak = 0;
  best = 0;
  turned = false;
  done = false;
  strokes = 0;

  get progress(): number {
    return Math.min(1, this.x / POOL_M);
  }

  /** How close the beat is, 1 = on it (drives the shrinking ring). */
  get ring(): number {
    return 1 - Math.min(1, Math.max(0, this.nextBeat) / BEAT);
  }

  step(dt: number): Judge | null {
    if (this.done) return null;
    this.time += dt;
    this.nextBeat -= dt;
    // A beat nobody hit.
    if (this.nextBeat < -GOOD) {
      this.nextBeat += BEAT;
      return this.apply('miss');
    }
    return null;
  }

  /** The player tapped: judged against the nearest beat. */
  tap(): Judge | null {
    if (this.done) return null;
    const off = Math.abs(this.nextBeat);
    const j: Judge = off <= PERFECT ? 'perfect' : off <= GOOD ? 'good' : 'miss';
    this.nextBeat = BEAT + Math.min(0, this.nextBeat);
    return this.apply(j);
  }

  private apply(j: Judge): Judge {
    this.strokes++;
    this.streak = j === 'miss' ? 0 : this.streak + 1;
    this.best = Math.max(this.best, this.streak);
    // A streak of clean strokes glides farther.
    this.x += STROKE[j] * (1 + Math.min(0.4, this.streak * 0.04));
    if (!this.turned && this.x >= TURN_M) {
      this.turned = true;
      // The flip: a perfect stroke right at the wall gives a push-off.
      if (j === 'perfect') this.x += 2.5;
    }
    if (this.x >= POOL_M) {
      this.x = POOL_M;
      this.done = true;
    }
    return j;
  }

  get score(): number {
    return this.done ? Math.max(0, 5000 - Math.round(this.time * 100)) : 0;
  }
}
