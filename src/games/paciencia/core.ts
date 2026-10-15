/**
 * "Paciência" (Klondike, one card at a time) — pure rules. Build the four foundations from Ace
 * to King by suit; on the seven columns cards go down in alternating colors. Tapping a card moves
 * it to the best legal place (foundation first), which is how mobile solitaire is played.
 */

export type Rng = () => number;

/** 0 ♠, 1 ♥, 2 ♦, 3 ♣. */
export type Suit = 0 | 1 | 2 | 3;
export const isRed = (s: Suit) => s === 1 || s === 2;

export interface Card {
  readonly suit: Suit;
  /** 1 (Ace) … 13 (King). */
  readonly rank: number;
  up: boolean;
}

export type Loc =
  | { readonly kind: 'waste' }
  | { readonly kind: 'tableau'; readonly i: number }
  | { readonly kind: 'foundation'; readonly i: number };

export const POINTS = {
  toFoundation: 10,
  wasteToTableau: 5,
  flip: 5,
  fromFoundation: -15,
  recycle: -20,
};

export class Klondike {
  stock: Card[] = [];
  waste: Card[] = [];
  readonly foundations: Card[][] = [[], [], [], []];
  readonly tableau: Card[][] = [[], [], [], [], [], [], []];
  score = 0;
  moves = 0;

  constructor(rng: Rng = Math.random) {
    const deck: Card[] = [];
    for (const suit of [0, 1, 2, 3] as Suit[])
      for (let rank = 1; rank <= 13; rank++) deck.push({ suit, rank, up: false });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    for (let col = 0; col < 7; col++)
      for (let row = 0; row <= col; row++) {
        const c = deck.pop()!;
        c.up = row === col;
        this.tableau[col]!.push(c);
      }
    this.stock = deck;
  }

  get won(): boolean {
    return this.foundations.every((f) => f.length === 13);
  }

  /** Stock tap: turn one card onto the waste, or recycle the waste when the stock is empty. */
  draw(): 'draw' | 'recycle' | null {
    if (this.stock.length) {
      const c = this.stock.pop()!;
      c.up = true;
      this.waste.push(c);
      this.moves++;
      return 'draw';
    }
    if (!this.waste.length) return null;
    this.stock = this.waste.reverse().map((c) => ({ ...c, up: false }));
    this.waste = [];
    this.score = Math.max(0, this.score + POINTS.recycle);
    return 'recycle';
  }

  canFound(card: Card, f: number): boolean {
    const pile = this.foundations[f]!;
    const top = pile[pile.length - 1];
    return top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1;
  }

  canStack(card: Card, t: number): boolean {
    const pile = this.tableau[t]!;
    const top = pile[pile.length - 1];
    if (!top) return card.rank === 13;
    return top.up && isRed(top.suit) !== isRed(card.suit) && card.rank === top.rank - 1;
  }

  private pile(loc: Loc): Card[] {
    return loc.kind === 'waste'
      ? this.waste
      : loc.kind === 'tableau'
        ? this.tableau[loc.i]!
        : this.foundations[loc.i]!;
  }

  /** Cards that would move when picking `index` of a pile (a run on the tableau). */
  movable(from: Loc, index: number): Card[] | null {
    const pile = this.pile(from);
    const card = pile[index];
    if (!card?.up) return null;
    if (from.kind !== 'tableau' && index !== pile.length - 1) return null;
    return pile.slice(index);
  }

  /** Every legal destination for the cards at (from, index), best first. */
  destinations(from: Loc, index: number): Loc[] {
    const cards = this.movable(from, index);
    if (!cards) return [];
    const out: Loc[] = [];
    const first = cards[0]!;
    if (cards.length === 1 && from.kind !== 'foundation')
      for (let f = 0; f < 4; f++)
        if (this.canFound(first, f)) out.push({ kind: 'foundation', i: f });
    const tabs: Loc[] = [];
    for (let t = 0; t < 7; t++) {
      if (from.kind === 'tableau' && from.i === t) continue;
      if (!this.canStack(first, t)) continue;
      // A King moving from the bottom of a column to an empty one would gain nothing.
      if (first.rank === 13 && from.kind === 'tableau' && index === 0 && !this.tableau[t]!.length)
        continue;
      tabs.push({ kind: 'tableau', i: t });
    }
    // Prefer non-empty columns (keeps empty ones free for Kings).
    tabs.sort(
      (a, b) =>
        Number(!this.tableau[(a as { i: number }).i]!.length) -
        Number(!this.tableau[(b as { i: number }).i]!.length),
    );
    return [...out, ...tabs];
  }

  move(from: Loc, index: number, to: Loc): boolean {
    const cards = this.movable(from, index);
    if (
      !cards ||
      !this.destinations(from, index).some(
        (d) => d.kind === to.kind && ('i' in d ? d.i : -1) === ('i' in to ? to.i : -1),
      )
    )
      return false;
    const src = this.pile(from);
    src.splice(index, cards.length);
    this.pile(to).push(...cards);
    if (to.kind === 'foundation') this.score += POINTS.toFoundation;
    else if (from.kind === 'waste') this.score += POINTS.wasteToTableau;
    if (from.kind === 'foundation') this.score = Math.max(0, this.score + POINTS.fromFoundation);
    const top = src[src.length - 1];
    if (from.kind === 'tableau' && top && !top.up) {
      top.up = true;
      this.score += POINTS.flip;
    }
    this.moves++;
    return true;
  }

  /** Tap: moves the card to its best place. Returns where it went (or null). */
  auto(from: Loc, index: number): Loc | null {
    const to = this.destinations(from, index)[0];
    return to && this.move(from, index, to) ? to : null;
  }

  /** Every card is face up and the stock is empty: the rest can be played automatically. */
  get solvable(): boolean {
    return (
      !this.stock.length && !this.waste.length && this.tableau.every((t) => t.every((c) => c.up))
    );
  }

  /** One automatic step towards the foundations (lowest card first). False when none. */
  autoStep(): boolean {
    let best: { from: Loc; index: number; rank: number } | null = null;
    const consider = (from: Loc, pile: Card[]) => {
      const c = pile[pile.length - 1];
      if (!c) return;
      for (let f = 0; f < 4; f++)
        if (this.canFound(c, f) && (!best || c.rank < best.rank))
          best = { from, index: pile.length - 1, rank: c.rank };
    };
    consider({ kind: 'waste' }, this.waste);
    this.tableau.forEach((t, i) => consider({ kind: 'tableau', i }, t));
    if (!best) return false;
    const b = best as { from: Loc; index: number };
    const to = this.destinations(b.from, b.index).find((d) => d.kind === 'foundation')!;
    return this.move(b.from, b.index, to);
  }

  /** Final score: the points plus a speed bonus for a win. */
  finalScore(seconds: number): number {
    return this.score + (this.won ? Math.max(0, 3000 - Math.round(seconds) * 3) + 500 : 0);
  }
}
