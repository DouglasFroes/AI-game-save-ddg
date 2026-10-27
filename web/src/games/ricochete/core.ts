import type { Rnd } from '@/platform/rnd';

export const PLAY_LEFT = 50;
export const PLAY_RIGHT = 670;
export const PLAY_TOP = 210;
export const LAUNCH_Y = 1080;
export const DANGER_Y = 1010;
export const COLS = 7;
export const CELL_W = (PLAY_RIGHT - PLAY_LEFT) / COLS; // ~88.5px
export const CELL_H = 68;
export const BALL_R = 11;
export const BALL_SPEED = 980;
export const FIRE_INTERVAL = 0.065;

export interface Brick {
  id: number;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
}

export interface BonusOrb {
  id: number;
  col: number;
  row: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
}

export type RicocheteEvent =
  | { type: 'launch'; balls: number }
  | { type: 'hit'; brickId: number; x: number; y: number }
  | { type: 'break'; brickId: number; x: number; y: number }
  | { type: 'extraBall'; x: number; y: number }
  | { type: 'turnEnd'; turn: number }
  | { type: 'gameOver' };

export const brickRect = (col: number, row: number) => ({
  x: PLAY_LEFT + col * CELL_W + 4,
  y: PLAY_TOP + row * CELL_H + 4,
  w: CELL_W - 8,
  h: CELL_H - 8,
});

export const orbCenter = (col: number, row: number) => ({
  x: PLAY_LEFT + (col + 0.5) * CELL_W,
  y: PLAY_TOP + (row + 0.5) * CELL_H,
});

/** Clamp aim angle so balls can never fire nearly horizontally and get stuck. */
export function clampAimAngle(angleRad: number): number {
  const minUp = -Math.PI + 0.22; // ~ -167 deg
  const maxUp = -0.22; // ~ -13 deg
  if (angleRad > 0) {
    return angleRad < Math.PI / 2 ? maxUp : minUp;
  }
  return Math.max(minUp, Math.min(maxUp, angleRad));
}

/**
 * "Ricochete Infinito" (Ballz style): aim and fire your Growing Volley of balls.
 * After every volley returns, all rows descend 1 step and a new tougher row spawns at the top.
 */
export class RicocheteSim {
  turn = 1;
  score = 0;
  destroyed = 0;
  ballCount = 1;
  pendingExtraBalls = 0;
  launchX = (PLAY_LEFT + PLAY_RIGHT) / 2;
  nextLaunchX: number | null = null;
  phase: 'aim' | 'firing' | 'over' = 'aim';

  bricks: Brick[] = [];
  orbs: BonusOrb[] = [];
  balls: Ball[] = [];

  private nextId = 1;
  private toFire = 0;
  private fireTimer = 0;
  private fireVx = 0;
  private fireVy = 0;
  private flightElapsed = 0;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.spawnRow(1);
  }

  get dead(): boolean {
    return this.phase === 'over';
  }

  /** Fires a volley of `ballCount` balls along `angleRad`. Returns false if not in aim phase. */
  shoot(angleRad: number): RicocheteEvent[] {
    if (this.phase !== 'aim') return [];
    const clamped = clampAimAngle(angleRad);
    this.fireVx = Math.cos(clamped) * BALL_SPEED;
    this.fireVy = Math.sin(clamped) * BALL_SPEED;
    this.toFire = this.ballCount;
    this.fireTimer = 0;
    this.flightElapsed = 0;
    this.nextLaunchX = null;
    this.balls = [];
    this.phase = 'firing';
    return [{ type: 'launch', balls: this.ballCount }];
  }

  /** Fast-forwards all balls currently in flight when a turn takes long. */
  recallBalls(): RicocheteEvent[] {
    if (this.phase !== 'firing') return [];
    this.balls = [];
    this.toFire = 0;
    return this.endVolley();
  }

  step(dt: number): RicocheteEvent[] {
    const events: RicocheteEvent[] = [];
    if (this.phase !== 'firing') return events;

    // Substep physics so fast balls never tunnel through bricks
    const substeps = 3;
    const subDt = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      this.flightElapsed += subDt;
      if (this.toFire > 0) {
        this.fireTimer -= subDt;
        if (this.fireTimer <= 0) {
          this.fireTimer += FIRE_INTERVAL;
          this.toFire--;
          this.balls.push({
            x: this.launchX,
            y: LAUNCH_Y - 2,
            vx: this.fireVx,
            vy: this.fireVy,
            active: true,
          });
        }
      }

      for (const b of this.balls) {
        if (!b.active) continue;
        // Slight downward nudge after 10 seconds so horizontal bounces never loop forever
        if (this.flightElapsed > 10 && Math.abs(b.vy) < 120) {
          b.vy += 180 * subDt;
        }
        b.x += b.vx * subDt;
        b.y += b.vy * subDt;

        // Walls
        if (b.x - BALL_R < PLAY_LEFT) {
          b.x = PLAY_LEFT + BALL_R;
          b.vx = Math.abs(b.vx);
        } else if (b.x + BALL_R > PLAY_RIGHT) {
          b.x = PLAY_RIGHT - BALL_R;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y - BALL_R < PLAY_TOP) {
          b.y = PLAY_TOP + BALL_R;
          b.vy = Math.abs(b.vy);
        }

        // Floor landing
        if (b.y >= LAUNCH_Y) {
          b.y = LAUNCH_Y;
          b.active = false;
          if (this.nextLaunchX === null) {
            this.nextLaunchX = Math.max(PLAY_LEFT + 30, Math.min(PLAY_RIGHT - 30, b.x));
          }
          continue;
        }

        this.collideBricks(b, events);
        this.collideOrbs(b, events);
      }
    }

    if (this.toFire === 0 && this.balls.every((b) => !b.active)) {
      events.push(...this.endVolley());
    }

    return events;
  }

  private collideBricks(b: Ball, events: RicocheteEvent[]): void {
    for (let i = 0; i < this.bricks.length; i++) {
      const br = this.bricks[i]!;
      const rect = brickRect(br.col, br.row);
      const closestX = Math.max(rect.x, Math.min(b.x, rect.x + rect.w));
      const closestY = Math.max(rect.y, Math.min(b.y, rect.y + rect.h));
      const dx = b.x - closestX;
      const dy = b.y - closestY;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

      // Determine reflection axis
      const overlapLeft = b.x + BALL_R - rect.x;
      const overlapRight = rect.x + rect.w - (b.x - BALL_R);
      const overlapTop = b.y + BALL_R - rect.y;
      const overlapBottom = rect.y + rect.h - (b.y - BALL_R);
      const minX = Math.min(overlapLeft, overlapRight);
      const minY = Math.min(overlapTop, overlapBottom);

      if (minX < minY) {
        b.vx = overlapLeft < overlapRight ? -Math.abs(b.vx) : Math.abs(b.vx);
      } else {
        b.vy = overlapTop < overlapBottom ? -Math.abs(b.vy) : Math.abs(b.vy);
      }

      br.hp--;
      this.score += 10;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      if (br.hp <= 0) {
        this.bricks.splice(i, 1);
        this.destroyed++;
        this.score += 25;
        events.push({ type: 'break', brickId: br.id, x: cx, y: cy });
      } else {
        events.push({ type: 'hit', brickId: br.id, x: cx, y: cy });
      }
      return; // one brick collision per substep
    }
  }

  private collideOrbs(b: Ball, events: RicocheteEvent[]): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i]!;
      const c = orbCenter(orb.col, orb.row);
      if (Math.hypot(b.x - c.x, b.y - c.y) <= BALL_R + 18) {
        this.orbs.splice(i, 1);
        this.pendingExtraBalls++;
        this.score += 30;
        events.push({ type: 'extraBall', x: c.x, y: c.y });
      }
    }
  }

  private endVolley(): RicocheteEvent[] {
    const events: RicocheteEvent[] = [];
    if (this.nextLaunchX !== null) this.launchX = this.nextLaunchX;
    this.ballCount += this.pendingExtraBalls;
    this.pendingExtraBalls = 0;
    this.balls = [];

    // Advance rows downward
    for (const br of this.bricks) br.row++;
    for (const orb of this.orbs) orb.row++;
    // Remove orbs that reached the floor
    this.orbs = this.orbs.filter((o) => PLAY_TOP + (o.row + 1) * CELL_H < DANGER_Y);

    // Check danger line (row >= 11 reaches DANGER_Y)
    const breached = this.bricks.some((br) => PLAY_TOP + (br.row + 1) * CELL_H >= DANGER_Y);
    if (breached) {
      this.phase = 'over';
      events.push({ type: 'gameOver' });
      return events;
    }

    this.turn++;
    this.spawnRow(this.turn);
    this.phase = 'aim';
    events.push({ type: 'turnEnd', turn: this.turn });
    return events;
  }

  private spawnRow(turn: number): void {
    const cols = Array.from({ length: COLS }, (_, i) => i);
    for (let i = cols.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      const tmp = cols[i]!;
      cols[i] = cols[j]!;
      cols[j] = tmp;
    }

    // Always place 1 bonus ball orb per turn
    const orbCol = cols.pop()!;
    this.orbs.push({ id: this.nextId++, col: orbCol, row: 0 });

    const brickCount = Math.min(5, 2 + Math.floor(this.rnd() * 3) + (turn % 4 === 0 ? 1 : 0));
    for (let i = 0; i < brickCount && cols.length > 0; i++) {
      const col = cols.pop()!;
      const isDouble = turn >= 4 && this.rnd() < 0.22;
      const hp = isDouble ? turn * 2 : turn;
      this.bricks.push({
        id: this.nextId++,
        col,
        row: 0,
        hp,
        maxHp: hp,
      });
    }
  }
}
