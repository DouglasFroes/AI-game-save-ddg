/**
 * "Padrões" — pure rules. A number series with its last term hidden; pick the term that continues
 * the pattern. Harder levels bring patterns that grow, alternate or interleave.
 */
export type Kind = 'soma' | 'produto' | 'quadrados' | 'fibonacci' | 'alterna' | 'cresce' | 'dupla';

export interface Question {
  kind: Kind;
  /** The terms shown. */
  terms: number[];
  answer: number;
  /** Four choices, the answer among them. */
  options: number[];
}

const KINDS_BY_LEVEL: ReadonlyArray<readonly Kind[]> = [
  ['soma'],
  ['soma', 'produto'],
  ['soma', 'produto', 'quadrados'],
  ['soma', 'produto', 'quadrados', 'alterna'],
  ['quadrados', 'alterna', 'cresce', 'fibonacci'],
  ['alterna', 'cresce', 'fibonacci', 'dupla'],
];

const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** A series of `len` terms of the given kind. */
export function series(kind: Kind, len: number, rng: () => number): number[] {
  const t: number[] = [];
  switch (kind) {
    case 'soma': {
      const a = int(rng, 1, 30);
      const d = int(rng, 2, 9) * (rng() < 0.3 ? -1 : 1);
      for (let i = 0; i < len; i++) t.push(a + d * i);
      break;
    }
    case 'produto': {
      const a = int(rng, 1, 4);
      const r = int(rng, 2, 3);
      for (let i = 0; i < len; i++) t.push(a * r ** i);
      break;
    }
    case 'quadrados': {
      const n = int(rng, 1, 6);
      const c = int(rng, 0, 1) * int(rng, -5, 5);
      for (let i = 0; i < len; i++) t.push((n + i) ** 2 + c);
      break;
    }
    case 'fibonacci': {
      t.push(int(rng, 1, 4), int(rng, 1, 5));
      while (t.length < len) t.push(t.at(-1)! + t.at(-2)!);
      break;
    }
    case 'alterna': {
      const a = int(rng, 1, 20);
      const x = int(rng, 2, 7);
      const y = int(rng, 1, 6);
      t.push(a);
      for (let i = 1; i < len; i++) t.push(t[i - 1]! + (i % 2 === 1 ? x : y));
      break;
    }
    case 'cresce': {
      const a = int(rng, 1, 15);
      const d = int(rng, 1, 3);
      const k = int(rng, 1, 2);
      t.push(a);
      for (let i = 1; i < len; i++) t.push(t[i - 1]! + d + k * (i - 1));
      break;
    }
    case 'dupla': {
      const a = int(rng, 1, 15);
      const b = int(rng, 20, 40);
      const da = int(rng, 2, 5);
      const db = int(rng, 2, 6);
      for (let i = 0; i < len; i++) t.push(i % 2 === 0 ? a + da * (i / 2) : b - db * ((i - 1) / 2));
      break;
    }
  }
  return t;
}

export function generate(level: number, rng: () => number = Math.random): Question {
  const kinds = KINDS_BY_LEVEL[Math.min(level, KINDS_BY_LEVEL.length) - 1]!;
  const kind = kinds[Math.floor(rng() * kinds.length)]!;
  const shown = kind === 'dupla' ? 6 : 5;
  const all = series(kind, shown + 1, rng);
  const answer = all.pop()!;
  const gap = Math.abs(answer - all.at(-1)!);
  const near = new Set<number>();
  const tries = [1, -1, 2, -2, gap, -gap, gap + 1, 10, -10, 3, -3];
  while (near.size < 3) {
    const d = tries[Math.floor(rng() * tries.length)]! + (near.size > 6 ? near.size : 0);
    const v = answer + d;
    if (v !== answer && d !== 0) near.add(v);
    if (near.size < 3 && tries.length > 0 && rng() < 0.05) tries.push(int(rng, 1, 12));
  }
  const options = [answer, ...near].sort(() => rng() - 0.5);
  return { kind, terms: all, answer, options };
}
