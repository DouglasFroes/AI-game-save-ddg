export const ARENA_LEFT = 30;
export const ARENA_RIGHT = 690;
export const ARENA_TOP = 240;
export const ARENA_BOTTOM = 1090;

export interface Rock {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: 1 | 2 | 3;
  radius: number;
}

export interface LaserBolt {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export type AsteroidEvent =
  | { type: 'rockSplit'; x: number; y: number; size: 1 | 2 | 3; points: number }
  | { type: 'shipHit'; x: number; y: number; livesLeft: number }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'gameOver' };

const SIZE_RADIUS: Record<1 | 2 | 3, number> = { 3: 48, 2: 30, 1: 18 };
const SIZE_POINTS: Record<1 | 2 | 3, number> = { 3: 60, 2: 110, 1: 170 };

export class AsteroidesSim {
  shipX = 360;
  shipY = 665;
  shipVx = 0;
  shipVy = 0;
  shipAngle = -Math.PI / 2;
  invuln = 1.5;
  lives = 3;
  score = 0;
  rocksDestroyed = 0;
  wave = 1;
  rocks: Rock[] = [];
  bolts: LaserBolt[] = [];
  private nextId = 1;
  private fireCooldown = 0;

  constructor() {
    this.spawnWave(1);
  }

  spawnWave(wave: number): void {
    this.wave = wave;
    this.rocks = [];
    const count = 3 + Math.min(5, wave);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.3;
      const x = 360 + Math.cos(a) * 260;
      const y = 665 + Math.sin(a) * 290;
      const speed = 75 + wave * 12;
      const dir = a + Math.PI / 2 + (i % 2 === 0 ? 0.4 : -0.4);
      this.rocks.push({
        id: this.nextId++,
        x,
        y,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        size: 3,
        radius: SIZE_RADIUS[3],
      });
    }
  }

  aimAndFire(targetX: number, targetY: number): boolean {
    this.shipAngle = Math.atan2(targetY - this.shipY, targetX - this.shipX);
    return this.fire();
  }

  fire(): boolean {
    if (this.fireCooldown > 0 || this.lives <= 0) return false;
    this.fireCooldown = 0.16;
    const speed = 640;
    this.bolts.push({
      id: this.nextId++,
      x: this.shipX + Math.cos(this.shipAngle) * 26,
      y: this.shipY + Math.sin(this.shipAngle) * 26,
      vx: Math.cos(this.shipAngle) * speed,
      vy: Math.sin(this.shipAngle) * speed,
      life: 1.05,
    });
    return true;
  }

  thrust(): void {
    this.shipVx += Math.cos(this.shipAngle) * 210;
    this.shipVy += Math.sin(this.shipAngle) * 210;
    const speed = Math.hypot(this.shipVx, this.shipVy);
    if (speed > 340) {
      this.shipVx = (this.shipVx / speed) * 340;
      this.shipVy = (this.shipVy / speed) * 340;
    }
  }

  private wrap(x: number, y: number): { x: number; y: number } {
    const w = ARENA_RIGHT - ARENA_LEFT;
    const h = ARENA_BOTTOM - ARENA_TOP;
    let nx = x;
    let ny = y;
    if (nx < ARENA_LEFT) nx += w;
    else if (nx > ARENA_RIGHT) nx -= w;
    if (ny < ARENA_TOP) ny += h;
    else if (ny > ARENA_BOTTOM) ny -= h;
    return { x: nx, y: ny };
  }

  step(dt: number): AsteroidEvent[] {
    if (this.lives <= 0) return [];
    const events: AsteroidEvent[] = [];

    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    // Move ship with gentle space drag
    this.shipX += this.shipVx * dt;
    this.shipY += this.shipVy * dt;
    this.shipVx *= Math.pow(0.45, dt);
    this.shipVy *= Math.pow(0.45, dt);
    const wrappedShip = this.wrap(this.shipX, this.shipY);
    this.shipX = wrappedShip.x;
    this.shipY = wrappedShip.y;

    // Move bolts
    for (const b of this.bolts) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const wb = this.wrap(b.x, b.y);
      b.x = wb.x;
      b.y = wb.y;
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);

    // Move rocks
    for (const r of this.rocks) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      const wr = this.wrap(r.x, r.y);
      r.x = wr.x;
      r.y = wr.y;
    }

    // Bolts vs Rocks
    const usedBolts = new Set<number>();
    const deadRocks = new Set<number>();
    const spawned: Rock[] = [];

    for (const b of this.bolts) {
      if (usedBolts.has(b.id)) continue;
      for (const r of this.rocks) {
        if (deadRocks.has(r.id)) continue;
        if (Math.hypot(b.x - r.x, b.y - r.y) <= r.radius + 8) {
          usedBolts.add(b.id);
          deadRocks.add(r.id);
          const pts = SIZE_POINTS[r.size];
          this.score += pts;
          this.rocksDestroyed++;
          events.push({ type: 'rockSplit', x: r.x, y: r.y, size: r.size, points: pts });

          if (r.size > 1) {
            const nextSize = (r.size - 1) as 1 | 2;
            const baseAngle = Math.atan2(r.vy, r.vx);
            const speed = Math.hypot(r.vx, r.vy) * 1.32 + 25;
            for (const offset of [-0.65, 0.65]) {
              spawned.push({
                id: this.nextId++,
                x: r.x,
                y: r.y,
                vx: Math.cos(baseAngle + offset) * speed,
                vy: Math.sin(baseAngle + offset) * speed,
                size: nextSize,
                radius: SIZE_RADIUS[nextSize],
              });
            }
          }
          break;
        }
      }
    }

    this.bolts = this.bolts.filter((b) => !usedBolts.has(b.id));
    this.rocks = [...this.rocks.filter((r) => !deadRocks.has(r.id)), ...spawned];

    // Ship vs Rocks
    if (this.invuln <= 0) {
      for (const r of this.rocks) {
        if (Math.hypot(this.shipX - r.x, this.shipY - r.y) < r.radius + 16) {
          this.lives--;
          this.invuln = 2.2;
          this.shipVx = 0;
          this.shipVy = 0;
          events.push({ type: 'shipHit', x: this.shipX, y: this.shipY, livesLeft: this.lives });
          if (this.lives <= 0) {
            events.push({ type: 'gameOver' });
          }
          break;
        }
      }
    }

    // Wave clear
    if (this.rocks.length === 0 && this.lives > 0) {
      const nextWave = this.wave + 1;
      const bonus = 300 * this.wave;
      this.score += bonus;
      this.invuln = Math.max(this.invuln, 1.5);
      this.spawnWave(nextWave);
      events.push({ type: 'waveCleared', wave: nextWave, bonus });
    }

    return events;
  }
}
