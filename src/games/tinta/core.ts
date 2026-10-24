import { pick, type Rnd } from '@/platform/rnd';

export type Rgb = readonly [number, number, number];

export interface Pigment {
  id: 'cyan' | 'magenta' | 'yellow' | 'white' | 'black';
  name: string;
  rgb: Rgb;
}

export const PIGMENTS: readonly Pigment[] = [
  { id: 'cyan', name: 'Ciano', rgb: [0, 190, 235] },
  { id: 'magenta', name: 'Magenta', rgb: [230, 0, 140] },
  { id: 'yellow', name: 'Amarelo', rgb: [255, 225, 0] },
  { id: 'white', name: 'Branco', rgb: [255, 255, 255] },
  { id: 'black', name: 'Preto', rgb: [25, 25, 30] },
];

export const MAX_DROPS = 8;
/** Below this match a delivery counts as a mistake. */
export const MIN_OK = 0.7;
export const PERFECT = 0.97;

/** Averages the drops, like mixing equal-sized drops of paint. */
export function mix(drops: readonly Pigment['id'][]): Rgb | null {
  if (drops.length === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const id of drops) {
    const p = PIGMENTS.find((x) => x.id === id)!;
    r += p.rgb[0];
    g += p.rgb[1];
    b += p.rgb[2];
  }
  const n = drops.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** 1 = identical, 0 = as far apart as black and white. */
export function match(a: Rgb, b: Rgb): number {
  const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return Math.max(0, 1 - d / 441.67);
}

/** How exact the colour is in the player's eyes: the raw distance is too forgiving, so sharpen it. */
export function accuracy(a: Rgb, b: Rgb): number {
  return Math.max(0, 1 - (1 - match(a, b)) * 3.2);
}

export interface Order {
  target: Rgb;
  /** Fewest drops that reproduce the target exactly. */
  recipe: Pigment['id'][];
  seconds: number;
}

/** Recipes grow from 2 drops up to 6 as the level rises, and the clock shrinks. */
export function makeOrder(index: number, rnd: Rnd): Order {
  const size = Math.min(2 + Math.floor(index / 2), 6);
  const recipe: Pigment['id'][] = [];
  for (let i = 0; i < size; i++) recipe.push(pick(rnd, PIGMENTS).id);
  // Avoid dull orders made of one single pigment.
  if (new Set(recipe).size === 1) recipe[0] = recipe[0] === 'white' ? 'black' : 'white';
  const target = mix(recipe)!;
  return { target, recipe, seconds: Math.max(15, 32 - index) };
}

export type TintaEvent =
  | { type: 'drop'; id: Pigment['id'] }
  | { type: 'full' }
  | {
      type: 'delivered';
      accuracy: number;
      points: number;
      perfect: boolean;
      ok: boolean;
      timeLeft: number;
    }
  | { type: 'newOrder' }
  | { type: 'timeUp' }
  | { type: 'over' };

/** "Mistura": copy the customer's colour with as few drops as you can before the clock runs out. */
export class TintaSim {
  index = 0;
  lives = 3;
  score = 0;
  orders = 0;
  perfect = 0;
  streak = 0;
  bestStreak = 0;
  drops: Pigment['id'][] = [];
  order: Order;
  time: number;
  over = false;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.order = makeOrder(0, rnd);
    this.time = this.order.seconds;
  }

  get current(): Rgb | null {
    return mix(this.drops);
  }

  get liveMatch(): number {
    const c = this.current;
    return c ? accuracy(c, this.order.target) : 0;
  }

  add(id: Pigment['id']): TintaEvent[] {
    if (this.over) return [];
    if (this.drops.length >= MAX_DROPS) return [{ type: 'full' }];
    this.drops.push(id);
    return [{ type: 'drop', id }];
  }

  undo(): void {
    if (!this.over) this.drops.pop();
  }

  clear(): void {
    if (!this.over) this.drops = [];
  }

  deliver(): TintaEvent[] {
    if (this.over || this.drops.length === 0) return [];
    const acc = this.liveMatch;
    const ok = acc >= MIN_OK;
    const perfect = acc >= PERFECT;
    const events: TintaEvent[] = [];
    let points = 0;
    if (ok) {
      this.orders++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (perfect) this.perfect++;
      const speed = Math.round(this.time * 2);
      // Fewer drops than the recipe is impossible to beat, but wasteful ones lose a little.
      const tidy = Math.max(0, 3 - Math.max(0, this.drops.length - this.order.recipe.length)) * 5;
      points =
        Math.round(acc * 60) + speed + tidy + (perfect ? 40 : 0) + Math.min(this.streak, 10) * 5;
      this.score += points;
    } else {
      this.streak = 0;
      this.lives--;
    }
    events.push({ type: 'delivered', accuracy: acc, points, perfect, ok, timeLeft: this.time });
    if (this.lives <= 0) {
      this.over = true;
      events.push({ type: 'over' });
    } else this.next(events);
    return events;
  }

  step(dt: number): TintaEvent[] {
    if (this.over) return [];
    this.time = Math.max(0, this.time - dt);
    if (this.time > 0) return [];
    this.streak = 0;
    this.lives--;
    const events: TintaEvent[] = [{ type: 'timeUp' }];
    if (this.lives <= 0) {
      this.over = true;
      events.push({ type: 'over' });
    } else this.next(events);
    return events;
  }

  private next(events: TintaEvent[]): void {
    this.index++;
    this.order = makeOrder(this.index, this.rnd);
    this.time = this.order.seconds;
    this.drops = [];
    events.push({ type: 'newOrder' });
  }
}
