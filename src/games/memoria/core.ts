/**
 * "Memória da Turma" — pure rules. Flip two cards; equal faces stay up, different ones turn back
 * after a short look. Each level has more pairs and a clock; consecutive matches build a combo.
 */

export type Rng = () => number;

export const FACES = 13;
const PEEK_S = 0.75;

export interface Card {
  readonly id: number;
  readonly face: number;
  up: boolean;
  matched: boolean;
}

export type MemoryEvent =
  | { type: 'flip'; card: Card }
  | { type: 'match'; a: Card; b: Card; points: number; combo: number }
  | { type: 'miss'; a: Card; b: Card }
  | { type: 'hide' }
  | { type: 'level'; level: number; bonus: number }
  | { type: 'over' };

export const levelLayout = (level: number): { cols: number; rows: number; time: number } => {
  const [cols, rows] = level === 1 ? [3, 4] : level === 2 ? [4, 4] : level === 3 ? [4, 5] : [4, 6];
  return { cols, rows, time: 25 + ((cols * rows) / 2) * 4 - Math.min(20, (level - 1) * 3) };
};

export class MemorySim {
  cards: Card[] = [];
  level = 1;
  score = 0;
  combo = 0;
  time = 0;
  over = false;
  /** Two mismatched cards waiting to turn back. */
  private peek = 0;
  private open: Card[] = [];
  private ids = 0;

  constructor(private readonly rng: Rng = Math.random) {
    this.deal();
  }

  get layout() {
    return levelLayout(this.level);
  }

  private deal(): void {
    const { cols, rows, time } = this.layout;
    const pairs = (cols * rows) / 2;
    const faces = [...Array(FACES).keys()].sort(() => this.rng() - 0.5).slice(0, pairs);
    const deck = [...faces, ...faces].sort(() => this.rng() - 0.5);
    this.cards = deck.map((face) => ({ id: ++this.ids, face, up: false, matched: false }));
    this.time = time;
    this.open = [];
    this.peek = 0;
  }

  /** Flips card `index` (ignored while two cards are being shown or for face-up cards). */
  flip(index: number): MemoryEvent[] {
    const card = this.cards[index];
    if (this.over || !card || card.up || this.peek > 0 || this.open.length >= 2) return [];
    card.up = true;
    this.open.push(card);
    const events: MemoryEvent[] = [{ type: 'flip', card }];
    if (this.open.length < 2) return events;
    const [a, b] = this.open as [Card, Card];
    if (a.face === b.face) {
      a.matched = b.matched = true;
      this.combo++;
      const points = 100 * this.combo;
      this.score += points;
      this.open = [];
      events.push({ type: 'match', a, b, points, combo: this.combo });
      if (this.cards.every((c) => c.matched)) {
        const bonus = Math.round(this.time) * 10 * this.level;
        this.score += bonus;
        this.level++;
        this.deal();
        events.push({ type: 'level', level: this.level, bonus });
      }
    } else {
      this.combo = 0;
      this.peek = PEEK_S;
      events.push({ type: 'miss', a, b });
    }
    return events;
  }

  step(dt: number): MemoryEvent[] {
    if (this.over) return [];
    const events: MemoryEvent[] = [];
    if (this.peek > 0) {
      this.peek -= dt;
      if (this.peek <= 0) {
        for (const c of this.open) c.up = false;
        this.open = [];
        events.push({ type: 'hide' });
      }
    }
    this.time = Math.max(0, this.time - dt);
    if (this.time === 0) {
      this.over = true;
      events.push({ type: 'over' });
    }
    return events;
  }
}
