import type { Rnd } from '@/platform/rnd';

export const FIELD_W = 720;
export const BASKET_Y = 1110;
export const BASKET_HALF = 90;
const FLOOR_Y = 1230;

export type ItemKind = 'fruit' | 'gold' | 'bomb' | 'heart';

export interface FallingItem {
  x: number;
  y: number;
  vy: number;
  kind: ItemKind;
  /** Which fruit sprite to draw. */
  variant: number;
}

export type BasketEvent =
  | { type: 'catch'; kind: ItemKind; x: number }
  | { type: 'miss'; x: number }
  | { type: 'boom'; x: number };

/** "Cesto Maluco": catch the fruit with the basket, dodge the bombs. */
export class BasketSim {
  x = FIELD_W / 2;
  lives = 3;
  score = 0;
  caught = 0;
  items: FallingItem[] = [];
  time = 0;
  private spawnIn = 0.6;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get dead(): boolean {
    return this.lives <= 0;
  }

  moveTo(x: number): void {
    this.x = Math.max(BASKET_HALF, Math.min(FIELD_W - BASKET_HALF, x));
  }

  step(dt: number): BasketEvent[] {
    const events: BasketEvent[] = [];
    if (this.dead) return events;
    this.time += dt;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      this.spawnIn = Math.max(0.32, 0.85 - this.time * 0.008) * (0.7 + this.rnd() * 0.6);
    }
    for (const it of this.items) it.y += it.vy * dt;
    const remaining: FallingItem[] = [];
    for (const it of this.items) {
      const inBasket =
        it.y >= BASKET_Y - 30 &&
        it.y <= BASKET_Y + 40 &&
        Math.abs(it.x - this.x) <= BASKET_HALF + 14;
      if (inBasket) {
        this.collect(it, events);
      } else if (it.y > FLOOR_Y) {
        if (it.kind === 'fruit' || it.kind === 'gold') {
          this.lives--;
          events.push({ type: 'miss', x: it.x });
        }
      } else remaining.push(it);
    }
    this.items = remaining;
    return events;
  }

  private collect(it: FallingItem, events: BasketEvent[]): void {
    if (it.kind === 'bomb') {
      this.lives--;
      events.push({ type: 'boom', x: it.x });
      return;
    }
    if (it.kind === 'heart') this.lives = Math.min(3, this.lives + 1);
    else {
      this.score += it.kind === 'gold' ? 5 : 1;
      this.caught++;
    }
    events.push({ type: 'catch', kind: it.kind, x: it.x });
  }

  private spawn(): void {
    const r = this.rnd();
    const bomb = Math.min(0.32, 0.14 + this.time * 0.003);
    let kind: ItemKind = 'fruit';
    if (r < bomb) kind = 'bomb';
    else if (r < bomb + 0.06) kind = 'gold';
    else if (r < bomb + 0.09 && this.lives < 3) kind = 'heart';
    this.items.push({
      x: 50 + this.rnd() * (FIELD_W - 100),
      y: 140,
      vy: Math.min(720, 280 + this.time * 7) * (0.85 + this.rnd() * 0.3),
      kind,
      variant: Math.floor(this.rnd() * 6),
    });
  }
}
