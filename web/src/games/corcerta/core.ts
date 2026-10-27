import type { Rnd } from '@/platform/rnd';

export const INKS = [
  { name: 'VERMELHO', color: 0xff4d4d },
  { name: 'AZUL', color: 0x4da3ff },
  { name: 'VERDE', color: 0x4ade80 },
  { name: 'AMARELO', color: 0xffd23f },
] as const;

export interface StroopQuestion {
  /** Index in INKS of the word that is written. */
  word: number;
  /** Index in INKS of the color it is painted in. */
  ink: number;
}

export type StroopResult = 'right' | 'wrong' | 'timeout';

/** "Cor Certa": does the paint color match what the word says? Answer before time runs out. */
export class StroopSim {
  lives = 3;
  score = 0;
  streak = 0;
  maxStreak = 0;
  q: StroopQuestion = { word: 0, ink: 0 };
  limit = 3;
  timeLeft = 3;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.next();
  }

  get match(): boolean {
    return this.q.word === this.q.ink;
  }

  get dead(): boolean {
    return this.lives <= 0;
  }

  answer(yes: boolean): StroopResult {
    if (this.dead) return 'wrong';
    const right = yes === this.match;
    if (right) {
      this.score++;
      this.streak++;
      this.maxStreak = Math.max(this.maxStreak, this.streak);
    } else this.miss();
    this.next();
    return right ? 'right' : 'wrong';
  }

  step(dt: number): StroopResult | null {
    if (this.dead) return null;
    this.timeLeft -= dt;
    if (this.timeLeft > 0) return null;
    this.miss();
    this.next();
    return 'timeout';
  }

  private miss(): void {
    this.lives--;
    this.streak = 0;
  }

  private next(): void {
    this.limit = Math.max(1.1, 3 - this.score * 0.06);
    this.timeLeft = this.limit;
    const word = Math.floor(this.rnd() * INKS.length);
    if (this.rnd() < 0.5) this.q = { word, ink: word };
    else
      this.q = { word, ink: (word + 1 + Math.floor(this.rnd() * (INKS.length - 1))) % INKS.length };
  }
}
