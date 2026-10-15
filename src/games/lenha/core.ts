/**
 * "Lenhador" (Timberman-like) — pure rules. Tap left or right to chop the trunk; the kid stands on
 * that side. A branch coming down on the kid's side, or walking into one, ends the run; so does the
 * timer, which drains faster as the score grows and is refilled by each chop.
 */

export type Rng = () => number;
export type Side = 'left' | 'right';

/** Trunk segments kept above the kid (index 0 is level with the kid). */
export const VISIBLE = 9;
const REFILL = 0.07;

export type LenhaEvent = { type: 'chop'; side: Side } | { type: 'over'; reason: 'branch' | 'time' };

export class LenhaSim {
  side: Side = 'left';
  score = 0;
  /** 0..1 */
  time = 0.6;
  started = false;
  over: 'branch' | 'time' | null = null;
  readonly branches: (Side | null)[] = [];

  constructor(private readonly rng: Rng = Math.random) {
    // A few clear segments at the start.
    for (let i = 0; i < VISIBLE; i++) this.branches.push(i < 2 ? null : this.nextBranch());
  }

  private nextBranch(): Side | null {
    const last = this.branches[this.branches.length - 1] ?? null;
    // After a branch comes a gap or one on the same side: a branch right above one on the other
    // side would leave no safe spot at all.
    if (last) return this.rng() < 0.55 ? null : last;
    if (this.rng() < 0.3) return null;
    return this.rng() < 0.5 ? 'left' : 'right';
  }

  /** Seconds-per-second drain: faster as the score grows. */
  get drain(): number {
    return 0.16 + Math.min(0.5, this.score * 0.0035);
  }

  step(dt: number): LenhaEvent[] {
    if (this.over || !this.started) return [];
    this.time = Math.max(0, this.time - this.drain * dt);
    if (this.time === 0) {
      this.over = 'time';
      return [{ type: 'over', reason: 'time' }];
    }
    return [];
  }

  chop(side: Side): LenhaEvent[] {
    if (this.over) return [];
    this.started = true;
    this.side = side;
    // Walking into a branch at head height.
    if (this.branches[0] === side) {
      this.over = 'branch';
      return [{ type: 'over', reason: 'branch' }];
    }
    this.branches.shift();
    this.branches.push(this.nextBranch());
    this.score++;
    this.time = Math.min(1, this.time + REFILL);
    const events: LenhaEvent[] = [{ type: 'chop', side }];
    // The trunk drops one segment: a branch now on the kid's side hits them.
    if (this.branches[0] === side) {
      this.over = 'branch';
      events.push({ type: 'over', reason: 'branch' });
    }
    return events;
  }
}
