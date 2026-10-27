import type { Rnd } from '@/platform/rnd';

export const BALL_R = 14;
const GRAVITY = 1500;
const SUBSTEPS = 8;
const MAX_SPEED = 2600;

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Thickness of the capsule around the segment. */
  r: number;
  kind: 'wall' | 'sling' | 'target';
  /** Index of the target for `kind: 'target'`. */
  index?: number;
}

export interface Bumper {
  x: number;
  y: number;
  r: number;
  /** Seconds since the last hit, for the flash effect. */
  lit: number;
}

export interface Flipper {
  px: number;
  py: number;
  len: number;
  /** +1 for the left flipper, -1 for the right. */
  side: 1 | -1;
  /** Current angle in radians (positive points down). */
  angle: number;
  pressed: boolean;
  /** Angular speed in rad/s over the last frame, used for the contact velocity. */
  omega: number;
}

export const FLIP_REST = 0.5;
export const FLIP_UP = -0.5;
const FLIP_SPEED = 13;
const FLIP_R = 11;
export const LANE_X = 646;
export const LANE_START_Y = 1196;
export const DRAIN_Y = 1290;

export type PinballEvent =
  | { type: 'launch' }
  | { type: 'wall'; speed: number }
  | { type: 'bumper'; index: number; x: number; y: number; points: number }
  | { type: 'sling'; points: number }
  | { type: 'target'; index: number; points: number }
  | { type: 'targetsDone'; multi: number; points: number }
  | { type: 'flip'; side: 1 | -1 }
  | { type: 'save' }
  | { type: 'drain'; ballsLeft: number }
  | { type: 'gameOver' };

function buildSegments(): Seg[] {
  const segs: Seg[] = [];
  const add = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    kind: Seg['kind'] = 'wall',
    r = 6,
    index?: number,
  ) => segs.push({ ax, ay, bx, by, r, kind, index });

  // Top arc: an ellipse from the left wall over to the right wall.
  const cx = 360;
  const cy = 430;
  const rx = 310;
  const ry = 240;
  let prev = { x: cx - rx, y: cy };
  for (let i = 1; i <= 24; i++) {
    const a = Math.PI + (Math.PI * i) / 24;
    const p = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    add(prev.x, prev.y, p.x, p.y);
    prev = p;
  }
  add(50, 430, 50, 980); // left wall
  add(670, 430, 670, DRAIN_Y); // right wall (outer edge of the plunger lane)
  add(LANE_X - 24, 600, LANE_X - 24, DRAIN_Y); // lane divider
  add(LANE_X - 24, DRAIN_Y, 670, DRAIN_Y); // lane floor
  // Inlane guides funnelling the ball to the flippers.
  add(50, 980, 186 - 30, 1090);
  add(LANE_X - 24, 980, 486 + 30, 1090);
  // Slingshots.
  add(112, 900, 160, 1010, 'sling', 8);
  add(560, 900, 512, 1010, 'sling', 8);
  // Drop targets.
  [185, 290, 382, 487].forEach((x, i) => add(x - 28, 700, x + 28, 700, 'target', 10, i));
  return segs;
}

/** Closest point on segment AB to P. */
function closest(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return { x: ax + dx * t, y: ay + dy * t };
}

/**
 * "Pinball Neon": a small table with bumpers, slingshots, drop targets, two flippers, a plunger lane
 * and three balls. All the physics is circle-versus-capsule with a few substeps per frame.
 */
export class PinballSim {
  segs = buildSegments();
  bumpers: Bumper[] = [
    { x: 250, y: 500, r: 38, lit: 9 },
    { x: 430, y: 500, r: 38, lit: 9 },
    { x: 340, y: 380, r: 38, lit: 9 },
  ];
  flippers: Flipper[] = [
    { px: 186, py: 1120, len: 135, side: 1, angle: FLIP_REST, pressed: false, omega: 0 },
    { px: 486, py: 1120, len: 135, side: -1, angle: FLIP_REST, pressed: false, omega: 0 },
  ];
  targetsDown = [false, false, false, false];
  ball = { x: LANE_X, y: LANE_START_Y, vx: 0, vy: 0 };
  state: 'plunger' | 'play' | 'over' = 'plunger';
  ballsLeft = 3;
  multi = 1;
  maxMulti = 1;
  score = 0;
  /** Seconds of ball-save remaining for the current ball. */
  saveTime = 0;
  time = 0;
  slingLit = [9, 9];

  constructor(private readonly rnd: Rnd = Math.random) {}

  press(side: 1 | -1, down: boolean): PinballEvent[] {
    const f = this.flippers[side === 1 ? 0 : 1]!;
    const was = f.pressed;
    f.pressed = down;
    return down && !was ? [{ type: 'flip', side }] : [];
  }

  /** Launches the ball from the plunger lane. */
  launch(power = 0.85): PinballEvent[] {
    if (this.state !== 'plunger') return [];
    const jitter = (this.rnd() - 0.5) * 0.06;
    this.ball = {
      x: LANE_X,
      y: LANE_START_Y,
      vx: 0,
      vy: -(1800 + 650 * Math.min(1, power + jitter)),
    };
    this.state = 'play';
    this.saveTime = 9;
    return [{ type: 'launch' }];
  }

  step(dt: number): PinballEvent[] {
    if (this.state === 'over') return [];
    const events: PinballEvent[] = [];
    this.time += dt;
    this.saveTime = Math.max(0, this.saveTime - dt);
    for (const b of this.bumpers) b.lit += dt;
    this.slingLit = this.slingLit.map((v) => v + dt);

    for (const f of this.flippers) {
      const target = f.pressed ? FLIP_UP : FLIP_REST;
      const d = target - f.angle;
      const stepA = FLIP_SPEED * dt;
      const before = f.angle;
      f.angle = Math.abs(d) <= stepA ? target : f.angle + Math.sign(d) * stepA;
      f.omega = (f.angle - before) / dt;
    }
    if (this.state !== 'play') return events;

    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS && this.state === 'play'; i++) this.substep(h, events);
    return events;
  }

  private flipperTip(f: Flipper): { x: number; y: number } {
    return { x: f.px + f.side * Math.cos(f.angle) * f.len, y: f.py + Math.sin(f.angle) * f.len };
  }

  private substep(h: number, events: PinballEvent[]): void {
    const b = this.ball;
    b.vy += GRAVITY * h;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_SPEED) {
      b.vx *= MAX_SPEED / sp;
      b.vy *= MAX_SPEED / sp;
    }
    b.x += b.vx * h;
    b.y += b.vy * h;

    for (const s of this.segs) {
      if (s.kind === 'target' && this.targetsDown[s.index!]) continue;
      const c = closest(s.ax, s.ay, s.bx, s.by, b.x, b.y);
      this.collide(c.x, c.y, s.r, 0, 0, s.kind === 'sling' ? 0.4 : 0.5, events, s);
    }

    this.bumpers.forEach((bp, i) => {
      const dx = b.x - bp.x;
      const dy = b.y - bp.y;
      const d = Math.hypot(dx, dy);
      if (d >= bp.r + BALL_R || d === 0) return;
      const nx = dx / d;
      const ny = dy / d;
      b.x = bp.x + nx * (bp.r + BALL_R);
      b.y = bp.y + ny * (bp.r + BALL_R);
      const vn = b.vx * nx + b.vy * ny;
      // Always kick away at a healthy speed, regardless of how softly the ball arrived.
      const out = Math.max(780, -vn * 1.1);
      b.vx += (out - vn) * nx;
      b.vy += (out - vn) * ny;
      bp.lit = 0;
      const points = 100 * this.multi;
      this.score += points;
      events.push({ type: 'bumper', index: i, x: bp.x, y: bp.y, points });
    });

    for (const f of this.flippers) {
      const tip = this.flipperTip(f);
      const c = closest(f.px, f.py, tip.x, tip.y, b.x, b.y);
      // Velocity of the contact point: ω × r about the pivot (the right flipper is mirrored).
      const rx = c.x - f.px;
      const ry = c.y - f.py;
      this.collide(
        c.x,
        c.y,
        FLIP_R,
        f.omega * f.side * -ry,
        f.omega * f.side * rx,
        0.35,
        events,
        null,
      );
    }

    if (b.y > DRAIN_Y - 8 && b.x < LANE_X - 24) this.drain(events);
    else if (b.y > DRAIN_Y + 40) this.drain(events);
  }

  private collide(
    cx: number,
    cy: number,
    r: number,
    surfVx: number,
    surfVy: number,
    restitution: number,
    events: PinballEvent[],
    seg: Seg | null,
  ): void {
    const b = this.ball;
    const dx = b.x - cx;
    const dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    const min = BALL_R + r;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    b.x = cx + nx * min;
    b.y = cy + ny * min;
    const vn = (b.vx - surfVx) * nx + (b.vy - surfVy) * ny;
    if (vn >= 0) return;
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;
    if (!seg) return;
    if (seg.kind === 'sling') {
      // Slingshots punch the ball back out.
      b.vx += nx * 420;
      b.vy += ny * 420;
      const points = 25 * this.multi;
      this.score += points;
      this.slingLit[seg.ax < 360 ? 0 : 1] = 0;
      events.push({ type: 'sling', points });
    } else if (seg.kind === 'target') {
      this.targetsDown[seg.index!] = true;
      const points = 250 * this.multi;
      this.score += points;
      events.push({ type: 'target', index: seg.index!, points });
      if (this.targetsDown.every(Boolean)) {
        this.multi = Math.min(8, this.multi + 1);
        this.maxMulti = Math.max(this.maxMulti, this.multi);
        const bonus = 1000 * this.multi;
        this.score += bonus;
        this.targetsDown = [false, false, false, false];
        events.push({ type: 'targetsDone', multi: this.multi, points: bonus });
      }
    } else if (-vn > 450) {
      events.push({ type: 'wall', speed: -vn });
    }
  }

  private drain(events: PinballEvent[]): void {
    if (this.saveTime > 0) {
      this.ball = { x: LANE_X, y: LANE_START_Y, vx: 0, vy: 0 };
      this.state = 'plunger';
      events.push({ type: 'save' });
      return;
    }
    this.ballsLeft--;
    this.multi = 1;
    events.push({ type: 'drain', ballsLeft: this.ballsLeft });
    if (this.ballsLeft <= 0) {
      this.state = 'over';
      events.push({ type: 'gameOver' });
    } else {
      this.ball = { x: LANE_X, y: LANE_START_Y, vx: 0, vy: 0 };
      this.state = 'plunger';
    }
  }
}
