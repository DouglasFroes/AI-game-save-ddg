import { shuffle, type Rnd } from '@/platform/rnd';

/**
 * Double-six dominoes for two: seven tiles each, the rest in the boneyard ("mercado"). Pure rules
 * and the CPU's choices; the scene only draws them.
 */
export type Tile = readonly [number, number];
export type End = 'L' | 'R';
export type Seat = 0 | 1; // 0 = player, 1 = CPU

export const MATCH_TARGET = 50;
export const HAND = 7;

export const pips = (t: Tile) => t[0] + t[1];
export const isDouble = (t: Tile) => t[0] === t[1];
export const handPips = (h: readonly Tile[]) => h.reduce((n, t) => n + pips(t), 0);

export function fullSet(): Tile[] {
  const out: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) out.push([a, b]);
  return out;
}

export interface Play {
  /** Index into the player's hand. */
  index: number;
  end: End;
}

export interface RoundResult {
  /** `null` for a drawn block. */
  winner: Seat | null;
  points: number;
  blocked: boolean;
}

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);

export class DominoRound {
  readonly hands: [Tile[], Tile[]] = [[], []];
  readonly pile: Tile[];
  /** Tiles in play, left to right, each oriented so neighbours match. */
  readonly chain: Tile[] = [];
  turn: Seat;
  result: RoundResult | null = null;
  /** The numbers each seat is known not to have (it drew or passed while they were open). */
  readonly lacks: [Set<number>, Set<number>] = [new Set(), new Set()];
  readonly opener: { seat: Seat; tile: Tile };
  private passes = 0;

  constructor(rnd: Rnd) {
    const deck = shuffle(rnd, fullSet());
    this.hands[0] = deck.slice(0, HAND);
    this.hands[1] = deck.slice(HAND, HAND * 2);
    this.pile = deck.slice(HAND * 2);
    // The highest double opens; with no double at all, the heaviest tile does.
    let best: { seat: Seat; tile: Tile; key: number } | null = null;
    for (const seat of [0, 1] as const) {
      for (const tile of this.hands[seat]) {
        const key = (isDouble(tile) ? 100 : 0) + pips(tile) * 2 + Math.max(...tile) * 0.01;
        if (!best || key > best.key) best = { seat, tile, key };
      }
    }
    const first = best!;
    this.opener = { seat: first.seat, tile: first.tile };
    const hand = this.hands[first.seat];
    hand.splice(hand.indexOf(first.tile), 1);
    this.chain.push(first.tile);
    this.turn = other(first.seat);
  }

  /** The two open numbers, left and right. */
  get ends(): readonly [number, number] {
    return [this.chain[0]![0], this.chain[this.chain.length - 1]![1]];
  }

  /** Every way `seat` can play (a tile that fits both ends is listed once per end). */
  legal(seat: Seat): Play[] {
    const [l, r] = this.ends;
    const out: Play[] = [];
    this.hands[seat].forEach((t, index) => {
      if (t[0] === l || t[1] === l) out.push({ index, end: 'L' });
      if (t[0] === r || t[1] === r) out.push({ index, end: 'R' });
    });
    return out;
  }

  /** Plays a tile; returns it as placed (oriented). */
  play(seat: Seat, play: Play): Tile {
    const hand = this.hands[seat];
    const tile = hand[play.index]!;
    const [l, r] = this.ends;
    let placed: Tile;
    if (play.end === 'L') {
      placed = tile[1] === l ? tile : [tile[1], tile[0]];
      this.chain.unshift(placed);
    } else {
      placed = tile[0] === r ? tile : [tile[1], tile[0]];
      this.chain.push(placed);
    }
    hand.splice(play.index, 1);
    this.passes = 0;
    if (hand.length === 0) {
      this.result = { winner: seat, points: handPips(this.hands[other(seat)]), blocked: false };
    } else this.turn = other(seat);
    return placed;
  }

  /** Takes a tile from the boneyard (only when nothing can be played). */
  draw(seat: Seat): Tile | null {
    const tile = this.pile.pop() ?? null;
    if (!tile) return null;
    this.hands[seat].push(tile);
    for (const n of this.ends) this.lacks[seat].add(n);
    return tile;
  }

  /** Passing is only allowed with nothing to play and an empty boneyard. */
  pass(seat: Seat): void {
    for (const n of this.ends) this.lacks[seat].add(n);
    this.passes++;
    if (this.passes >= 2) {
      const mine = handPips(this.hands[0]);
      const theirs = handPips(this.hands[1]);
      this.result = {
        winner: mine === theirs ? null : mine < theirs ? 0 : 1,
        points: Math.abs(mine - theirs),
        blocked: true,
      };
    } else this.turn = other(seat);
  }
}

// ---------------------------------------------------------------- CPU

/** Picks the CPU's tile. Level 0 plays at random, 1 plays the heaviest, 2+ plans ahead. */
export function choosePlay(round: DominoRound, seat: Seat, level: number, rnd: Rnd): Play {
  const options = round.legal(seat);
  if (level <= 0) return options[Math.floor(rnd() * options.length)]!;
  const hand = round.hands[seat];
  const foe = round.lacks[other(seat)];
  const [l, r] = round.ends;
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const play of options) {
    const tile = hand[play.index]!;
    let score = pips(tile) * 1.5 + (isDouble(tile) ? 4 : 0);
    if (level >= 2) {
      const open = play.end === 'L' ? l : r;
      const exposed = tile[0] === open ? tile[1] : tile[0];
      const ends = play.end === 'L' ? [exposed, r] : [l, exposed];
      const rest = hand.filter((_, i) => i !== play.index);
      for (const e of ends) {
        score += rest.filter((t) => t[0] === e || t[1] === e).length * 2.5;
        if (foe.has(e)) score += 5;
      }
      // Keep a spread of numbers in hand instead of piling up one.
      score += new Set(rest.flat()).size * 0.6;
    }
    score += rnd() * (level >= 2 ? 0.8 : 3);
    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }
  return best;
}

/** The CPU's level for the player's n-th match win. */
export const cpuLevel = (wins: number): number => (wins === 0 ? 1 : 2);

/** Points for winning a match: the margin and the round it was won in. */
export function matchPoints(wins: number, mine: number, theirs: number): number {
  return 100 + wins * 40 + Math.max(0, mine - theirs);
}
