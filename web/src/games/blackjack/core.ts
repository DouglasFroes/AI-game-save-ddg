export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const SUITS: readonly Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: readonly Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

export function createDeck(rng: () => number = Math.random): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}

export function handValue(cards: readonly Card[]): {
  total: number;
  soft: boolean;
  blackjack: boolean;
  bust: boolean;
} {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') {
      total += 11;
      aces++;
    } else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J' || c.rank === '10') {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return {
    total,
    soft: aces > 0,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
}

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export class BlackjackGame {
  chips = 500;
  peakChips = 500;
  bet = 0;
  handIndex = 0;
  readonly maxHands = 10;
  wins = 0;
  blackjacks = 0;
  player: Card[] = [];
  dealer: Card[] = [];
  state: 'betting' | 'playing' | 'settled' | 'finished' = 'betting';
  lastOutcome: HandOutcome | null = null;
  lastDelta = 0;
  private deck: Card[];

  constructor(private readonly rng: () => number = Math.random) {
    this.deck = createDeck(rng);
  }

  private draw(): Card {
    if (this.deck.length === 0) this.deck = createDeck(this.rng);
    return this.deck.pop()!;
  }

  deal(betAmount: number): boolean {
    if (this.state !== 'betting' && this.state !== 'settled') return false;
    const w = Math.max(10, Math.min(this.chips, betAmount));
    if (w <= 0 || this.chips <= 0) return false;
    if (this.deck.length < 15) this.deck = createDeck(this.rng);

    this.handIndex++;
    this.bet = w;
    this.chips -= w;
    this.player = [this.draw(), this.draw()];
    this.dealer = [this.draw(), this.draw()];
    this.lastOutcome = null;
    this.lastDelta = 0;
    this.state = 'playing';

    const pv = handValue(this.player);
    if (pv.blackjack) {
      this.stand();
    }
    return true;
  }

  canDouble(): boolean {
    return this.state === 'playing' && this.player.length === 2 && this.chips >= this.bet;
  }

  hit(): HandOutcome | null {
    if (this.state !== 'playing') return null;
    this.player.push(this.draw());
    const pv = handValue(this.player);
    if (pv.bust) {
      return this.settle('bust');
    }
    if (pv.total === 21) {
      return this.stand();
    }
    return null;
  }

  doubleDown(): HandOutcome | null {
    if (!this.canDouble()) return null;
    this.chips -= this.bet;
    this.bet *= 2;
    this.player.push(this.draw());
    const pv = handValue(this.player);
    if (pv.bust) return this.settle('bust');
    return this.stand();
  }

  stand(): HandOutcome {
    if (this.state !== 'playing') return this.lastOutcome ?? 'lose';
    while (handValue(this.dealer).total < 17) {
      this.dealer.push(this.draw());
    }
    const pv = handValue(this.player);
    const dv = handValue(this.dealer);

    if (pv.blackjack && !dv.blackjack) return this.settle('blackjack');
    if (dv.bust || pv.total > dv.total) return this.settle('win');
    if (pv.total === dv.total && pv.blackjack === dv.blackjack) return this.settle('push');
    return this.settle('lose');
  }

  private settle(outcome: HandOutcome): HandOutcome {
    this.lastOutcome = outcome;
    if (outcome === 'blackjack') {
      const payout = Math.floor(this.bet * 2.5);
      this.chips += payout;
      this.lastDelta = payout - this.bet;
      this.wins++;
      this.blackjacks++;
    } else if (outcome === 'win') {
      const payout = this.bet * 2;
      this.chips += payout;
      this.lastDelta = this.bet;
      this.wins++;
    } else if (outcome === 'push') {
      this.chips += this.bet;
      this.lastDelta = 0;
    } else {
      this.lastDelta = -this.bet;
    }

    if (this.chips > this.peakChips) this.peakChips = this.chips;
    this.state = this.chips <= 0 || this.handIndex >= this.maxHands ? 'finished' : 'settled';
    return outcome;
  }
}
