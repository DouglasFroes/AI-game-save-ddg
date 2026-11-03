/**
 * "Esquiva" — pure rules (bullet hell). Drag to steer a tiny ship through waves of bullets;
 * grab the stars for bonus points. Aimed volleys, rings, rain and spirals, ever denser.
 */
export const FIELD = { x: 20, y: 230, w: 680, h: 1010 } as const;
export const SHIP_R = 13;
export const BULLET_R = 9;
const SHIP_SPEED = 560;

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface Star {
  x: number;
  y: number;
}

export class DodgeSim {
  x = FIELD.x + FIELD.w / 2;
  y = FIELD.y + FIELD.h * 0.75;
  bullets: Bullet[] = [];
  stars: Star[] = [];
  t = 0;
  starsGot = 0;
  alive = true;
  private fireIn = 1.5;
  private starIn = 3;
  private spiral = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  get score(): number {
    return Math.floor(this.t * 10) + this.starsGot * 50;
  }

  /** Bullet speed and volley delay get harder with time. */
  private get pace(): number {
    return Math.min(1, this.t / 70);
  }

  private shoot(x: number, y: number, angle: number, speed: number): void {
    this.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
  }

  private volley(): void {
    const sp = 200 + 170 * this.pace;
    const kind = this.rng();
    const top = FIELD.y + 10;
    if (kind < 0.3) {
      // Aimed at the ship, in a fan.
      const sx = FIELD.x + this.rng() * FIELD.w;
      const a = Math.atan2(this.y - top, this.x - sx);
      const n = 1 + Math.floor(this.pace * 3) * 1;
      for (let i = -n; i <= n; i++) this.shoot(sx, top, a + i * 0.16, sp * 1.1);
    } else if (kind < 0.55) {
      // A ring from a random point.
      const cx = FIELD.x + 80 + this.rng() * (FIELD.w - 160);
      const cy = FIELD.y + 80 + this.rng() * 360;
      const n = 12 + Math.floor(this.pace * 8);
      const off = this.rng() * Math.PI;
      for (let i = 0; i < n; i++) this.shoot(cx, cy, off + (i / n) * Math.PI * 2, sp * 0.85);
    } else if (kind < 0.8) {
      // Rain with one gap.
      const cols = 9;
      const gap = Math.floor(this.rng() * cols);
      for (let c = 0; c < cols; c++) {
        if (c !== gap && c !== gap + 1)
          this.shoot(FIELD.x + ((c + 0.5) * FIELD.w) / cols, top, Math.PI / 2, sp * 0.9);
      }
    } else {
      // Spiral arm.
      for (let i = 0; i < 8; i++) {
        this.spiral += 0.55;
        this.bullets.push({
          x: FIELD.x + FIELD.w / 2,
          y: FIELD.y + 160,
          vx: Math.cos(this.spiral) * sp * 0.8,
          vy: Math.sin(this.spiral) * sp * 0.8,
        });
      }
    }
  }

  /** Steers toward (tx, ty), moves bullets, collects stars. Returns stars collected this step. */
  step(dt: number, tx: number, ty: number): number {
    if (!this.alive) return 0;
    this.t += dt;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const move = Math.min(d, SHIP_SPEED * dt);
    if (d > 1e-6) {
      this.x += (dx / d) * move;
      this.y += (dy / d) * move;
    }
    this.x = Math.min(FIELD.x + FIELD.w - SHIP_R, Math.max(FIELD.x + SHIP_R, this.x));
    this.y = Math.min(FIELD.y + FIELD.h - SHIP_R, Math.max(FIELD.y + SHIP_R, this.y));
    this.fireIn -= dt;
    if (this.fireIn <= 0) {
      this.volley();
      this.fireIn = 1.5 - 0.9 * this.pace + this.rng() * 0.3;
    }
    this.starIn -= dt;
    if (this.starIn <= 0 && this.stars.length < 2) {
      this.stars.push({
        x: FIELD.x + 40 + this.rng() * (FIELD.w - 80),
        y: FIELD.y + 120 + this.rng() * (FIELD.h - 200),
      });
      this.starIn = 3.5;
    }
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (Math.hypot(b.x - this.x, b.y - this.y) < (SHIP_R + BULLET_R) * 0.8) this.alive = false;
    }
    this.bullets = this.bullets.filter(
      (b) =>
        b.x > FIELD.x - 40 &&
        b.x < FIELD.x + FIELD.w + 40 &&
        b.y > FIELD.y - 40 &&
        b.y < FIELD.y + FIELD.h + 40,
    );
    let got = 0;
    this.stars = this.stars.filter((s) => {
      if (Math.hypot(s.x - this.x, s.y - this.y) < 38) {
        got++;
        return false;
      }
      return true;
    });
    this.starsGot += got;
    return got;
  }
}

/** Picks, from a ring of candidate spots, the one farthest from bullets over the next instants. */
export function botTarget(s: DodgeSim): { x: number; y: number } {
  let best = { x: s.x, y: s.y };
  let bestV = -Infinity;
  const cands: Array<[number, number]> = [[0, 0]];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    cands.push([Math.cos(a) * 90, Math.sin(a) * 90], [Math.cos(a) * 200, Math.sin(a) * 200]);
  }
  for (const [ox, oy] of cands) {
    const px = Math.min(FIELD.x + FIELD.w - 20, Math.max(FIELD.x + 20, s.x + ox));
    const py = Math.min(FIELD.y + FIELD.h - 20, Math.max(FIELD.y + 20, s.y + oy));
    let danger = 0;
    for (const b of s.bullets) {
      for (const t of [0.1, 0.25, 0.4]) {
        const d = Math.hypot(b.x + b.vx * t - px, b.y + b.vy * t - py);
        if (d < 70) danger += (70 - d) * (70 - d);
      }
    }
    const travel = Math.hypot(px - s.x, py - s.y);
    const v =
      -danger -
      travel * 0.4 -
      Math.hypot(px - 360, py - 900) * 0.05 -
      (px < 60 || px > 660 ? 400 : 0);
    if (v > bestV) {
      bestV = v;
      best = { x: px, y: py };
    }
  }
  return best;
}
