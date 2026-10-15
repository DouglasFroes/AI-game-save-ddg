/** Uniform spatial hash for fast "who is near this point" queries, rebuilt every step. */

export interface Point {
  x: number;
  y: number;
}

export class SpatialGrid<T extends Point> {
  private readonly cells = new Map<number, T[]>();
  private readonly pool: T[][] = [];

  constructor(private readonly size = 96) {}

  private key(cx: number, cy: number): number {
    return (cx + 1000) * 4096 + (cy + 1000);
  }

  clear(): void {
    for (const list of this.cells.values()) {
      list.length = 0;
      this.pool.push(list);
    }
    this.cells.clear();
  }

  insert(item: T): void {
    const k = this.key(Math.floor(item.x / this.size), Math.floor(item.y / this.size));
    let list = this.cells.get(k);
    if (!list) {
      list = this.pool.pop() ?? [];
      this.cells.set(k, list);
    }
    list.push(item);
  }

  /** Calls `fn` for every item within `r` of (x, y). Return true from `fn` to stop early. */
  query(x: number, y: number, r: number, fn: (item: T, d2: number) => boolean | void): void {
    const r2 = r * r;
    const x0 = Math.floor((x - r) / this.size);
    const x1 = Math.floor((x + r) / this.size);
    const y0 = Math.floor((y - r) / this.size);
    const y1 = Math.floor((y + r) / this.size);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (!list) continue;
        for (const item of list) {
          const dx = item.x - x;
          const dy = item.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && fn(item, d2) === true) return;
        }
      }
  }

  nearest(x: number, y: number, maxR: number, skip?: (item: T) => boolean): T | null {
    let best: T | null = null;
    let bestD = Infinity;
    this.query(x, y, maxR, (item, d2) => {
      if (d2 < bestD && !skip?.(item)) {
        bestD = d2;
        best = item;
      }
    });
    return best;
  }
}
