/**
 * "Disputa de Pênaltis" — pure rules. A knockout cup decided only on penalties: you take your
 * kicks with a swipe (direction, height, power and curve) and save theirs by diving at the right
 * spot in time. Goal-plane coordinates: u from -1 (left post) to 1 (right post), v from 0 (grass)
 * to 1 (crossbar).
 */
import type { Rnd } from '@/platform/rnd';

export interface Shot {
  readonly u: number;
  readonly v: number;
  /** 0 (soft) to 1 (a rocket): faster balls are harder to save but less accurate. */
  readonly power: number;
  /** -1 to 1: bend applied along the flight (purely visual on the final spot, which already has it). */
  readonly curve: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
  /** Milliseconds. */
  readonly t: number;
}

export type Outcome = 'gol' | 'defesa' | 'trave' | 'fora';

export const STAGES = ['Oitavas de final', 'Quartas de final', 'Semifinal', 'FINAL'] as const;
export const KICKS = 5;
/** How far the keeper can stretch from where he dives (goal units). */
export const REACH = 0.34;
/** The farthest a keeper can dive sideways / up. */
export const DIVE_U = 0.66;
export const DIVE_V = 0.78;
/** Keeper start: centre of the goal, about chest height. */
export const KEEPER_HOME = { u: 0, v: 0.42 } as const;
/** Goal units per second a keeper covers once he moves. */
export const KEEPER_SPEED = 2.4;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Approximately normal noise from a uniform source. */
const noise = (rnd: Rnd) => rnd() + rnd() + rnd() - 1.5;

/** Seconds the ball takes to reach the goal. */
export const flightTime = (power: number): number => 0.78 - 0.36 * clamp(power, 0, 1);

/** A top-corner shot: worth a bonus, nearly impossible to save. */
export const inTheCorner = (s: Shot): boolean => Math.abs(s.u) > 0.72 && s.v > 0.62;

/**
 * Turns a swipe into a shot. Sideways travel aims, the length of the swipe lifts the ball, its
 * speed is the power, and how far the middle of the path bows out is the curve.
 */
export function shotFromSwipe(path: readonly Point[]): Shot | null {
  if (path.length < 2) return null;
  const a = path[0]!;
  const b = path[path.length - 1]!;
  const dx = b.x - a.x;
  const dy = a.y - b.y; // upwards is positive
  const len = Math.hypot(dx, dy);
  if (dy < 40 || len < 70) return null;
  const ms = Math.max(30, b.t - a.t);
  const speed = (len / ms) * 1000;
  // Bow of the path: signed distance of the middle point from the straight line.
  const mid = path[Math.floor(path.length / 2)]!;
  const bow = ((mid.x - a.x) * dy - (a.y - mid.y) * dx) / len;
  const curve = clamp(-bow / (len * 0.25), -1, 1);
  return {
    u: clamp((dx / dy) * 1.5 + curve * 0.18, -1.5, 1.5),
    v: clamp((dy - 120) / 380, -0.05, 1.5),
    power: clamp((speed - 700) / 2600, 0, 1),
    curve,
  };
}

/** Where the ball really goes: harder shots spray more. */
export function withError(s: Shot, rnd: Rnd, skill = 1): Shot {
  const spread = (0.025 + 0.13 * s.power * s.power) / skill;
  return { ...s, u: s.u + noise(rnd) * spread, v: s.v + noise(rnd) * spread * 0.8 };
}

/** Clamps where a keeper can actually get to. */
export const diveSpot = (u: number, v: number) => ({
  u: clamp(u, -DIVE_U, DIVE_U),
  v: clamp(v, 0.12, DIVE_V),
});

/**
 * What happens to a shot when the keeper ends up at `keeper`. Off target first, then the
 * woodwork, then whether the keeper's reach covers the ball (a fast ball shrinks the reach).
 */
export function outcome(s: Shot, keeper: { u: number; v: number }): Outcome {
  if (s.v > 1.07 || Math.abs(s.u) > 1.07 || s.v < -0.02) return 'fora';
  if (s.v > 0.96 || Math.abs(s.u) > 0.95) return 'trave';
  const reach = REACH * (1.12 - 0.42 * s.power);
  const d = Math.hypot(s.u - keeper.u, (s.v - keeper.v) * 0.85);
  return d <= reach ? 'defesa' : 'gol';
}

/** Where a keeper is after moving for `seconds` towards `target` from his spot. */
export function keeperAfter(target: { u: number; v: number }, seconds: number) {
  const dx = target.u - KEEPER_HOME.u;
  const dy = target.v - KEEPER_HOME.v;
  const dist = Math.hypot(dx, dy);
  const k = dist === 0 ? 1 : Math.min(1, (KEEPER_SPEED * Math.max(0, seconds)) / dist);
  return { u: KEEPER_HOME.u + dx * k, v: KEEPER_HOME.v + dy * k };
}

export interface Kick {
  readonly shot: Shot;
  /** Where the keeper ended up. */
  readonly keeper: { u: number; v: number };
  readonly outcome: Outcome;
}

export class Shootout {
  stage = 0;
  /** Results of this shootout: true = goal. */
  mine: boolean[] = [];
  theirs: boolean[] = [];
  score = 0;
  goals = 0;
  saves = 0;
  corners = 0;
  cups = 0;
  over = false;
  champion = false;

  constructor(private readonly rnd: Rnd = Math.random) {}

  /** You kick first, then you alternate. */
  get turn(): 'shoot' | 'save' {
    return this.mine.length === this.theirs.length ? 'shoot' : 'save';
  }

  /** Better keepers and shooters in each round of the cup. */
  get rivalSkill(): number {
    return 1 + this.stage * 0.18;
  }

  /** Your swipe, with its spray, against the rival keeper's guess. */
  shoot(aim: Shot): Kick {
    const shot = withError(aim, this.rnd);
    // How likely he reads it: worse against power and bend, better in later rounds.
    const read = clamp(
      0.22 + this.stage * 0.08 - shot.power * 0.18 - Math.abs(shot.curve) * 0.12,
      0.06,
      0.6,
    );
    let target: { u: number; v: number };
    const r = this.rnd();
    if (r < read) target = diveSpot(shot.u, shot.v);
    else if (r < read + 0.14) target = { ...KEEPER_HOME };
    else {
      const side = this.rnd() < 0.5 ? -1 : 1;
      target = diveSpot(side * (0.35 + this.rnd() * 0.35), 0.2 + this.rnd() * 0.55);
    }
    const keeper = keeperAfter(target, flightTime(shot.power) - 0.08);
    const result = outcome(shot, keeper);
    this.recordMine(result === 'gol', shot);
    return { shot, keeper, outcome: result };
  }

  /** The rival's next kick (decided before you dive). */
  rivalShot(): Shot {
    const side = this.rnd() < 0.5 ? -1 : 1;
    const aim: Shot = {
      u: side * (0.25 + this.rnd() * 0.65),
      v: 0.1 + this.rnd() * 0.8,
      power: 0.35 + this.rnd() * 0.55,
      curve: (this.rnd() - 0.5) * 0.6,
    };
    return withError(aim, this.rnd, this.rivalSkill + 0.6);
  }

  /**
   * You dove at `spot`, `reaction` seconds after the kick (negative: before it, and the shooter
   * may see it and switch sides).
   */
  save(planned: Shot, spot: { u: number; v: number } | null, reaction: number): Kick {
    let shot = planned;
    if (spot && reaction < 0 && Math.sign(spot.u) === Math.sign(planned.u) && this.rnd() < 0.55) {
      // You moved too early: he puts it the other way.
      shot = { ...planned, u: -planned.u * 0.9 };
    }
    const keeper = spot
      ? keeperAfter(diveSpot(spot.u, spot.v), flightTime(shot.power) - Math.max(0, reaction))
      : { ...KEEPER_HOME };
    const result = outcome(shot, keeper);
    this.recordTheirs(result === 'gol');
    return { shot, keeper, outcome: result };
  }

  private recordMine(goal: boolean, shot: Shot): void {
    this.mine.push(goal);
    if (!goal) return;
    this.goals++;
    this.score += 100;
    if (inTheCorner(shot)) {
      this.corners++;
      this.score += 50;
    }
  }

  private recordTheirs(goal: boolean): void {
    this.theirs.push(goal);
    if (goal) return;
    this.saves++;
    this.score += 150;
  }

  /** Who has won this shootout, if it is decided. */
  winner(): 'me' | 'them' | null {
    const a = this.mine.length;
    const b = this.theirs.length;
    const ga = this.mine.filter(Boolean).length;
    const gb = this.theirs.filter(Boolean).length;
    if (a <= KICKS && b <= KICKS && !(a === KICKS && b === KICKS)) {
      if (ga > gb + (KICKS - b)) return 'me';
      if (gb > ga + (KICKS - a)) return 'them';
      return null;
    }
    // Sudden death: only after both kicked the same number of times.
    if (a === b && ga !== gb) return ga > gb ? 'me' : 'them';
    return null;
  }

  /** Call when `winner()` says it is over. */
  finishShootout(): void {
    const w = this.winner();
    if (w === 'me') {
      this.cups++;
      this.score += 500 + this.stage * 250;
      if (this.stage === STAGES.length - 1) {
        this.champion = true;
        this.over = true;
      } else {
        this.stage++;
        this.mine = [];
        this.theirs = [];
      }
    } else if (w === 'them') this.over = true;
  }
}
