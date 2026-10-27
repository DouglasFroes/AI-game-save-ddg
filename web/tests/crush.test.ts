import { describe, expect, it } from 'vitest';
import { COLS, CrushGame, levelGoal, ROWS, type Special } from '@/games/crush/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Board from rows of digits (kind) — '.' keeps a filler pattern that never matches. */
function fromRows(rows: string[], specials: Record<string, Special> = {}): CrushGame {
  const g = new CrushGame(6, seeded(7));
  let id = 1000;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const ch = rows[y]?.[x] ?? '.';
      // Filler: kinds 3,4,5 in a pattern without any 3-in-a-row.
      const kind = ch === '.' ? 3 + ((x + y * 2) % 3) : Number(ch);
      const special = specials[`${x},${y}`];
      g.board[y]![x] = special ? { id: id++, kind, special } : { id: id++, kind };
    }
  return g;
}

describe('crush', () => {
  it('starts without ready matches and with at least one move', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = new CrushGame(5, seeded(seed));
      expect(g.findMatches()).toEqual([]);
      expect(g.hasMove()).toBe(true);
    }
  });

  it('rejects a swap that makes no match and leaves the board unchanged', () => {
    const g = fromRows(['01', '20']);
    const before = g.at({ x: 0, y: 0 })!.id;
    const r = g.swap({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(r.ok).toBe(false);
    expect(g.at({ x: 0, y: 0 })!.id).toBe(before);
  });

  it('clears a match of three, drops pieces and refills', () => {
    // Row 0: 0 0 1 0 → swapping (2,0)<->(3,0) lines up three 0s.
    const g = fromRows(['0010']);
    const r = g.swap({ x: 2, y: 0 }, { x: 3, y: 0 });
    expect(r.ok).toBe(true);
    const first = r.phases[0]!;
    expect(first.cleared.length).toBe(3);
    expect(first.points).toBeGreaterThan(0);
    expect(first.spawned.length).toBe(3);
    // Board is full again.
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) expect(g.at({ x, y })).not.toBeNull();
  });

  it('four in a row makes a striped piece, five a rainbow, L a bomb', () => {
    const four = fromRows(['0010', '..0']);
    const r4 = four.swap({ x: 2, y: 0 }, { x: 2, y: 1 });
    expect(r4.phases[0]!.created[0]!.piece.special).toBe('row');

    const five = fromRows(['00100', '..0..']);
    const r5 = five.swap({ x: 2, y: 0 }, { x: 2, y: 1 });
    expect(r5.phases[0]!.created[0]!.piece.special).toBe('rainbow');

    // L: column 0 rows 0..2 and row 2 columns 0..2, completed by swapping into (0,2).
    const l = fromRows(['0', '0', '100', '0']);
    const rl = l.swap({ x: 0, y: 2 }, { x: 0, y: 3 });
    expect(rl.phases[0]!.created.some((c) => c.piece.special === 'bomb')).toBe(true);
  });

  it('a striped piece in a match clears its whole row', () => {
    const g = fromRows(['0010'], { '0,0': 'row' });
    const r = g.swap({ x: 2, y: 0 }, { x: 3, y: 0 });
    expect(r.phases[0]!.cleared.length).toBeGreaterThanOrEqual(COLS);
  });

  it('a rainbow clears every piece of the kind it is swapped with', () => {
    const g = fromRows(['21.2.2', '...2..'], { '0,0': 'rainbow' });
    const twos = g.board.flat().filter((p) => p!.kind === 2 && !p!.special).length;
    const r = g.swap({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(r.ok).toBe(true);
    // The rainbow swapped with a "1": every 1 goes (here only that one), plus the rainbow itself.
    expect(r.phases[0]!.cleared.length).toBeGreaterThanOrEqual(2);
    expect(twos).toBeGreaterThan(0);
  });

  it('cascades score more', () => {
    let sawCascade = false;
    for (let seed = 1; seed < 40 && !sawCascade; seed++) {
      const g = new CrushGame(5, seeded(seed));
      for (let move = 0; move < 30 && !sawCascade; move++) {
        const h = g.hint();
        if (!h) break;
        const r = g.swap(h[0], h[1]);
        if (r.phases.length > 1) {
          sawCascade = true;
          expect(r.phases[1]!.cascade).toBe(2);
        }
      }
    }
    expect(sawCascade).toBe(true);
  });

  it('never leaves the board stuck after a move', () => {
    const g = new CrushGame(6, seeded(11));
    for (let move = 0; move < 200; move++) {
      const h = g.hint();
      expect(h).not.toBeNull();
      expect(g.swap(h![0], h![1]).ok).toBe(true);
      expect(g.findMatches()).toEqual([]);
    }
  });

  it('levels ask for more points and add a kind later', () => {
    expect(levelGoal(2).target).toBeGreaterThan(levelGoal(1).target);
    expect(levelGoal(1).kinds).toBe(5);
    expect(levelGoal(3).kinds).toBe(6);
  });
});
