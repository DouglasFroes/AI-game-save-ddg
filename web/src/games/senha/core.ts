/**
 * "Senha das Cores" — pure rules of Mastermind, endless. Guess the hidden colour code; each
 * guess tells how many pegs are the right colour in the right place (black) and how many are the
 * right colour elsewhere (white). Codes get longer and use more colours as the run goes on.
 */
export const MAX_TRIES = 8;
export const LIVES = 3;
export const PALETTE = [
  0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7, 0xf97316, 0x06b6d4, 0xf472b6,
];

export interface CodeSpec {
  readonly len: number;
  readonly colors: number;
}

export const specFor = (code: number): CodeSpec =>
  code <= 3 ? { len: 4, colors: 5 } : code <= 7 ? { len: 4, colors: 6 } : { len: 5, colors: 7 };

export interface Feedback {
  readonly exact: number;
  readonly near: number;
}

export function feedback(guess: readonly number[], code: readonly number[]): Feedback {
  let exact = 0;
  const left = new Map<number, number>();
  const rest: number[] = [];
  guess.forEach((g, i) => {
    if (g === code[i]) exact++;
    else {
      rest.push(g);
      left.set(code[i]!, (left.get(code[i]!) ?? 0) + 1);
    }
  });
  let near = 0;
  for (const g of rest) {
    const k = left.get(g) ?? 0;
    if (k > 0) {
      near++;
      left.set(g, k - 1);
    }
  }
  return { exact, near };
}

export type GuessResult =
  | { kind: 'incomplete' }
  | { kind: 'guess'; fb: Feedback }
  | { kind: 'cracked'; fb: Feedback; points: number }
  | { kind: 'failed'; fb: Feedback; code: number[]; livesLeft: number };

export class CodeRun {
  codeNo = 1;
  code: number[] = [];
  guesses: number[][] = [];
  feedbacks: Feedback[] = [];
  current: number[] = [];
  score = 0;
  cracked = 0;
  lives = LIVES;

  constructor(private readonly rng: () => number = Math.random) {
    this.newCode();
  }

  get spec(): CodeSpec {
    return specFor(this.codeNo);
  }

  get over(): boolean {
    return this.lives <= 0;
  }

  newCode(): void {
    const { len, colors } = this.spec;
    this.code = Array.from({ length: len }, () => Math.floor(this.rng() * colors));
    this.guesses = [];
    this.feedbacks = [];
    this.current = [];
  }

  pick(color: number): void {
    if (this.current.length < this.spec.len && color < this.spec.colors) this.current.push(color);
  }

  undo(): void {
    this.current.pop();
  }

  submit(): GuessResult {
    if (this.current.length < this.spec.len) return { kind: 'incomplete' };
    const guess = this.current;
    const fb = feedback(guess, this.code);
    this.guesses.push(guess);
    this.feedbacks.push(fb);
    this.current = [];
    if (fb.exact === this.spec.len) {
      const points =
        (MAX_TRIES + 1 - this.guesses.length) * 100 * (this.spec.len - 3) + this.codeNo * 20;
      this.score += points;
      this.cracked++;
      this.codeNo++;
      return { kind: 'cracked', fb, points };
    }
    if (this.guesses.length >= MAX_TRIES) {
      this.lives--;
      const code = this.code;
      this.codeNo++;
      return { kind: 'failed', fb, code, livesLeft: this.lives };
    }
    return { kind: 'guess', fb };
  }
}
