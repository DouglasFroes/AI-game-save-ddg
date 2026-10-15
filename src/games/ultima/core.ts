/**
 * "Última Carta" (an Uno-style game) — pure rules. Match the top card by color or by symbol,
 * use the action cards (+2, skip, reverse, wild, wild +4) and be the first to empty your hand.
 * The player faces three bots; each round won adds the points left in the others' hands, and
 * the run lasts until a bot wins a round.
 */

export type Rng = () => number;

/** 0 red, 1 yellow, 2 green, 3 blue; -1 = wild (no color until played). */
export type Color = -1 | 0 | 1 | 2 | 3;
export type Value = number | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface UCard {
  readonly id: number;
  readonly color: Color;
  readonly value: Value;
}

export const PLAYERS = 4;
export const HAND = 7;
export const HUMAN = 0;

export const cardPoints = (c: UCard): number =>
  typeof c.value === 'number' ? c.value : c.value === 'wild' || c.value === 'wild4' ? 50 : 20;

export function buildDeck(): UCard[] {
  const deck: UCard[] = [];
  let id = 0;
  for (const color of [0, 1, 2, 3] as const) {
    deck.push({ id: ++id, color, value: 0 });
    for (let n = 1; n <= 9; n++)
      for (let k = 0; k < 2; k++) deck.push({ id: ++id, color, value: n });
    for (const v of ['skip', 'reverse', 'draw2'] as const)
      for (let k = 0; k < 2; k++) deck.push({ id: ++id, color, value: v });
  }
  for (let k = 0; k < 4; k++) {
    deck.push({ id: ++id, color: -1, value: 'wild' });
    deck.push({ id: ++id, color: -1, value: 'wild4' });
  }
  return deck;
}

export type UltimaEvent =
  | { type: 'play'; player: number; card: UCard; color: Color }
  | { type: 'draw'; player: number; count: number }
  | { type: 'skip'; player: number }
  | { type: 'reverse' }
  | { type: 'last'; player: number }
  | { type: 'round'; winner: number; points: number };

export class UltimaRound {
  readonly hands: UCard[][] = [];
  drawPile: UCard[] = [];
  readonly discard: UCard[] = [];
  /** Color in force (a wild sets it). */
  color: Color = 0;
  turn = HUMAN;
  direction: 1 | -1 = 1;
  winner: number | null = null;
  /** The card the current player just drew and may still play (or pass). */
  drawn: UCard | null = null;

  constructor(private readonly rng: Rng = Math.random) {
    const deck = buildDeck();
    this.shuffle(deck);
    for (let p = 0; p < PLAYERS; p++) this.hands.push(deck.splice(0, HAND));
    // The first card shown is a number card.
    const first = deck.findIndex((c) => typeof c.value === 'number');
    const [top] = deck.splice(first, 1);
    this.discard.push(top!);
    this.color = top!.color;
    this.drawPile = deck;
  }

  private shuffle(a: UCard[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
  }

  get top(): UCard {
    return this.discard[this.discard.length - 1]!;
  }

  get over(): boolean {
    return this.winner !== null;
  }

  canPlay(c: UCard): boolean {
    if (c.color === -1) return true;
    return c.color === this.color || (this.top.value === c.value && this.top.color !== -1);
  }

  playable(player: number): UCard[] {
    const hand = this.hands[player]!;
    if (this.drawn && player === this.turn) return this.canPlay(this.drawn) ? [this.drawn] : [];
    return hand.filter((c) => this.canPlay(c));
  }

  next(from = this.turn, steps = 1): number {
    return (((from + this.direction * steps) % PLAYERS) + PLAYERS) % PLAYERS;
  }

  private take(player: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (!this.drawPile.length) {
        // Reshuffle the discard pile, keeping its top card.
        const top = this.discard.pop()!;
        this.drawPile = this.discard.splice(0);
        this.shuffle(this.drawPile);
        this.discard.push(top);
        if (!this.drawPile.length) return;
      }
      this.hands[player]!.push(this.drawPile.pop()!);
    }
  }

  /** Plays a card of the current player. `chosen` is the color picked for a wild. */
  play(card: UCard, chosen: Color = 0): UltimaEvent[] {
    if (this.over) return [];
    const player = this.turn;
    const hand = this.hands[player]!;
    if (!hand.includes(card) || !this.playable(player).includes(card)) return [];
    hand.splice(hand.indexOf(card), 1);
    this.discard.push(card);
    this.drawn = null;
    this.color = card.color === -1 ? (chosen === -1 ? 0 : chosen) : card.color;
    const events: UltimaEvent[] = [{ type: 'play', player, card, color: this.color }];
    if (hand.length === 1) events.push({ type: 'last', player });
    if (hand.length === 0) {
      const points = this.hands.reduce((s, h) => s + h.reduce((t, c) => t + cardPoints(c), 0), 0);
      this.winner = player;
      events.push({ type: 'round', winner: player, points });
      return events;
    }
    let advance = 1;
    if (card.value === 'reverse') {
      this.direction = this.direction === 1 ? -1 : 1;
      events.push({ type: 'reverse' });
    } else if (card.value === 'skip') {
      events.push({ type: 'skip', player: this.next() });
      advance = 2;
    } else if (card.value === 'draw2' || card.value === 'wild4') {
      const victim = this.next();
      const n = card.value === 'draw2' ? 2 : 4;
      this.take(victim, n);
      events.push({ type: 'draw', player: victim, count: n }, { type: 'skip', player: victim });
      advance = 2;
    }
    this.turn = this.next(player, advance);
    return events;
  }

  /** The current player draws one card; if it can't be played, the turn passes. */
  draw(): UltimaEvent[] {
    if (this.over || this.drawn) return [];
    const player = this.turn;
    this.take(player, 1);
    const hand = this.hands[player]!;
    const card = hand[hand.length - 1]!;
    const events: UltimaEvent[] = [{ type: 'draw', player, count: 1 }];
    if (this.canPlay(card)) this.drawn = card;
    else this.turn = this.next();
    return events;
  }

  /** Keeps the drawn card and ends the turn. */
  pass(): boolean {
    if (!this.drawn) return false;
    this.drawn = null;
    this.turn = this.next();
    return true;
  }

  /** The color a player has most of (for wilds). */
  favoriteColor(player: number): Color {
    const count = [0, 0, 0, 0];
    for (const c of this.hands[player]!) if (c.color !== -1) count[c.color]!++;
    return count.indexOf(Math.max(...count)) as Color;
  }

  /** Bot turn: plays its best card, or draws (and plays the drawn card if it can). */
  botTurn(): UltimaEvent[] {
    const player = this.turn;
    const options = this.playable(player);
    if (!options.length) {
      const events = this.draw();
      if (this.drawn) events.push(...this.play(this.drawn, this.favoriteColor(player)));
      return events;
    }
    const nextCards = this.hands[this.next()]!.length;
    const score = (c: UCard): number => {
      const attack = c.value === 'draw2' || c.value === 'skip' || c.value === 'wild4' ? 1 : 0;
      if (c.color === -1) return nextCards <= 2 ? 40 : -50; // keep wilds for later
      // Attack a player close to winning; otherwise get rid of high cards, keep colors.
      return (
        (nextCards <= 2 ? attack * 60 : 0) +
        cardPoints(c) +
        (c.color === this.favoriteColor(player) ? 5 : 0)
      );
    };
    const best = [...options].sort((a, b) => score(b) - score(a))[0]!;
    return this.play(best, this.favoriteColor(player));
  }
}
