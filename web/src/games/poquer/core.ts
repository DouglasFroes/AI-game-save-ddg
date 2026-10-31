/**
 * "Pôquer" — pure rules of video poker (Jacks or Better). Each hand costs the bet; you get five
 * cards, hold the ones you like and draw replacements once. The final hand pays by the table.
 * Twenty-five hands per session; the score is the chips left (going broke ends it early).
 */
export const HANDS = 25;
export const START_CHIPS = 100;
export const BET = 5;

export interface Card {
  /** 2..14 (11 J, 12 Q, 13 K, 14 A). */
  readonly rank: number;
  readonly suit: '♠' | '♥' | '♦' | '♣';
}

export const RANK_LABEL = (r: number): string =>
  r <= 10 ? String(r) : ['J', 'Q', 'K', 'A'][r - 11]!;

export type HandName =
  | 'royal'
  | 'straightFlush'
  | 'four'
  | 'fullHouse'
  | 'flush'
  | 'straight'
  | 'three'
  | 'twoPair'
  | 'jacks'
  | 'nothing';

export const PAYOUT: Readonly<Record<HandName, number>> = {
  royal: 250,
  straightFlush: 50,
  four: 25,
  fullHouse: 9,
  flush: 6,
  straight: 4,
  three: 3,
  twoPair: 2,
  jacks: 1,
  nothing: 0,
};

export const HAND_LABEL: Readonly<Record<HandName, string>> = {
  royal: 'Royal Flush',
  straightFlush: 'Straight Flush',
  four: 'Quadra',
  fullHouse: 'Full House',
  flush: 'Flush',
  straight: 'Sequência',
  three: 'Trinca',
  twoPair: 'Dois Pares',
  jacks: 'Par de J ou maior',
  nothing: 'Nada',
};

export function evaluate(hand: readonly Card[]): HandName {
  const ranks = hand.map((c) => c.rank).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = hand.every((c) => c.suit === hand[0]!.suit);
  const unique = counts.size === 5;
  const wheel = unique && ranks.join(',') === '2,3,4,5,14';
  const straight = unique && (ranks[4]! - ranks[0]! === 4 || wheel);
  if (straight && flush) return ranks[0] === 10 ? 'royal' : 'straightFlush';
  if (groups[0] === 4) return 'four';
  if (groups[0] === 3 && groups[1] === 2) return 'fullHouse';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0] === 3) return 'three';
  if (groups[0] === 2 && groups[1] === 2) return 'twoPair';
  if (groups[0] === 2) {
    const pair = [...counts].find(([, n]) => n === 2)![0];
    if (pair >= 11) return 'jacks';
  }
  return 'nothing';
}

function deck(rng: () => number): Card[] {
  const out: Card[] = [];
  for (const suit of ['♠', '♥', '♦', '♣'] as const)
    for (let rank = 2; rank <= 14; rank++) out.push({ rank, suit });
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export class PokerSession {
  chips = START_CHIPS;
  handNo = 0;
  hand: Card[] = [];
  held = [false, false, false, false, false];
  phase: 'bet' | 'hold' | 'shown' = 'bet';
  best: HandName = 'nothing';
  bestPay = 0;
  private stock: Card[] = [];

  constructor(private readonly rng: () => number = Math.random) {}

  get over(): boolean {
    return this.phase !== 'hold' && (this.handNo >= HANDS || this.chips < BET);
  }

  deal(): boolean {
    if (this.over || this.phase === 'hold') return false;
    this.chips -= BET;
    this.handNo++;
    this.stock = deck(this.rng);
    this.hand = this.stock.splice(0, 5);
    this.held = [false, false, false, false, false];
    this.phase = 'hold';
    return true;
  }

  toggle(i: number): void {
    if (this.phase === 'hold') this.held[i] = !this.held[i];
  }

  /** Replaces the cards not held and pays the final hand. */
  draw(): { name: HandName; win: number } {
    this.hand = this.hand.map((c, i) => (this.held[i] ? c : this.stock.shift()!));
    const name = evaluate(this.hand);
    const win = PAYOUT[name] * BET;
    this.chips += win;
    if (PAYOUT[name] > this.bestPay) {
      this.bestPay = PAYOUT[name];
      this.best = name;
    }
    this.phase = 'shown';
    return { name, win };
  }
}
