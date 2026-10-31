/**
 * "Dardos" — pure rules. The aim drifts over the board in a figure-eight that grows wilder each
 * round (a shaky hand); tap to throw. A real dartboard scores the hit: numbered segments,
 * the thin outer ring doubles, the inner ring triples, and the bull is 25 or 50. Ten rounds of
 * three darts; three triples (or bulls) in a round earn a bonus.
 */
export const BOARD = { x: 360, y: 640, r: 280 } as const;
/** Radii as fractions of the board radius (regulation proportions). */
const R = {
  bull: 0.037,
  outerBull: 0.094,
  tripleIn: 0.582,
  tripleOut: 0.629,
  doubleIn: 0.953,
  doubleOut: 1,
};
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const ROUNDS = 10;

export interface Hit {
  readonly points: number;
  readonly label: string;
  readonly mult: 0 | 1 | 2 | 3;
  readonly bull: boolean;
}

/** Score of a dart landing at (x, y). */
export function scoreAt(x: number, y: number): Hit {
  const dx = x - BOARD.x;
  const dy = y - BOARD.y;
  const d = Math.hypot(dx, dy) / BOARD.r;
  if (d <= R.bull) return { points: 50, label: 'MOSCA!', mult: 2, bull: true };
  if (d <= R.outerBull) return { points: 25, label: '25', mult: 1, bull: true };
  if (d > R.doubleOut) return { points: 0, label: 'Fora', mult: 0, bull: false };
  // Angle clockwise from straight up; each segment spans 18°, the 20 centred on top.
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360 + 9) % 360;
  const n = ORDER[Math.floor(deg / 18)]!;
  if (d >= R.doubleIn) return { points: n * 2, label: `D${n}`, mult: 2, bull: false };
  if (d >= R.tripleIn && d <= R.tripleOut)
    return { points: n * 3, label: `T${n}`, mult: 3, bull: false };
  return { points: n, label: String(n), mult: 1, bull: false };
}

export class DartsGame {
  round = 1;
  dart = 0; // 0..2 within the round
  score = 0;
  time = 0;
  triples = 0;
  bulls = 0;
  roundHits: Hit[] = [];
  private seed: number;

  constructor(rng: () => number = Math.random) {
    this.seed = rng() * 100;
  }

  get over(): boolean {
    return this.round > ROUNDS;
  }

  /** How far (px) the aim wanders this round. */
  get wobble(): number {
    return 30 + this.round * 13;
  }

  /** Where the aim is right now (a drifting Lissajous figure around the board centre). */
  aim(): { x: number; y: number } {
    const t = this.time + this.seed;
    const speed = 1 + this.round * 0.12;
    return {
      x: BOARD.x + Math.sin(t * 1.3 * speed) * this.wobble * 1.4 + Math.sin(t * 3.1) * 8,
      y: BOARD.y - 60 + Math.sin(t * 2.1 * speed + 0.6) * this.wobble + Math.cos(t * 2.7) * 8,
    };
  }

  tick(dt: number): void {
    this.time += dt;
  }

  /** Throws at the current aim; `offset` lets the scene add the player's drag correction. */
  throw(offsetX = 0, offsetY = 0): { hit: Hit; x: number; y: number; bonus: number } {
    const a = this.aim();
    const x = a.x + offsetX;
    const y = a.y + offsetY;
    const hit = scoreAt(x, y);
    this.score += hit.points;
    if (hit.mult === 3) this.triples++;
    if (hit.bull) this.bulls++;
    this.roundHits.push(hit);
    this.dart++;
    let bonus = 0;
    if (this.dart === 3) {
      if (this.roundHits.every((h) => h.mult === 3 || h.bull)) bonus = 100;
      else if (this.roundHits.every((h) => h.points > 0)) bonus = 10;
      this.score += bonus;
      this.round++;
      this.dart = 0;
      this.roundHits = [];
    }
    return { hit, x, y, bonus };
  }
}
