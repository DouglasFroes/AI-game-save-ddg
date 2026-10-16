import type { Rnd } from '@/platform/rnd';

export interface ZigueTile {
  x: number;
  y: number;
  gem: boolean;
}

const key = (x: number, y: number) => `${x},${y}`;

/**
 * "Zigue-Zague": the ball rolls along a one-tile-wide path made of turns. Tap to swap between
 * going along +x and +y; fall off the edge and it is over.
 */
export class ZigueSim {
  /** Path in order, each tile adjacent to the previous one. */
  tiles: ZigueTile[] = [];
  private byKey = new Map<string, ZigueTile>();
  x = 0;
  y = 0;
  dir: 0 | 1 = 0;
  dead = false;
  time = 0;
  gems = 0;
  /** Index of the path tile the ball is on. */
  index = 0;
  private cx = 0;
  private cy = 0;
  private runDir: 0 | 1 = 0;
  private taken = new Set<string>();

  constructor(private readonly rnd: Rnd = Math.random) {
    for (let i = 0; i <= 5; i++) this.add(i, 0, false);
    this.cx = 5;
    this.extend();
  }

  get score(): number {
    return Math.floor(this.x + this.y) + this.gems * 5;
  }

  get speed(): number {
    return Math.min(7.5, 3.6 + this.time * 0.045);
  }

  tap(): void {
    if (!this.dead) this.dir = this.dir === 0 ? 1 : 0;
  }

  tileAt(x: number, y: number): ZigueTile | undefined {
    return this.byKey.get(key(Math.round(x), Math.round(y)));
  }

  step(dt: number): 'gem' | 'dead' | null {
    if (this.dead) return null;
    this.time += dt;
    const d = this.speed * dt;
    if (this.dir === 0) this.x += d;
    else this.y += d;
    const tile = this.tileAt(this.x, this.y);
    if (!tile) {
      this.dead = true;
      return 'dead';
    }
    const i = this.tiles.indexOf(tile, Math.max(0, this.index - 2));
    if (i > this.index) this.index = i;
    this.extend();
    const k = key(tile.x, tile.y);
    if (tile.gem && !this.taken.has(k)) {
      this.taken.add(k);
      this.gems++;
      return 'gem';
    }
    return null;
  }

  private add(x: number, y: number, gem: boolean): void {
    const t = { x, y, gem };
    this.tiles.push(t);
    this.byKey.set(key(x, y), t);
  }

  private extend(): void {
    while (this.tiles.length < this.index + 60) {
      this.runDir = this.rnd() < 0.82 ? (this.runDir === 0 ? 1 : 0) : this.runDir;
      const min = this.tiles.length < 70 ? 2 : 1;
      const len = min + Math.floor(this.rnd() * (5 - min));
      for (let i = 0; i < len; i++) {
        if (this.runDir === 0) this.cx++;
        else this.cy++;
        this.add(this.cx, this.cy, this.rnd() < 0.12);
      }
    }
  }
}
