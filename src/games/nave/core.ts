import type { Rnd } from '@/platform/rnd';

export const W = 720;
export const H = 1280;
export const SHIP_Y = 1110;
const SHIP_R = 26;

export type EnemyKind = 'grunt' | 'tank' | 'shooter';
export type PowerKind = 'double' | 'shield' | 'heart';

export interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  x0: number;
  hp: number;
  r: number;
  phase: number;
  fireIn: number;
}
export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface Power {
  x: number;
  y: number;
  kind: PowerKind;
}

export type NaveEvent =
  | { type: 'kill'; kind: EnemyKind; x: number; y: number }
  | { type: 'hurt' }
  | { type: 'shield' }
  | { type: 'power'; kind: PowerKind }
  | { type: 'wave'; n: number };

const POINTS: Record<EnemyKind, number> = { grunt: 10, shooter: 25, tank: 40 };

/** "Nave": drag to dodge, the ship fires by itself. Waves keep coming. */
export class ShipSim {
  x = W / 2;
  lives = 3;
  score = 0;
  kills = 0;
  wave = 0;
  time = 0;
  enemies: Enemy[] = [];
  bullets: Shot[] = [];
  enemyShots: Shot[] = [];
  powers: Power[] = [];
  doubleLeft = 0;
  shieldLeft = 0;
  invuln = 0;
  private fireIn = 0;
  /** Seconds until the next wave spawns. */
  waveIn = 0.8;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get dead(): boolean {
    return this.lives <= 0;
  }

  moveTo(x: number): void {
    this.x = Math.max(40, Math.min(W - 40, x));
  }

  step(dt: number): NaveEvent[] {
    const ev: NaveEvent[] = [];
    if (this.dead) return ev;
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.doubleLeft = Math.max(0, this.doubleLeft - dt);
    this.shieldLeft = Math.max(0, this.shieldLeft - dt);

    this.fireIn -= dt;
    if (this.fireIn <= 0) {
      this.fireIn = 0.2;
      const spread = this.doubleLeft > 0 ? [-16, 16] : [0];
      for (const dx of spread)
        this.bullets.push({ x: this.x + dx, y: SHIP_Y - 30, vx: 0, vy: -1200 });
    }

    this.waveIn -= dt;
    if (this.waveIn <= 0) {
      this.wave++;
      this.spawnWave();
      this.waveIn = Math.max(2.4, 4.6 - this.wave * 0.12);
      ev.push({ type: 'wave', n: this.wave });
    }

    for (const b of this.bullets) b.y += b.vy * dt;
    this.bullets = this.bullets.filter((b) => b.y > -40);
    for (const s of this.enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.enemyShots = this.enemyShots.filter((s) => s.y < H + 40 && s.x > -40 && s.x < W + 40);
    for (const p of this.powers) p.y += 170 * dt;
    this.powers = this.powers.filter((p) => p.y < H + 40);

    for (const e of this.enemies) this.moveEnemy(e, dt);
    this.enemies = this.enemies.filter((e) => e.y < H + 80);

    this.hitEnemies(ev);
    this.hitShip(ev);
    this.collectPowers(ev);
    return ev;
  }

  private moveEnemy(e: Enemy, dt: number): void {
    e.phase += dt * 2;
    if (e.kind === 'grunt') {
      e.y += (120 + this.wave * 7) * dt;
      e.x = e.x0 + Math.sin(e.phase) * 70;
    } else if (e.kind === 'tank') {
      e.y += (65 + this.wave * 3) * dt;
      e.x = e.x0 + Math.sin(e.phase * 0.6) * 40;
    } else {
      if (e.y < 270) e.y += 160 * dt;
      e.x = W / 2 + Math.sin(e.phase * 0.7 + e.x0) * 250;
      e.fireIn -= dt;
      if (e.fireIn <= 0 && e.y >= 200) {
        e.fireIn = Math.max(0.9, 1.7 - this.wave * 0.03);
        const dx = this.x - e.x;
        const dy = SHIP_Y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        this.enemyShots.push({ x: e.x, y: e.y + 30, vx: (dx / len) * 380, vy: (dy / len) * 380 });
      }
    }
  }

  private hitEnemies(ev: NaveEvent[]): void {
    for (const b of this.bullets) {
      const e = this.enemies.find(
        (en) => en.y > -20 && Math.hypot(en.x - b.x, en.y - b.y) < en.r + 8,
      );
      if (!e) continue;
      b.y = -999;
      e.hp--;
      if (e.hp > 0) continue;
      this.score += POINTS[e.kind];
      this.kills++;
      ev.push({ type: 'kill', kind: e.kind, x: e.x, y: e.y });
      if (this.rnd() < 0.13) {
        const r = this.rnd();
        this.powers.push({
          x: e.x,
          y: e.y,
          kind: r < 0.45 ? 'double' : r < 0.8 ? 'shield' : 'heart',
        });
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private hitShip(ev: NaveEvent[]): void {
    const hit = (x: number, y: number, r: number) =>
      Math.hypot(x - this.x, y - SHIP_Y) < r + SHIP_R;
    const shot = this.enemyShots.find((s) => hit(s.x, s.y, 8));
    if (shot) {
      this.enemyShots = this.enemyShots.filter((s) => s !== shot);
      this.hurt(ev);
    }
    const body = this.enemies.find((e) => hit(e.x, e.y, e.r - 6));
    if (body) {
      this.enemies = this.enemies.filter((e) => e !== body);
      this.hurt(ev);
    }
  }

  private hurt(ev: NaveEvent[]): void {
    if (this.invuln > 0) return;
    if (this.shieldLeft > 0) {
      this.shieldLeft = 0;
      this.invuln = 0.6;
      ev.push({ type: 'shield' });
      return;
    }
    this.lives--;
    this.invuln = 1.6;
    ev.push({ type: 'hurt' });
  }

  private collectPowers(ev: NaveEvent[]): void {
    for (const p of this.powers) {
      if (Math.hypot(p.x - this.x, p.y - SHIP_Y) > 56) continue;
      p.y = H + 999;
      if (p.kind === 'double') this.doubleLeft = 10;
      else if (p.kind === 'shield') this.shieldLeft = 12;
      else this.lives = Math.min(3, this.lives + 1);
      ev.push({ type: 'power', kind: p.kind });
    }
  }

  private spawnWave(): void {
    const n = Math.min(8, 3 + Math.floor(this.wave / 2));
    const gap = (W - 120) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      this.enemies.push({
        kind: 'grunt',
        x: 60 + i * gap,
        x0: 60 + i * gap,
        y: -40 - (i % 2) * 70,
        hp: 1,
        r: 34,
        phase: i,
        fireIn: 0,
      });
    }
    if (this.wave % 3 === 0)
      this.enemies.push({
        kind: 'tank',
        x: W / 2,
        x0: W / 2,
        y: -120,
        hp: 4 + Math.floor(this.wave / 4),
        r: 50,
        phase: 0,
        fireIn: 0,
      });
    if (this.wave >= 2)
      for (let i = 0; i < Math.min(2, 1 + Math.floor(this.wave / 6)); i++)
        this.enemies.push({
          kind: 'shooter',
          x: W / 2,
          x0: i * 3.1,
          y: -80 - i * 80,
          hp: 2,
          r: 38,
          phase: i * 2,
          fireIn: 1.1,
        });
  }
}
