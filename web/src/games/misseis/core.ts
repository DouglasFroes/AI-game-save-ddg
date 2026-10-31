/**
 * "Defesa Antimísseis" — pure rules (Missile Command style). Enemy missiles fall on six cities;
 * a tap fires an interceptor from the nearest battery with ammo, which bursts into a growing
 * blast where it was aimed. Anything inside a blast is destroyed — and explodes in turn.
 */
export const GROUND_Y = 1150;
export const TOP_Y = 240;
export const BATTERIES = [110, 360, 610];
export const CITIES = [190, 255, 315, 405, 465, 530];
const AMMO = 10;
const INTERCEPT_SPEED = 1100;
const BLAST_R = 72;
const BLAST_T = 1.1;

export interface Missile {
  readonly id: number;
  x: number;
  y: number;
  readonly sx: number;
  readonly sy: number;
  readonly tx: number;
  readonly ty: number;
  readonly speed: number;
  /** Splits into three when it passes this height (0 = never). */
  splitAt: number;
  dead: boolean;
}

export interface Interceptor {
  x: number;
  y: number;
  readonly sx: number;
  readonly sy: number;
  readonly tx: number;
  readonly ty: number;
}

export interface Blast {
  readonly x: number;
  readonly y: number;
  t: number;
  /** Blasts from enemy hits on the ground do not destroy missiles. */
  readonly friendly: boolean;
}

export type MissileEvent =
  | { type: 'fire'; battery: number }
  | { type: 'empty' }
  | { type: 'kill'; x: number; y: number; points: number; chain: number }
  | { type: 'city'; index: number }
  | { type: 'battery'; index: number }
  | { type: 'wave'; wave: number; bonus: number }
  | { type: 'over' };

export const blastRadius = (t: number): number =>
  BLAST_R * Math.sin(Math.min(1, t / BLAST_T) * Math.PI);

export class MissileSim {
  wave = 1;
  score = 0;
  kills = 0;
  cities = CITIES.map(() => true);
  ammo = BATTERIES.map(() => AMMO);
  missiles: Missile[] = [];
  shots: Interceptor[] = [];
  blasts: Blast[] = [];
  private toSpawn = 0;
  private spawnIn = 0;
  private nextId = 0;
  private chain = 0;
  private pause = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.startWave();
  }

  get over(): boolean {
    return this.cities.every((c) => !c);
  }

  private startWave(): void {
    this.toSpawn = 8 + this.wave * 3;
    this.spawnIn = 1;
    this.ammo = BATTERIES.map(() => AMMO + Math.min(5, Math.floor(this.wave / 2)));
    this.chain = 0;
  }

  private get missileSpeed(): number {
    return Math.min(260, 55 + this.wave * 16);
  }

  private launch(sx: number, sy: number, split: boolean): void {
    const targets = [
      ...CITIES.filter((_, i) => this.cities[i]),
      ...BATTERIES.filter((_, i) => this.ammo[i]! > 0 || this.rng() < 0.3),
    ];
    const tx = targets[Math.floor(this.rng() * targets.length)] ?? 360;
    this.missiles.push({
      id: this.nextId++,
      x: sx,
      y: sy,
      sx,
      sy,
      tx,
      ty: GROUND_Y,
      speed: this.missileSpeed * (0.8 + this.rng() * 0.4),
      splitAt: split ? 520 + this.rng() * 200 : 0,
      dead: false,
    });
  }

  /** The player taps a point in the sky. */
  fire(x: number, y: number): MissileEvent[] {
    if (this.over || y > GROUND_Y - 40 || y < TOP_Y) return [];
    let best = -1;
    for (let i = 0; i < BATTERIES.length; i++) {
      if (this.ammo[i]! <= 0) continue;
      if (best < 0 || Math.abs(BATTERIES[i]! - x) < Math.abs(BATTERIES[best]! - x)) best = i;
    }
    if (best < 0) return [{ type: 'empty' }];
    this.ammo[best]!--;
    const sx = BATTERIES[best]!;
    this.shots.push({ x: sx, y: GROUND_Y - 30, sx, sy: GROUND_Y - 30, tx: x, ty: y });
    return [{ type: 'fire', battery: best }];
  }

  step(dt: number): MissileEvent[] {
    const ev: MissileEvent[] = [];
    if (this.over) return ev;

    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        this.wave++;
        this.startWave();
      }
      return ev;
    }

    this.spawnIn -= dt;
    if (this.toSpawn > 0 && this.spawnIn <= 0) {
      this.toSpawn--;
      this.spawnIn = Math.max(0.35, 1.6 - this.wave * 0.1) * (0.5 + this.rng());
      this.launch(40 + this.rng() * 640, TOP_Y, this.wave >= 3 && this.rng() < 0.25);
    }

    for (const s of this.shots) {
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      const stepLen = INTERCEPT_SPEED * dt;
      if (d <= stepLen) {
        s.x = s.tx;
        s.y = s.ty;
        this.blasts.push({ x: s.tx, y: s.ty, t: 0, friendly: true });
      } else {
        s.x += (dx / d) * stepLen;
        s.y += (dy / d) * stepLen;
      }
    }
    this.shots = this.shots.filter((s) => s.x !== s.tx || s.y !== s.ty);

    for (const m of this.missiles) {
      if (m.dead) continue;
      const dx = m.tx - m.sx;
      const dy = m.ty - m.sy;
      const len = Math.hypot(dx, dy);
      m.x += (dx / len) * m.speed * dt;
      m.y += (dy / len) * m.speed * dt;
      if (m.splitAt && m.y >= m.splitAt) {
        m.dead = true;
        for (let k = 0; k < 3; k++) this.launch(m.x, m.y, false);
        continue;
      }
      if (m.y >= GROUND_Y) {
        m.dead = true;
        this.blasts.push({ x: m.x, y: GROUND_Y, t: 0, friendly: false });
        const ci = CITIES.findIndex((cx, i) => this.cities[i] && Math.abs(cx - m.x) < 34);
        if (ci >= 0) {
          this.cities[ci] = false;
          ev.push({ type: 'city', index: ci });
        }
        const bi = BATTERIES.findIndex((bx) => Math.abs(bx - m.x) < 40);
        if (bi >= 0 && this.ammo[bi]! > 0) {
          this.ammo[bi] = 0;
          ev.push({ type: 'battery', index: bi });
        }
      }
    }

    for (const b of this.blasts) {
      b.t += dt;
      if (!b.friendly) continue;
      const r = blastRadius(b.t);
      for (const m of this.missiles) {
        if (m.dead || Math.hypot(m.x - b.x, m.y - b.y) > r) continue;
        m.dead = true;
        this.chain++;
        this.kills++;
        const points = 25 * this.wave * Math.min(5, this.chain);
        this.score += points;
        ev.push({ type: 'kill', x: m.x, y: m.y, points, chain: this.chain });
        this.blasts.push({ x: m.x, y: m.y, t: 0, friendly: true });
      }
    }
    this.blasts = this.blasts.filter((b) => b.t < BLAST_T);
    this.missiles = this.missiles.filter((m) => !m.dead);
    if (!this.blasts.some((b) => b.friendly)) this.chain = 0;

    if (this.over) {
      ev.push({ type: 'over' });
    } else if (this.toSpawn === 0 && this.missiles.length === 0 && this.shots.length === 0) {
      const alive = this.cities.filter(Boolean).length;
      const ammoLeft = this.ammo.reduce((a, b) => a + b, 0);
      const bonus = (alive * 100 + ammoLeft * 5) * this.wave;
      this.score += bonus;
      // Every third wave a lost city is rebuilt.
      if (this.wave % 3 === 0) {
        const lost = this.cities.indexOf(false);
        if (lost >= 0) this.cities[lost] = true;
      }
      ev.push({ type: 'wave', wave: this.wave, bonus });
      this.pause = 2;
    }
    return ev;
  }
}
