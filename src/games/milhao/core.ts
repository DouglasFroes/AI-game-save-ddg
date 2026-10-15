/**
 * "Jogo do Milhão" — pure rules of a TV-style quiz. 16 questions climb a prize ladder up to
 * R$ 1 milhão. Before answering the player may stop (keeps what they have); a wrong answer
 * leaves them with half of it, and missing the final question loses everything.
 * Helps, once each: Cartas (removes 1–3 wrong answers), Universitários (three hints),
 * Placas (audience votes) and three skips.
 */
import { QUESTIONS, type Question } from './questions';

export type Rng = () => number;

/** Prize for answering question i (0-based) correctly. */
export const LADDER = [
  1_000, 2_000, 3_000, 4_000, 5_000, 10_000, 20_000, 30_000, 40_000, 50_000, 100_000, 200_000,
  300_000, 400_000, 500_000, 1_000_000,
] as const;
export const QUESTION_COUNT = LADDER.length;
export const SKIPS = 3;
export const ANSWER_TIME = 40;

/** Difficulty of each step: easy up to R$ 5 mil, medium up to 50 mil, hard, then the final one. */
export const tierOf = (step: number): Question['tier'] =>
  step < 5 ? 1 : step < 10 ? 2 : step < 15 ? 3 : 4;

export type Help = 'cartas' | 'universitarios' | 'placas';
export type EndReason = 'won' | 'stopped' | 'wrong' | 'timeout';

export interface Prizes {
  /** If the current question is answered right. */
  readonly right: number;
  /** If the player stops now. */
  readonly stop: number;
  /** If the answer is wrong. */
  readonly wrong: number;
}

export class MilhaoGame {
  step = 0;
  question!: Question;
  /** Answer order on screen (indexes into question.options); the right one is question.answer. */
  order: number[] = [];
  /** Options removed by the Cartas help (screen positions). */
  removed = new Set<number>();
  skipsLeft = SKIPS;
  readonly used = new Set<Help>();
  time = ANSWER_TIME;
  over = false;
  end: EndReason | null = null;
  prize = 0;
  private readonly seen = new Set<string>();

  constructor(
    private readonly rng: Rng = Math.random,
    private readonly bank: readonly Question[] = QUESTIONS,
  ) {
    this.next();
  }

  /** What is at stake on the current question. */
  get prizes(): Prizes {
    const stop = this.step === 0 ? 0 : LADDER[this.step - 1]!;
    const final = this.step === QUESTION_COUNT - 1;
    return { right: LADDER[this.step]!, stop, wrong: final ? 0 : Math.floor(stop / 2) };
  }

  /** Screen position (0–3) of the right answer. */
  get rightPosition(): number {
    return this.order.indexOf(this.question.answer);
  }

  private next(): void {
    const tier = tierOf(this.step);
    let pool = this.bank.filter((q) => q.tier === tier && !this.seen.has(q.text));
    if (pool.length === 0) pool = this.bank.filter((q) => q.tier === tier);
    this.question = pool[Math.floor(this.rng() * pool.length)]!;
    this.seen.add(this.question.text);
    this.order = [0, 1, 2, 3].sort(() => this.rng() - 0.5);
    this.removed = new Set();
    this.time = ANSWER_TIME;
  }

  private finish(end: EndReason, prize: number): void {
    this.over = true;
    this.end = end;
    this.prize = prize;
  }

  /** Answers with the option at screen position `pos`. Returns whether it was right. */
  answer(pos: number): boolean {
    if (this.over || this.removed.has(pos)) return false;
    const right = pos === this.rightPosition;
    if (!right) {
      this.finish('wrong', this.prizes.wrong);
      return false;
    }
    if (this.step === QUESTION_COUNT - 1) this.finish('won', LADDER[this.step]!);
    else {
      this.step++;
      this.next();
    }
    return true;
  }

  stop(): void {
    if (!this.over) this.finish('stopped', this.prizes.stop);
  }

  /** Same prize, a different question of the same level. */
  skip(): boolean {
    if (this.over || this.skipsLeft <= 0) return false;
    this.skipsLeft--;
    this.next();
    return true;
  }

  /** Cartas: draws a card from 0 (king, nothing removed) to 3, and removes that many wrong ones. */
  cartas(): number {
    if (this.over || this.used.has('cartas')) return -1;
    this.used.add('cartas');
    const n = Math.floor(this.rng() * 4);
    const wrong = [0, 1, 2, 3].filter((p) => p !== this.rightPosition);
    wrong.sort(() => this.rng() - 0.5);
    for (const p of wrong.slice(0, n)) this.removed.add(p);
    return n;
  }

  /** Universitários: three students each point to an answer (usually, not always, the right one). */
  universitarios(): number[] {
    if (this.over || this.used.has('universitarios')) return [];
    this.used.add('universitarios');
    const sure = this.question.tier === 1 ? 0.9 : this.question.tier === 2 ? 0.75 : 0.6;
    const open = [0, 1, 2, 3].filter((p) => !this.removed.has(p));
    return [0, 1, 2].map(() =>
      this.rng() < sure ? this.rightPosition : open[Math.floor(this.rng() * open.length)]!,
    );
  }

  /** Placas: the audience's votes in percent for each screen position (sum 100). */
  placas(): number[] {
    if (this.over || this.used.has('placas')) return [];
    this.used.add('placas');
    const lean = this.question.tier === 1 ? 3 : this.question.tier === 2 ? 1.8 : 1.1;
    const raw = [0, 1, 2, 3].map((p) =>
      this.removed.has(p) ? 0 : (0.3 + this.rng()) * (p === this.rightPosition ? lean : 1),
    );
    const total = raw.reduce((a, b) => a + b, 0);
    const pct = raw.map((v) => Math.floor((v / total) * 100));
    const best = pct.indexOf(Math.max(...pct));
    pct[best]! += 100 - pct.reduce((a, b) => a + b, 0);
    return pct;
  }

  /** Advances the answer clock; true when time just ran out. */
  tick(dt: number): boolean {
    if (this.over) return false;
    this.time = Math.max(0, this.time - dt);
    if (this.time > 0) return false;
    this.finish('timeout', this.prizes.wrong);
    return true;
  }
}
