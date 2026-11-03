/**
 * "Buraco Negro" — pure rules. Drag a hole around the arena; it swallows everything smaller than
 * itself and grows with each bite. You have a minute.
 */
export const ARENA = { x: 20, y: 230, w: 680, h: 1000 } as const;
export const DURATION = 60;
export const START_R = 36;
export const MAX_R = 150;

export interface Item {
  x: number;
  y: number;
  r: number;
  /** Cosmetic: picks the item's colour/emoji. */
  kind: number;
}

export class HoleSim {
  x = ARENA.x + ARENA.w / 2;
  y = ARENA.y + ARENA.h / 2;
  r = START_R;
  t = 0;
  score = 0;
  eaten = 0;
  items: Item[] = [];

  constructor(private readonly rng: () => number = Math.random) {
    while (this.items.length < 26) this.items.push(this.spawn());
  }

  get done(): boolean {
    return this.t >= DURATION;
  }

  /** A new item: many small ones, a few big ones to grow into. */
  private spawn(): Item {
    for (let i = 0; i < 40; i++) {
      // Sizes come from a fixed spread, so the hole can't snowball past the biggest items.
      const r = 10 + Math.pow(this.rng(), 1.8) * 100;
      const x = ARENA.x + r + this.rng() * (ARENA.w - 2 * r);
      const y = ARENA.y + r + this.rng() * (ARENA.h - 2 * r);
      if (Math.hypot(x - this.x, y - this.y) > this.r + r + 40)
        return { x, y, r, kind: Math.floor(this.rng() * 6) };
    }
    return { x: ARENA.x + 60, y: ARENA.y + 60, r: 12, kind: 0 };
  }

  /** Moves toward (tx, ty) and swallows what fits. Returns the items eaten this step. */
  step(dt: number, tx: number, ty: number): Item[] {
    if (this.done) return [];
    this.t += dt;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const speed = Math.max(300, 460 - this.r * 1.2);
    const move = Math.min(d, speed * dt);
    if (d > 1e-6) {
      this.x += (dx / d) * move;
      this.y += (dy / d) * move;
    }
    this.x = Math.min(ARENA.x + ARENA.w - this.r, Math.max(ARENA.x + this.r, this.x));
    this.y = Math.min(ARENA.y + ARENA.h - this.r, Math.max(ARENA.y + this.r, this.y));
    const eaten: Item[] = [];
    this.items = this.items.map((it) => {
      if (it.r < this.r * 0.85 && Math.hypot(it.x - this.x, it.y - this.y) < this.r - it.r * 0.3) {
        eaten.push(it);
        this.r = Math.min(MAX_R, Math.sqrt(this.r * this.r + it.r * it.r * 0.2));
        this.score += Math.round(it.r);
        this.eaten++;
        return this.spawn();
      }
      return it;
    });
    return eaten;
  }

  /** Nearest item the hole can swallow right now (used by the bot). */
  nearestEdible(): Item | null {
    let best: Item | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (it.r >= this.r * 0.85) continue;
      const d = Math.hypot(it.x - this.x, it.y - this.y) - it.r;
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }
}
