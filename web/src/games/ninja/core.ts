/**
 * "Ninja" — pure rules. The ninja clings to one of two walls while the world scrolls past; tap to
 * leap to the other wall. Spikes sit on the walls, shurikens fly across the gap.
 */
export const NINJA_Y = 930;
export const LEFT_X = 120;
export const RIGHT_X = 600;
export const CROSS_TIME = 0.28;
const HIT = 46;

export type HazardKind = 'spike' | 'shuriken';
export interface Hazard {
  kind: HazardKind;
  /** 0 = left wall, 1 = right wall (spikes only). */
  side: 0 | 1;
  /** Position along the scroll axis. */
  d: number;
}

export class NinjaSim {
  dist = 0;
  side: 0 | 1 = 0;
  /** 0..1 while leaping, else null. */
  cross: number | null = null;
  alive = true;
  t = 0;
  hazards: Hazard[] = [];
  private nextD = 700;

  constructor(private readonly rng: () => number = Math.random) {
    this.fill();
  }

  get speed(): number {
    return Math.min(660, 360 + this.dist * 0.018);
  }

  get score(): number {
    return Math.floor(this.dist / 20);
  }

  /** Screen y of a hazard (they come down from the top). */
  screenY(h: Hazard): number {
    return NINJA_Y - (h.d - this.dist);
  }

  /** Current x of the ninja. */
  x(): number {
    const from = this.side === 0 ? LEFT_X : RIGHT_X;
    const to = this.side === 0 ? RIGHT_X : LEFT_X;
    return this.cross === null ? from : from + (to - from) * this.cross;
  }

  private fill(): void {
    while (this.nextD < this.dist + 2400) {
      const side = (this.rng() < 0.5 ? 0 : 1) as 0 | 1;
      this.hazards.push({ kind: this.rng() < 0.25 ? 'shuriken' : 'spike', side, d: this.nextD });
      // Enough room to leap between two hazards, even at top speed.
      this.nextD += 330 + this.rng() * 200;
    }
  }

  tap(): boolean {
    if (!this.alive || this.cross !== null) return false;
    this.cross = 0;
    return true;
  }

  step(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    this.dist += this.speed * dt;
    if (this.cross !== null) {
      this.cross += dt / CROSS_TIME;
      if (this.cross >= 1) {
        this.cross = null;
        this.side = this.side === 0 ? 1 : 0;
      }
    }
    this.fill();
    this.hazards = this.hazards.filter((h) => h.d > this.dist - 200);
    for (const h of this.hazards) {
      if (Math.abs(h.d - this.dist) > HIT) continue;
      const c = this.cross;
      if (h.kind === 'shuriken') {
        if (c !== null && c > 0.2 && c < 0.8) this.alive = false;
      } else {
        const onWall =
          c === null ? this.side : c < 0.25 ? this.side : c > 0.75 ? 1 - this.side : -1;
        if (onWall === h.side) this.alive = false;
      }
    }
  }
}

/** Looks ahead and leaps in time. */
export function botAct(s: NinjaSim): void {
  if (s.cross !== null) return;
  const lead = s.speed * (CROSS_TIME * 0.5) + 70;
  for (const h of s.hazards) {
    const ahead = h.d - s.dist;
    if (ahead < 0 || ahead > lead + 40) continue;
    if (h.kind === 'spike' && h.side === s.side && ahead < lead) {
      s.tap();
      return;
    }
  }
}
