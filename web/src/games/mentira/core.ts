/**
 * "Quem Mente?" — pure rules (knights and knaves). Every suspect is either honest (always tells the
 * truth) or a liar (always lies) and makes one statement. Work out who is who.
 */
export type Stmt =
  { kind: 'about'; target: number; honest: boolean } | { kind: 'count'; k: number };

export interface Puzzle {
  n: number;
  stmts: Stmt[];
  /** One consistent answer (true = honest). Unique for generated puzzles. */
  solution: boolean[];
}

export const NAMES = ['Ana', 'Beto', 'Cida', 'Davi', 'Eva', 'Fábio'] as const;

export const countFor = (level: number): number => Math.min(6, 2 + Math.ceil(level / 2));

export function holds(s: Stmt, roles: readonly boolean[]): boolean {
  return s.kind === 'about' ? roles[s.target] === s.honest : roles.filter((r) => !r).length === s.k;
}

/** True when everybody's statement is true exactly if they are honest. */
export function consistent(p: Puzzle, roles: readonly boolean[]): boolean {
  return p.stmts.every((s, i) => holds(s, roles) === roles[i]);
}

export function solutions(n: number, stmts: Stmt[]): boolean[][] {
  const out: boolean[][] = [];
  for (let m = 0; m < 1 << n; m++) {
    const roles = Array.from({ length: n }, (_, i) => ((m >> i) & 1) === 1);
    if (stmts.every((s, i) => holds(s, roles) === roles[i])) out.push(roles);
  }
  return out;
}

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const n = countFor(level);
  let last: Puzzle | null = null;
  for (let attempt = 0; attempt < 800; attempt++) {
    const roles = Array.from({ length: n }, () => rng() < 0.5);
    const liars = roles.filter((r) => !r).length;
    const stmts: Stmt[] = roles.map((honest, i) => {
      if (rng() < 0.8 || n < 3) {
        let target = Math.floor(rng() * (n - 1));
        if (target >= i) target++;
        // Honest people say what is true, liars what is false.
        return { kind: 'about', target, honest: honest ? roles[target]! : !roles[target]! };
      }
      let k = honest ? liars : Math.floor(rng() * (n + 1));
      if (!honest && k === liars) k = (k + 1) % (n + 1);
      return { kind: 'count', k };
    });
    last = { n, stmts, solution: roles };
    if (solutions(n, stmts).length === 1) return last;
  }
  return last!;
}

export function describe(s: Stmt): string {
  if (s.kind === 'about')
    return `${NAMES[s.target]} é ${s.honest ? 'sincero(a)' : 'mentiroso(a)'}.`;
  return s.k === 1 ? 'Há exatamente 1 mentiroso.' : `Há exatamente ${s.k} mentirosos.`;
}
