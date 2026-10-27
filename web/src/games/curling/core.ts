/**
 * "Curling" — pure rules: four ends against the computer, four stones each per end. Seen from
 * above (pixels): pull back to aim and set the weight, pick the turn (the stone curls that way as it
 * slows), then rub the screen to sweep — sweeping keeps the stone going farther and straighter.
 * Stones collide; only the team closest to the button scores, one point per stone closer than the
 * other team's best.
 */
import type { Rnd } from '@/platform/rnd';

export const SHEET_L = 140;
export const SHEET_R = 580;
export const BUTTON = { x: 360, y: 450 } as const;
export const HOUSE_R = 180;
export const RINGS = [180, 120, 60, 22] as const;
export const HOG_Y = 700;
export const BACK_Y = 240;
export const HACK = { x: 360, y: 1140 } as const;
export const STONE_R = 22;
export const ENDS = 4;
export const STONES_EACH = 4;
const FRICTION = 150;
const CURL = 60;
const STONE_E = 0.9;
const STEP = 1 / 120;

export type Team = 'me' | 'them';

export interface Stone {
  readonly id: number;
  readonly team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** -1 curls left, 1 curls right. */
  curl: number;
}

export interface Throw {
  /** Radians off straight up (positive = to the right). */
  readonly angle: number;
  /** px/s at release. */
  readonly speed: number;
  readonly curl: -1 | 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Reads a pull-back from the stone as a throw (curl chosen separately). */
export function throwFromPull(pullX: number, pullY: number, curl: -1 | 1): Throw | null {
  const len = Math.hypot(pullX, pullY);
  if (pullY < 20 || len < 30) return null;
  return {
    angle: clamp(Math.atan2(-pullX, pullY), -0.3, 0.3),
    speed: 380 + clamp((len - 30) / 270, 0, 1) * 780,
    curl,
  };
}

/** Where a stone thrown straight with this speed would stop (no curl, no sweeping). */
export const stopY = (speed: number): number => HACK.y - (speed * speed) / (2 * FRICTION);

export const distToButton = (s: { x: number; y: number }) =>
  Math.hypot(s.x - BUTTON.x, s.y - BUTTON.y);
export const inHouse = (s: { x: number; y: number }) => distToButton(s) <= HOUSE_R + STONE_R;

/**
 * Advances moving stones by `h` seconds. `sweep` (0–1) applies to the stone thrown last.
 * Returns the ids of stones that touched another stone.
 */
export function advance(stones: Stone[], h: number, sweep: number, swept: number | null): number[] {
  const hits: number[] = [];
  for (const s of stones) {
    const v = Math.hypot(s.vx, s.vy);
    if (v === 0) continue;
    const k = s.id === swept ? sweep : 0;
    const decel = FRICTION * (1 - 0.32 * k) * h;
    if (v <= decel) {
      s.vx = s.vy = 0;
      continue;
    }
    const nx = s.vx / v;
    const ny = s.vy / v;
    // Curl grows as the stone slows down; sweeping straightens it.
    const curl = s.curl * CURL * (0.25 + 0.75 * (1 - Math.min(1, v / 900))) * (1 - 0.45 * k) * h;
    s.vx -= nx * decel;
    s.vy -= ny * decel;
    // Sideways (to the right of the direction of travel for a positive curl).
    s.vx += -ny * curl;
    s.vy += nx * curl;
    s.x += s.vx * h;
    s.y += s.vy * h;
  }
  for (let i = 0; i < stones.length; i++)
    for (let j = i + 1; j < stones.length; j++) {
      const a = stones[i]!;
      const b = stones[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= STONE_R * 2 || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (STONE_R * 2 - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue;
      const jmp = ((1 + STONE_E) * rel) / 2;
      a.vx -= jmp * nx;
      a.vy -= jmp * ny;
      b.vx += jmp * nx;
      b.vy += jmp * ny;
      hits.push(a.id, b.id);
    }
  return hits;
}

/** Stones out of play: past the back line or off the sides. */
export const outOfPlay = (s: Stone) =>
  s.y < BACK_Y - STONE_R || s.x < SHEET_L - STONE_R || s.x > SHEET_R + STONE_R;

export const moving = (stones: readonly Stone[]) => stones.some((s) => s.vx !== 0 || s.vy !== 0);

/** Points of an end: [team, points] (null when nobody is in the house). */
export function endScore(stones: readonly Stone[]): { team: Team; points: number } | null {
  const inside = stones.filter(inHouse).sort((a, b) => distToButton(a) - distToButton(b));
  if (!inside.length) return null;
  const team = inside[0]!.team;
  const other = inside.find((s) => s.team !== team);
  const limit = other ? distToButton(other) : Infinity;
  return { team, points: inside.filter((s) => s.team === team && distToButton(s) < limit).length };
}

/** Plays a throw to rest on a copy of the stones (used by the computer to plan). */
export function simulate(stones: readonly Stone[], team: Team, t: Throw): Stone[] {
  const copy = stones.map((s) => ({ ...s }));
  const id = 999;
  copy.push({
    id,
    team,
    x: HACK.x,
    y: HACK.y,
    vx: Math.sin(t.angle) * t.speed,
    vy: -Math.cos(t.angle) * t.speed,
    curl: t.curl,
  });
  for (let i = 0; i < 12 / STEP && moving(copy); i++) {
    advance(copy, STEP, 0, null);
    for (let k = copy.length - 1; k >= 0; k--) if (outOfPlay(copy[k]!)) copy.splice(k, 1);
  }
  const thrown = copy.find((s) => s.id === id);
  if (thrown && thrown.y > HOG_Y) copy.splice(copy.indexOf(thrown), 1);
  return copy;
}

/** How good the house looks for `team` (positive = good). */
export function evaluate(stones: readonly Stone[], team: Team): number {
  const r = endScore(stones);
  const best = (t: Team) =>
    Math.min(HOUSE_R * 2, ...stones.filter((s) => s.team === t && inHouse(s)).map(distToButton));
  const lead = r ? (r.team === team ? r.points : -r.points) : 0;
  return lead * 100 + (best(team === 'me' ? 'them' : 'me') - best(team)) * 0.2;
}

export type CurlEvent =
  | { type: 'hit' }
  | { type: 'out'; team: Team }
  | { type: 'hog' }
  | { type: 'rest' }
  | { type: 'end'; team: Team | null; points: number }
  | { type: 'over' };

export class CurlingSim {
  stones: Stone[] = [];
  end = 0;
  thrownMe = 0;
  thrownThem = 0;
  scores: Record<Team, number[]> = { me: [], them: [] };
  /** The team that throws last in this end (you start with it). */
  hammer: Team = 'me';
  inMotion = false;
  sweep = 0;
  over = false;
  private ids = 0;
  private lastId: number | null = null;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get total(): Record<Team, number> {
    return {
      me: this.scores.me.reduce((a, b) => a + b, 0),
      them: this.scores.them.reduce((a, b) => a + b, 0),
    };
  }

  /** Whose stone is next: the team without the hammer starts; turns alternate. */
  get turn(): Team {
    const first: Team = this.hammer === 'me' ? 'them' : 'me';
    const n = this.thrownMe + this.thrownThem;
    return n % 2 === 0 ? first : first === 'me' ? 'them' : 'me';
  }

  get score(): number {
    const t = this.total;
    const result = t.me > t.them ? 1000 : t.me === t.them ? 400 : 0;
    return t.me * 250 + result + Math.max(0, t.me - t.them) * 100;
  }

  throwStone(t: Throw): boolean {
    if (this.inMotion || this.over) return false;
    const team = this.turn;
    const id = ++this.ids;
    this.stones.push({
      id,
      team,
      x: HACK.x,
      y: HACK.y,
      vx: Math.sin(t.angle) * t.speed,
      vy: -Math.cos(t.angle) * t.speed,
      curl: t.curl,
    });
    if (team === 'me') this.thrownMe++;
    else this.thrownThem++;
    this.lastId = id;
    this.inMotion = true;
    this.sweep = 0;
    return true;
  }

  /** Rubbing the ice in front of your stone (adds to the sweep, which fades by itself). */
  brush(amount: number): void {
    if (!this.inMotion) return;
    const s = this.stones.find((x) => x.id === this.lastId);
    if (!s || s.team !== 'me') return;
    this.sweep = Math.min(1, this.sweep + amount);
  }

  get lastStone(): Stone | undefined {
    return this.stones.find((x) => x.id === this.lastId);
  }

  step(dt: number): CurlEvent[] {
    const events: CurlEvent[] = [];
    if (!this.inMotion) return events;
    this.sweep = Math.max(0, this.sweep - dt * 1.6);
    let left = dt;
    while (left > 1e-9 && this.inMotion) {
      const h = Math.min(STEP, left);
      left -= h;
      if (advance(this.stones, h, this.sweep, this.lastId).length) events.push({ type: 'hit' });
      for (let k = this.stones.length - 1; k >= 0; k--) {
        const s = this.stones[k]!;
        if (outOfPlay(s)) {
          this.stones.splice(k, 1);
          events.push({ type: 'out', team: s.team });
        }
      }
      if (!moving(this.stones)) this.rest(events);
    }
    return events;
  }

  private rest(events: CurlEvent[]): void {
    this.inMotion = false;
    const last = this.lastStone;
    if (last && last.y > HOG_Y) {
      this.stones.splice(this.stones.indexOf(last), 1);
      events.push({ type: 'hog' });
    } else events.push({ type: 'rest' });
    if (this.thrownMe >= STONES_EACH && this.thrownThem >= STONES_EACH) this.closeEnd(events);
  }

  private closeEnd(events: CurlEvent[]): void {
    const r = endScore(this.stones);
    this.scores.me.push(r?.team === 'me' ? r.points : 0);
    this.scores.them.push(r?.team === 'them' ? r.points : 0);
    events.push({ type: 'end', team: r?.team ?? null, points: r?.points ?? 0 });
    // The team that scored gives the hammer away; a blank end keeps it.
    if (r) this.hammer = r.team === 'me' ? 'them' : 'me';
  }

  /** Clears the sheet for the next end (call after showing the end's result). */
  nextEnd(): CurlEvent[] {
    this.end++;
    this.stones = [];
    this.thrownMe = this.thrownThem = 0;
    if (this.end >= ENDS) {
      this.over = true;
      return [{ type: 'over' }];
    }
    return [];
  }

  /** The computer's throw: it tries a handful of shots on a copy and keeps the best (with a wobble). */
  plan(): Throw {
    let best: { t: Throw; v: number } | null = null;
    for (const curl of [-1, 1] as const)
      for (let a = -0.12; a <= 0.1201; a += 0.03)
        for (const speed of [430, 455, 480, 520, 600, 720, 880]) {
          const t = { angle: a, speed, curl };
          const v = evaluate(simulate(this.stones, 'them', t), 'them') + this.rnd() * 6;
          if (!best || v > best.v) best = { t, v };
        }
    const t = best!.t;
    // Human-like error.
    return {
      angle: t.angle + (this.rnd() - 0.5) * 0.02,
      speed: t.speed * (1 + (this.rnd() - 0.5) * 0.04),
      curl: t.curl,
    };
  }
}
