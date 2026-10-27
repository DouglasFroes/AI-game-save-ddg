/**
 * "Território" (paper.io-like) — pure rules on a grid. Each player owns land. Leaving it draws a
 * trail; getting back home claims the trail and everything it encloses. Touching someone's
 * trail eliminates its owner (your own trail included!), and so does leaving the arena.
 */

export type Rng = () => number;

export const SIZE = 64;
export const START_R = 2;
/** Cells per second. */
export const PLAYER_SPEED = 8;
const BOT_SPEED = 7;
const BOTS = 6;
const RESPAWN_S = 3;

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
export const opposite = (d: Dir) => ((d + 2) % 4) as Dir;

export interface Runner {
  readonly id: number;
  readonly name: string;
  readonly color: number;
  readonly bot: boolean;
  x: number;
  y: number;
  dir: Dir;
  /** Requested turn, applied on the next cell (no 180° turns). */
  wish: Dir;
  alive: boolean;
  /** Cells of the current trail, in order. */
  trail: number[];
  progress: number;
  respawn: number;
  // Bot plan: steps left on this leg, and the legs still to go.
  plan: Dir[];
  kills: number;
}

export type TerritoryEvent =
  | { type: 'claim'; who: Runner; cells: number }
  | { type: 'kill'; who: Runner | null; victim: Runner }
  | { type: 'over'; by: Runner | null };

const NAMES = ['Bia', 'Caio', 'Duda', 'Enzo', 'Gabi', 'Lara', 'Nico', 'Theo', 'Vivi', 'Zeca'];
export const RUNNER_COLORS = [0x35e0ff, 0xff4f8b, 0xffd23f, 0x5bd46f, 0x9b5de5, 0xff7b00, 0xf15bb5];

export class TerritorySim {
  /** Owner id of each cell (0 = nobody). */
  readonly owner = new Uint8Array(SIZE * SIZE);
  /** Id of the runner whose trail is on each cell (0 = none). */
  readonly trail = new Uint8Array(SIZE * SIZE);
  readonly runners: Runner[] = [];
  readonly player: Runner;
  over = false;
  /** Best share of the map (0–1) the player reached. */
  best = 0;
  time = 0;

  constructor(
    name: string,
    private readonly rng: Rng = Math.random,
  ) {
    this.player = this.add(name, RUNNER_COLORS[0]!, false);
    for (let i = 0; i < BOTS; i++)
      this.add(NAMES[i]!, RUNNER_COLORS[(i % (RUNNER_COLORS.length - 1)) + 1]!, true);
    for (const r of this.runners) this.spawn(r);
    this.best = this.share(this.player);
  }

  static idx(x: number, y: number): number {
    return y * SIZE + x;
  }

  private add(name: string, color: number, bot: boolean): Runner {
    const r: Runner = {
      id: this.runners.length + 1,
      name,
      color,
      bot,
      x: 0,
      y: 0,
      dir: 0,
      wish: 0,
      alive: false,
      trail: [],
      progress: 0,
      respawn: 0,
      plan: [],
      kills: 0,
    };
    this.runners.push(r);
    return r;
  }

  /** Puts a runner on a free spot with a small square of land. */
  private spawn(r: Runner): void {
    let best = { x: SIZE / 2, y: SIZE / 2, free: -1 };
    for (let tries = 0; tries < 40; tries++) {
      const x = START_R + 2 + Math.floor(this.rng() * (SIZE - 2 * START_R - 4));
      const y = START_R + 2 + Math.floor(this.rng() * (SIZE - 2 * START_R - 4));
      let free = 0;
      for (let dy = -START_R - 2; dy <= START_R + 2; dy++)
        for (let dx = -START_R - 2; dx <= START_R + 2; dx++) {
          const i = TerritorySim.idx(x + dx, y + dy);
          if (this.owner[i] === 0 && this.trail[i] === 0) free++;
        }
      if (r === this.player && tries === 0) {
        best = { x: SIZE / 2, y: SIZE / 2, free: Infinity };
        break;
      }
      if (free > best.free) best = { x, y, free };
    }
    for (let dy = -START_R; dy <= START_R; dy++)
      for (let dx = -START_R; dx <= START_R; dx++) {
        const i = TerritorySim.idx(best.x + dx, best.y + dy);
        if (this.trail[i]) continue;
        this.owner[i] = r.id;
      }
    Object.assign(r, { x: best.x, y: best.y, alive: true, trail: [], progress: 0, plan: [] });
    r.dir = r.wish = Math.floor(this.rng() * 4) as Dir;
  }

  /** Share of the map owned by a runner (0–1). */
  share(r: Runner): number {
    let n = 0;
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === r.id) n++;
    return n / this.owner.length;
  }

  get score(): number {
    return Math.round(this.best * 10000); // hundredths of a percent
  }

  /** Steering: ignored when it would reverse straight into the trail. */
  turn(d: Dir, r: Runner = this.player): void {
    if (d !== opposite(r.dir)) r.wish = d;
  }

  private kill(victim: Runner, by: Runner | null, events: TerritoryEvent[]): void {
    if (!victim.alive) return;
    victim.alive = false;
    for (const c of victim.trail) if (this.trail[c] === victim.id) this.trail[c] = 0;
    victim.trail = [];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === victim.id) this.owner[i] = 0;
    victim.respawn = RESPAWN_S;
    if (by && by !== victim) by.kills++;
    events.push({ type: 'kill', who: by, victim });
    if (victim === this.player) {
      this.over = true;
      events.push({ type: 'over', by: by === victim ? null : by });
    }
  }

  /** Claims the trail plus every area it closes (cells not reachable from the map border). */
  private claim(r: Runner, events: TerritoryEvent[]): void {
    const wall = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < wall.length; i++) if (this.owner[i] === r.id) wall[i] = 1;
    for (const c of r.trail) wall[c] = 1;
    // Flood from outside: pad the grid by treating every border cell that isn't wall as a seed.
    const seen = new Uint8Array(SIZE * SIZE);
    const stack: number[] = [];
    for (let k = 0; k < SIZE; k++)
      for (const i of [
        TerritorySim.idx(k, 0),
        TerritorySim.idx(k, SIZE - 1),
        TerritorySim.idx(0, k),
        TerritorySim.idx(SIZE - 1, k),
      ])
        if (!wall[i] && !seen[i]) {
          seen[i] = 1;
          stack.push(i);
        }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % SIZE;
      const y = (i - x) / SIZE;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]!;
        const ny = y + DY[d]!;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const j = TerritorySim.idx(nx, ny);
        if (wall[j] || seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    let gained = 0;
    for (let i = 0; i < wall.length; i++) {
      if (seen[i] || this.owner[i] === r.id) continue;
      // Enclosed: becomes ours. Anyone whose trail was inside is cut off.
      const t = this.trail[i];
      if (t && t !== r.id) {
        const victim = this.runners[t - 1]!;
        this.kill(victim, r, events);
      }
      this.owner[i] = r.id;
      gained++;
    }
    for (const c of r.trail) if (this.trail[c] === r.id) this.trail[c] = 0;
    r.trail = [];
    if (gained) events.push({ type: 'claim', who: r, cells: gained });
  }

  /** Moves a runner one cell. */
  private advance(r: Runner, events: TerritoryEvent[]): void {
    if (r.wish !== opposite(r.dir)) r.dir = r.wish;
    const nx = r.x + DX[r.dir]!;
    const ny = r.y + DY[r.dir]!;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) {
      this.kill(r, null, events); // left the arena
      return;
    }
    r.x = nx;
    r.y = ny;
    const i = TerritorySim.idx(nx, ny);
    const t = this.trail[i];
    if (t) {
      const owner = this.runners[t - 1]!;
      this.kill(owner, owner === r ? null : r, events);
      if (owner === r || !r.alive) return;
    }
    if (this.owner[i] === r.id) {
      if (r.trail.length) this.claim(r, events);
    } else {
      this.trail[i] = r.id;
      r.trail.push(i);
    }
  }

  /** Bot: leaves home in a rectangle (out, across, back) and then wanders back inside. */
  private think(b: Runner): void {
    const home = this.owner[TerritorySim.idx(b.x, b.y)] === b.id;
    // Danger: the player's head is close to our trail → rush home.
    if (b.trail.length && Math.abs(this.player.x - b.x) + Math.abs(this.player.y - b.y) < 6)
      b.plan = [];
    if (!b.plan.length) {
      if (home) {
        const out = Math.floor(this.rng() * 4) as Dir;
        const side = ((out + (this.rng() < 0.5 ? 1 : 3)) % 4) as Dir;
        const a = 3 + Math.floor(this.rng() * (4 + Math.min(8, this.time / 20)));
        const w = 2 + Math.floor(this.rng() * 6);
        b.plan = [
          ...Array<Dir>(a).fill(out),
          ...Array<Dir>(w).fill(side),
          ...Array<Dir>(a + 1).fill(opposite(out)),
        ];
      } else {
        // Head for the closest own cell.
        let best: Dir = b.dir;
        let bestD = Infinity;
        for (let i = 0; i < this.owner.length; i++) {
          if (this.owner[i] !== b.id) continue;
          const x = i % SIZE;
          const y = (i - x) / SIZE;
          const d = Math.abs(x - b.x) + Math.abs(y - b.y);
          if (d < bestD) {
            bestD = d;
            const dx = x - b.x;
            const dy = y - b.y;
            best = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
          }
        }
        b.plan = [best];
      }
    }
    let d = b.plan.shift()!;
    // Never step on its own trail or out of the arena when another way exists.
    const bad = (dir: Dir) => {
      const nx = b.x + DX[dir]!;
      const ny = b.y + DY[dir]!;
      return (
        nx < 0 ||
        ny < 0 ||
        nx >= SIZE ||
        ny >= SIZE ||
        this.trail[TerritorySim.idx(nx, ny)] === b.id ||
        dir === opposite(b.dir)
      );
    };
    if (bad(d)) {
      const alt = ([0, 1, 2, 3] as Dir[]).filter((x) => !bad(x));
      if (alt.length) {
        d = alt[Math.floor(this.rng() * alt.length)]!;
        b.plan = [];
      }
    }
    b.wish = d;
  }

  step(dt: number): TerritoryEvent[] {
    if (this.over) return [];
    this.time += dt;
    const events: TerritoryEvent[] = [];
    for (const r of this.runners) {
      if (!r.alive) {
        if (r.bot) {
          r.respawn -= dt;
          if (r.respawn <= 0) this.spawn(r);
        }
        continue;
      }
      r.progress += dt * (r.bot ? BOT_SPEED : PLAYER_SPEED);
      while (r.progress >= 1 && r.alive && !this.over) {
        r.progress -= 1;
        if (r.bot) this.think(r);
        this.advance(r, events);
      }
      if (this.over) return events;
    }
    // Head-on: two heads on the same cell — the one with the smaller land loses.
    for (const a of this.runners)
      for (const b of this.runners) {
        if (a.id >= b.id || !a.alive || !b.alive || a.x !== b.x || a.y !== b.y) continue;
        const loser = this.share(a) < this.share(b) ? a : b;
        this.kill(loser, loser === a ? b : a, events);
        if (this.over) return events;
      }
    this.best = Math.max(this.best, this.share(this.player));
    return events;
  }
}
