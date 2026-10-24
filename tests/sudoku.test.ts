import { describe, expect, it } from 'vitest';
import {
  candidates,
  countSolutions,
  DIFFICULTIES,
  HINTS_PER_GAME,
  isComplete,
  isValidPlacement,
  makePuzzle,
  PEERS,
  solve,
  sudokuScore,
} from '@/games/sudoku/core';
import { BestScores } from '@/platform/bestScores';
import { boardId } from '@/platform/boards';
import { LocalLeaderboard } from '@/platform/leaderboard';
import { MemoryStore } from '@/platform/storage';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const isValidSolution = (g: readonly number[]) =>
  g.every((n, i) => n >= 1 && n <= 9 && PEERS[i]!.every((j) => g[j] !== n));

describe('sudoku core', () => {
  it('has 20 peers per cell', () => {
    expect(PEERS.every((p) => p.length === 20)).toBe(true);
  });

  it('solves an empty grid into a valid solution', () => {
    const g = solve(new Array(81).fill(0), seeded(7));
    expect(g).not.toBeNull();
    expect(isValidSolution(g!)).toBe(true);
  });

  it.each(['easy', 'medium', 'hard', 'expert'] as const)('generates a unique %s puzzle', (d) => {
    const { puzzle, solution } = makePuzzle(d, seeded(42));
    expect(isValidSolution(solution)).toBe(true);
    expect(countSolutions(puzzle)).toBe(1);
    puzzle.forEach((n, i) => n && expect(n).toBe(solution[i]));
    const holes = puzzle.filter((n) => n === 0).length;
    expect(holes).toBeGreaterThan(DIFFICULTIES[d].holes - 8);
    expect(holes).toBeLessThanOrEqual(DIFFICULTIES[d].holes);
  });

  it('checks placements and candidates', () => {
    const { puzzle, solution } = makePuzzle('easy', seeded(3));
    const i = puzzle.findIndex((n) => n === 0);
    expect(candidates(puzzle, i)).toContain(solution[i]);
    expect(isValidPlacement(puzzle, i, solution[i]!)).toBe(true);
    expect(isComplete(puzzle, solution)).toBe(false);
    expect(isComplete(solution, solution)).toBe(true);
  });

  it('scores harder, faster and cleaner solves higher', () => {
    expect(sudokuScore('hard', 600, 0, 0)).toBeGreaterThan(sudokuScore('easy', 600, 0, 0));
    expect(sudokuScore('medium', 300, 0, 0)).toBeGreaterThan(sudokuScore('medium', 600, 0, 0));
    expect(sudokuScore('medium', 300, 2, 1)).toBeLessThan(sudokuScore('medium', 300, 0, 0));
    expect(sudokuScore('easy', 99999, 3, 9)).toBe(100);
  });

  it('expert is the last level: one life, no hints, the highest payout', () => {
    const { expert, hard, easy, medium } = DIFFICULTIES;
    expect(expert.lives).toBe(1);
    expect(expert.hints).toBe(false);
    expect(expert.level).toBe(hard.level + 1);
    for (const d of [easy, medium, hard]) {
      expect(d.lives).toBe(3);
      expect(d.hints).toBe(true);
    }
    expect(sudokuScore('expert', 600, 0, 0)).toBeGreaterThan(sudokuScore('hard', 600, 0, 0));
  });
});

describe('sudoku: ranking reset and hint limit', () => {
  it('stores Sudoku scores on a fresh board, leaving the old one untouched', async () => {
    const store = new MemoryStore();
    store.set(
      'arcade.board.sudoku',
      JSON.stringify([
        {
          id: 'x',
          player: 'p',
          name: 'Velho',
          score: 99999,
          details: {},
          date: '2026-01-01T00:00:00Z',
        },
      ]),
    );
    store.set('arcade.best.sudoku', JSON.stringify({ score: 99999, details: {} }));
    await expect(new LocalLeaderboard(store).list('sudoku', 10)).resolves.toEqual([]);
    expect(new BestScores(store).get('sudoku')).toBeNull();
    expect(boardId('sudoku')).toBe('sudoku2');
    expect(boardId('snake')).toBe('snake');
    const board = new LocalLeaderboard(store);
    await board.submit('sudoku', {
      id: 'n',
      player: 'p',
      name: 'Novo',
      score: 10,
      details: {},
      date: '2026-10-01T00:00:00Z',
    });
    expect((await board.list('sudoku', 10)).map((e) => e.name)).toEqual(['Novo']);
    expect(store.get('arcade.board.sudoku2')).toBeTruthy();
  });

  it('allows a few hints per game', () => {
    expect(HINTS_PER_GAME).toBeGreaterThan(0);
    expect(HINTS_PER_GAME).toBeLessThanOrEqual(5);
  });
});
