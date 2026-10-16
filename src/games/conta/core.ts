import type { Rnd } from '@/platform/rnd';
import { shuffle } from '@/platform/rnd';

export interface MathQuestion {
  text: string;
  choices: number[];
  /** Index in `choices` of the right answer. */
  correct: number;
}

const START_TIME = 8;
const MAX_TIME = 10;

/** Builds a question; harder (bigger numbers, more operations) as `level` grows. */
export function makeQuestion(level: number, rnd: Rnd): MathQuestion {
  const span = 9 + Math.min(level, 30);
  const ops = level < 5 ? ['+'] : level < 12 ? ['+', '-'] : ['+', '-', '×'];
  const op = ops[Math.floor(rnd() * ops.length)]!;
  let a = 1 + Math.floor(rnd() * span);
  let b = 1 + Math.floor(rnd() * span);
  if (op === '×') {
    a = 2 + Math.floor(rnd() * Math.min(9, 4 + level / 4));
    b = 2 + Math.floor(rnd() * 8);
  }
  if (op === '-' && b > a) [a, b] = [b, a];
  const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
  const near = new Set<number>([answer]);
  let guard = 0;
  while (near.size < 3 && guard++ < 50) {
    const off = 1 + Math.floor(rnd() * 3 + (level > 15 ? 2 : 0));
    const wrong = answer + (rnd() < 0.5 ? -off : off);
    if (wrong >= 0) near.add(wrong);
  }
  for (let i = 1; near.size < 3; i++) near.add(answer + i);
  const choices = shuffle(rnd, [...near]);
  return { text: `${a} ${op} ${b}`, choices, correct: choices.indexOf(answer) };
}

/** "Conta Rápida": a draining clock, right answers refill it. */
export class MathSim {
  score = 0;
  time = START_TIME;
  streak = 0;
  maxStreak = 0;
  q: MathQuestion;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.q = makeQuestion(0, rnd);
  }

  get dead(): boolean {
    return this.time <= 0;
  }

  answer(i: number): boolean {
    if (this.dead) return false;
    const right = i === this.q.correct;
    if (right) {
      this.score++;
      this.streak++;
      this.maxStreak = Math.max(this.maxStreak, this.streak);
      this.time = Math.min(MAX_TIME, this.time + Math.max(0.5, 1.2 - this.score * 0.02));
    } else {
      this.streak = 0;
      this.time -= 2;
    }
    this.q = makeQuestion(this.score, this.rnd);
    return right;
  }

  step(dt: number): void {
    if (this.dead) return;
    this.time -= dt * Math.min(2, 1 + this.score * 0.01);
  }
}
