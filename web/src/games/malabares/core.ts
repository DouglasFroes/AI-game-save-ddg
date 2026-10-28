export const LEFT_WALL = 58;
export const RIGHT_WALL = 662;
export const FLOOR_Y = 1090;
export const KICK_RADIUS = 115;
export const GRAVITY = 1220;

export interface JuggleBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  emoji: string;
  color: number;
}

export interface StarTarget {
  x: number;
  y: number;
}

export type MalabaresEvent =
  | { type: 'kicked'; x: number; y: number; perfect: boolean; points: number }
  | { type: 'starCollected'; x: number; y: number; points: number }
  | { type: 'newBall'; count: number }
  | { type: 'dropped'; x: number; livesLeft: number }
  | { type: 'gameOver' };

const BALL_STYLES: ReadonlyArray<{ emoji: string; color: number }> = [
  { emoji: '⚽', color: 0x38bdf8 },
  { emoji: '🏀', color: 0xf97316 },
  { emoji: '🏐', color: 0xfbbf24 },
  { emoji: '🎾', color: 0x34d399 },
];

export class MalabaresSim {
  balls: JuggleBall[] = [];
  star: StarTarget = { x: 360, y: 460 };
  lives = 3;
  score = 0;
  kicks = 0;
  maxBalls = 1;
  private nextId = 1;

  constructor() {
    this.spawnBall(360);
  }

  spawnBall(x = 220 + Math.random() * 280): JuggleBall {
    const style = BALL_STYLES[(this.nextId - 1) % BALL_STYLES.length]!;
    const ball: JuggleBall = {
      id: this.nextId++,
      x,
      y: 340,
      vx: (Math.random() - 0.5) * 180,
      vy: -180,
      emoji: style.emoji,
      color: style.color,
    };
    this.balls.push(ball);
    if (this.balls.length > this.maxBalls) this.maxBalls = this.balls.length;
    return ball;
  }

  tap(px: number, py: number): MalabaresEvent[] {
    if (this.lives <= 0) return [];
    let best: JuggleBall | null = null;
    let bestDist = KICK_RADIUS;
    for (const b of this.balls) {
      const d = Math.hypot(b.x - px, b.y - py);
      if (d <= bestDist) {
        bestDist = d;
        best = b;
      }
    }
    if (!best) return [];

    const events: MalabaresEvent[] = [];
    const perfect = best.y >= 780 && best.y <= 1030;
    best.vy = perfect ? -840 : -760;
    best.vx = Math.max(-420, Math.min(420, (best.x - px) * 5.2 + (Math.random() - 0.5) * 60));

    this.kicks++;
    const pts = (perfect ? 35 : 15) * this.balls.length;
    this.score += pts;
    events.push({ type: 'kicked', x: best.x, y: best.y, perfect, points: pts });

    if (this.kicks % 8 === 0 && this.balls.length < 4) {
      this.spawnBall();
      events.push({ type: 'newBall', count: this.balls.length });
    }

    return events;
  }

  step(dt: number): MalabaresEvent[] {
    if (this.lives <= 0) return [];
    const events: MalabaresEvent[] = [];

    for (const b of this.balls) {
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < LEFT_WALL) {
        b.x = LEFT_WALL;
        b.vx = Math.abs(b.vx) * 0.85;
      } else if (b.x > RIGHT_WALL) {
        b.x = RIGHT_WALL;
        b.vx = -Math.abs(b.vx) * 0.85;
      }

      // Check star pickup
      if (Math.hypot(b.x - this.star.x, b.y - this.star.y) < 62) {
        const sx = this.star.x;
        const sy = this.star.y;
        const pts = 100 * this.balls.length;
        this.score += pts;
        this.star = {
          x: 130 + Math.random() * 460,
          y: 340 + Math.random() * 340,
        };
        events.push({ type: 'starCollected', x: sx, y: sy, points: pts });
      }
    }

    // Check dropped balls
    for (const b of this.balls) {
      if (b.y > FLOOR_Y) {
        this.lives--;
        events.push({ type: 'dropped', x: b.x, livesLeft: this.lives });
        if (this.lives <= 0) {
          events.push({ type: 'gameOver' });
          break;
        }
        // Relaunch from top so player can keep juggling
        b.y = 340;
        b.vy = -160;
        b.vx = (Math.random() - 0.5) * 160;
      }
    }

    return events;
  }
}
