/**
 * "Anagrama" — pure rules. Five letters come scrambled; tap them in order to spell a word.
 * Any word of the list made of the same letters counts. Every word solved adds time to the
 * clock and grows a streak multiplier; skipping costs time and breaks the streak.
 */
import { WORDS } from '@/games/termo/core';

export const START_TIME = 60;
export const SOLVE_BONUS = 6;
export const SKIP_COST = 6;

const sorted = (w: string) => [...w].sort().join('');
const BY_LETTERS = new Map<string, Set<string>>();
for (const w of WORDS) {
  const k = sorted(w);
  if (!BY_LETTERS.has(k)) BY_LETTERS.set(k, new Set());
  BY_LETTERS.get(k)!.add(w);
}

/** Whether `guess` is a listed word made of the same letters as `word`. */
export const isAnagramOf = (guess: string, word: string): boolean =>
  BY_LETTERS.get(sorted(word))?.has(guess) ?? false;

/** Shuffles the letters, never handing back the word itself. */
export function scramble(word: string, rng: () => number): string[] {
  for (let tries = 0; tries < 20; tries++) {
    const out = [...word];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    if (!isAnagramOf(out.join(''), word)) return out;
  }
  return [...word].reverse();
}

export type PickResult =
  { kind: 'pick' } | { kind: 'solved'; word: string; points: number } | { kind: 'wrong' };

export class AnagramRun {
  word = '';
  letters: string[] = [];
  /** Indices of the letters tapped so far. */
  picked: number[] = [];
  score = 0;
  solved = 0;
  streak = 0;
  bestStreak = 0;
  timeLeft = START_TIME;
  private used = new Set<string>();

  constructor(private readonly rng: () => number = Math.random) {
    this.next();
  }

  get over(): boolean {
    return this.timeLeft <= 0;
  }

  get typed(): string {
    return this.picked.map((i) => this.letters[i]!).join('');
  }

  next(): void {
    let w = WORDS[Math.floor(this.rng() * WORDS.length)]!;
    for (let i = 0; i < 30 && this.used.has(w); i++)
      w = WORDS[Math.floor(this.rng() * WORDS.length)]!;
    this.used.add(w);
    this.word = w;
    this.letters = scramble(w, this.rng);
    this.picked = [];
  }

  tick(dt: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
  }

  pick(i: number): PickResult {
    if (this.over || this.picked.includes(i) || i < 0 || i >= this.letters.length)
      return { kind: 'pick' };
    this.picked.push(i);
    if (this.picked.length < this.letters.length) return { kind: 'pick' };
    const guess = this.typed;
    if (!isAnagramOf(guess, this.word)) {
      this.picked = [];
      this.streak = 0;
      return { kind: 'wrong' };
    }
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.solved++;
    const points = Math.round((100 + Math.ceil(this.timeLeft)) * (1 + 0.2 * (this.streak - 1)));
    this.score += points;
    this.timeLeft += SOLVE_BONUS;
    this.next();
    return { kind: 'solved', word: guess, points };
  }

  unpick(): void {
    this.picked.pop();
  }

  skip(): string {
    const w = this.word;
    this.timeLeft = Math.max(0, this.timeLeft - SKIP_COST);
    this.streak = 0;
    this.next();
    return w;
  }
}
