import type { Rnd } from '@/platform/rnd';

export const W = 720;
export const H = 1280;
export const ARENA_W = 2200;
export const ARENA_H = 2200;
export const HERO_R = 26;

export type EnemyType = 'bat' | 'zombie' | 'golem' | 'boss';

export interface SurvivorEnemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  r: number;
  xpValue: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
}

export interface XpGem {
  id: number;
  x: number;
  y: number;
  value: number;
}

export type UpgradeId = 'fireRate' | 'multiShot' | 'orbitals' | 'damage' | 'speed' | 'heal';

export interface UpgradeOption {
  readonly id: UpgradeId;
  readonly title: string;
  readonly desc: string;
  readonly emoji: string;
}

export const UPGRADES: readonly UpgradeOption[] = [
  { id: 'multiShot', title: '+1 Projétil', desc: 'Atira mais magias de uma vez', emoji: '🔮' },
  {
    id: 'orbitals',
    title: '+1 Lâmina Orbital',
    desc: 'Gira ao seu redor cortando tudo',
    emoji: '⚔️',
  },
  { id: 'fireRate', title: 'Cadência +25%', desc: 'Ataca muito mais rápido', emoji: '⚡' },
  { id: 'damage', title: 'Força +35%', desc: 'Seus ataques causam mais dano', emoji: '💥' },
  {
    id: 'speed',
    title: 'Velocidade + Magnetismo',
    desc: 'Corre mais e atrai gemas de longe',
    emoji: '🧲',
  },
  { id: 'heal', title: 'Cura +40 HP', desc: 'Recupera vida imediatamente', emoji: '❤️' },
];

export type HordaEvent =
  | { type: 'shoot' }
  | { type: 'kill'; x: number; y: number; enemyType: EnemyType }
  | { type: 'gem'; levelUp: boolean }
  | { type: 'hurt' }
  | { type: 'gameOver' };

/**
 * "Sobrevivente da Horda" (Vampire Survivors / Survivor.io style):
 * Steer to dodge swarms, weapons auto-target nearest monster, collect XP gems and pick 1 of 3 upgrades on level up.
 */
export class HordaSim {
  x = ARENA_W / 2;
  y = ARENA_H / 2;
  vx = 0;
  vy = 0;

  hp = 100;
  maxHp = 100;
  level = 1;
  xp = 0;
  xpNext = 25;
  score = 0;
  kills = 0;
  time = 0;

  // Player stats upgraded on level up
  moveSpeed = 270;
  magnetRadius = 155;
  fireCooldown = 0.52;
  projectileCount = 1;
  damage = 18;
  orbitalCount = 1;
  orbitalAngle = 0;
  orbitalRadius = 105;

  enemies: SurvivorEnemy[] = [];
  projectiles: Projectile[] = [];
  gems: XpGem[] = [];
  choices: UpgradeOption[] | null = null;

  private nextId = 1;
  private fireTimer = 0.1;
  private spawnTimer = 0.4;
  private hurtCooldown = 0;
  private orbitalHitCooldown = new Map<number, number>();

  constructor(private readonly rnd: Rnd = Math.random) {}

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** Sets normalized movement direction (-1..1). */
  setMoveDir(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    if (len < 0.05) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    this.vx = (dx / len) * this.moveSpeed;
    this.vy = (dy / len) * this.moveSpeed;
  }

  chooseUpgrade(id: UpgradeId): boolean {
    if (!this.choices) return false;
    switch (id) {
      case 'multiShot':
        this.projectileCount = Math.min(6, this.projectileCount + 1);
        break;
      case 'orbitals':
        this.orbitalCount = Math.min(6, this.orbitalCount + 1);
        break;
      case 'fireRate':
        this.fireCooldown = Math.max(0.14, this.fireCooldown * 0.8);
        break;
      case 'damage':
        this.damage = Math.round(this.damage * 1.35);
        break;
      case 'speed':
        this.moveSpeed = Math.min(430, Math.round(this.moveSpeed * 1.15));
        this.magnetRadius = Math.min(340, Math.round(this.magnetRadius * 1.28));
        break;
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + 40);
        break;
    }
    this.choices = null;
    return true;
  }

  orbitalPositions(): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < this.orbitalCount; i++) {
      const a = this.orbitalAngle + (i * Math.PI * 2) / this.orbitalCount;
      out.push({
        x: this.x + Math.cos(a) * this.orbitalRadius,
        y: this.y + Math.sin(a) * this.orbitalRadius,
      });
    }
    return out;
  }

  step(dt: number): HordaEvent[] {
    const events: HordaEvent[] = [];
    if (this.dead || this.choices !== null) return events;

    this.time += dt;
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.orbitalAngle += dt * 3.8;

    // Move hero inside arena
    this.x = Math.max(60, Math.min(ARENA_W - 60, this.x + this.vx * dt));
    this.y = Math.max(60, Math.min(ARENA_H - 60, this.y + this.vy * dt));

    // Auto-fire at nearest enemy
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.enemies.length > 0) {
      this.fireTimer = this.fireCooldown;
      this.fireVolley();
      events.push({ type: 'shoot' });
    }

    // Spawn enemies around player
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const interval = Math.max(0.22, 0.95 - this.time * 0.008);
      this.spawnTimer = interval;
      this.spawnEnemy();
    }

    // Move projectiles
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.projectiles = this.projectiles.filter(
      (p) =>
        p.pierce > 0 &&
        Math.hypot(p.x - this.x, p.y - this.y) < 900 &&
        p.x > 0 &&
        p.x < ARENA_W &&
        p.y > 0 &&
        p.y < ARENA_H,
    );

    // Move enemies toward hero
    for (const e of this.enemies) {
      const dx = this.x - e.x;
      const dy = this.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
    }

    this.hitWithProjectiles(events);
    this.hitWithOrbitals(dt, events);
    this.collectGems(dt, events);
    this.checkPlayerDamage(events);

    return events;
  }

  private fireVolley(): void {
    // Sort enemies by distance
    const sorted = [...this.enemies].sort(
      (a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y),
    );
    const nearest = sorted[0];
    if (!nearest) return;
    const baseAngle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
    const count = this.projectileCount;
    const spread = 0.16;

    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      const a = baseAngle + offset;
      this.projectiles.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(a) * 680,
        vy: Math.sin(a) * 680,
        damage: this.damage,
        pierce: 1,
      });
    }
  }

  private hitWithProjectiles(events: HordaEvent[]): void {
    for (const p of this.projectiles) {
      if (p.pierce <= 0) continue;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(p.x - e.x, p.y - e.y) <= e.r + 12) {
          e.hp -= p.damage;
          p.pierce--;
          if (e.hp <= 0) {
            this.onEnemyKilled(e, events);
          }
          break;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private hitWithOrbitals(dt: number, events: HordaEvent[]): void {
    for (const [id, t] of this.orbitalHitCooldown) {
      if (t - dt <= 0) this.orbitalHitCooldown.delete(id);
      else this.orbitalHitCooldown.set(id, t - dt);
    }
    const orbs = this.orbitalPositions();
    for (const orb of orbs) {
      for (const e of this.enemies) {
        if (e.hp <= 0 || this.orbitalHitCooldown.has(e.id)) continue;
        if (Math.hypot(orb.x - e.x, orb.y - e.y) <= e.r + 20) {
          this.orbitalHitCooldown.set(e.id, 0.35);
          e.hp -= Math.round(this.damage * 0.85);
          if (e.hp <= 0) {
            this.onEnemyKilled(e, events);
          }
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private onEnemyKilled(e: SurvivorEnemy, events: HordaEvent[]): void {
    this.kills++;
    this.score += e.xpValue * 2;
    this.gems.push({
      id: this.nextId++,
      x: e.x,
      y: e.y,
      value: e.xpValue,
    });
    events.push({ type: 'kill', x: e.x, y: e.y, enemyType: e.type });
  }

  private collectGems(dt: number, events: HordaEvent[]): void {
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i]!;
      const dx = this.x - g.x;
      const dy = this.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= this.magnetRadius) {
        const pull = 560 * dt;
        if (dist <= HERO_R + 18 || dist <= pull) {
          this.gems.splice(i, 1);
          this.xp += g.value;
          this.score += g.value;
          let leveled = false;
          if (this.xp >= this.xpNext) {
            this.xp -= this.xpNext;
            this.level++;
            this.xpNext = Math.round(this.xpNext * 1.35 + 15);
            this.rollChoices();
            leveled = true;
          }
          events.push({ type: 'gem', levelUp: leveled });
        } else {
          g.x += (dx / dist) * pull;
          g.y += (dy / dist) * pull;
        }
      }
    }
  }

  private checkPlayerDamage(events: HordaEvent[]): void {
    if (this.hurtCooldown > 0) return;
    const hitter = this.enemies.find(
      (e) => Math.hypot(e.x - this.x, e.y - this.y) < e.r + HERO_R - 4,
    );
    if (!hitter) return;
    this.hurtCooldown = 0.65;
    const dmg = hitter.type === 'boss' ? 22 : hitter.type === 'golem' ? 15 : 10;
    this.hp = Math.max(0, this.hp - dmg);
    events.push({ type: 'hurt' });
    if (this.hp <= 0) {
      events.push({ type: 'gameOver' });
    }
  }

  private rollChoices(): void {
    const pool = [...UPGRADES];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      const tmp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = tmp;
    }
    this.choices = pool.slice(0, 3);
  }

  private spawnEnemy(): void {
    if (this.enemies.length >= 65) return;
    const angle = this.rnd() * Math.PI * 2;
    const dist = 480 + this.rnd() * 120;
    const x = Math.max(40, Math.min(ARENA_W - 40, this.x + Math.cos(angle) * dist));
    const y = Math.max(40, Math.min(ARENA_H - 40, this.y + Math.sin(angle) * dist));

    const r = this.rnd();
    const scale = 1 + this.time / 45;
    let type: EnemyType = 'bat';
    let hp = Math.round(14 * scale);
    let speed = 135 + Math.min(70, this.time * 0.4);
    let radius = 22;
    let xpValue = 8;

    if (this.time > 35 && r < 0.08) {
      type = 'boss';
      hp = Math.round(120 * scale);
      speed = 105;
      radius = 40;
      xpValue = 50;
    } else if (this.time > 15 && r < 0.28) {
      type = 'golem';
      hp = Math.round(45 * scale);
      speed = 95;
      radius = 30;
      xpValue = 20;
    } else if (r < 0.65) {
      type = 'zombie';
      hp = Math.round(24 * scale);
      speed = 115;
      radius = 25;
      xpValue = 12;
    }

    this.enemies.push({
      id: this.nextId++,
      type,
      x,
      y,
      hp,
      maxHp: hp,
      speed,
      r: radius,
      xpValue,
    });
  }
}
