/**
 * "Lanchonete" — pure rules of a burger rush. Customers queue up with an order (bottom bun, some
 * fillings in a given order, top bun). Tap the ingredients in that order to build it; a wrong
 * ingredient spoils the burger. Every customer's patience runs down while they wait — anyone who
 * gives up costs a life. Orders get longer and customers less patient.
 */
export const INGREDIENTS = [
  'pao',
  'carne',
  'queijo',
  'alface',
  'tomate',
  'bacon',
  'cebola',
  'topo',
] as const;
export type Ingredient = (typeof INGREDIENTS)[number];
export const FILLINGS: readonly Ingredient[] = [
  'carne',
  'queijo',
  'alface',
  'tomate',
  'bacon',
  'cebola',
];
export const LIVES = 3;
export const MAX_QUEUE = 4;

export interface Customer {
  readonly id: number;
  readonly order: readonly Ingredient[];
  patience: number;
  readonly maxPatience: number;
}

export type DinerEvent =
  | { type: 'add'; ingredient: Ingredient }
  | { type: 'spoiled' }
  | { type: 'served'; customer: Customer; points: number }
  | { type: 'left'; customer: Customer; livesLeft: number }
  | { type: 'arrived'; customer: Customer }
  | { type: 'over' };

export class Diner {
  queue: Customer[] = [];
  plate: Ingredient[] = [];
  time = 0;
  score = 0;
  served = 0;
  lives = LIVES;
  private arriveIn = 0;
  private nextId = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.arrive();
  }

  get over(): boolean {
    return this.lives <= 0;
  }

  get current(): Customer | undefined {
    return this.queue[0];
  }

  private arrive(): Customer {
    const fillings = Math.min(6, 2 + Math.floor(this.served / 4));
    const order: Ingredient[] = ['pao'];
    for (let i = 0; i < fillings; i++)
      order.push(FILLINGS[Math.floor(this.rng() * FILLINGS.length)]!);
    order.push('topo');
    const maxPatience = Math.max(9, 12 + fillings * 2.2 - this.served * 0.35);
    const c = { id: this.nextId++, order, patience: maxPatience, maxPatience };
    this.queue.push(c);
    this.arriveIn = Math.max(3, 9 - this.served * 0.25) * (0.7 + this.rng() * 0.6);
    return c;
  }

  step(dt: number): DinerEvent[] {
    const ev: DinerEvent[] = [];
    if (this.over) return ev;
    this.time += dt;
    this.arriveIn -= dt;
    if ((this.arriveIn <= 0 && this.queue.length < MAX_QUEUE) || this.queue.length === 0)
      ev.push({ type: 'arrived', customer: this.arrive() });
    for (const c of [...this.queue]) {
      c.patience -= dt;
      if (c.patience > 0) continue;
      const wasFirst = this.queue[0] === c;
      this.queue.splice(this.queue.indexOf(c), 1);
      if (wasFirst) this.plate = [];
      this.lives--;
      ev.push({ type: 'left', customer: c, livesLeft: this.lives });
      if (this.over) {
        ev.push({ type: 'over' });
        return ev;
      }
    }
    return ev;
  }

  /** Puts an ingredient on the plate for the customer at the counter. */
  add(ing: Ingredient): DinerEvent[] {
    const c = this.current;
    if (!c || this.over) return [];
    if (c.order[this.plate.length] !== ing) {
      this.plate = [];
      c.patience = Math.max(0.5, c.patience - 2);
      return [{ type: 'spoiled' }];
    }
    this.plate.push(ing);
    if (this.plate.length < c.order.length) return [{ type: 'add', ingredient: ing }];
    // Done: served. Patience left is the tip.
    this.queue.shift();
    this.plate = [];
    this.served++;
    const tip = Math.round((c.patience / c.maxPatience) * 50);
    const points = c.order.length * 15 + tip;
    this.score += points;
    return [{ type: 'served', customer: c, points }];
  }
}
