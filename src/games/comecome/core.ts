import type { Rnd } from '@/platform/rnd';

export const COLS = 15;
export const ROWS = 17;
export const HOME = { x: 7, y: 8 };
export const START = { x: 7, y: 13 };
const GHOST_STARTS = [
  { x: 7, y: 8 },
  { x: 6, y: 8 },
  { x: 8, y: 8 },
  { x: 7, y: 9 },
];
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Loop-rich random maze (true = wall) with an open room in the middle for the ghosts. */
export function generateMaze(rnd: Rnd): boolean[] {
  const walls = new Array<boolean>(COLS * ROWS).fill(true);
  const at = (x: number, y: number) => y * COLS + x;
  const stack: Array<[number, number]> = [[1, 1]];
  walls[at(1, 1)] = false;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]!;
    const options = DIRS.map(([dx, dy]) => [x + dx * 2, y + dy * 2, dx, dy] as const).filter(
      ([nx, ny]) => nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1 && walls[at(nx, ny)],
    );
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = options[Math.floor(rnd() * options.length)]!;
    walls[at(x + dx, y + dy)] = false;
    walls[at(nx, ny)] = false;
    stack.push([nx, ny]);
  }
  // Knock down some inner walls so there are loops to run around.
  for (let y = 1; y < ROWS - 1; y++)
    for (let x = 1; x < COLS - 1; x++) {
      const between = (x % 2 === 0) !== (y % 2 === 0);
      if (between && walls[at(x, y)] && rnd() < 0.3) walls[at(x, y)] = false;
    }
  for (let y = 7; y <= 9; y++) for (let x = 6; x <= 8; x++) walls[at(x, y)] = false;
  return walls;
}

export interface Mover {
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  /** Progress (0..1) towards tile (tx+dx, ty+dy). */
  p: number;
}

export type GhostMode = 'wait' | 'chase' | 'afraid' | 'eaten';
export interface Ghost extends Mover {
  id: number;
  mode: GhostMode;
  wait: number;
}

export type MazeEvent =
  | { type: 'pellet' }
  | { type: 'power' }
  | { type: 'eat'; points: number }
  | { type: 'died' }
  | { type: 'clear' }
  | { type: 'over' };

export const posOf = (m: Mover) => ({ x: m.tx + m.dx * m.p, y: m.ty + m.dy * m.p });

/** "Come-Come": eat every pellet, outrun the ghosts, a power pellet turns the tables. */
export class MazeSim {
  walls: boolean[] = [];
  pellets: Array<0 | 1 | 2> = [];
  remaining = 0;
  player: Mover = { tx: START.x, ty: START.y, dx: 0, dy: 0, p: 0 };
  ghosts: Ghost[] = [];
  lives = 3;
  score = 0;
  level = 1;
  fear = 0;
  freeze = 1;
  private chain = 0;
  private want = { dx: 0, dy: 0 };

  constructor(private readonly rnd: Rnd = Math.random) {
    this.buildLevel();
  }

  get playerSpeed(): number {
    return Math.min(7.2, 5.8 + this.level * 0.15);
  }

  private buildLevel(): void {
    this.walls = generateMaze(this.rnd);
    this.pellets = this.walls.map((w) => (w ? 0 : 1));
    for (const [x, y] of [
      [1, 1],
      [13, 1],
      [1, 15],
      [13, 15],
    ] as const)
      this.pellets[y * COLS + x] = 2;
    for (let y = 7; y <= 9; y++) for (let x = 6; x <= 8; x++) this.pellets[y * COLS + x] = 0;
    this.pellets[START.y * COLS + START.x] = 0;
    this.remaining = this.pellets.filter((p) => p > 0).length;
    this.resetPositions();
  }

  private resetPositions(): void {
    this.player = { tx: START.x, ty: START.y, dx: 0, dy: 0, p: 0 };
    this.want = { dx: 0, dy: 0 };
    const count = Math.min(4, 2 + this.level);
    this.ghosts = GHOST_STARTS.slice(0, count).map((s, id) => ({
      id,
      tx: s.x,
      ty: s.y,
      dx: 0,
      dy: 0,
      p: 0,
      mode: 'wait' as GhostMode,
      wait: 1 + id * 2.2,
    }));
    this.fear = 0;
    this.freeze = 1.2;
  }

  isWall(x: number, y: number): boolean {
    return x < 0 || y < 0 || x >= COLS || y >= ROWS || this.walls[y * COLS + x]!;
  }

  setWant(dx: number, dy: number): void {
    this.want = { dx, dy };
    const m = this.player;
    // Reversing between two tiles is instant.
    if ((m.dx || m.dy) && dx === -m.dx && dy === -m.dy && m.p > 0) this.flip(m);
  }

  private flip(m: Mover): void {
    m.tx += m.dx;
    m.ty += m.dy;
    m.dx = -m.dx;
    m.dy = -m.dy;
    m.p = 1 - m.p;
  }

  private decidePlayer = (m: Mover): void => {
    const { dx, dy } = this.want;
    if ((dx || dy) && !this.isWall(m.tx + dx, m.ty + dy)) {
      m.dx = dx;
      m.dy = dy;
    } else if (!(m.dx || m.dy) || this.isWall(m.tx + m.dx, m.ty + m.dy)) {
      m.dx = 0;
      m.dy = 0;
    }
  };

  private decideGhost(g: Ghost): void {
    const reverse = [-g.dx, -g.dy];
    let options = DIRS.filter(
      ([dx, dy]) =>
        !this.isWall(g.tx + dx, g.ty + dy) &&
        !(dx === reverse[0] && dy === reverse[1] && (g.dx || g.dy)),
    );
    if (options.length === 0)
      options = DIRS.filter(([dx, dy]) => !this.isWall(g.tx + dx, g.ty + dy));
    if (options.length === 0) return;
    let pick: readonly [number, number];
    if (g.mode === 'afraid' || (g.mode === 'chase' && this.rnd() < [0.12, 0.3, 0.55, 0.2][g.id]!)) {
      pick = options[Math.floor(this.rnd() * options.length)]!;
    } else {
      let tx: number = HOME.x;
      let ty: number = HOME.y;
      if (g.mode !== 'eaten') {
        const pl = this.player;
        tx = pl.tx;
        ty = pl.ty;
        // The second ghost cuts the corner, aiming ahead of the player.
        if (g.id === 1) {
          tx += pl.dx * 4;
          ty += pl.dy * 4;
        }
      }
      pick = options.reduce((best, d) =>
        (g.tx + d[0] - tx) ** 2 + (g.ty + d[1] - ty) ** 2 <
        (g.tx + best[0] - tx) ** 2 + (g.ty + best[1] - ty) ** 2
          ? d
          : best,
      );
    }
    g.dx = pick[0];
    g.dy = pick[1];
  }

  private advance(m: Mover, dist: number, decide: (m: Mover) => void, arrive: () => void): void {
    for (let guard = 0; dist > 1e-9 && guard < 8; guard++) {
      if (m.dx === 0 && m.dy === 0) {
        decide(m);
        if (m.dx === 0 && m.dy === 0) return;
      }
      const left = 1 - m.p;
      if (dist < left) {
        m.p += dist;
        return;
      }
      dist -= left;
      m.tx += m.dx;
      m.ty += m.dy;
      m.p = 0;
      arrive();
      decide(m);
    }
  }

  step(dt: number): MazeEvent[] {
    const events: MazeEvent[] = [];
    if (this.freeze > 0) {
      this.freeze -= dt;
      return events;
    }
    this.advance(this.player, this.playerSpeed * dt, this.decidePlayer, () => this.eat(events));
    if (this.remaining === 0) {
      this.level++;
      this.buildLevel();
      events.push({ type: 'clear' });
      return events;
    }
    if (this.fear > 0) {
      this.fear -= dt;
      if (this.fear <= 0) for (const g of this.ghosts) if (g.mode === 'afraid') g.mode = 'chase';
    }
    for (const g of this.ghosts) {
      if (g.mode === 'wait') {
        g.wait -= dt;
        if (g.wait <= 0) g.mode = 'chase';
        continue;
      }
      const base = Math.min(6.6, 4.4 + this.level * 0.3);
      const speed = g.mode === 'afraid' ? 3 : g.mode === 'eaten' ? 10 : base;
      this.advance(
        g,
        speed * dt,
        (m) => this.decideGhost(m as Ghost),
        () => {
          if (g.mode === 'eaten' && g.tx === HOME.x && g.ty === HOME.y)
            g.mode = this.fear > 0 ? 'afraid' : 'chase';
        },
      );
    }
    this.collide(events);
    return events;
  }

  private eat(events: MazeEvent[]): void {
    const i = this.player.ty * COLS + this.player.tx;
    const v = this.pellets[i];
    if (!v) return;
    this.pellets[i] = 0;
    this.remaining--;
    if (v === 2) {
      this.score += 50;
      this.fear = Math.max(3, 7 - this.level * 0.5);
      this.chain = 0;
      for (const g of this.ghosts)
        if (g.mode === 'chase') {
          g.mode = 'afraid';
          if ((g.dx || g.dy) && g.p > 0) this.flip(g);
        }
      events.push({ type: 'power' });
    } else {
      this.score += 10;
      events.push({ type: 'pellet' });
    }
  }

  private collide(events: MazeEvent[]): void {
    const pp = posOf(this.player);
    for (const g of this.ghosts) {
      if (g.mode === 'wait' || g.mode === 'eaten') continue;
      const gp = posOf(g);
      if (Math.hypot(pp.x - gp.x, pp.y - gp.y) > 0.6) continue;
      if (g.mode === 'afraid') {
        this.chain++;
        const points = 200 * 2 ** Math.min(3, this.chain - 1);
        this.score += points;
        g.mode = 'eaten';
        events.push({ type: 'eat', points });
      } else {
        this.lives--;
        if (this.lives <= 0) events.push({ type: 'over' });
        else {
          this.resetPositions();
          events.push({ type: 'died' });
        }
        return;
      }
    }
  }
}
