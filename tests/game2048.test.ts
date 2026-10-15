import { describe, expect, it } from 'vitest';
import { Game2048 } from '@/games/game2048/core';

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('2048', () => {
  it('slides and merges a row to the left', () => {
    const g = Game2048.fromGrid([
      [2, 2, 4, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const r = g.move('left');
    expect(r.moved).toBe(true);
    expect(r.gained).toBe(4);
    expect(g.grid()[0]).toEqual([4, 4, 0, 0]);
  });

  it('merges each tile only once per move', () => {
    const g = Game2048.fromGrid([
      [2, 2, 2, 2],
      [4, 4, 8, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    g.move('left');
    expect(g.grid()[0]).toEqual([4, 4, 0, 0]);
    expect(g.grid()[1]).toEqual([8, 8, 0, 0]);
    expect(g.score).toBe(16);
  });

  it('merges toward the move direction', () => {
    const g = Game2048.fromGrid([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    g.move('down');
    expect(g.grid().map((row) => row[0])).toEqual([0, 0, 2, 4]);
  });

  it('reports no movement and keeps the board when blocked', () => {
    const g = Game2048.fromGrid([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const before = g.grid();
    expect(g.move('left').moved).toBe(false);
    expect(g.grid()).toEqual(before);
  });

  it('describes merges for animation', () => {
    const g = Game2048.fromGrid([
      [0, 0, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const r = g.move('right');
    expect(r.merges).toHaveLength(1);
    expect(r.merges[0]!.tile).toMatchObject({ value: 8, r: 0, c: 3 });
    expect(r.merges[0]!.from.map((t) => t.c)).toEqual([3, 3]);
  });

  it('spawns 2 or 4 on empty cells and detects game over', () => {
    const g = new Game2048(seq(0, 0.5, 0, 0.95)).start();
    expect(g.tiles.map((t) => t.value).sort()).toEqual([2, 4]);
    const stuck = Game2048.fromGrid([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(stuck.canMove()).toBe(false);
    expect(stuck.spawn()).toBeNull();
    const open = Game2048.fromGrid([
      [2, 2, 4, 8],
      [4, 8, 16, 32],
      [2, 4, 8, 16],
      [4, 8, 16, 32],
    ]);
    expect(open.canMove()).toBe(true);
    expect(open.maxTile).toBe(32);
  });
});
