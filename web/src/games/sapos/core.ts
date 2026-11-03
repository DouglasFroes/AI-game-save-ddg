/**
 * "Sapos" — pure rules (the classic leapfrog puzzle). Green frogs start on the left and red frogs on
 * the right, with one empty lily pad between them. Frogs only move forward, one pad or by jumping a
 * single frog; swap the two groups. Needs n² + 2n moves with n frogs per side.
 */
export const GREEN = 1;
export const RED = 2;
export type Pad = 0 | 1 | 2;

export function frogsFor(level: number): number {
  return Math.min(6, 2 + Math.floor((level - 1) / 1));
}

export function newGame(n: number): Pad[] {
  return [...Array<Pad>(n).fill(GREEN), 0 as Pad, ...Array<Pad>(n).fill(RED)];
}

/** Where the frog on pad `i` would land, or -1 if it cannot move. */
export function target(p: readonly Pad[], i: number): number {
  const f = p[i];
  if (!f) return -1;
  const dir = f === GREEN ? 1 : -1;
  const one = i + dir;
  if (p[one] === 0) return one;
  const two = i + 2 * dir;
  if (p[one] !== undefined && p[one] !== f && p[two] === 0) return two;
  return -1;
}

export function move(p: readonly Pad[], i: number): Pad[] | null {
  const t = target(p, i);
  if (t < 0) return null;
  const next = p.slice();
  next[t] = next[i]!;
  next[i] = 0;
  return next;
}

export function isSolved(p: readonly Pad[]): boolean {
  const n = (p.length - 1) / 2;
  return p.every((f, i) => (i < n ? f === RED : i === n ? f === 0 : f === GREEN));
}

export function isStuck(p: readonly Pad[]): boolean {
  return !isSolved(p) && p.every((_, i) => target(p, i) < 0);
}

export function par(n: number): number {
  return n * n + 2 * n;
}

/** The optimal answer (breadth-first): the pads to move, in order. */
export function solve(n: number): number[] {
  const first = newGame(n);
  const prev = new Map<string, { from: string; pad: number }>();
  const states = new Map<string, Pad[]>([[first.join(''), first]]);
  let frontier = [first];
  while (frontier.length > 0) {
    const next: Pad[][] = [];
    for (const p of frontier) {
      const k = p.join('');
      if (isSolved(p)) {
        const out: number[] = [];
        for (let at = k; prev.has(at); at = prev.get(at)!.from) out.unshift(prev.get(at)!.pad);
        return out;
      }
      p.forEach((_, i) => {
        const q = move(p, i);
        if (!q || states.has(q.join(''))) return;
        states.set(q.join(''), q);
        prev.set(q.join(''), { from: k, pad: i });
        next.push(q);
      });
    }
    frontier = next;
  }
  return [];
}
