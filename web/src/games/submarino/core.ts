export const WATER_Y = 270;
export const SHIP_MIN_X = 75;
export const SHIP_MAX_X = 645;
export const MAX_ACTIVE_CHARGES = 4;

export interface DepthCharge {
  id: number;
  x: number;
  y: number;
  vy: number;
}

export interface EnemySub {
  id: number;
  x: number;
  y: number;
  vx: number;
  lane: 0 | 1 | 2 | 3;
  points: number;
  fireCooldown: number;
}

export interface RisingMine {
  id: number;
  x: number;
  y: number;
  vy: number;
}

export type SubEvent =
  | { type: 'subHit'; x: number; y: number; points: number }
  | { type: 'mineCleared'; x: number; y: number; points: number }
  | { type: 'shipHit'; x: number; y: number; livesLeft: number }
  | { type: 'waveUp'; wave: number; bonus: number }
  | { type: 'gameOver' };

const LANE_Y = [460, 640, 820, 1000] as const;
const LANE_PTS = [100, 180, 280, 420] as const;

export class SubmarinoSim {
  shipX = 360;
  targetX = 360;
  lives = 3;
  score = 0;
  subsSunk = 0;
  wave = 1;
  charges: DepthCharge[] = [];
  subs: EnemySub[] = [];
  mines: RisingMine[] = [];
  private nextId = 1;
  private spawnTimer = 0.6;

  dropCharge(x = this.shipX): boolean {
    if (this.charges.length >= MAX_ACTIVE_CHARGES || this.lives <= 0) return false;
    this.shipX = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, x));
    this.targetX = this.shipX;
    this.charges.push({
      id: this.nextId++,
      x: this.shipX,
      y: WATER_Y + 28,
      vy: 265,
    });
    return true;
  }

  spawnSub(lane: 0 | 1 | 2 | 3, fromLeft: boolean): EnemySub {
    const speed = (115 + lane * 42) * (1 + (this.wave - 1) * 0.12);
    const sub: EnemySub = {
      id: this.nextId++,
      x: fromLeft ? -50 : 770,
      y: LANE_Y[lane],
      vx: fromLeft ? speed : -speed,
      lane,
      points: LANE_PTS[lane],
      fireCooldown: 1.4 + Math.random() * 1.8,
    };
    this.subs.push(sub);
    return sub;
  }

  step(dt: number): SubEvent[] {
    if (this.lives <= 0) return [];
    const events: SubEvent[] = [];

    // Smoothly steer ship toward targetX
    const diff = this.targetX - this.shipX;
    const maxMove = 420 * dt;
    if (Math.abs(diff) <= maxMove) this.shipX = this.targetX;
    else this.shipX += Math.sign(diff) * maxMove;
    this.shipX = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, this.shipX));

    // Spawn enemy subs
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.subs.length < 4 + Math.min(3, this.wave)) {
      const lane = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
      this.spawnSub(lane, Math.random() < 0.5);
      this.spawnTimer = Math.max(0.75, 1.85 - this.wave * 0.12);
    }

    // Move charges
    for (const c of this.charges) c.y += c.vy * dt;
    this.charges = this.charges.filter((c) => c.y < 1130);

    // Move subs and fire mines
    for (const s of this.subs) {
      s.x += s.vx * dt;
      s.fireCooldown -= dt;
      if (s.fireCooldown <= 0 && s.x > 80 && s.x < 640) {
        s.fireCooldown = Math.max(1.5, 3.2 - this.wave * 0.15);
        this.mines.push({
          id: this.nextId++,
          x: s.x,
          y: s.y - 24,
          vy: -(165 + this.wave * 14),
        });
      }
    }
    this.subs = this.subs.filter((s) => s.x > -90 && s.x < 810);

    // Move rising mines
    for (const m of this.mines) m.y += m.vy * dt;

    // Collisions: charges vs mines
    const usedCharges = new Set<number>();
    const deadMines = new Set<number>();
    for (const c of this.charges) {
      for (const m of this.mines) {
        if (deadMines.has(m.id)) continue;
        if (Math.hypot(c.x - m.x, c.y - m.y) < 36) {
          usedCharges.add(c.id);
          deadMines.add(m.id);
          this.score += 50;
          events.push({ type: 'mineCleared', x: m.x, y: m.y, points: 50 });
          break;
        }
      }
    }

    // Collisions: charges vs subs
    const deadSubs = new Set<number>();
    for (const c of this.charges) {
      if (usedCharges.has(c.id)) continue;
      for (const s of this.subs) {
        if (deadSubs.has(s.id)) continue;
        if (Math.abs(c.x - s.x) < 52 && Math.abs(c.y - s.y) < 32) {
          usedCharges.add(c.id);
          deadSubs.add(s.id);
          this.score += s.points;
          this.subsSunk++;
          events.push({ type: 'subHit', x: s.x, y: s.y, points: s.points });
          if (this.subsSunk % 8 === 0) {
            this.wave++;
            const bonus = 250 * this.wave;
            this.score += bonus;
            events.push({ type: 'waveUp', wave: this.wave, bonus });
          }
          break;
        }
      }
    }

    // Collisions: mines reaching water surface
    for (const m of this.mines) {
      if (deadMines.has(m.id)) continue;
      if (m.y <= WATER_Y + 12) {
        deadMines.add(m.id);
        if (Math.abs(m.x - this.shipX) < 54) {
          this.lives--;
          events.push({ type: 'shipHit', x: this.shipX, y: WATER_Y, livesLeft: this.lives });
          if (this.lives <= 0) {
            events.push({ type: 'gameOver' });
          }
        }
      }
    }

    this.charges = this.charges.filter((c) => !usedCharges.has(c.id));
    this.subs = this.subs.filter((s) => !deadSubs.has(s.id));
    this.mines = this.mines.filter((m) => !deadMines.has(m.id) && m.y > WATER_Y - 10);

    return events;
  }
}
