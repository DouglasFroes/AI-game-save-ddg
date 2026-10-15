/**
 * "Pula Cor" (Color Switch-like) — pure rules. Tap to hop up. Spinning rings and sliding bars
 * are split in four colors: the ball may only cross the part that has its own color. Switchers
 * change the ball's color; a star sits in every obstacle. World y grows upwards.
 */

export type Rng = () => number;

export const COLORS = 4;
const GRAVITY = 2100;
const HOP = 820;
export const BALL_R = 16;
/** Distance between obstacles; the color switcher sits halfway, with room on both sides. */
const GAP = 700;
export const SWITCH_OFFSET = GAP / 2;
const BAR_W = 720;

export interface Obstacle {
  readonly id: number;
  readonly kind: 'ring' | 'bar';
  readonly y: number;
  /** Ring: radius and thickness; bar: thickness. */
  readonly r: number;
  readonly thick: number;
  /** Spin (rings, rad/s) or slide (bars, px/s). */
  speed: number;
  angle: number;
  star: boolean;
  /** Switcher (above the obstacle) still there. */
  switcher: boolean;
}

export type ColorEvent =
  | { type: 'hop' }
  | { type: 'star'; score: number }
  | { type: 'switch'; color: number }
  | { type: 'over'; reason: 'color' | 'fall' };

const TAU = Math.PI * 2;

/** Which color a ring shows at screen angle `a` (rotation applied). */
export const ringColorAt = (a: number, rotation: number): number =>
  Math.floor(((((a - rotation) % TAU) + TAU) % TAU) / (TAU / COLORS)) % COLORS;

/** Which color a sliding bar shows at x (it scrolls by `offset` pixels). */
export const barColorAt = (x: number, offset: number): number =>
  Math.floor(((((x - offset) % BAR_W) + BAR_W) % BAR_W) / (BAR_W / COLORS)) % COLORS;

export class ColorSim {
  y = 0;
  vy = 0;
  color = 0;
  score = 0;
  started = false;
  over: 'color' | 'fall' | null = null;
  top = 0;
  readonly obstacles: Obstacle[] = [];
  private ids = 0;
  private nextY = 600;

  constructor(private readonly rng: Rng = Math.random) {
    this.color = Math.floor(this.rng() * COLORS);
    this.fill();
  }

  /** Bottom of the visible window. */
  get camera(): number {
    return Math.max(0, this.top - 500);
  }

  private fill(): void {
    while (this.nextY < this.top + 2000) {
      const level = this.obstacles.length;
      const ring = level < 2 || this.rng() < 0.7;
      const speed = (1.2 + Math.min(1.6, level * 0.08)) * (this.rng() < 0.5 ? -1 : 1);
      this.obstacles.push({
        id: ++this.ids,
        kind: ring ? 'ring' : 'bar',
        y: this.nextY,
        r: ring ? 190 - Math.min(40, level * 2) : 0,
        thick: ring ? 26 : 30,
        speed: ring ? speed : speed * 140,
        angle: this.rng() * TAU,
        star: true,
        switcher: true,
      });
      this.nextY += GAP;
    }
  }

  hop(): ColorEvent[] {
    if (this.over) return [];
    this.started = true;
    this.vy = HOP;
    return [{ type: 'hop' }];
  }

  step(dt: number): ColorEvent[] {
    if (this.over || !this.started) return [];
    const events: ColorEvent[] = [];
    const prev = this.y;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    this.top = Math.max(this.top, this.y);
    for (const o of this.obstacles) o.angle += o.speed * dt;

    for (const o of this.obstacles) {
      // Star in the middle of each obstacle.
      if (o.star && Math.abs(this.y - o.y) < 30) {
        o.star = false;
        this.score++;
        events.push({ type: 'star', score: this.score });
      }
      // Switcher above it: picks a new color.
      const sy = o.y + SWITCH_OFFSET;
      if (o.switcher && Math.abs(this.y - sy) < 28) {
        o.switcher = false;
        let c = this.color;
        while (c === this.color) c = Math.floor(this.rng() * COLORS);
        this.color = c;
        events.push({ type: 'switch', color: c });
      }
      if (this.touchesWrongColor(o, prev)) {
        this.over = 'color';
        events.push({ type: 'over', reason: 'color' });
        return events;
      }
    }
    if (this.y < this.camera - 80) {
      this.over = 'fall';
      events.push({ type: 'over', reason: 'fall' });
    }
    this.fill();
    for (let i = this.obstacles.length - 1; i >= 0; i--)
      if (this.obstacles[i]!.y < this.camera - 600) this.obstacles.splice(i, 1);
    return events;
  }

  /** The ball (at x = center) overlapping a band of another color. */
  private touchesWrongColor(o: Obstacle, prev: number): boolean {
    const bands: { y: number; color: number }[] = [];
    if (o.kind === 'ring') {
      // Top (screen up = world +y) and bottom crossings of the ring.
      bands.push({ y: o.y + o.r, color: ringColorAt(-Math.PI / 2, o.angle) });
      bands.push({ y: o.y - o.r, color: ringColorAt(Math.PI / 2, o.angle) });
    } else bands.push({ y: o.y, color: barColorAt(360, o.angle) });
    for (const b of bands) {
      const lo = Math.min(prev, this.y) - BALL_R;
      const hi = Math.max(prev, this.y) + BALL_R;
      const half = o.thick / 2;
      if (hi >= b.y - half && lo <= b.y + half && b.color !== this.color) return true;
    }
    return false;
  }
}
