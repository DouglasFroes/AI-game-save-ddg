/**
 * "Quebra-Tijolos" (Breakout-like) — pure rules. A paddle bounces balls into a wall of bricks;
 * some bricks drop power-ups. Lose every ball and you lose a life. Field is 720×1280.
 */

export type Rng = () => number;

export const W = 720;
export const TOP = 170;
export const PADDLE_Y = 1120;
export const BALL_R = 12;
const PADDLE_W = 140;
const BRICK_W = 80;
const BRICK_H = 36;
const COLS = 8;
const START_SPEED = 620;
export const START_LIVES = 3;

export type ItemKind = 'largo' | 'multi' | 'lento';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Brick {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  hp: number;
  readonly maxHp: number;
  readonly item: ItemKind | null;
}

export interface Item {
  readonly kind: ItemKind;
  x: number;
  y: number;
}

export type BrickEvent =
  | { type: 'bounce' }
  | { type: 'brick'; brick: Brick; broke: boolean }
  | { type: 'item'; kind: ItemKind }
  | { type: 'life'; lives: number }
  | { type: 'level'; level: number }
  | { type: 'over' };

export const brickSize = { w: BRICK_W, h: BRICK_H };

export class BrickSim {
  paddleX = W / 2;
  paddleW = PADDLE_W;
  balls: Ball[] = [];
  bricks: Brick[] = [];
  items: Item[] = [];
  lives = START_LIVES;
  score = 0;
  level = 1;
  /** Ball resting on the paddle until the player launches it. */
  attached = true;
  over = false;
  private wideT = 0;
  private slowT = 0;
  private ids = 0;

  constructor(private readonly rng: Rng = Math.random) {
    this.buildLevel();
    this.resetBall();
  }

  get speed(): number {
    return (START_SPEED + (this.level - 1) * 45) * (this.slowT > 0 ? 0.65 : 1);
  }

  /** Rows grow and bricks get tougher each level. */
  private buildLevel(): void {
    this.bricks = [];
    const rows = Math.min(9, 4 + this.level);
    const margin = (W - COLS * BRICK_W) / 2;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < COLS; c++) {
        // A few gaps make each level look different.
        if (this.level > 1 && this.rng() < 0.12) continue;
        const hp = Math.min(
          3,
          1 + Math.floor((rows - 1 - r) / 3) + (this.level > 3 && this.rng() < 0.2 ? 1 : 0),
        );
        const roll = this.rng();
        const item: ItemKind | null =
          roll < 0.05 ? 'multi' : roll < 0.1 ? 'largo' : roll < 0.13 ? 'lento' : null;
        this.bricks.push({
          id: ++this.ids,
          x: margin + c * BRICK_W + BRICK_W / 2,
          y: TOP + 60 + r * BRICK_H + BRICK_H / 2,
          hp,
          maxHp: hp,
          item,
        });
      }
  }

  private resetBall(): void {
    this.attached = true;
    this.balls = [{ x: this.paddleX, y: PADDLE_Y - BALL_R - 14, vx: 0, vy: 0 }];
  }

  movePaddle(x: number): void {
    this.paddleX = Math.max(this.paddleW / 2, Math.min(W - this.paddleW / 2, x));
    if (this.attached) this.balls[0]!.x = this.paddleX;
  }

  launch(): void {
    if (!this.attached || this.over) return;
    this.attached = false;
    const a = -Math.PI / 2 + (this.rng() - 0.5) * 0.5;
    this.balls[0]!.vx = Math.cos(a) * this.speed;
    this.balls[0]!.vy = Math.sin(a) * this.speed;
  }

  step(dt: number): BrickEvent[] {
    const events: BrickEvent[] = [];
    if (this.over || this.attached) return events;
    this.wideT = Math.max(0, this.wideT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.paddleW = this.wideT > 0 ? PADDLE_W * 1.6 : PADDLE_W;
    // Sub-steps so fast balls never tunnel through bricks.
    const steps = Math.ceil((this.speed * dt) / (BALL_R * 0.8));
    for (let i = 0; i < steps; i++) this.moveBalls(dt / steps, events);
    this.moveItems(dt, events);
    if (!this.balls.length) {
      this.lives--;
      events.push({ type: 'life', lives: this.lives });
      if (this.lives <= 0) {
        this.over = true;
        events.push({ type: 'over' });
      } else this.resetBall();
    }
    if (!this.bricks.length && !this.over) {
      this.score += 500 * this.level;
      this.level++;
      this.items = [];
      this.buildLevel();
      this.resetBall();
      events.push({ type: 'level', level: this.level });
    }
    return events;
  }

  private moveBalls(dt: number, events: BrickEvent[]): void {
    const speed = this.speed;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]!;
      // Keep the speed constant (slow-down power-up included).
      const v = Math.hypot(b.vx, b.vy) || 1;
      b.vx = (b.vx / v) * speed;
      b.vy = (b.vy / v) * speed;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < BALL_R || b.x > W - BALL_R) {
        b.vx = Math.abs(b.vx) * (b.x < BALL_R ? 1 : -1);
        b.x = Math.max(BALL_R, Math.min(W - BALL_R, b.x));
        events.push({ type: 'bounce' });
      }
      if (b.y < TOP + BALL_R) {
        b.vy = Math.abs(b.vy);
        events.push({ type: 'bounce' });
      }
      // Paddle: the further from the center, the sharper the angle.
      const half = this.paddleW / 2;
      if (
        b.vy > 0 &&
        b.y + BALL_R >= PADDLE_Y - 12 &&
        b.y < PADDLE_Y + 10 &&
        Math.abs(b.x - this.paddleX) <= half + BALL_R
      ) {
        const off = Math.max(-1, Math.min(1, (b.x - this.paddleX) / half));
        const a = -Math.PI / 2 + off * 1.05;
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
        b.y = PADDLE_Y - 12 - BALL_R;
        events.push({ type: 'bounce' });
      }
      if (b.y > 1300) {
        this.balls.splice(i, 1);
        continue;
      }
      this.hitBricks(b, events);
    }
  }

  private hitBricks(b: Ball, events: BrickEvent[]): void {
    for (let i = this.bricks.length - 1; i >= 0; i--) {
      const k = this.bricks[i]!;
      const dx = b.x - k.x;
      const dy = b.y - k.y;
      const px = BRICK_W / 2 + BALL_R - Math.abs(dx);
      const py = BRICK_H / 2 + BALL_R - Math.abs(dy);
      if (px <= 0 || py <= 0) continue;
      // Bounce off the side we went into the least.
      if (px < py) {
        b.vx = Math.abs(b.vx) * Math.sign(dx || 1);
        b.x += Math.sign(dx || 1) * px;
      } else {
        b.vy = Math.abs(b.vy) * Math.sign(dy || 1);
        b.y += Math.sign(dy || 1) * py;
      }
      k.hp--;
      const broke = k.hp <= 0;
      this.score += 10 * this.level;
      if (broke) {
        this.bricks.splice(i, 1);
        if (k.item) this.items.push({ kind: k.item, x: k.x, y: k.y });
      }
      events.push({ type: 'brick', brick: k, broke });
      return; // one brick per sub-step
    }
  }

  private moveItems(dt: number, events: BrickEvent[]): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.y += 260 * dt;
      const caught =
        Math.abs(it.y - PADDLE_Y) < 24 && Math.abs(it.x - this.paddleX) < this.paddleW / 2 + 20;
      if (caught) {
        this.items.splice(i, 1);
        this.apply(it.kind);
        events.push({ type: 'item', kind: it.kind });
      } else if (it.y > 1300) this.items.splice(i, 1);
    }
  }

  private apply(kind: ItemKind): void {
    if (kind === 'largo') this.wideT = 12;
    else if (kind === 'lento') this.slowT = 10;
    else {
      // Every ball splits in three.
      const extra: Ball[] = [];
      for (const b of this.balls.slice(0, 4))
        for (const turn of [-0.5, 0.5]) {
          const a = Math.atan2(b.vy, b.vx) + turn;
          extra.push({ x: b.x, y: b.y, vx: Math.cos(a), vy: Math.sin(a) });
        }
      this.balls.push(...extra);
    }
  }
}
