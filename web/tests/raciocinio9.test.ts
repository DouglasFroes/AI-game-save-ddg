import { describe, expect, it } from 'vitest';
import * as circuito from '@/games/circuito/core';
import * as encaixe from '@/games/encaixe/core';
import * as jarros from '@/games/jarros/core';
import * as mentira from '@/games/mentira/core';
import * as moeda from '@/games/moeda/core';
import * as padroes from '@/games/padroes/core';
import * as panquecas from '@/games/panquecas/core';
import * as rolante from '@/games/rolante/core';
import * as torres from '@/games/torres/core';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('Torres', () => {
  it('the hidden solution satisfies every visible clue', () => {
    for (let level = 1; level <= 8; level++) {
      const p = torres.generate(level, seeded(level * 11));
      expect(torres.isSolved(p, p.solution)).toBe(true);
      expect(torres.isSolved(p, torres.newGrid(p.n))).toBe(false);
    }
  });
  it('counts visible buildings and flags repeated heights', () => {
    expect(torres.visible([1, 3, 2, 4])).toBe(3);
    expect(torres.visible([4, 3, 2, 1])).toBe(1);
    const g = torres.newGrid(4);
    g[0]![0] = 2;
    g[0]![3] = 2;
    expect([...torres.duplicates(g)].sort()).toEqual([0, 3]);
  });
});

describe('Quem Mente?', () => {
  it('generated puzzles have exactly one consistent answer', () => {
    for (let level = 1; level <= 8; level++) {
      for (let seed = 1; seed <= 5; seed++) {
        const p = mentira.generate(level, seeded(level * 100 + seed));
        expect(mentira.consistent(p, p.solution)).toBe(true);
        expect(mentira.solutions(p.n, p.stmts)).toHaveLength(1);
      }
    }
  });
});

describe('Moeda Falsa', () => {
  it('the thirds strategy always finds the coin within the weighings allowed', () => {
    for (const n of moeda.COUNTS) {
      for (let odd = 0; odd < n; odd++) {
        const r = moeda.solve(n, odd);
        expect(r.guess).toBe(odd);
        expect(r.weighings).toBeLessThanOrEqual(moeda.weighsFor(n));
      }
    }
    expect(moeda.weighsFor(9)).toBe(2);
    expect(moeda.weighsFor(27)).toBe(3);
  });
  it('weighings need equal, disjoint sides', () => {
    expect(moeda.validWeighing([0, 1], [2, 3])).toBe(true);
    expect(moeda.validWeighing([0, 1], [1, 2])).toBe(false);
    expect(moeda.validWeighing([0], [1, 2])).toBe(false);
    expect(moeda.weigh(2, [0, 1], [2, 3])).toBe('right');
  });
});

describe('Panquecas', () => {
  it('the classic solution sorts every stack in at most 2n flips', () => {
    for (let level = 1; level <= 7; level++) {
      for (let seed = 1; seed <= 5; seed++) {
        let s = panquecas.newGame(panquecas.sizeFor(level), seeded(level * 9 + seed));
        expect(panquecas.isSorted(s)).toBe(false);
        const seq = panquecas.solve(s);
        for (const k of seq) s = panquecas.flip(s, k);
        expect(panquecas.isSorted(s)).toBe(true);
        expect(seq.length).toBeLessThanOrEqual(2 * s.length);
      }
    }
  });
});

describe('Circuito', () => {
  it('the stored solution lights the lamp and all-off does not', () => {
    for (let level = 1; level <= 10; level++) {
      const p = circuito.generate(level, seeded(level * 5));
      expect(circuito.lamp(p, p.solution)).toBe(true);
      expect(
        circuito.lamp(
          p,
          p.solution.map(() => false),
        ),
      ).toBe(false);
    }
  });
  it('gates behave', () => {
    expect(circuito.apply('XOR', true, true)).toBe(false);
    expect(circuito.apply('NAND', true, true)).toBe(false);
    expect(circuito.apply('NOR', false, false)).toBe(true);
    expect(circuito.apply('NOT', false, true)).toBe(true);
  });
});

describe('Encaixe', () => {
  it('the solution pieces tile the board exactly', () => {
    for (let level = 1; level <= 8; level++) {
      const p = encaixe.generate(level, seeded(level * 3));
      let o = encaixe.emptyBoard(p);
      p.solution.forEach((cells, i) => {
        o = encaixe.place(
          p,
          o,
          i,
          encaixe.normalize(cells),
          Math.min(...cells.map((c) => c[0])),
          Math.min(...cells.map((c) => c[1])),
        )!;
        expect(o).not.toBeNull();
      });
      expect(encaixe.isSolved(o)).toBe(true);
      expect(p.tray).toHaveLength(p.solution.length);
    }
  });
  it('four rotations bring a piece back', () => {
    const s = encaixe.normalize([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
    let t = s;
    for (let i = 0; i < 4; i++) t = encaixe.rotate(t);
    expect(t).toEqual(s);
  });
});

describe('Dado Rolante', () => {
  it('generated puzzles are solvable and rolling keeps opposite faces at 7', () => {
    for (let level = 1; level <= 8; level++) {
      const p = rolante.generate(level, seeded(level * 7));
      expect(rolante.solve(p)).toBe(p.par);
      expect(p.par).toBeGreaterThan(0);
    }
    let d = rolante.START_DIE;
    for (const dir of [3, 0, 2, 1, 3, 3]) {
      d = rolante.roll(d, dir);
      expect(d.top + rolante.bottom(d)).toBe(7);
    }
    // Rolling forth and back restores the die.
    expect(rolante.roll(rolante.roll(rolante.START_DIE, 3), 2)).toEqual(rolante.START_DIE);
  });
});

describe('Jarros', () => {
  it('the target is reachable in exactly par moves', () => {
    for (let level = 1; level <= 8; level++) {
      const p = jarros.generate(level, seeded(level * 13));
      expect(p.caps.includes(p.target)).toBe(false);
      expect(jarros.distances(p.caps).get(p.target)).toBe(p.par);
    }
  });
  it('pouring stops when the target is full or the source is empty', () => {
    expect(jarros.apply([3, 5], [3, 4], { kind: 'pour', i: 0, j: 1 })).toEqual([2, 5]);
    expect(jarros.apply([3, 5], [0, 4], { kind: 'pour', i: 0, j: 1 })).toBeNull();
  });
});

describe('Padrões', () => {
  it('questions have four distinct options containing the answer', () => {
    for (let level = 1; level <= 8; level++) {
      for (let seed = 1; seed <= 25; seed++) {
        const q = padroes.generate(level, seeded(level * 1000 + seed));
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options).toContain(q.answer);
        expect(q.terms.length).toBeGreaterThanOrEqual(5);
      }
    }
  });
  it('arithmetic series continue with the same step', () => {
    const t = padroes.series('soma', 6, seeded(4));
    const d = t[1]! - t[0]!;
    expect(t.every((v, i) => i === 0 || v - t[i - 1]! === d)).toBe(true);
  });
});
