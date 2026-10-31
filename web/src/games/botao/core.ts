/**
 * "Futebol de Botão" — pure rules of Brazilian button football. Turns alternate: flick one of
 * your buttons (pull back and release) to push the ball into the robot's goal at the top. The
 * robot answers from its half. First to 2 goals wins the match; every win brings a sharper
 * robot, and the first loss ends the run.
 */
export const FIELD = { x0: 60, y0: 270, x1: 660, y1: 1170 } as const;
export const GOAL_W = 180;
export const BALL_R = 15;
export const BTN_R = 34;
export const MAX_POWER = 1500;
export const TO_WIN = 2;
const STEP = 1 / 240;
const DECEL = 380;
const DRAG = 0.9;

export interface Disc {
  readonly id: number;
  readonly team: 'me' | 'cpu' | 'ball';
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly r: number;
  readonly m: number;
}

const HOME_ME: ReadonlyArray<[number, number]> = [
  [360, 1080],
  [200, 960],
  [520, 960],
  [270, 820],
  [450, 820],
];
const goalX0 = (FIELD.x0 + FIELD.x1 - GOAL_W) / 2;
const goalX1 = goalX0 + GOAL_W;

export type ButtonEvent =
  | { type: 'goal'; by: 'me' | 'cpu' }
  | { type: 'clack' }
  | { type: 'turn'; who: 'me' | 'cpu' }
  | { type: 'match'; won: boolean };

export class ButtonMatch {
  discs: Disc[] = [];
  turn: 'me' | 'cpu' = 'me';
  goalsMe = 0;
  goalsCpu = 0;
  level = 1;
  wins = 0;
  totalGoals = 0;
  over = false;
  private moving = false;

  constructor(private readonly rng: () => number = Math.random) {
    this.kickoff();
  }

  get rolling(): boolean {
    return this.moving;
  }

  get ball(): Disc {
    return this.discs.find((d) => d.team === 'ball')!;
  }

  /** Puts everyone back in position. */
  kickoff(): void {
    let id = 0;
    const me = HOME_ME.map(([x, y]) => ({
      id: id++,
      team: 'me' as const,
      x,
      y,
      vx: 0,
      vy: 0,
      r: BTN_R,
      m: 3,
    }));
    const cpu = HOME_ME.map(([x, y]) => ({
      id: id++,
      team: 'cpu' as const,
      x,
      y: FIELD.y0 + FIELD.y1 - y,
      vx: 0,
      vy: 0,
      r: BTN_R,
      m: 3,
    }));
    this.discs = [
      ...me,
      ...cpu,
      {
        id: id++,
        team: 'ball',
        x: 360,
        y: (FIELD.y0 + FIELD.y1) / 2,
        vx: 0,
        vy: 0,
        r: BALL_R,
        m: 1,
      },
    ];
    this.moving = false;
  }

  /** The player's button under a finger. */
  pick(x: number, y: number): Disc | undefined {
    return this.discs.find((d) => d.team === 'me' && Math.hypot(d.x - x, d.y - y) <= BTN_R * 1.4);
  }

  flick(id: number, dx: number, dy: number, power: number): boolean {
    const d = this.discs.find((k) => k.id === id);
    if (!d || this.moving || this.over || d.team !== this.turn) return false;
    const len = Math.hypot(dx, dy);
    if (!len || power < 0.05) return false;
    const v = Math.min(1, power) * MAX_POWER;
    d.vx = (dx / len) * v;
    d.vy = (dy / len) * v;
    this.moving = true;
    return true;
  }

  /** The robot picks the button with the best line to the ball towards the player's goal. */
  cpuShot(): { id: number; dx: number; dy: number; power: number } {
    const ball = this.ball;
    const target = { x: 360, y: FIELD.y1 + 40 };
    let best: { id: number; dx: number; dy: number; power: number; score: number } | null = null;
    for (const d of this.discs.filter((k) => k.team === 'cpu')) {
      // Aim through the ball at the goal: hit the ball's far side.
      const gx = target.x - ball.x;
      const gy = target.y - ball.y;
      const gl = Math.hypot(gx, gy);
      const contact = {
        x: ball.x - (gx / gl) * (BTN_R + BALL_R - 4),
        y: ball.y - (gy / gl) * (BTN_R + BALL_R - 4),
      };
      const dx = contact.x - d.x;
      const dy = contact.y - d.y;
      const dist = Math.hypot(dx, dy);
      const align = (dx * gx + dy * gy) / (dist * gl || 1);
      const score = align * 2 - dist / 600;
      if (!best || score > best.score)
        best = { id: d.id, dx, dy, power: Math.min(1, 0.45 + dist / 900), score };
    }
    // Weaker robots miss by more.
    const noise = Math.max(0.03, 0.32 - this.level * 0.05);
    const a = Math.atan2(best!.dy, best!.dx) + (this.rng() - 0.5) * noise;
    return { id: best!.id, dx: Math.cos(a), dy: Math.sin(a), power: best!.power };
  }

  step(dt: number): ButtonEvent[] {
    const ev: ButtonEvent[] = [];
    if (!this.moving || this.over) return ev;
    for (let left = dt; left > 1e-9; left -= STEP) {
      const goal = this.sub(Math.min(STEP, left), ev);
      if (goal) {
        ev.push({ type: 'goal', by: goal });
        if (goal === 'me') {
          this.goalsMe++;
          this.totalGoals++;
        } else this.goalsCpu++;
        if (this.goalsMe >= TO_WIN || this.goalsCpu >= TO_WIN) {
          const won = this.goalsMe >= TO_WIN;
          if (won) this.wins++;
          else this.over = true;
          ev.push({ type: 'match', won });
        }
        this.kickoff();
        // Whoever conceded kicks off.
        this.turn = goal === 'me' ? 'cpu' : 'me';
        ev.push({ type: 'turn', who: this.turn });
        return ev;
      }
    }
    if (this.discs.every((d) => d.vx === 0 && d.vy === 0)) {
      this.moving = false;
      this.turn = this.turn === 'me' ? 'cpu' : 'me';
      ev.push({ type: 'turn', who: this.turn });
    }
    return ev;
  }

  /** Starts the next match against a sharper robot. */
  nextMatch(): void {
    this.level++;
    this.goalsMe = 0;
    this.goalsCpu = 0;
    this.turn = 'me';
    this.kickoff();
  }

  private sub(h: number, ev: ButtonEvent[]): 'me' | 'cpu' | null {
    for (const d of this.discs) {
      const sp = Math.hypot(d.vx, d.vy);
      if (!sp) continue;
      const ns = Math.max(0, sp - (DECEL + sp * DRAG) * h);
      if (ns < 6) {
        d.vx = d.vy = 0;
        continue;
      }
      d.vx *= ns / sp;
      d.vy *= ns / sp;
      d.x += d.vx * h;
      d.y += d.vy * h;
    }
    for (const d of this.discs) {
      const inMouth = d.team === 'ball' && d.x > goalX0 && d.x < goalX1;
      if (inMouth && d.y < FIELD.y0) return 'me';
      if (inMouth && d.y > FIELD.y1) return 'cpu';
      if (d.x < FIELD.x0 + d.r) {
        d.x = FIELD.x0 + d.r;
        d.vx = Math.abs(d.vx) * 0.7;
      } else if (d.x > FIELD.x1 - d.r) {
        d.x = FIELD.x1 - d.r;
        d.vx = -Math.abs(d.vx) * 0.7;
      }
      if (!inMouth && d.y < FIELD.y0 + d.r) {
        d.y = FIELD.y0 + d.r;
        d.vy = Math.abs(d.vy) * 0.7;
      } else if (!inMouth && d.y > FIELD.y1 - d.r) {
        d.y = FIELD.y1 - d.r;
        d.vy = -Math.abs(d.vy) * 0.7;
      }
    }
    for (let i = 0; i < this.discs.length; i++)
      for (let j = i + 1; j < this.discs.length; j++) {
        const a = this.discs[i]!;
        const b = this.discs[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (dist >= min || dist === 0) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const push = min - dist;
        const ta = b.m / (a.m + b.m);
        a.x -= nx * push * ta;
        a.y -= ny * push * ta;
        b.x += nx * push * (1 - ta);
        b.y += ny * push * (1 - ta);
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        const j2 = (1.9 * rel) / (1 / a.m + 1 / b.m);
        a.vx -= (j2 / a.m) * nx;
        a.vy -= (j2 / a.m) * ny;
        b.vx += (j2 / b.m) * nx;
        b.vy += (j2 / b.m) * ny;
        if (rel > 150) ev.push({ type: 'clack' });
      }
    return null;
  }

  get score(): number {
    return this.totalGoals * 100 + this.wins * 500;
  }
}
