/**
 * "Sumô" — pure rules. Slide your disc into rivals to knock them off a ring that keeps shrinking.
 * Swipe to dash (it needs a moment to recharge). Clear a wave to face a bigger one.
 */
export const CENTER = { x: 360, y: 720 } as const;
const START_R = 340;
const MIN_R = 190;
export const PLAYER_R = 40;
export const ENEMY_R = 36;

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alive: boolean;
  /** Seconds until it can dash again. */
  cd: number;
}

export class SumoSim {
  player: Body = { x: CENTER.x, y: CENTER.y + 120, vx: 0, vy: 0, r: PLAYER_R, alive: true, cd: 0 };
  enemies: Body[] = [];
  wave = 0;
  knocked = 0;
  t = 0;
  /** Seconds into the current wave (the ring shrinks with it). */
  waveT = 0;
  score = 0;
  /** Set for one step when a wave has just been cleared. */
  cleared = false;

  constructor(private readonly rng: () => number = Math.random) {
    this.nextWave();
  }

  get ring(): number {
    return Math.max(MIN_R, START_R - this.waveT * 5);
  }

  get alive(): boolean {
    return this.player.alive;
  }

  nextWave(): void {
    this.wave++;
    this.waveT = 0;
    const n = Math.min(5, 1 + Math.ceil(this.wave / 2));
    this.enemies = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + this.rng() * 0.5 - Math.PI / 2;
      return {
        x: CENTER.x + Math.cos(a) * 190,
        y: CENTER.y + Math.sin(a) * 190,
        vx: 0,
        vy: 0,
        r: ENEMY_R,
        alive: true,
        cd: 0.8 + this.rng() * 1.2,
      };
    });
    this.player.x = CENTER.x;
    this.player.y = CENTER.y + 120;
    this.player.vx = this.player.vy = 0;
  }

  /** Dashes the player toward a direction. */
  dash(dx: number, dy: number): boolean {
    const p = this.player;
    const d = Math.hypot(dx, dy);
    if (!p.alive || p.cd > 0 || d < 1e-6) return false;
    p.vx = (dx / d) * 880;
    p.vy = (dy / d) * 880;
    p.cd = 0.55;
    return true;
  }

  step(dt: number): void {
    if (!this.player.alive) return;
    this.t += dt;
    this.waveT += dt;
    this.cleared = false;
    const all = [this.player, ...this.enemies.filter((e) => e.alive)];
    for (const b of all) {
      b.cd = Math.max(0, b.cd - dt);
      const f = Math.exp(-1.7 * dt);
      b.vx *= f;
      b.vy *= f;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    for (const e of this.enemies) {
      if (!e.alive || e.cd > 0) continue;
      const edge = Math.hypot(e.x - CENTER.x, e.y - CENTER.y);
      const sloppy = Math.max(0, 0.5 - this.wave * 0.05);
      let tx = this.player.x + (this.rng() - 0.5) * 300 * sloppy;
      let ty = this.player.y + (this.rng() - 0.5) * 300 * sloppy;
      if (edge > this.ring - 90) {
        tx = CENTER.x;
        ty = CENTER.y;
      }
      const d = Math.hypot(tx - e.x, ty - e.y) || 1;
      const sp = 620 + 35 * this.wave;
      e.vx = ((tx - e.x) / d) * sp;
      e.vy = ((ty - e.y) / d) * sp;
      e.cd = Math.max(0.9, 1.9 - 0.1 * this.wave) + this.rng() * 0.5;
    }
    // Pairwise elastic collisions between equal masses.
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min || d < 1e-6) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = (min - d) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const kick = -rel * 1.05;
          a.vx -= nx * kick;
          a.vy -= ny * kick;
          b.vx += nx * kick;
          b.vy += ny * kick;
        }
      }
    }
    for (const b of all) {
      if (Math.hypot(b.x - CENTER.x, b.y - CENTER.y) > this.ring + b.r * 0.6) {
        b.alive = false;
        if (b !== this.player) {
          this.knocked++;
          this.score += 100 * this.wave;
        }
      }
    }
    if (this.player.alive && this.enemies.every((e) => !e.alive)) {
      this.score += 150;
      this.cleared = true;
      this.nextWave();
    }
  }
}

/** Dashes at the nearest rival, or back toward the middle when near the edge. */
export function botAct(s: SumoSim): void {
  const p = s.player;
  if (p.cd > 0) return;
  const edge = Math.hypot(p.x - CENTER.x, p.y - CENTER.y);
  if (edge > s.ring - 110) {
    s.dash(CENTER.x - p.x, CENTER.y - p.y);
    return;
  }
  let best: Body | null = null;
  let bestD = Infinity;
  for (const e of s.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (e.alive && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  if (best && bestD < 330) s.dash(best.x - p.x, best.y - p.y);
}
