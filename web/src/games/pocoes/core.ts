/**
 * "Poções" — pure rules. Customers queue up asking for a coloured potion. Drop two ingredients
 * into the cauldron to mix it and serve the right customer before their patience runs out.
 */
export const INGREDIENTS = ['Vermelho', 'Azul', 'Amarelo'] as const;
export const ING_EMOJI = ['🍄', '🫐', '🌼'] as const;
/** Potion made from two ingredient indexes (order doesn't matter). */
export const POTIONS = [
  { name: 'Vermelha', mix: [0, 0], color: 0xef4444 },
  { name: 'Azul', mix: [1, 1], color: 0x3b82f6 },
  { name: 'Amarela', mix: [2, 2], color: 0xfacc15 },
  { name: 'Roxa', mix: [0, 1], color: 0xa855f7 },
  { name: 'Laranja', mix: [0, 2], color: 0xf97316 },
  { name: 'Verde', mix: [1, 2], color: 0x22c55e },
] as const;
export const SLOTS = 3;

export function potionOf(a: number, b: number): number {
  const [x, y] = a <= b ? [a, b] : [b, a];
  return POTIONS.findIndex((p) => p.mix[0] === x && p.mix[1] === y);
}

export interface Customer {
  potion: number;
  patience: number;
  max: number;
}

export type ServeResult = 'ok' | 'wrong' | 'none';

export class BrewSim {
  t = 0;
  score = 0;
  served = 0;
  lives = 3;
  cauldron: number[] = [];
  slots: Array<Customer | null> = Array.from({ length: SLOTS }, () => null);
  private spawnIn = 1;

  constructor(private readonly rng: () => number = Math.random) {}

  get alive(): boolean {
    return this.lives > 0;
  }

  add(ing: number): boolean {
    if (!this.alive || this.cauldron.length >= 2) return false;
    this.cauldron.push(ing);
    return true;
  }

  clear(): void {
    this.cauldron = [];
  }

  /** The potion currently in the cauldron (-1 while it holds fewer than two ingredients). */
  brewed(): number {
    return this.cauldron.length === 2 ? potionOf(this.cauldron[0]!, this.cauldron[1]!) : -1;
  }

  serve(slot: number): ServeResult {
    const c = this.slots[slot];
    const p = this.brewed();
    if (!this.alive || !c || p < 0) return 'none';
    this.cauldron = [];
    if (p === c.potion) {
      this.score += 10 + Math.ceil(c.patience / 2);
      this.served++;
      this.slots[slot] = null;
      return 'ok';
    }
    c.patience -= 5;
    return 'wrong';
  }

  /** Steps the shop; returns how many customers left angry this step. */
  step(dt: number): number {
    if (!this.alive) return 0;
    this.t += dt;
    const pace = Math.min(1, this.t / 120);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const free = this.slots.findIndex((s) => !s);
      if (free >= 0) {
        const max = 24 - 8 * pace;
        this.slots[free] = { potion: Math.floor(this.rng() * POTIONS.length), patience: max, max };
      }
      this.spawnIn = 6 - 2.5 * pace + this.rng();
    }
    let angry = 0;
    this.slots = this.slots.map((c) => {
      if (!c) return null;
      c.patience -= dt;
      if (c.patience <= 0) {
        angry++;
        this.lives--;
        return null;
      }
      return c;
    });
    return angry;
  }
}

/** One action of a decent player: mix what the most impatient customer wants and serve it. */
export function botAct(s: BrewSim): void {
  const waiting = s.slots
    .map((c, i) => ({ c, i }))
    .filter((o): o is { c: Customer; i: number } => !!o.c)
    .sort((a, b) => a.c.patience - b.c.patience);
  if (waiting.length === 0) return;
  const want = waiting[0]!;
  if (s.cauldron.length === 2) {
    const slot = waiting.find((o) => o.c.potion === s.brewed());
    if (slot) s.serve(slot.i);
    else s.clear();
    return;
  }
  const mix = POTIONS[want.c.potion]!.mix;
  const have = [...s.cauldron];
  for (const m of mix) {
    const at = have.indexOf(m);
    if (at >= 0) have.splice(at, 1);
    else {
      s.add(m);
      return;
    }
  }
}
