/**
 * "Memória: Aventura" — a level-based memory game (like Salve o Doguinho: pick a level, earn up
 * to 3 stars, unlock the next). New twists show up along the way: a peek at the start, a bomb
 * card that costs time, and cards that swap places after a miss.
 */

export type Rng = () => number;

export const FACES = 13;
const PEEK_S = 0.8;
export const BOMB_PENALTY = 5;
export const BOMB = -1;

export interface MemoLevel {
  readonly id: number;
  readonly cols: number;
  readonly rows: number;
  /** Seconds to clear the board. */
  readonly time: number;
  /** Seconds every card is shown at the start (0 = none). */
  readonly preview: number;
  /** One unpaired bomb card: flipping it costs BOMB_PENALTY seconds. */
  readonly bomb: boolean;
  /** After each miss two hidden cards swap places. */
  readonly shuffle: boolean;
}

// [cols, rows, time, preview, bomb, shuffle]
const TABLE: ReadonlyArray<[number, number, number, number, boolean, boolean]> = [
  [3, 2, 30, 2, false, false],
  [3, 4, 45, 2, false, false],
  [4, 4, 55, 2, false, false],
  [4, 4, 50, 0, false, false],
  [4, 5, 65, 2, false, false],
  [3, 5, 50, 1.5, true, false],
  [4, 5, 60, 0, false, false],
  [5, 3, 45, 0, true, false],
  [4, 6, 80, 2, false, false],
  [5, 5, 80, 1.5, true, false],
  [4, 4, 55, 1.5, false, true],
  [4, 5, 65, 1.5, false, true],
  [3, 5, 50, 0, true, true],
  [4, 6, 80, 1, false, false],
  [5, 5, 75, 0, true, false],
  [4, 5, 60, 0, false, true],
  [4, 6, 75, 1, false, true],
  [5, 5, 75, 1, true, true],
  [4, 6, 70, 0, false, false],
  [5, 5, 70, 0, true, true],
  [4, 5, 50, 0, false, true],
  [4, 6, 65, 0, false, true],
  [5, 5, 65, 0.8, true, true],
  [4, 6, 60, 0, false, false],
  [5, 5, 60, 0, true, false],
  [4, 6, 60, 0, false, true],
  [5, 5, 60, 0, true, true],
  [4, 6, 55, 0, false, true],
  [5, 5, 55, 0, true, true],
  [4, 6, 50, 0, false, true],
];

export const LEVELS: readonly MemoLevel[] = TABLE.map(
  ([cols, rows, time, preview, bomb, shuffle], i) => ({
    id: i + 1,
    cols,
    rows,
    time,
    preview,
    bomb,
    shuffle,
  }),
);

export const pairsOf = (l: MemoLevel) => Math.floor((l.cols * l.rows - (l.bomb ? 1 : 0)) / 2);

/** 3 stars with few misses, 2 with some, 1 for just clearing it. */
export function starsFor(level: MemoLevel, misses: number): 1 | 2 | 3 {
  const pairs = pairsOf(level);
  if (misses <= Math.floor(pairs / 2)) return 3;
  if (misses <= pairs) return 2;
  return 1;
}

export const pointsFor = (stars: number, timeLeft: number) =>
  stars * 1000 + Math.round(timeLeft) * 10;

export interface Card {
  readonly id: number;
  /** Face 0..FACES-1, or BOMB. */
  readonly face: number;
  up: boolean;
  matched: boolean;
}

export type MemoEvent =
  | { type: 'flip'; card: Card }
  | { type: 'match'; a: Card; b: Card }
  | { type: 'miss' }
  | { type: 'bomb' }
  | { type: 'hide' }
  | { type: 'swap'; i: number; j: number }
  | { type: 'previewEnd' }
  | { type: 'won'; stars: 1 | 2 | 3; points: number }
  | { type: 'lost' };

export class MemoLevelSim {
  cards: Card[] = [];
  time: number;
  misses = 0;
  /** Seconds left of the opening peek (input is blocked meanwhile). */
  preview: number;
  over = false;
  won = false;
  private peek = 0;
  private open: Card[] = [];
  private pendingSwap = false;

  constructor(
    readonly level: MemoLevel,
    private readonly rng: Rng = Math.random,
  ) {
    const pairs = pairsOf(level);
    const faces = [...Array(FACES).keys()].sort(() => this.rng() - 0.5).slice(0, pairs);
    const deck = [...faces, ...faces, ...(level.bomb ? [BOMB] : [])].sort(() => this.rng() - 0.5);
    this.cards = deck.map((face, i) => ({
      id: i + 1,
      face,
      up: level.preview > 0,
      matched: false,
    }));
    this.time = level.time;
    this.preview = level.preview;
  }

  flip(index: number): MemoEvent[] {
    const card = this.cards[index];
    if (this.over || this.preview > 0 || !card || card.up || this.peek > 0 || this.open.length >= 2)
      return [];
    card.up = true;
    this.open.push(card);
    const events: MemoEvent[] = [{ type: 'flip', card }];
    if (card.face === BOMB) {
      this.time = Math.max(0, this.time - BOMB_PENALTY);
      this.misses++;
      this.peek = PEEK_S;
      events.push({ type: 'bomb' });
      return events;
    }
    if (this.open.length < 2) return events;
    const [a, b] = this.open as [Card, Card];
    if (a.face === b.face) {
      a.matched = b.matched = true;
      this.open = [];
      events.push({ type: 'match', a, b });
      if (this.cards.every((c) => c.matched || c.face === BOMB)) {
        this.over = this.won = true;
        const stars = starsFor(this.level, this.misses);
        events.push({ type: 'won', stars, points: pointsFor(stars, this.time) });
      }
    } else {
      this.misses++;
      this.peek = PEEK_S;
      this.pendingSwap = this.level.shuffle;
      events.push({ type: 'miss' });
    }
    return events;
  }

  step(dt: number): MemoEvent[] {
    if (this.over) return [];
    const events: MemoEvent[] = [];
    if (this.preview > 0) {
      this.preview = Math.max(0, this.preview - dt);
      if (this.preview === 0) {
        for (const c of this.cards) c.up = false;
        events.push({ type: 'previewEnd' });
      }
      return events; // the clock starts after the peek
    }
    if (this.peek > 0) {
      this.peek -= dt;
      if (this.peek <= 0) {
        for (const c of this.open) c.up = false;
        this.open = [];
        events.push({ type: 'hide' });
        if (this.pendingSwap) {
          this.pendingSwap = false;
          const hidden = this.cards.map((c, i) => (c.matched ? -1 : i)).filter((i) => i >= 0);
          if (hidden.length >= 2) {
            const i = hidden.splice(Math.floor(this.rng() * hidden.length), 1)[0]!;
            const j = hidden[Math.floor(this.rng() * hidden.length)]!;
            [this.cards[i], this.cards[j]] = [this.cards[j]!, this.cards[i]!];
            events.push({ type: 'swap', i, j });
          }
        }
      }
    }
    this.time = Math.max(0, this.time - dt);
    if (this.time === 0) {
      this.over = true;
      events.push({ type: 'lost' });
    }
    return events;
  }
}

// ── Progress ──────────────────────────────────────────────────────────────

export interface LevelResult {
  readonly stars: 1 | 2 | 3;
  readonly points: number;
}

export type MemoProgress = Readonly<Record<number, LevelResult>>;

/** Keeps the best stars and the best points of each level independently. */
export function recordWin(
  p: MemoProgress,
  id: number,
  stars: 1 | 2 | 3,
  points: number,
): MemoProgress {
  const prev = p[id];
  return {
    ...p,
    [id]: prev
      ? { stars: Math.max(prev.stars, stars) as 1 | 2 | 3, points: Math.max(prev.points, points) }
      : { stars, points },
  };
}

export const isUnlocked = (p: MemoProgress, id: number) => id === 1 || p[id - 1] !== undefined;

export function summary(p: MemoProgress): { stars: number; levels: number; score: number } {
  const r = Object.values(p);
  return {
    stars: r.reduce((s, x) => s + x.stars, 0),
    levels: r.length,
    score: r.reduce((s, x) => s + x.points, 0),
  };
}

export function parseProgress(raw: unknown): MemoProgress {
  const out: Record<number, LevelResult> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k);
    const r = v as Record<string, unknown>;
    if (!LEVELS.some((l) => l.id === id) || typeof r !== 'object' || r === null) continue;
    const stars = Number(r.stars);
    const points = Number(r.points);
    if ([1, 2, 3].includes(stars) && Number.isFinite(points) && points >= 0)
      out[id] = { stars: stars as 1 | 2 | 3, points };
  }
  return out;
}
