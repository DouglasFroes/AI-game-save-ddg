import { shuffle, type Rnd } from '@/platform/rnd';

export type HandKind =
  'high' | 'pair' | 'twoPair' | 'three' | 'straight4' | 'fullHouse' | 'straight5' | 'four' | 'five';

export interface HandInfo {
  kind: HandKind;
  label: string;
  chips: number;
  mult: number;
}

export const HANDS: Readonly<Record<HandKind, HandInfo>> = {
  high: { kind: 'high', label: 'Carta alta', chips: 5, mult: 1 },
  pair: { kind: 'pair', label: 'Par', chips: 10, mult: 2 },
  twoPair: { kind: 'twoPair', label: 'Dois pares', chips: 20, mult: 2 },
  three: { kind: 'three', label: 'Trio', chips: 30, mult: 3 },
  straight4: { kind: 'straight4', label: 'Sequência de 4', chips: 30, mult: 4 },
  fullHouse: { kind: 'fullHouse', label: 'Full house', chips: 35, mult: 4 },
  straight5: { kind: 'straight5', label: 'Sequência de 5', chips: 40, mult: 4 },
  four: { kind: 'four', label: 'Quadra', chips: 60, mult: 7 },
  five: { kind: 'five', label: 'GENERALA!', chips: 100, mult: 10 },
};

/** Classifies five dice. */
export function classify(dice: readonly number[]): HandKind {
  const counts = new Map<number, number>();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => b - a);
  const faces = new Set(dice);
  const has = (...v: number[]) => v.every((x) => faces.has(x));
  if (sizes[0] === 5) return 'five';
  if (sizes[0] === 4) return 'four';
  if (has(1, 2, 3, 4, 5) || has(2, 3, 4, 5, 6)) return 'straight5';
  if (sizes[0] === 3 && sizes[1] === 2) return 'fullHouse';
  if (has(1, 2, 3, 4) || has(2, 3, 4, 5) || has(3, 4, 5, 6)) return 'straight4';
  if (sizes[0] === 3) return 'three';
  if (sizes[0] === 2 && sizes[1] === 2) return 'twoPair';
  if (sizes[0] === 2) return 'pair';
  return 'high';
}

export type JokerId =
  'pairs' | 'sixes' | 'lucky' | 'hands' | 'straight' | 'big' | 'heavy' | 'evens';

export interface Joker {
  id: JokerId;
  name: string;
  desc: string;
  emoji: string;
}

export const JOKERS: readonly Joker[] = [
  { id: 'pairs', name: 'Casal', desc: 'Mãos com par ou mais: +1 multiplicador', emoji: '👫' },
  { id: 'sixes', name: 'Seis de Ouro', desc: 'Cada dado 6 vale +8 fichas', emoji: '🥇' },
  { id: 'lucky', name: 'Sorte Grande', desc: '+1 rolagem por mão', emoji: '🍀' },
  { id: 'hands', name: 'Fôlego', desc: '+1 mão por rodada', emoji: '⏳' },
  { id: 'straight', name: 'Régua', desc: 'Sequências: +3 multiplicador', emoji: '📏' },
  { id: 'big', name: 'Cofre', desc: 'Toda mão ganha +25 fichas', emoji: '💰' },
  {
    id: 'heavy',
    name: 'Pesadão',
    desc: 'Trio, quadra e generala valem +2 multiplicador',
    emoji: '🏋️',
  },
  { id: 'evens', name: 'Par ou Ímpar', desc: 'Cada dado par: +1 multiplicador', emoji: '🎭' },
];

export interface Breakdown {
  kind: HandKind;
  label: string;
  chips: number;
  mult: number;
  total: number;
}

export function scoreHand(dice: readonly number[], jokers: readonly JokerId[]): Breakdown {
  const kind = classify(dice);
  const base = HANDS[kind];
  let chips = base.chips + dice.reduce((a, b) => a + b, 0);
  let mult = base.mult;
  const count = (id: JokerId) => jokers.filter((j) => j === id).length;
  if (kind !== 'high') mult += count('pairs');
  chips += count('sixes') * 8 * dice.filter((d) => d === 6).length;
  if (kind === 'straight4' || kind === 'straight5') mult += 3 * count('straight');
  chips += 25 * count('big');
  if (kind === 'three' || kind === 'four' || kind === 'five') mult += 2 * count('heavy');
  mult += count('evens') * dice.filter((d) => d % 2 === 0).length;
  return { kind, label: base.label, chips, mult, total: chips * mult };
}

export function targetFor(round: number): number {
  return Math.round((140 * 1.6 ** (round - 1)) / 5) * 5;
}

export type DadosEvent =
  | { type: 'roll'; rolled: number[] }
  | { type: 'played'; breakdown: Breakdown; roundScore: number }
  | { type: 'roundWon'; round: number; bonus: number }
  | { type: 'gameOver' }
  | { type: 'newHand' };

export const DICE = 5;
export const BASE_ROLLS = 3;
export const BASE_HANDS = 4;
export const MAX_JOKERS = 6;

/** "Dados Loucos": Yahtzee meets deck-building — roll, hold, score big and pick jokers between rounds. */
export class DadosSim {
  round = 1;
  dice: number[] = new Array<number>(DICE).fill(0);
  held: boolean[] = new Array<boolean>(DICE).fill(false);
  rollsLeft = BASE_ROLLS;
  handsLeft = BASE_HANDS;
  roundScore = 0;
  score = 0;
  target = targetFor(1);
  jokers: JokerId[] = [];
  state: 'hand' | 'shop' | 'over' = 'hand';
  offer: Joker[] = [];
  bestHand = 0;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get rollsPerHand(): number {
    return BASE_ROLLS + this.jokers.filter((j) => j === 'lucky').length;
  }

  get handsPerRound(): number {
    return BASE_HANDS + this.jokers.filter((j) => j === 'hands').length;
  }

  get rolled(): boolean {
    return this.dice[0] !== 0;
  }

  /** What the dice on the table would score right now. */
  get preview(): Breakdown | null {
    return this.rolled ? scoreHand(this.dice, this.jokers) : null;
  }

  toggle(i: number): boolean {
    if (this.state !== 'hand' || !this.rolled || this.rollsLeft <= 0 || i < 0 || i >= DICE)
      return false;
    this.held[i] = !this.held[i];
    return true;
  }

  roll(): DadosEvent[] {
    if (this.state !== 'hand' || this.rollsLeft <= 0) return [];
    const rolled: number[] = [];
    for (let i = 0; i < DICE; i++) {
      if (this.held[i]) continue;
      this.dice[i] = 1 + Math.floor(this.rnd() * 6);
      rolled.push(i);
    }
    this.rollsLeft--;
    if (this.rollsLeft <= 0) this.held.fill(false);
    return [{ type: 'roll', rolled }];
  }

  /** Scores the dice, then moves to the next hand, the shop, or game over. */
  play(): DadosEvent[] {
    if (this.state !== 'hand' || !this.rolled) return [];
    const breakdown = scoreHand(this.dice, this.jokers);
    this.roundScore += breakdown.total;
    this.score += breakdown.total;
    this.bestHand = Math.max(this.bestHand, breakdown.total);
    this.handsLeft--;
    const events: DadosEvent[] = [{ type: 'played', breakdown, roundScore: this.roundScore }];

    if (this.roundScore >= this.target) {
      const bonus = 100 * this.round + 40 * this.handsLeft;
      this.score += bonus;
      this.state = 'shop';
      this.offer = shuffle(this.rnd, [...JOKERS]).slice(0, 3);
      events.push({ type: 'roundWon', round: this.round, bonus });
    } else if (this.handsLeft <= 0) {
      this.state = 'over';
      events.push({ type: 'gameOver' });
    } else {
      this.newHand();
      events.push({ type: 'newHand' });
    }
    return events;
  }

  /** Takes a joker from the shop and starts the next round. */
  pick(id: JokerId): boolean {
    if (this.state !== 'shop' || !this.offer.some((j) => j.id === id)) return false;
    if (this.jokers.length < MAX_JOKERS) this.jokers.push(id);
    this.round++;
    this.target = targetFor(this.round);
    this.roundScore = 0;
    this.handsLeft = this.handsPerRound;
    this.offer = [];
    this.state = 'hand';
    this.newHand();
    return true;
  }

  private newHand(): void {
    this.dice.fill(0);
    this.held.fill(false);
    this.rollsLeft = this.rollsPerHand;
  }
}
