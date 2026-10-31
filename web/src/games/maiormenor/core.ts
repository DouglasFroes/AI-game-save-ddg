/**
 * "Maior ou Menor" — pure rules of a push-your-luck card game. Guess whether the next card is
 * higher or lower; each right guess adds to the pot (riskier guesses add more). Bank the pot to keep
 * it, or keep going for a bigger one — a wrong guess loses the pot and a life. A tie is free.
 */
export const LIVES = 3;
export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export interface Card {
  /** 1 (ace) .. 13 (king). */
  readonly rank: number;
  readonly suit: (typeof SUITS)[number];
}

export const cardLabel = (c: Card): string => `${RANK_LABELS[c.rank]}${c.suit}`;
export const isRed = (c: Card): boolean => c.suit === '♥' || c.suit === '♦';

export function shuffledDeck(rng: () => number): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export type Guess = 'higher' | 'lower';

export type GuessResult =
  | { kind: 'win'; card: Card; gain: number }
  | { kind: 'tie'; card: Card }
  | { kind: 'lose'; card: Card; lost: number; livesLeft: number };

export class HiLoGame {
  deck: Card[];
  current: Card;
  pot = 0;
  score = 0;
  lives = LIVES;
  streak = 0;
  bestStreak = 0;
  banks = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.deck = shuffledDeck(rng);
    this.current = this.draw();
  }

  get over(): boolean {
    return this.lives <= 0;
  }

  private draw(): Card {
    if (!this.deck.length) this.deck = shuffledDeck(this.rng);
    return this.deck.pop()!;
  }

  /** Chance (0..1) that the guess wins, from the cards left in the deck. */
  odds(guess: Guess): number {
    const pool = this.deck.length ? this.deck : shuffledDeck(this.rng);
    const wins = pool.filter((c) =>
      guess === 'higher' ? c.rank > this.current.rank : c.rank < this.current.rank,
    ).length;
    return wins / pool.length;
  }

  /** Points a right guess adds to the pot: rarer guesses are worth more, and streaks grow it. */
  gainFor(guess: Guess): number {
    const p = Math.max(0.04, this.odds(guess));
    return Math.round((10 / p) * (1 + this.streak * 0.15));
  }

  guess(g: Guess): GuessResult {
    const gain = this.gainFor(g);
    const card = this.draw();
    const prev = this.current;
    this.current = card;
    if (card.rank === prev.rank) return { kind: 'tie', card };
    const right = g === 'higher' ? card.rank > prev.rank : card.rank < prev.rank;
    if (right) {
      this.pot += gain;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      return { kind: 'win', card, gain };
    }
    const lost = this.pot;
    this.pot = 0;
    this.streak = 0;
    this.lives--;
    return { kind: 'lose', card, lost, livesLeft: this.lives };
  }

  /** Keeps the pot (a bigger pot banked at once earns a bonus). */
  bank(): number {
    if (this.pot <= 0) return 0;
    const bonus = this.streak >= 5 ? Math.round(this.pot * 0.2) : 0;
    const total = this.pot + bonus;
    this.score += total;
    this.pot = 0;
    this.streak = 0;
    this.banks++;
    return total;
  }

  /** Ends the run keeping whatever is in the pot. */
  cashOut(): void {
    this.bank();
    this.lives = 0;
  }
}
