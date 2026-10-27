import { describe, expect, it } from 'vitest';
import { Checkers, chooseMove, robotLevel, sq, winPoints, type Cell } from '@/games/damas/core';
import { seeded } from '@/platform/rnd';

/** A board with just these pieces: [row, col, cell]. */
const board = (pieces: ReadonlyArray<readonly [number, number, Cell]>, turn: 1 | 2 = 1) => {
  const cells = new Array<number>(64).fill(0);
  for (const [r, c, v] of pieces) cells[sq(r, c)] = v;
  return new Checkers(turn, cells);
};

describe('damas rules', () => {
  it('starts with 12 pieces each and 7 legal moves', () => {
    const g = new Checkers();
    expect(g.count(1)).toBe(12);
    expect(g.count(2)).toBe(12);
    expect(g.moves()).toHaveLength(7);
  });

  it('forces a capture, and men may capture backwards', () => {
    const g = board([
      [4, 3, 1],
      [3, 2, 2],
      [5, 4, 2], // behind the man
      [7, 0, 1],
    ]);
    const moves = g.moves();
    expect(moves.every((m) => m.captured.length > 0)).toBe(true);
    expect(moves.some((m) => m.captured[0] === sq(5, 4))).toBe(true);
  });

  it('obeys the majority rule', () => {
    const g = board([
      [6, 1, 1],
      [5, 2, 2], // a one-piece capture is on offer…
      [7, 4, 1],
      [6, 5, 2],
      [4, 5, 2], // …and so is this double jump, which must be the one played
    ]);
    const moves = g.moves();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.captured).toHaveLength(2);
  });

  it('lets a king fly and capture from a distance', () => {
    const g = board([
      [7, 0, 3],
      [3, 4, 2],
    ]);
    const m = g.moves();
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((x) => x.captured.includes(sq(3, 4)))).toBe(true);
    // It may land on any free square beyond the victim.
    expect(m.map((x) => x.to).sort()).toEqual([sq(2, 5), sq(1, 6), sq(0, 7)].sort());
  });

  it('crowns a man that ends its move on the far row', () => {
    const g = board([[1, 2, 1]]);
    const up = g.moves().find((m) => m.to === sq(0, 1))!;
    g.apply(up);
    expect(g.cells[sq(0, 1)]).toBe(3);
  });

  it('has no winner until a side runs out of moves', () => {
    expect(new Checkers().outcome()).toBe(0);
    expect(board([[0, 1, 1]], 2).outcome()).toBe(1);
  });

  it('declares a draw after a long run of king moves', () => {
    const g = board([
      [7, 0, 3],
      [0, 7, 4],
    ]);
    g.quiet = 39;
    g.apply(g.moves()[0]!);
    expect(g.outcome()).toBe(3);
  });
});

describe('damas robot', () => {
  const play = (wins: number, seed: number): number => {
    const rnd = seeded(seed);
    const g = new Checkers(seed % 2 === 0 ? 1 : 2);
    const level = robotLevel(wins);
    for (let ply = 0; ply < 300; ply++) {
      const o = g.outcome();
      if (o !== 0) return o;
      const moves = g.moves();
      if (g.turn === 1) g.apply(moves[Math.floor(rnd() * moves.length)]!);
      else g.apply(chooseMove(g, level, rnd, 8000));
    }
    return 3;
  };

  it('beats a random player almost every time', () => {
    let robot = 0;
    for (let s = 1; s <= 10; s++) if (play(2, s) === 2) robot++;
    expect(robot).toBeGreaterThanOrEqual(8);
  });

  it('gets deeper with each win', () => {
    expect(robotLevel(0).depth).toBeLessThan(robotLevel(4).depth);
    expect(robotLevel(0).blunder).toBeGreaterThan(robotLevel(5).blunder);
  });

  it('pays more for later rounds', () => {
    expect(winPoints(2, 5, 0)).toBeGreaterThan(winPoints(0, 5, 3));
  });
});
