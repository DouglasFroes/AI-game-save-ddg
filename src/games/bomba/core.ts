/**
 * Bomb maze ("Bombinhas") — pure simulation (no Phaser). The board is a grid of tiles; characters
 * move tile to tile with interpolation, so positions are always on a straight line between two
 * neighbouring tiles. Bombs explode in a cross, break bricks, chain other bombs and reveal items.
 */

export type Rng = () => number;

export const COLS = 13;
export const ROWS = 15;
export const FUSE_S = 2.6;
export const FLAME_S = 0.45;
export const START_LIVES = 3;
export const LEVEL_TIME = 180;
const BRICK_BURN_S = 0.45;
const RESPAWN_S = 1.6;
const SHIELD_S = 2.5;
const BASE_SPEED = 3.3;
const SPEED_STEP = 0.45;
const MAX_SPEED = 5.5;

export type Tile = 'floor' | 'wall' | 'brick';
export type Dir = 'up' | 'down' | 'left' | 'right';
export type ItemKind = 'bomb' | 'fire' | 'speed';
export type EnemyKind = 'bolha' | 'rapido' | 'fantasma';

export const DIRS: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
const ALL_DIRS = Object.keys(DIRS) as Dir[];
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Something walking on the grid: from tile (tx,ty) towards (nx,ny), `p` of the way there. */
export interface Walker {
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  p: number;
  dir: Dir;
  speed: number;
}

export interface Player extends Walker {
  alive: boolean;
  lives: number;
  bombs: number;
  fire: number;
  /** Seconds of invulnerability left after respawning. */
  shield: number;
  respawn: number;
}

export interface Enemy extends Walker {
  readonly id: number;
  readonly kind: EnemyKind;
  alive: boolean;
}

export interface Bomb {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  fuse: number;
  readonly range: number;
}

export interface Flame {
  readonly x: number;
  readonly y: number;
  t: number;
  /** For drawing: 'center', or the arm direction; `end` marks the tip. */
  readonly part: 'center' | Dir;
  readonly end: boolean;
}

export interface Item {
  readonly x: number;
  readonly y: number;
  readonly kind: ItemKind;
}

export type BombEvent =
  | { type: 'bomb'; bomb: Bomb }
  | { type: 'explode'; bomb: Bomb; cells: readonly Flame[] }
  | { type: 'brick'; x: number; y: number }
  | { type: 'item'; item: Item }
  | { type: 'enemy'; enemy: Enemy; points: number }
  | { type: 'die'; lives: number }
  | { type: 'door' }
  | { type: 'clear'; bonus: number }
  | { type: 'over' };

export interface Input {
  /** Held direction (null = stand still). */
  dir: Dir | null;
  /** Pressed this step. */
  bomb: boolean;
}

/** Position of a walker in tile units (tile centers are integers). */
export const posOf = (w: Walker) => ({
  x: w.tx + (w.nx - w.tx) * w.p,
  y: w.ty + (w.ny - w.ty) * w.p,
});
/** The tile a walker mostly stands on. */
export const tileOf = (w: Walker) => (w.p < 0.5 ? { x: w.tx, y: w.ty } : { x: w.nx, y: w.ny });

const isPillar = (x: number, y: number) =>
  x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 || (x % 2 === 0 && y % 2 === 0);

export interface LevelPlan {
  readonly bricks: number;
  readonly enemies: readonly EnemyKind[];
}

/** Difficulty curve: more bricks and more, smarter monsters each level. */
export function levelPlan(level: number): LevelPlan {
  const n = Math.min(10, 2 + level);
  const enemies: EnemyKind[] = [];
  for (let i = 0; i < n; i++) {
    if (level >= 4 && i % 4 === 3) enemies.push('fantasma');
    else if (level >= 2 && i % 3 === 1) enemies.push('rapido');
    else enemies.push('bolha');
  }
  return { bricks: Math.min(0.62, 0.42 + level * 0.025), enemies };
}

const ENEMY_SPEED: Record<EnemyKind, number> = { bolha: 1.5, rapido: 2.5, fantasma: 1.8 };
export const ENEMY_POINTS: Record<EnemyKind, number> = { bolha: 100, rapido: 200, fantasma: 400 };

/** What carries over from one level to the next. */
export interface Carry {
  readonly lives: number;
  readonly bombs: number;
  readonly fire: number;
  readonly speed: number;
  readonly score: number;
  readonly killed: number;
}

export class BombGame {
  readonly grid: Tile[][];
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly bombs: Bomb[] = [];
  readonly flames: Flame[] = [];
  readonly items: Item[] = [];
  /** Bricks being destroyed (for the crumble animation): seconds left by "x,y". */
  readonly burning = new Map<string, number>();
  door: { x: number; y: number; open: boolean; found: boolean };
  score = 0;
  time = LEVEL_TIME;
  cleared = false;
  over = false;
  enemiesKilled = 0;
  private readonly hiddenItems = new Map<string, ItemKind>();
  /** Bombs the player still stands on: walkable until they step off. */
  private readonly standingOn = new Set<number>();
  private ids = 0;

  constructor(
    readonly level = 1,
    private readonly rng: Rng = Math.random,
    carry?: Carry,
  ) {
    const plan = levelPlan(level);
    const safe = (x: number, y: number) => x + y <= 3;
    this.grid = [];
    const bricks: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < ROWS; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < COLS; x++) {
        if (isPillar(x, y)) row.push('wall');
        else if (!safe(x, y) && this.rng() < plan.bricks) {
          row.push('brick');
          bricks.push({ x, y });
        } else row.push('floor');
      }
      this.grid.push(row);
    }

    // The exit hides under a brick far from the start; a few items under others.
    const far = bricks.filter((b) => b.x + b.y > 10);
    const doorPool = far.length ? far : bricks;
    const doorAt = doorPool[Math.floor(this.rng() * doorPool.length)] ?? {
      x: COLS - 2,
      y: ROWS - 2,
    };
    this.door = { x: doorAt.x, y: doorAt.y, open: false, found: false };
    if (this.tile(doorAt.x, doorAt.y) !== 'brick') this.door.found = true;
    const kinds: ItemKind[] = ['bomb', 'fire', 'speed', 'bomb', 'fire'];
    const pool = bricks
      .filter((b) => b.x !== doorAt.x || b.y !== doorAt.y)
      .sort(() => this.rng() - 0.5);
    kinds.slice(0, Math.min(kinds.length, 2 + Math.ceil(level / 2))).forEach((kind, i) => {
      const b = pool[i];
      if (b) this.hiddenItems.set(`${b.x},${b.y}`, kind);
    });

    this.player = {
      tx: 1,
      ty: 1,
      nx: 1,
      ny: 1,
      p: 0,
      dir: 'down',
      speed: carry?.speed ?? BASE_SPEED,
      alive: true,
      lives: carry?.lives ?? START_LIVES,
      bombs: carry?.bombs ?? 1,
      fire: carry?.fire ?? 2,
      shield: 0,
      respawn: 0,
    };
    this.score = carry?.score ?? 0;
    this.enemiesKilled = carry?.killed ?? 0;

    const spots: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < ROWS - 1; y++)
      for (let x = 1; x < COLS - 1; x++)
        if (this.grid[y]![x] === 'floor' && x + y >= 8) spots.push({ x, y });
    spots.sort(() => this.rng() - 0.5);
    plan.enemies.forEach((kind, i) => {
      const at = spots[i % Math.max(1, spots.length)];
      if (at) this.addEnemy(kind, at.x, at.y);
    });
  }

  get carry(): Carry {
    const p = this.player;
    return {
      lives: p.lives,
      bombs: p.bombs,
      fire: p.fire,
      speed: p.speed,
      score: this.score,
      killed: this.enemiesKilled,
    };
  }

  tile(x: number, y: number): Tile {
    return this.grid[y]?.[x] ?? 'wall';
  }

  bombAt(x: number, y: number): Bomb | undefined {
    return this.bombs.find((b) => b.x === x && b.y === y);
  }

  addEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const e: Enemy = {
      id: ++this.ids,
      kind,
      alive: true,
      tx: x,
      ty: y,
      nx: x,
      ny: y,
      p: 0,
      dir: ALL_DIRS[Math.floor(this.rng() * 4)]!,
      speed: ENEMY_SPEED[kind] * (1 + Math.min(0.3, this.level * 0.03)),
    };
    this.enemies.push(e);
    return e;
  }

  step(dt: number, input: Input): BombEvent[] {
    const events: BombEvent[] = [];
    if (this.over || this.cleared) return events;
    this.time = Math.max(0, this.time - dt);

    this.updatePlayer(dt, input, events);
    for (const e of this.enemies) if (e.alive) this.moveEnemy(e, dt);
    this.updateBombs(dt, events);
    this.updateFlames(dt);
    this.checkHits(events);

    for (const [key, t] of this.burning) {
      if (t - dt > 0) this.burning.set(key, t - dt);
      else this.burning.delete(key);
    }

    if (!this.door.open && this.door.found && this.enemies.every((e) => !e.alive)) {
      this.door.open = true;
      events.push({ type: 'door' });
    }
    const p = this.player;
    const onDoor = tileOf(p);
    if (this.door.open && p.alive && onDoor.x === this.door.x && onDoor.y === this.door.y) {
      this.cleared = true;
      const bonus = 1000 * this.level + Math.round(this.time) * 10;
      this.score += bonus;
      events.push({ type: 'clear', bonus });
    }
    return events;
  }

  // ── Movement ────────────────────────────────────────────────────────────

  /** Whether a walker may enter tile (x,y). */
  private open(x: number, y: number, ghost = false, isPlayer = false): boolean {
    const t = this.tile(x, y);
    if (t === 'wall') return false;
    if (t === 'brick' && !ghost) return false;
    const bomb = this.bombAt(x, y);
    if (bomb && !(isPlayer && this.standingOn.has(bomb.id))) return false;
    return true;
  }

  /** Advances a walker; at each tile center `choose` picks the next direction (null = stop). */
  private walk(
    w: Walker,
    dt: number,
    choose: () => Dir | null,
    ghost = false,
    isPlayer = false,
  ): void {
    let budget = w.speed * dt;
    while (budget > 1e-9) {
      if (w.p === 0) {
        const dir = choose();
        if (!dir) return;
        const { dx, dy } = DIRS[dir];
        w.dir = dir;
        if (!this.open(w.tx + dx, w.ty + dy, ghost, isPlayer)) return;
        w.nx = w.tx + dx;
        w.ny = w.ty + dy;
      }
      const step = Math.min(budget, 1 - w.p);
      w.p += step;
      budget -= step;
      if (w.p >= 1 - 1e-9) {
        w.tx = w.nx;
        w.ty = w.ny;
        w.p = 0;
      }
    }
  }

  private updatePlayer(dt: number, input: Input, events: BombEvent[]): void {
    const p = this.player;
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0 && p.lives > 0) {
        Object.assign(p, { tx: 1, ty: 1, nx: 1, ny: 1, p: 0, alive: true, shield: SHIELD_S });
      }
      return;
    }
    p.shield = Math.max(0, p.shield - dt);

    if (input.bomb) this.placeBomb(events);

    // Turning back mid-way is instant; other turns wait for the next tile center.
    if (input.dir && p.p > 0 && input.dir === OPPOSITE[p.dir]) {
      [p.tx, p.nx] = [p.nx, p.tx];
      [p.ty, p.ny] = [p.ny, p.ty];
      p.p = 1 - p.p;
      p.dir = input.dir;
    }
    if (p.p > 0 || input.dir) this.walk(p, dt, () => input.dir, false, true);

    // A bomb you were standing on becomes solid once you are fully off its tile.
    for (const id of this.standingOn) {
      const b = this.bombs.find((bb) => bb.id === id);
      const on = b && ((p.tx === b.x && p.ty === b.y) || (p.p > 0 && p.nx === b.x && p.ny === b.y));
      if (!on) this.standingOn.delete(id);
    }

    const t = tileOf(p);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      if (t.x !== item.x || t.y !== item.y) continue;
      this.items.splice(i, 1);
      if (item.kind === 'bomb') p.bombs = Math.min(8, p.bombs + 1);
      else if (item.kind === 'fire') p.fire = Math.min(8, p.fire + 1);
      else p.speed = Math.min(MAX_SPEED, p.speed + SPEED_STEP);
      this.score += 50;
      events.push({ type: 'item', item });
    }
  }

  private placeBomb(events: BombEvent[]): void {
    const p = this.player;
    const { x, y } = tileOf(p);
    if (this.bombs.length >= p.bombs || this.bombAt(x, y) || this.tile(x, y) !== 'floor') return;
    const bomb: Bomb = { id: ++this.ids, x, y, fuse: FUSE_S, range: p.fire };
    this.bombs.push(bomb);
    this.standingOn.add(bomb.id);
    events.push({ type: 'bomb', bomb });
  }

  private moveEnemy(e: Enemy, dt: number): void {
    const ghost = e.kind === 'fantasma';
    this.walk(e, dt, () => this.enemyChoice(e, ghost), ghost);
  }

  /** Monster brains: wander and sometimes turn; "rápido" chases the player when in sight. */
  private enemyChoice(e: Enemy, ghost: boolean): Dir | null {
    const options = ALL_DIRS.filter((d) => this.open(e.tx + DIRS[d].dx, e.ty + DIRS[d].dy, ghost));
    if (!options.length) return null;
    if (e.kind === 'rapido' && this.player.alive) {
      const t = tileOf(this.player);
      const chase = this.lineOfSight(e.tx, e.ty, t.x, t.y);
      if (chase && options.includes(chase)) return chase;
    }
    if (options.includes(e.dir) && this.rng() > 0.25) return e.dir;
    const notBack = options.filter((d) => d !== OPPOSITE[e.dir]);
    const pickFrom = notBack.length ? notBack : options;
    return pickFrom[Math.floor(this.rng() * pickFrom.length)]!;
  }

  /** Direction to (x2,y2) if it is in the same row/column within 6 tiles with nothing between. */
  private lineOfSight(x1: number, y1: number, x2: number, y2: number): Dir | null {
    if (x1 !== x2 && y1 !== y2) return null;
    if (Math.abs(x1 - x2) + Math.abs(y1 - y2) > 6) return null;
    const dir: Dir = x1 === x2 ? (y2 > y1 ? 'down' : 'up') : x2 > x1 ? 'right' : 'left';
    const { dx, dy } = DIRS[dir];
    for (let x = x1 + dx, y = y1 + dy; x !== x2 || y !== y2; x += dx, y += dy)
      if (!this.open(x, y)) return null;
    return dir;
  }

  // ── Bombs and flames ────────────────────────────────────────────────────

  private updateBombs(dt: number, events: BombEvent[]): void {
    for (const b of this.bombs) b.fuse -= dt;
    // Explosions can chain: keep going while any fuse has run out.
    let next: Bomb | undefined;
    while ((next = this.bombs.find((b) => b.fuse <= 0))) this.explode(next, events);
  }

  private explode(bomb: Bomb, events: BombEvent[]): void {
    this.bombs.splice(this.bombs.indexOf(bomb), 1);
    this.standingOn.delete(bomb.id);
    const cells: Flame[] = [{ x: bomb.x, y: bomb.y, t: FLAME_S, part: 'center', end: false }];
    for (const dir of ALL_DIRS) {
      const { dx, dy } = DIRS[dir];
      for (let i = 1; i <= bomb.range; i++) {
        const x = bomb.x + dx * i;
        const y = bomb.y + dy * i;
        const t = this.tile(x, y);
        if (t === 'wall') break;
        if (t === 'brick') {
          this.breakBrick(x, y, events);
          break;
        }
        cells.push({ x, y, t: FLAME_S, part: dir, end: i === bomb.range });
        const other = this.bombAt(x, y);
        if (other) {
          other.fuse = 0; // chain reaction
          break;
        }
        // Flames burn uncovered items (but never the exit).
        const item = this.items.findIndex((it) => it.x === x && it.y === y);
        if (item >= 0) {
          this.items.splice(item, 1);
          break;
        }
      }
    }
    this.flames.push(...cells);
    events.push({ type: 'explode', bomb, cells });
  }

  private breakBrick(x: number, y: number, events: BombEvent[]): void {
    this.grid[y]![x] = 'floor';
    this.burning.set(`${x},${y}`, BRICK_BURN_S);
    this.score += 10;
    events.push({ type: 'brick', x, y });
    if (this.door.x === x && this.door.y === y) this.door.found = true;
    const kind = this.hiddenItems.get(`${x},${y}`);
    if (kind) {
      this.hiddenItems.delete(`${x},${y}`);
      this.items.push({ x, y, kind });
    }
  }

  private updateFlames(dt: number): void {
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i]!;
      f.t -= dt;
      if (f.t <= 0) this.flames.splice(i, 1);
    }
  }

  private burningAt(x: number, y: number): boolean {
    return this.flames.some((f) => f.x === x && f.y === y);
  }

  private checkHits(events: BombEvent[]): void {
    // Monsters caught in flames; several in one blast score double, then quadruple…
    let streak = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const t = tileOf(e);
      if (!this.burningAt(t.x, t.y)) continue;
      e.alive = false;
      const points = ENEMY_POINTS[e.kind] * 2 ** streak++;
      this.score += points;
      this.enemiesKilled++;
      events.push({ type: 'enemy', enemy: e, points });
    }

    const p = this.player;
    if (!p.alive || p.shield > 0) return;
    const t = tileOf(p);
    const pp = posOf(p);
    const touched = this.enemies.some((e) => {
      if (!e.alive) return false;
      const ep = posOf(e);
      return Math.abs(ep.x - pp.x) + Math.abs(ep.y - pp.y) < 0.7;
    });
    if (!this.burningAt(t.x, t.y) && !touched) return;
    p.alive = false;
    p.lives--;
    p.respawn = RESPAWN_S;
    // Losing a life also costs some fire power, so mistakes matter.
    p.fire = Math.max(2, p.fire - 1);
    events.push({ type: 'die', lives: p.lives });
    if (p.lives <= 0) {
      this.over = true;
      events.push({ type: 'over' });
    }
  }
}
