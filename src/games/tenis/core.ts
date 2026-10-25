/**
 * "Tênis" — pure rules of a singles tie-break against a ladder of rivals. Metres on the court:
 * x across (singles lines at ±4.115), y along (your baseline at 0, the net at 11.885, theirs at
 * 23.77), z up. You swipe to hit: direction aims, length sets the depth, speed sets the pace, and
 * the moment you swipe (ball early or late in your reach) pulls or pushes the shot.
 */
import type { Rnd } from '@/platform/rnd';

export const HALF_W = 4.115;
export const LENGTH = 23.77;
export const NET_Y = LENGTH / 2;
export const NET_H = 0.95;
export const SERVICE_DEPTH = 6.4;
const G = 9.8;
const BOUNCE_Z = 0.7;
const BOUNCE_XY = 0.82;
/** How close (m) the ball must be, along the court, to be hit. */
export const REACH_Y = 1.7;
export const REACH_X = 1.5;
export const REACH_Z = 2.7;
const MY_Y = -0.6;
/** How fast your player runs to the ball (m/s): wide balls can beat you too. */
const MY_SPEED = 5.4;
const MY_REACTION = 0.3;
const THEIR_Y = LENGTH + 0.6;

export type Side = 'me' | 'them';
export type PointReason = 'fora' | 'rede' | 'dois quiques' | 'dupla falta' | 'ace';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export type TennisEvent =
  | { type: 'hit'; by: Side; pace: number }
  | { type: 'bounce'; x: number; y: number; ok: boolean }
  | { type: 'net' }
  | { type: 'fault'; by: Side }
  | { type: 'point'; winner: Side; reason: PointReason | 'winner' }
  | { type: 'match'; winner: Side };

export const RIVALS = [
  { name: 'Juca', speed: 6, aim: 0.45, error: 0.7, pace: 0.3 },
  { name: 'Duda', speed: 6.8, aim: 0.55, error: 0.55, pace: 0.4 },
  { name: 'Rafa', speed: 7.6, aim: 0.65, error: 0.45, pace: 0.5 },
  { name: 'Nole', speed: 8.4, aim: 0.75, error: 0.35, pace: 0.6 },
  { name: 'Guga', speed: 9.2, aim: 0.85, error: 0.25, pace: 0.7 },
] as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const noise = (rnd: Rnd) => rnd() + rnd() + rnd() - 1.5;

/** Velocity that takes the ball from `from` to land on (tx, ty) at a given horizontal speed. */
export function aimAt(from: Ball, tx: number, ty: number, speed: number): Ball {
  const dx = tx - from.x;
  const dy = ty - from.y;
  const d = Math.max(0.5, Math.hypot(dx, dy));
  const t = d / speed;
  return { ...from, vx: dx / t, vy: dy / t, vz: (0.5 * G * t * t - from.z) / t };
}

/** Height of the ball when it crosses the net (null if it never does). */
export function heightAtNet(b: Ball): number | null {
  if (b.vy === 0 || (b.y - NET_Y) * b.vy > 0) return null;
  const t = (NET_Y - b.y) / b.vy;
  return b.z + b.vz * t - 0.5 * G * t * t;
}

/** Inside the singles court on the given side (serves: inside the service box). */
export function inCourt(x: number, y: number, side: Side, serve = false): boolean {
  if (Math.abs(x) > HALF_W + 0.04) return false;
  if (side === 'them') return y >= NET_Y && y <= (serve ? NET_Y + SERVICE_DEPTH : LENGTH) + 0.04;
  return y <= NET_Y && y >= (serve ? NET_Y - SERVICE_DEPTH : 0) - 0.04;
}

export interface Swing {
  /** -1 (far left) to 1 (far right). */
  readonly aim: number;
  /** 0 (short) to 1 (to the baseline). */
  readonly depth: number;
  /** 0 (soft) to 1 (a bullet). */
  readonly pace: number;
}

/** Reads a swipe (screen pixels, upward = negative dy) as a swing. */
export function swingFromSwipe(dx: number, dy: number, ms: number): Swing | null {
  if (dy > -40) return null;
  const len = Math.hypot(dx, dy);
  return {
    aim: clamp((dx / -dy) * 1.6, -1.3, 1.3),
    depth: clamp((len - 80) / 420, 0, 1.15),
    pace: clamp(((len / Math.max(40, ms)) * 1000) / 3200, 0, 1),
  };
}

export class TennisSim {
  ball: Ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  me = { x: 0, y: MY_Y };
  them = { x: 0, y: THEIR_Y };
  /** Who hit the ball last, and how many times it bounced since. */
  lastHit: Side | null = null;
  bounces = 0;
  live = false;
  serving: Side = 'me';
  serveTry = 1;
  /** True while the serve has not been returned yet. */
  isServe = false;
  /** Shots in the current point: long rallies get riskier for both players. */
  rally = 0;
  private sinceHit = 0;
  myPoints = 0;
  theirPoints = 0;
  rival = 0;
  matchesWon = 0;
  pointsWon = 0;
  winners = 0;
  aces = 0;
  over = false;
  private crossed = false;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get rivalInfo() {
    return RIVALS[Math.min(this.rival, RIVALS.length - 1)]!;
  }

  get score(): number {
    return this.pointsWon * 100 + this.matchesWon * 1000 + this.winners * 50 + this.aces * 50;
  }

  /** Server for the next point: one serve, then two each (tie-break order). */
  serverFor(pointsPlayed: number): Side {
    return Math.floor((pointsPlayed + 1) / 2) % 2 === 0 ? 'me' : 'them';
  }

  /** Puts the server in place with the ball in hand. */
  setupPoint(): void {
    this.serving = this.serverFor(this.myPoints + this.theirPoints);
    this.serveTry = 1;
    this.prepareServe();
  }

  private prepareServe(): void {
    this.live = false;
    this.isServe = true;
    this.lastHit = null;
    this.bounces = 0;
    this.crossed = false;
    this.rally = 0;
    this.me = { x: this.serving === 'me' ? 0.8 : -0.8, y: MY_Y };
    this.them = { x: this.serving === 'them' ? -0.8 : 0.8, y: THEIR_Y };
    const s = this.serving === 'me' ? this.me : this.them;
    this.ball = { x: s.x + 0.3, y: s.y, z: 1, vx: 0, vy: 0, vz: 0 };
  }

  /** Your serve: same swipe as a shot, from high above your head. */
  serve(swing: Swing): TennisEvent[] {
    if (this.live || this.serving !== 'me' || this.over) return [];
    this.ball = { ...this.ball, x: this.me.x, y: this.me.y, z: 2.7 };
    return this.launch('me', swing, true);
  }

  /** The rival serves (the scene calls it after a short pause). */
  rivalServe(): TennisEvent[] {
    if (this.live || this.serving !== 'them' || this.over) return [];
    const r = this.rivalInfo;
    // Serves are safe-ish (a double fault should be rare). Depth is measured from the net
    // towards your baseline, like every shot target.
    const tx = (this.rnd() < 0.5 ? -1 : 1) * (0.8 + this.rnd() * 2.2);
    const ty = NET_Y + 2 + this.rnd() * 3.2;
    this.ball = { ...this.ball, x: this.them.x, y: this.them.y, z: 2.7 };
    return this.shootTo(
      'them',
      tx + noise(this.rnd) * r.error * 0.3,
      ty + noise(this.rnd) * r.error * 0.3,
      17 + r.pace * 10,
    );
  }

  /** Your swing: only connects when the ball is within your reach. */
  swing(swing: Swing): TennisEvent[] {
    if (!this.live || this.lastHit === 'me' || !this.inReach('me')) return [];
    return this.launch('me', swing, false);
  }

  /** Whether the ball is where a player can hit it. */
  inReach(side: Side): boolean {
    const p = side === 'me' ? this.me : this.them;
    const b = this.ball;
    return Math.abs(b.y - p.y) < REACH_Y && Math.abs(b.x - p.x) < REACH_X && b.z < REACH_Z;
  }

  /** How well-timed a hit is now: 0 = perfect, ±1 = edge of the reach (early > 0). */
  timing(side: Side): number {
    const p = side === 'me' ? this.me : this.them;
    return clamp((side === 'me' ? this.ball.y - p.y : p.y - this.ball.y) / REACH_Y, -1, 1);
  }

  private launch(by: Side, s: Swing, serve: boolean): TennisEvent[] {
    // Early swings pull the ball across, late ones push it; harder swings spray more.
    const t = serve ? 0 : this.timing(by);
    if (!serve) this.isServe = false;
    const spread = (0.25 + s.pace * 0.75) * (1 + this.rally * 0.04);
    const tx = s.aim * HALF_W * 0.85 + t * 1.3 + noise(this.rnd) * spread;
    const far = serve ? SERVICE_DEPTH : LENGTH - NET_Y;
    const ty = NET_Y + 1.2 + s.depth * (far - 1.2) + noise(this.rnd) * spread * 0.7;
    return this.shootTo(by, tx, ty, (serve ? 18 : 13) + s.pace * 15);
  }

  private shootTo(by: Side, tx: number, ty: number, speed0: number): TennisEvent[] {
    let speed = speed0;
    const yy = by === 'me' ? ty : LENGTH - ty;
    let b = aimAt(this.ball, tx, yy, speed);
    // Players instinctively lift the ball over the net (not when going for a rocket).
    for (let i = 0; i < 5 && (by === 'them' || speed < 26); i++) {
      const h = heightAtNet(b);
      if (h === null || h >= NET_H + 0.2) break;
      speed *= 0.85;
      b = aimAt(this.ball, tx, yy, speed);
    }
    this.ball = b;
    this.live = true;
    this.lastHit = by;
    this.bounces = 0;
    this.crossed = false;
    this.rally++;
    this.sinceHit = 0;
    return [{ type: 'hit', by, pace: clamp((speed - 13) / 17, 0, 1) }];
  }

  /** Where the ball will be when it reaches row `y` (simple forward simulation). */
  predictX(y: number): number {
    const b = { ...this.ball };
    for (let i = 0; i < 400; i++) {
      if ((b.vy > 0 && b.y >= y) || (b.vy < 0 && b.y <= y)) return b.x;
      b.x += b.vx / 120;
      b.y += b.vy / 120;
      b.z += b.vz / 120;
      b.vz -= G / 120;
      if (b.z < 0 && b.vz < 0) {
        b.z = 0;
        b.vz *= -BOUNCE_Z;
        b.vx *= BOUNCE_XY;
        b.vy *= BOUNCE_XY;
      }
    }
    return b.x;
  }

  step(dt: number): TennisEvent[] {
    if (this.over) return [];
    const events: TennisEvent[] = [];
    // Players run to where the ball is going (yours a step slower than you'd like: aim wide!).
    if (this.live) {
      const toMe = this.ball.vy < 0;
      this.sinceHit += dt;
      // Nobody reads a shot instantly: the runner starts after a short reaction time.
      if (toMe && this.sinceHit > MY_REACTION)
        this.run(this.me, this.predictX(this.me.y), MY_SPEED, dt);
      else if (!toMe && this.sinceHit > 0.32 - this.rival * 0.05)
        this.run(this.them, this.predictX(this.them.y), this.rivalInfo.speed, dt);
      this.run(toMe ? this.them : this.me, 0, 3, dt);
    }
    if (!this.live) return events;
    const b = this.ball;
    const prevY = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.vz -= G * dt;
    // The net.
    if (!this.crossed && (prevY - NET_Y) * (b.y - NET_Y) <= 0 && prevY !== b.y) {
      this.crossed = true;
      if (b.z < NET_H) {
        events.push({ type: 'net' });
        return this.endPoint(events, this.lastHit === 'me' ? 'them' : 'me', 'rede');
      }
    }
    if (b.z <= 0 && b.vz < 0) {
      b.z = 0;
      b.vz = -b.vz * BOUNCE_Z;
      b.vx *= BOUNCE_XY;
      b.vy *= BOUNCE_XY;
      this.bounces++;
      const target: Side = this.lastHit === 'me' ? 'them' : 'me';
      if (this.bounces === 1) {
        const ok = this.crossed && inCourt(b.x, b.y, target, this.isServe);
        events.push({ type: 'bounce', x: b.x, y: b.y, ok });
        if (!ok) return this.endPoint(events, target, 'fora');
      } else {
        events.push({ type: 'bounce', x: b.x, y: b.y, ok: true });
        const reason = this.isServe ? 'ace' : 'dois quiques';
        return this.endPoint(events, this.lastHit!, reason);
      }
    }
    // A ball that flies past a player who could not get to it.
    const out = b.y < MY_Y - 3 || b.y > THEIR_Y + 3 || Math.abs(b.x) > 9;
    if (out && this.bounces >= 1)
      return this.endPoint(events, this.lastHit!, this.isServe ? 'ace' : 'dois quiques');
    // The rival swings when the ball comes into reach after bouncing on his side.
    // He lets the ball rise to a comfortable height, unless it is about to get past him.
    const comfy = this.ball.z > 0.6 || this.ball.y > this.them.y - 0.3;
    if (
      this.lastHit === 'me' &&
      this.bounces === 1 &&
      this.inReach('them') &&
      this.ball.vy > 0 &&
      comfy
    ) {
      events.push(...this.rivalHit());
    }
    return events;
  }

  private run(p: { x: number; y: number }, x: number, speed: number, dt: number): void {
    const d = clamp(x, -7, 7) - p.x;
    p.x += clamp(d, -speed * dt, speed * dt);
  }

  private rivalHit(): TennisEvent[] {
    const r = this.rivalInfo;
    this.isServe = false;
    // Aim away from you, sometimes; deep into your half; errors grow with his own pace.
    const away = this.me.x > 0 ? -1 : 1;
    const side = this.rnd() < r.aim ? away : this.rnd() < 0.5 ? -1 : 1;
    const pressure = 1 + this.rally * 0.07;
    const tx = side * (1.6 + this.rnd() * 1.8) + noise(this.rnd) * r.error * pressure;
    const ty = NET_Y + 3 + this.rnd() * 7.5 + noise(this.rnd) * r.error * pressure;
    return this.shootTo('them', tx, ty, 14 + r.pace * 12 + this.rnd() * 3);
  }

  private endPoint(
    events: TennisEvent[],
    winner: Side,
    reason: PointReason | 'winner',
  ): TennisEvent[] {
    this.live = false;
    // A serve that misses gets a second try.
    if (
      this.isServe &&
      this.lastHit === this.serving &&
      (reason === 'fora' || reason === 'rede') &&
      this.serveTry === 1
    ) {
      this.serveTry = 2;
      events.push({ type: 'fault', by: this.serving });
      this.prepareServe();
      this.serveTry = 2;
      return events;
    }
    const why: PointReason | 'winner' =
      this.isServe && (reason === 'fora' || reason === 'rede') ? 'dupla falta' : reason;
    events.push({ type: 'point', winner, reason: why });
    if (winner === 'me') {
      this.myPoints++;
      this.pointsWon++;
      if (why === 'ace') this.aces++;
      else if (why === 'dois quiques') this.winners++;
    } else this.theirPoints++;
    const a = this.myPoints;
    const b = this.theirPoints;
    if ((a >= 7 || b >= 7) && Math.abs(a - b) >= 2) {
      const w: Side = a > b ? 'me' : 'them';
      events.push({ type: 'match', winner: w });
      if (w === 'me') {
        this.matchesWon++;
        this.rival++;
        this.myPoints = this.theirPoints = 0;
        if (this.rival >= RIVALS.length) this.over = true;
      } else this.over = true;
    }
    return events;
  }
}
