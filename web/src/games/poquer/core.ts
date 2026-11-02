/**
 * "Pôquer" — pure rules of Poker Squares (solitaire poker). Twenty-five cards come one at a time
 * and each goes into a free square of a 5×5 grid. When the grid is full, its five rows and five
 * columns count as poker hands and pay by the table; the score is the sum of the ten lines.
 */
export const SIZE = 5;
export const CELLS = SIZE * SIZE;

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
  | 'pair'
  | 'nothing';

/** The American Poker Squares table. */
export const POINTS: Readonly<Record<HandName, number>> = {
  royal: 100,
  straightFlush: 75,
  four: 50,
  fullHouse: 25,
  flush: 20,
  straight: 15,
  three: 10,
  twoPair: 5,
  pair: 2,
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
  pair: 'Par',
  nothing: 'Nada',
};

/** Short names for the labels next to each line. */
export const HAND_SHORT: Readonly<Record<HandName, string>> = {
  royal: 'Royal',
  straightFlush: 'S. Flush',
  four: 'Quadra',
  fullHouse: 'Full',
  flush: 'Flush',
  straight: 'Seq.',
  three: 'Trinca',
  twoPair: '2 Pares',
  pair: 'Par',
  nothing: '',
};

/** Hands from best to worst, for the reference table. */
export const TABLE: readonly HandName[] = [
  'royal',
  'straightFlush',
  'four',
  'fullHouse',
  'flush',
  'straight',
  'three',
  'twoPair',
  'pair',
];

/** The hand made by five cards. */
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
  if (groups[0] === 2) return 'pair';
  return 'nothing';
}

/** What a line with fewer than five cards already holds (only matched ranks count so far). */
export function partial(cards: readonly Card[]): HandName {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  if (groups[0] === 4) return 'four';
  if (groups[0] === 3 && groups[1] === 2) return 'fullHouse';
  if (groups[0] === 3) return 'three';
  if (groups[0] === 2 && groups[1] === 2) return 'twoPair';
  if (groups[0] === 2) return 'pair';
  return 'nothing';
}

export interface Line {
  readonly kind: 'row' | 'col';
  readonly index: number;
  /** Grid cells of the line, in order. */
  readonly cells: readonly number[];
}

/** The ten lines: five rows, then five columns. */
export const LINES: readonly Line[] = [
  ...Array.from({ length: SIZE }, (_, r) => ({
    kind: 'row' as const,
    index: r,
    cells: Array.from({ length: SIZE }, (_, c) => r * SIZE + c),
  })),
  ...Array.from({ length: SIZE }, (_, c) => ({
    kind: 'col' as const,
    index: c,
    cells: Array.from({ length: SIZE }, (_, r) => r * SIZE + c),
  })),
];

export interface LineState {
  readonly line: Line;
  /** Cards placed so far. */
  readonly filled: number;
  /** Hand held so far ('nothing' when no matched ranks yet). */
  readonly name: HandName;
  /** Points: only a full line pays. */
  readonly points: number;
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

export class PokerSquares {
  readonly grid: (Card | null)[] = Array.from({ length: CELLS }, () => null);
  private readonly stock: Card[];
  placed = 0;

  constructor(rng: () => number = Math.random) {
    this.stock = deck(rng).slice(0, CELLS);
  }

  /** The card waiting to be placed (null when the grid is full). */
  get current(): Card | null {
    return this.stock[this.placed] ?? null;
  }

  get over(): boolean {
    return this.placed >= CELLS;
  }

  /** Puts the current card in a free cell; returns the lines it completed (null if refused). */
  place(cell: number): LineState[] | null {
    const card = this.current;
    if (!card || cell < 0 || cell >= CELLS || this.grid[cell]) return null;
    this.grid[cell] = card;
    this.placed++;
    return LINES.filter((l) => l.cells.includes(cell) && this.stateOf(l).filled === SIZE).map((l) =>
      this.stateOf(l),
    );
  }

  stateOf(line: Line): LineState {
    const cards = line.cells.map((c) => this.grid[c]).filter((c): c is Card => c !== null);
    if (cards.length === SIZE) {
      const name = evaluate(cards);
      return { line, filled: SIZE, name, points: POINTS[name] };
    }
    return { line, filled: cards.length, name: partial(cards), points: 0 };
  }

  states(): LineState[] {
    return LINES.map((l) => this.stateOf(l));
  }

  get score(): number {
    return this.states().reduce((sum, s) => sum + s.points, 0);
  }

  /** The best single line so far. */
  get best(): { name: HandName; points: number } {
    let best: { name: HandName; points: number } = { name: 'nothing', points: 0 };
    for (const s of this.states()) if (s.points > best.points) best = s;
    return best;
  }
}
