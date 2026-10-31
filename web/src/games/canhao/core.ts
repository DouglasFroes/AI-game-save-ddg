/**
 * "Canhão" — pure rules (Ball Blast style). A cannon slides along the floor and fires
 * non-stop. Numbered rocks bounce around; each hit takes one off the number, and a rock at zero
 * splits into two smaller ones. A rock touching the cannon ends the run. Every wave cleared
 * makes the cannon fire faster — and the rocks tougher.
 */
export const LEFT = 40;
export const RIGHT = 680;
export const FLOOR = 1080;
export const CANNON_W = 90;
export const CANNON_H = 70;
const GRAVITY = 520;

export interface Rock {
  readonly id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  /** 3 = big, 2 = medium, 1 = small. */
  readonly size: 1 | 2 | 3;
}

export interface Bullet {
  x: number;
  y: number;
}

export const rockRadius = (size: Rock['size']): number => (size === 3 ? 68 : size === 2 ? 48 : 32);

export type BlastEvent =
  | { type: 'split'; rock: Rock }
  | { type: 'pop'; rock: Rock }
  | { type: 'wave'; wave: number }
  | { type: 'dead' };

export class BlastSim {
  cannonX = 360;
  targetX = 360;
  rocks: Rock[] = [];
  bullets: Bullet[] = [];
  wave = 1;
  score = 0;
  alive = true;
  private cooldown = 0;
  private nextId = 0;
  private toSpawn = 0;
  private spawnIn = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.startWave();
  }

  /** Shots per second. */
  get fireRate(): number {
    return Math.min(22, 7 + this.wave * 1.2);
  }

  private startWave(): void {
    this.toSpawn = Math.min(6, 1 + Math.floor(this.wave / 2));
    this.spawnIn = 0.6;
  }

  private spawnRock(): void {
    const size: Rock['size'] = this.wave < 3 ? 2 : this.rng() < 0.5 ? 3 : 2;
    const fromLeft = this.rng() < 0.5;
    this.rocks.push({
      id: this.nextId++,
      x: fromLeft ? LEFT + 70 : RIGHT - 70,
      y: 330,
      vx: (fromLeft ? 1 : -1) * (90 + this.rng() * 60),
      vy: 0,
      hp: Math.round((10 + this.wave * 9) * (size === 3 ? 1.6 : 1) * (0.7 + this.rng() * 0.6)),
      size,
    });
  }

  aim(x: number): void {
    this.targetX = Math.max(LEFT + CANNON_W / 2, Math.min(RIGHT - CANNON_W / 2, x));
  }

  step(dt: number): BlastEvent[] {
    const ev: BlastEvent[] = [];
    if (!this.alive) return ev;
    this.cannonX += (this.targetX - this.cannonX) * Math.min(1, dt * 18);

    this.spawnIn -= dt;
    if (this.toSpawn > 0 && this.spawnIn <= 0) {
      this.toSpawn--;
      this.spawnIn = 2.2;
      this.spawnRock();
    }

    this.cooldown -= dt;
    while (this.cooldown <= 0) {
      this.cooldown += 1 / this.fireRate;
      this.bullets.push({ x: this.cannonX, y: FLOOR - CANNON_H });
    }
    for (const b of this.bullets) b.y -= 1500 * dt;
    this.bullets = this.bullets.filter((b) => b.y > 200);

    for (const r of [...this.rocks]) {
      const rad = rockRadius(r.size);
      r.vy += GRAVITY * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (r.x < LEFT + rad || r.x > RIGHT - rad) {
        r.vx = -r.vx;
        r.x = Math.max(LEFT + rad, Math.min(RIGHT - rad, r.x));
      }
      if (r.y > FLOOR - rad) {
        r.y = FLOOR - rad;
        // Bounce back up to a fixed height per size, so the rhythm is readable.
        r.vy = -Math.sqrt(2 * GRAVITY * (r.size === 3 ? 640 : r.size === 2 ? 540 : 440));
      }
      // Bullets.
      for (const b of this.bullets) {
        if (b.y < 0 || Math.hypot(b.x - r.x, b.y - r.y) > rad) continue;
        b.y = -1;
        r.hp--;
        this.score++;
        if (r.hp <= 0) break;
      }
      if (r.hp <= 0) {
        this.rocks.splice(this.rocks.indexOf(r), 1);
        if (r.size > 1) {
          const size = (r.size - 1) as Rock['size'];
          const hp = Math.max(3, Math.round((10 + this.wave * 9) * (size === 2 ? 0.7 : 0.45)));
          for (const dir of [-1, 1])
            this.rocks.push({
              id: this.nextId++,
              x: r.x,
              y: r.y,
              vx: dir * 140,
              vy: -380,
              hp,
              size,
            });
          ev.push({ type: 'split', rock: r });
        } else ev.push({ type: 'pop', rock: r });
        this.score += 10 * r.size * this.wave;
        continue;
      }
      // The cannon (a box on the floor).
      const cx = Math.max(this.cannonX - CANNON_W / 2, Math.min(this.cannonX + CANNON_W / 2, r.x));
      const cy = Math.max(FLOOR - CANNON_H, Math.min(FLOOR, r.y));
      if (Math.hypot(cx - r.x, cy - r.y) < rad - 4) {
        this.alive = false;
        ev.push({ type: 'dead' });
        return ev;
      }
    }
    this.bullets = this.bullets.filter((b) => b.y >= 0);

    if (this.toSpawn === 0 && this.rocks.length === 0) {
      this.wave++;
      ev.push({ type: 'wave', wave: this.wave });
      this.startWave();
    }
    return ev;
  }
}
