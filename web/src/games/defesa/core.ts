/**
 * "Defesa da Torre" — pure rules of a compact tower defense. Enemies walk a winding road; build
 * towers on the grass beside it with the gold they drop. Three towers: Arqueiro (fast, single
 * target), Canhão (slow, splash damage) and Gelo (slows). Tap a tower to upgrade it. Each enemy
 * that reaches the end costs a life; waves keep getting tougher, with a boss every fifth wave.
 */
export const COLS = 8;
export const ROWS = 11;
export const CELL = 80;
export const X0 = 40;
export const Y0 = 250;
export const START_GOLD = 160;
export const LIVES = 20;
export const MAX_LEVEL = 3;

export type TowerKind = 'arco' | 'canhao' | 'gelo';
export const TOWERS: Readonly<
  Record<
    TowerKind,
    { cost: number; range: number; damage: number; rate: number; splash: number; slow: number }
  >
> = {
  arco: { cost: 50, range: 2.3, damage: 2, rate: 3, splash: 0, slow: 0 },
  canhao: { cost: 90, range: 2.0, damage: 7, rate: 0.8, splash: 0.9, slow: 0 },
  gelo: { cost: 70, range: 1.9, damage: 1, rate: 1.5, splash: 0, slow: 1.2 },
};

/** Waypoints of the road, in cells (it enters from the left and leaves on the right). */
const WAYPOINTS: ReadonlyArray<[number, number]> = [
  [-1, 1],
  [6, 1],
  [6, 4],
  [1, 4],
  [1, 7],
  [6, 7],
  [6, 10],
  [8, 10],
];

export const toWorld = (c: number, r: number): { x: number; y: number } => ({
  x: X0 + (c + 0.5) * CELL,
  y: Y0 + (r + 0.5) * CELL,
});

const POINTS = WAYPOINTS.map(([c, r]) => toWorld(c, r));
const SEGS = POINTS.slice(1).map((p, i) => Math.hypot(p.x - POINTS[i]!.x, p.y - POINTS[i]!.y));
export const PATH_LEN = SEGS.reduce((a, b) => a + b, 0);

/** World position at a distance along the road. */
export function along(d: number): { x: number; y: number } {
  let left = d;
  for (let i = 0; i < SEGS.length; i++) {
    const a = POINTS[i]!;
    const b = POINTS[i + 1]!;
    if (left <= SEGS[i]!) {
      const t = left / SEGS[i]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= SEGS[i]!;
  }
  return POINTS[POINTS.length - 1]!;
}

/** Cells the road passes through (towers cannot go there). */
export const ROAD = new Set<number>();
for (let i = 0; i + 1 < WAYPOINTS.length; i++) {
  const [c0, r0] = WAYPOINTS[i]!;
  const [c1, r1] = WAYPOINTS[i + 1]!;
  const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
  for (let k = 0; k <= steps; k++) {
    const c = c0 + Math.sign(c1 - c0) * k;
    const r = r0 + Math.sign(r1 - r0) * k;
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) ROAD.add(r * COLS + c);
  }
}

export interface Enemy {
  readonly id: number;
  dist: number;
  hp: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly boss: boolean;
  slowFor: number;
}

export interface Tower {
  readonly cell: number;
  readonly kind: TowerKind;
  level: number;
  cooldown: number;
}

export type DefenseEvent =
  | { type: 'shot'; tower: Tower; target: Enemy }
  | { type: 'kill'; enemy: Enemy; gold: number }
  | { type: 'leak'; enemy: Enemy; livesLeft: number }
  | { type: 'wave'; wave: number; boss: boolean }
  | { type: 'over' };

export const upgradeCost = (t: Tower): number =>
  Math.round(TOWERS[t.kind].cost * (0.8 + t.level * 0.6));
export const statsOf = (t: Tower) => {
  const base = TOWERS[t.kind];
  const m = 1 + (t.level - 1) * 0.6;
  return { ...base, damage: base.damage * m, range: base.range * (1 + (t.level - 1) * 0.12) };
};

export class TowerDefense {
  gold = START_GOLD;
  lives = LIVES;
  wave = 0;
  score = 0;
  kills = 0;
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  private toSpawn = 0;
  private spawnIn = 0;
  private breakIn = 3;
  private nextId = 0;

  get over(): boolean {
    return this.lives <= 0;
  }

  get between(): boolean {
    return this.toSpawn === 0 && this.enemies.length === 0;
  }

  towerAt(cell: number): Tower | undefined {
    return this.towers.find((t) => t.cell === cell);
  }

  canBuild(cell: number): boolean {
    return cell >= 0 && cell < COLS * ROWS && !ROAD.has(cell) && !this.towerAt(cell);
  }

  build(kind: TowerKind, cell: number): boolean {
    if (!this.canBuild(cell) || this.gold < TOWERS[kind].cost) return false;
    this.gold -= TOWERS[kind].cost;
    this.towers.push({ cell, kind, level: 1, cooldown: 0 });
    return true;
  }

  upgrade(cell: number): boolean {
    const t = this.towerAt(cell);
    if (!t || t.level >= MAX_LEVEL || this.gold < upgradeCost(t)) return false;
    this.gold -= upgradeCost(t);
    t.level++;
    return true;
  }

  private startWave(): DefenseEvent {
    this.wave++;
    this.toSpawn = 8 + this.wave * 2;
    this.spawnIn = 0;
    return { type: 'wave', wave: this.wave, boss: this.wave % 5 === 0 };
  }

  step(dt: number): DefenseEvent[] {
    const ev: DefenseEvent[] = [];
    if (this.over) return ev;
    if (this.between) {
      this.breakIn -= dt;
      if (this.breakIn <= 0) {
        ev.push(this.startWave());
        this.breakIn = 4;
      }
    }
    this.spawnIn -= dt;
    if (this.toSpawn > 0 && this.spawnIn <= 0) {
      const boss = this.wave % 5 === 0 && this.toSpawn === 1;
      const hp = Math.round(5 * Math.pow(1.28, this.wave) * (boss ? 10 : 1));
      this.enemies.push({
        id: this.nextId++,
        dist: 0,
        hp,
        maxHp: hp,
        speed: (boss ? 34 : 62) * (1 + this.wave * 0.025),
        boss,
        slowFor: 0,
      });
      this.toSpawn--;
      this.spawnIn = Math.max(0.35, 0.9 - this.wave * 0.03);
    }
    for (const e of [...this.enemies]) {
      e.slowFor = Math.max(0, e.slowFor - dt);
      e.dist += e.speed * (e.slowFor > 0 ? 0.5 : 1) * dt;
      if (e.dist >= PATH_LEN) {
        this.enemies.splice(this.enemies.indexOf(e), 1);
        this.lives -= e.boss ? 5 : 1;
        ev.push({ type: 'leak', enemy: e, livesLeft: Math.max(0, this.lives) });
        if (this.over) {
          ev.push({ type: 'over' });
          return ev;
        }
      }
    }
    for (const t of this.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const s = statsOf(t);
      const c = t.cell % COLS;
      const r = Math.floor(t.cell / COLS);
      const at = toWorld(c, r);
      // Target the enemy furthest along the road within range.
      const target = this.enemies
        .filter((e) => {
          const p = along(e.dist);
          return Math.hypot(p.x - at.x, p.y - at.y) <= s.range * CELL;
        })
        .sort((a, b) => b.dist - a.dist)[0];
      if (!target) continue;
      t.cooldown = 1 / s.rate;
      ev.push({ type: 'shot', tower: t, target });
      const hit = s.splash
        ? this.enemies.filter((e) => {
            const p = along(e.dist);
            const q = along(target.dist);
            return Math.hypot(p.x - q.x, p.y - q.y) <= s.splash * CELL;
          })
        : [target];
      for (const e of hit) {
        e.hp -= s.damage;
        if (s.slow) e.slowFor = s.slow;
      }
    }
    for (const e of this.enemies.filter((x) => x.hp <= 0)) {
      this.enemies.splice(this.enemies.indexOf(e), 1);
      const gold = (e.boss ? 60 : 4) + Math.floor(this.wave / 2);
      this.gold += gold;
      this.kills++;
      this.score += (e.boss ? 200 : 10) * this.wave;
      ev.push({ type: 'kill', enemy: e, gold });
    }
    return ev;
  }
}
