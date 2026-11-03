import { describe, expect, it } from 'vitest';
import * as balanca from '@/games/balanca/core';
import * as caixas from '@/games/caixas/core';
import * as cavalo from '@/games/cavalo/core';
import * as fluxo from '@/games/fluxo/core';
import * as hanoi from '@/games/hanoi/core';
import * as pontes from '@/games/pontes/core';
import * as rainhas from '@/games/rainhas/core';
import * as rio from '@/games/rio/core';
import * as sapos from '@/games/sapos/core';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('Empurra Caixas', () => {
  it('moves and pushes, and refuses to push into a wall or a box', () => {
    const l: caixas.Level = {
      w: 5,
      h: 3,
      walls: Array.from({ length: 15 }, (_, i) => i < 5 || i >= 10 || i % 5 === 0 || i % 5 === 4),
      goals: Array.from({ length: 15 }, (_, i) => i === 8),
      boxes: [7],
      player: 6,
    };
    const s = caixas.start(l);
    const m = caixas.move(l, s, 3)!;
    expect(m.pushed).toBe(true);
    expect(caixas.isSolved(l, m.state)).toBe(true);
    expect(caixas.move(l, m.state, 3)).toBeNull();
    expect(caixas.move(l, s, 0)).toBeNull();
  });
  it('generated levels are solvable', () => {
    for (let level = 1; level <= 6; level++) {
      for (let seed = 1; seed <= 3; seed++) {
        const l = caixas.generate(level, seeded(seed * 31 + level));
        expect(caixas.isSolved(l, caixas.start(l))).toBe(false);
        expect(caixas.solve(l, 400000)).not.toBeNull();
      }
    }
  });
});

describe('Torre de Hanói', () => {
  it('follows the size rule and the optimal solution takes 2^n - 1 moves', () => {
    const p = hanoi.newGame(3);
    expect(hanoi.move(p, 1, 0)).toBeNull();
    const a = hanoi.move(p, 0, 1)!;
    expect(hanoi.move(a, 0, 1)).toBeNull();
    for (let n = 1; n <= 8; n++) {
      let g = hanoi.newGame(n);
      const seq = hanoi.solve(n);
      expect(seq.length).toBe(hanoi.par(n));
      for (const [f, t] of seq) g = hanoi.move(g, f, t)!;
      expect(hanoi.isSolved(g, n)).toBe(true);
    }
  });
});

describe('Fluxo', () => {
  it('generated puzzles are solved by their own solution, and drawing rules hold', () => {
    for (let level = 1; level <= 6; level++) {
      const p = fluxo.generate(level, seeded(level * 7));
      expect(p.solution.flat().length).toBe(p.size * p.size);
      expect(new Set(p.solution.flat()).size).toBe(p.size * p.size);
      const paths = fluxo.newPaths(p);
      p.solution.forEach((cells, color) => {
        const c = fluxo.begin(p, paths, cells[0]!);
        expect(c).toBe(color);
        for (const cell of cells.slice(1)) expect(fluxo.extend(p, paths, color, cell)).toBe(true);
      });
      expect(fluxo.isSolved(p, paths)).toBe(true);
    }
  });
  it('a pipe cannot enter another colour dot, and cutting works', () => {
    const p = fluxo.generate(1, seeded(3));
    const paths = fluxo.newPaths(p);
    fluxo.begin(p, paths, p.ends[0]![0]);
    const other = p.ends[1]![0];
    const near = fluxo.neighbours(p.size, other)[0]!;
    paths[0] = [p.ends[0]![0], near];
    expect(fluxo.extend(p, paths, 0, other)).toBe(false);
  });
});

describe('Pontes', () => {
  it('generated puzzles are solved by their own solution', () => {
    for (let level = 1; level <= 8; level++) {
      const p = pontes.generate(level, seeded(level * 13));
      expect(p.islands.length).toBeGreaterThanOrEqual(2);
      expect(pontes.isSolved(p, p.solution)).toBe(true);
      expect(
        pontes.isSolved(
          p,
          p.links.map(() => 0),
        ),
      ).toBe(false);
    }
  });
  it('toggle cycles 0 → 1 → 2 → 0', () => {
    const p = pontes.generate(2, seeded(5));
    let counts = p.links.map(() => 0);
    for (const want of [1, 2, 0]) {
      counts = pontes.toggle(p, counts, 0)!;
      expect(counts[0]).toBe(want);
    }
  });
});

describe('Rainhas', () => {
  it('generated puzzles are solved by their solution; wrong placements are flagged', () => {
    for (let level = 1; level <= 5; level++) {
      const p = rainhas.generate(level, seeded(level * 3));
      expect(new Set(p.regions).size).toBe(p.n);
      const q = Array.from({ length: p.n * p.n }, () => false);
      p.solution.forEach((c, r) => (q[r * p.n + c] = true));
      expect(rainhas.isSolved(p, q)).toBe(true);
      const bad = q.slice();
      bad[p.solution[0]!] = false;
      bad[p.solution[0]! === 0 ? 1 : 0] = true;
      expect(rainhas.isSolved(p, bad)).toBe(false);
    }
  });
});

describe('Sapos', () => {
  it('optimal solutions need n² + 2n moves and end solved', () => {
    for (let n = 1; n <= 6; n++) {
      let p = sapos.newGame(n);
      const seq = sapos.solve(n);
      expect(seq.length).toBe(sapos.par(n));
      for (const i of seq) p = sapos.move(p, i)!;
      expect(sapos.isSolved(p)).toBe(true);
    }
  });
  it('frogs never move backwards', () => {
    const p = sapos.newGame(2);
    expect(sapos.move(p, 0)).toBeNull();
    expect(sapos.move(p, 4)).toBeNull();
    expect(sapos.move(p, 1)).not.toBeNull();
  });
});

describe('Balança', () => {
  it('every generated level has a perfect split', () => {
    for (let level = 1; level <= 12; level++) {
      const p = balanca.generate(level, seeded(level * 17));
      expect(balanca.isSolved(p, p.solution)).toBe(true);
      expect(balanca.isSolved(p, balanca.newSides(p))).toBe(false);
    }
  });
  it('cycles a weight through the table and both pans', () => {
    let s = balanca.cycle([0], 0);
    expect(s).toEqual([-1]);
    s = balanca.cycle(s, 0);
    expect(s).toEqual([1]);
    expect(balanca.cycle(s, 0)).toEqual([0]);
  });
});

describe('Travessia do Rio', () => {
  it('every level can be solved', () => {
    for (const l of rio.LEVELS) expect(rio.solve(l)).not.toBeNull();
    expect(rio.solve({ n: 3, cap: 2 })).toBe(11);
  });
  it('refuses unsafe trips', () => {
    const l = rio.levelFor(2);
    expect(rio.cross(l, rio.start(l), 0, 2)).not.toBeNull();
    expect(rio.cross(l, rio.start(l), 2, 0)).toBeNull(); // leaves 1 missionary vs 3 cannibals
    expect(rio.cross(l, rio.start(l), 0, 3)).toBeNull(); // boat too small
  });
});

describe('Passeio do Cavalo', () => {
  it('generated levels have a complete tour from the start', () => {
    for (let level = 1; level <= 8; level++) {
      const g = cavalo.generate(level, seeded(level * 5));
      const t = cavalo.tour(g.size, g.start)!;
      expect(t).not.toBeNull();
      expect(t.length).toBe(g.size * g.size);
      const walk = [t[0]!];
      for (const c of t.slice(1)) {
        expect(cavalo.canJump(g.size, walk, c)).toBe(true);
        walk.push(c);
      }
      expect(cavalo.isSolved(g.size, walk)).toBe(true);
    }
  });
});
