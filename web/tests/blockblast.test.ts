import { describe, expect, it } from 'vitest';
import {
  Board,
  dealTray,
  hasAnyMove,
  PERFECT_CLEAR_BONUS,
  placementScore,
  SHAPES,
  SIZE,
  type Piece,
} from '@/games/blockblast/core';

const shape = (id: string) => {
  const s = SHAPES.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};
const piece = (id: string): Piece => ({ shape: shape(id), color: 1 });

/** Deterministic RNG for repeatable tests. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('shapes', () => {
  it('expands rotations without duplicates', () => {
    expect(SHAPES.filter((s) => s.id.startsWith('o2-'))).toHaveLength(1);
    expect(SHAPES.filter((s) => s.id.startsWith('i3-'))).toHaveLength(2);
    expect(SHAPES.filter((s) => s.id.startsWith('t-'))).toHaveLength(4);
    for (const s of SHAPES) expect(s.cells.every((c) => c.x < s.w && c.y < s.h)).toBe(true);
  });
});

describe('board', () => {
  it('rejects out-of-bounds and overlapping placements', () => {
    const b = Board.fromRows(['#.......']);
    expect(b.canPlace(shape('i2-0'), 0, 0)).toBe(false);
    expect(b.canPlace(shape('i2-0'), 1, 0)).toBe(true);
    expect(b.canPlace(shape('i2-0'), 7, 0)).toBe(false);
  });

  it('clears a full row and a full column at the same time', () => {
    const rows: string[] = Array.from({ length: SIZE }, (_, y) =>
      y === 0 ? '#######.' : '.......#',
    );
    rows[7] = '........';
    const b = Board.fromRows(rows);
    const r = b.place(piece('dot-0'), 7, 0);
    expect(r.rows).toEqual([0]);
    expect(r.cols).toEqual([]);
    const col = Board.fromRows(Array.from({ length: SIZE }, (_, y) => (y < 7 ? '#' : '.')));
    const r2 = col.place(piece('dot-0'), 0, 7);
    expect(r2.cols).toEqual([0]);
    expect(r2.cleared).toHaveLength(SIZE);
    expect(col.isEmpty).toBe(true);
  });

  it('detects when no piece fits', () => {
    const full = Board.fromRows(Array.from({ length: SIZE }, () => '########'));
    expect(full.fitsAnywhere(shape('dot-0'))).toBe(false);
    expect(hasAnyMove(full, [piece('dot-0'), null])).toBe(false);
    expect(hasAnyMove(new Board(), [null, piece('o3-0')])).toBe(true);
  });
});

describe('scoring and dealing', () => {
  it('rewards multi-line clears, combos and perfect clears', () => {
    expect(placementScore(4, 0, 0, false)).toBe(4);
    expect(placementScore(4, 1, 0, false)).toBe(24);
    expect(placementScore(4, 2, 0, false)).toBe(64);
    expect(placementScore(4, 1, 2, false)).toBe(44);
    expect(placementScore(1, 1, 0, true)).toBe(21 + PERFECT_CLEAR_BONUS);
  });

  it('always deals a playable piece when one exists', () => {
    // Only single holes left: only the dot fits.
    const rows = Array.from({ length: SIZE }, () => '########');
    rows[3] = '###.####';
    const b = Board.fromRows(rows);
    for (let seed = 1; seed < 40; seed++) {
      const tray = dealTray(b, seeded(seed));
      expect(tray).toHaveLength(3);
      expect(hasAnyMove(b, tray)).toBe(true);
    }
  });
});
